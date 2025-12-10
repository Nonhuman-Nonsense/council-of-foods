import dotenv from 'dotenv';
dotenv.config()
const environment = process.env.NODE_ENV ?? "production";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import OpenAI from "openai";
import { MongoClient } from "mongodb";
import { v4 as uuidv4 } from "uuid"; // Import UUID library
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // pingTimeout: 60000, // Increase ping timeout
  // maxHttpBufferSize: 1e8, // Increase maximum buffer size
  // transports: ["websocket", "polling"], // Ensure WebSocket is used primarily
});

if (!process.env.COUNCIL_OPENAI_API_KEY) {
  throw new Error("COUNCIL_OPENAI_API_KEY environment variable not set.");
}
const openai = new OpenAI({ apiKey: process.env.COUNCIL_OPENAI_API_KEY });
import globalOptions from './global-options.json' with { type: 'json' };

//Error reporting
import { initReporting, reportError } from './errorbot.js';
initReporting();

// Database setup
if (!process.env.COUNCIL_DB_URL) {
  throw new Error("COUNCIL_DB_URL environment variable not set.");
}
const mongoClient = new MongoClient(process.env.COUNCIL_DB_URL);
if (!process.env.COUNCIL_DB_PREFIX) {
  throw new Error("COUNCIL_DB_PREFIX environment variable not set.");
}
console.log(`[init] COUNCIL_DB_PREFIX is ${process.env.COUNCIL_DB_PREFIX}`);
const db = mongoClient.db(process.env.COUNCIL_DB_PREFIX);
const meetingsCollection = db.collection("meetings");
const audioCollection = db.collection("audio");
const counters = db.collection("counters");

const initializeDB = async () => {
  try {
    await counters.insertOne({ _id: "meeting_id", seq: 0 });
    console.log("[init] No meeting ID found, created initial meeting #0");
  } catch (e) {
    if (e.errorResponse?.code === 11000) {
      console.log(
        "[init] Meeting ID counter already found in database. Not creating meeting #0"
      );
      return;
    }
    throw e; //If any other error, re-throw
  }
};



const insertMeeting = async (meeting) => {
  const ret = await counters.findOneAndUpdate(
    { _id: "meeting_id" },
    { $inc: { seq: 1 } }
  );
  meeting._id = ret.seq;
  return await meetingsCollection.insertOne(meeting);
};

initializeDB();

console.log(`[init] node_env is ${environment}`);
if (environment === "prototype") {
  app.use(express.static(path.join(__dirname, "../prototype/", "public")));
  //Enable prototype to reset to default settings for each language
  for (const lang of ['en']) {
    for (const promptfile of ['foods', 'topics']) {
      app.get(`/${promptfile}_${lang}.json`, function (req, res) {
        res.sendFile(path.join(__dirname, "../client/src/prompts", `${promptfile}_${lang}.json`));
      });
    }
  }
} else if (environment !== "development") {
  app.use(express.static(path.join(__dirname, "../client/dist")));
  app.get("/{*splat}", function (req, res) {
    res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
  });
}

io.on("connection", (socket) => {
  console.log(`[session ${socket.id}] connected`);

  //Session variables
  let run = true;
  let handRaised = false;
  let isPaused = false;//for prototype
  let currentSpeaker = 0;
  let extraMessageCount = 0;
  let meetingId;
  let meetingDate;

  //These are stored in database and will be recovered on reconnection
  let conversation = [];
  let conversationOptions = {
    topic: "",
    characters: {},
  };

  const calculateCurrentSpeaker = () => {
    if (conversation.length === 0) return 0;
    if (conversation.length === 1) return 1;
    for (let i = conversation.length - 1; i >= 0; i--) {
      //If last message was human input
      if (conversation[i].type === "human") {
        //And it contained a question to a particular food
        if (conversation[i].askParticular && (conversationOptions.characters.findIndex(char => char.name === conversation[i].askParticular) !== -1)) {
          //Ask them directly
          return conversationOptions.characters.findIndex(char => char.name === conversation[i].askParticular);
        } else {
          //If just a human question to anyone in the council, skip it
          continue;
        }
      }
      //Skip invitations
      if (conversation[i].type === "invitation") continue;

      // Skip direct responses to questions when calculating next speaker
      if (conversation[i].type === 'response') {
        //Check if it was supposed to be this character speaking anyway
        const indexOfSecondLast = conversationOptions.characters.findIndex(char => char.name === conversation[i - 2].speaker);
        const nextAfter = indexOfSecondLast >= conversationOptions.characters.length - 1 ? 0 : indexOfSecondLast + 1;
        //Unless we should have spoken anyway
        if (conversationOptions.characters[nextAfter].name !== conversation[i].speaker) {
          // Skip the human question in calculation too
          i--;
          continue;
        }
      }

      const lastSpeakerIndex = conversationOptions.characters.findIndex(
        (char) => char.id === conversation[i].speaker
      );

      return lastSpeakerIndex >= conversationOptions.characters.length - 1
        ? 0
        : lastSpeakerIndex + 1;
    }
  };

  if (environment === "prototype") {
    socket.on("pause_conversation", () => {
      isPaused = true;
      console.log(`[meeting ${meetingId}] paused`);
    });

    socket.on("resume_conversation", () => {
      console.log(`[meeting ${meetingId}] resumed`);
      isPaused = false;
      handleConversationTurn();
    });

    socket.on("submit_injection", async (message) => {
      let { response, id } = await chairInterjection(
        message.text.replace("[DATE]", message.date),
        message.index,
        message.length,
        true
      );

      let summary = {
        id: id,
        speaker: conversationOptions.characters[0].id,
        text: response,
        type: "interjection",
      };

      conversation.push(summary);

      socket.emit("conversation_update", conversation);
      console.log(
        `[meeting ${meetingId}] interjection generated on index ${conversation.length - 1
        }`
      );

      ////Split message into sentences
      summary.sentences = splitSentences(response);

      generateAudio(summary, conversationOptions.characters[0]);
    });

    socket.on("remove_last_message", () => {
      conversation.pop();
      socket.emit("conversation_update", conversation);
    });
  }

  socket.on("raise_hand", async (handRaisedOptions) => {
    console.log(
      `[meeting ${meetingId}] hand raised on index ${handRaisedOptions.index - 1
      }`
    );
    handRaised = true;
    conversationOptions.state.humanName = handRaisedOptions.humanName;

    // Cut everything after the raised index
    conversation = conversation.slice(0, handRaisedOptions.index);

    if (!conversationOptions.state.alreadyInvited) {
      let { response, id } = await chairInterjection(
        conversationOptions.options.raiseHandPrompt[conversationOptions.language].replace(
          "[NAME]",
          conversationOptions.state.humanName
        ),
        handRaisedOptions.index,
        conversationOptions.options.raiseHandInvitationLength
      );

      const firstNewLineIndex = response.indexOf("\n\n");
      if (firstNewLineIndex !== -1) {
        response = response.substring(0, firstNewLineIndex);
      }

      const message = {
        id: id,
        speaker: conversationOptions.characters[0].id,
        text: response,
        type: "invitation",
        message_index: handRaisedOptions.index,
      }

      //Add the invitation
      conversation.push(message);

      ////Split message into sentences
      message.sentences = splitSentences(response);

      conversationOptions.state.alreadyInvited = true;
      console.log(`[meeting ${meetingId}] invitation generated, on index ${handRaisedOptions.index}`);

      //will run async
      generateAudio(message, conversationOptions.characters[0]);
    }

    //Set a waiting message at the end of the stack and wait
    conversation.push({
      type: 'awaiting_human_question',
      speaker: conversationOptions.state.humanName
    });

    console.log(`[meeting ${meetingId}] awaiting human question on index ${conversation.length - 1}`);

    //Store alreadyInvited and humanName
    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation, 'options.state': conversationOptions.state } }
    );

    socket.emit("conversation_update", conversation);
  });

  const chairInterjection = async (
    interjectionPrompt,
    index,
    length,
    dontStop
  ) => {
    try {
      const chair = conversationOptions.characters[0];
      let messages = buildMessageStack(chair, index);

      messages.push({
        role: "system",
        content: interjectionPrompt,
      });

      const completion = await openai.chat.completions.create({
        model: conversationOptions.options.gptModel,
        max_completion_tokens: length,
        temperature: conversationOptions.options.temperature,
        frequency_penalty: conversationOptions.options.frequencyPenalty,
        presence_penalty: conversationOptions.options.presencePenalty,
        stop: dontStop ? "" : "\n---",
        messages: messages,
      });

      let response = completion.choices[0].message.content.trim();

      if (response.startsWith(chair.name + ":")) {
        response = response.substring(chair.name.length + 1).trim();
      } else if (response.startsWith("**" + chair.name + "**:")) {
        response = response.substring(chair.name.length + 5).trim();
      }

      return { response, id: completion.id };
    } catch (error) {
      console.error("Error during conversation:", error);
      socket.emit("conversation_error", {
        message: "An error occurred during the conversation.",
        code: 500,
      });
      reportError(error);
    }
  };

  const buildMessageStack = function (speaker, upToIndex) {
    let messages = [];

    messages.push({
      role: "system",
      content: `${conversationOptions.topic}\n\n${speaker.prompt}`.trim(),
    });

    for (const msg of conversation) {
      if (msg.type === "skipped") continue;
      const speakerName = msg.type === 'human' ? conversationOptions.humanName : conversationOptions.characters.find(c => c.id === msg.speaker).name;
      messages.push({
        role: speaker.id === msg.speaker ? "assistant" : "user",
        content: speakerName + ": " + msg.text + "\n---",
      });
    }

    if (upToIndex) {
      messages = messages.slice(0, 1 + upToIndex);
      return messages;
    }

    messages.push({
      role: "system",
      content: speaker.name + ": ",
    });

    return messages;
  };

  socket.on("submit_human_message", (message) => {
    console.log(
      `[meeting ${meetingId}] human input on index ${conversation.length - 1}`
    );

    //deleting the awaiting_human_question
    if (conversation[conversation.length - 1].type !== 'awaiting_human_question') {
      throw new Error("Received a human question but was not expecting one!");
    }
    conversation.pop();

    //If there was an invitation, delete it too
    if (conversation[conversation.length - 1].type === 'invitation') {
      console.log(`[meeting ${meetingId}] popping invitation down to index ${conversation.length - 1}`);
      conversation.pop();
    }

    if (message.askParticular) {
      console.log(`[meeting ${meetingId}] specifically asked to ${message.askParticular}`);
      message.text = message.speaker + " asked " + message.askParticular + ":\xa0" + message.text;
    } else {
      //Use non-breaking space \xa0
      message.text = message.speaker + (conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
    }

    message.id = "human-" + uuidv4(); // Use UUID for unique message IDs for human messages
    message.type = "human";
    message.speaker = conversationOptions.humanName;

    //Add the question to the conversation
    conversation.push(message);

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation } }
    );

    socket.emit("conversation_update", conversation);

    ////Split message into sentences
    message.sentences = splitSentences(message.text);

    generateAudio(message, conversationOptions.characters[0]);

    isPaused = false;
    handRaised = false;
    handleConversationTurn();
  });

  socket.on("submit_human_panelist", (message) => {
    console.log(`[meeting ${meetingId}] human panelist ${message.speaker} on index ${conversation.length - 1}`);

    //deleting the awaiting_human_panelist
    if (conversation[conversation.length - 1].type !== 'awaiting_human_panelist') {
      throw new Error("Received a human panelist but was not expecting one!");
    }
    conversation.pop();

    message.text = conversationOptions.characters.find(c => c.id === message.speaker).name + (conversationOptions.language === 'en' ? " said: " : " sa: ") + message.text;
    message.id = message.speaker + uuidv4(); // Use UUID for unique message IDs for human messages
    message.type = "panelist";

    //add it to the stack
    conversation.push(message);

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation } }
    );

    socket.emit("conversation_update", conversation);

    ////Split message into sentences
    message.sentences = splitSentences(message.text);

    generateAudio(message, conversationOptions.characters[0]);

    isPaused = false;
    handRaised = false;
    handleConversationTurn();
  });

  socket.on("wrap_up_meeting", async (message) => {
    const summaryPrompt = conversationOptions.options.finalizeMeetingPrompt[conversationOptions.language].replace("[DATE]", message.date);

    let { response, id } = await chairInterjection(
      summaryPrompt,
      conversation.length,
      conversationOptions.options.finalizeMeetingLength,
      true
    );

    let summary = {
      id: id,
      speaker: conversationOptions.characters[0].id,
      text: response,
      type: "summary",
    };

    conversation.push(summary);

    socket.emit("conversation_update", conversation);
    console.log(
      `[meeting ${meetingId}] summary generated on index ${conversation.length - 1}`
    );

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation, summary: summary } }
    );

    ////Split message into sentences
    summary.sentences = splitSentences(response);

    generateAudio(summary, conversationOptions.characters[0], true);
  });

  socket.on("continue_conversation", () => {
    extraMessageCount += conversationOptions.options.extraMessageCount;

    isPaused = false;
    handleConversationTurn();
  });

  socket.on("attempt_reconnection", async (options) => {
    console.log(`[meeting ${options.meetingId}] attempting to resume`);

    try {
      const existingMeeting = await meetingsCollection.findOne({
        _id: options.meetingId,
      });

      if (existingMeeting) {
        //restore all session variables
        meetingId = existingMeeting._id;
        conversation = existingMeeting.conversation;
        conversationOptions = existingMeeting.options;
        meetingDate = new Date(existingMeeting.date);
        handRaised = options.handRaised;
        extraMessageCount =
          options.conversationMaxLength -
          conversationOptions.options.conversationMaxLength;

        //If some audio are missing, try to regenerate them
        let missingAudio = [];
        for (let i = 0; i < conversation.length; i++) {
          if (conversation[i].type === 'awaiting_human_panelist') continue;
          if (conversation[i].type === 'awaiting_human_question') continue;
          if (existingMeeting.audio.indexOf(conversation[i].id) === -1) {
            missingAudio.push(conversation[i]);
          }
        }
        for (let i = 0; i < missingAudio.length; i++) {
          console.log(`[meeting ${meetingId}] (async) generating missing audio for ${missingAudio[i].speaker}`);
          missingAudio[i].sentences = splitSentences(missingAudio[i].text);
          generateAudio(
            missingAudio[i],
            conversationOptions.characters.find(c => c.id == missingAudio[i].speaker)
          );
        }

        console.log(`[meeting ${meetingId}] resumed`);
        handleConversationTurn(); // TODO: Do we need to find the correct message index to play from?
      } else {
        socket.emit("meeting_not_found", { meeting_id: meetingId });
        console.log(`[meeting ${meetingId}] not found`);
      }
    } catch (error) {
      console.error("Error resuming conversation:", error);
      socket.emit("conversation_error", {
        message: "An error occurred while resuming the conversation.",
        code: 500,
      });
      reportError(error);
    }
  });

  socket.on("start_conversation", async (setup) => {
    conversationOptions = setup;
    if (environment === "prototype") {
      conversationOptions.options = setup.options ?? globalOptions;
    } else {
      conversationOptions.options = globalOptions;
    }

    //Clean up names, although shouldn't be needed
    // for (let i = 0; i < conversationOptions.characters.length; i++) {
    //   conversationOptions.characters[i].name = toTitleCase(
    //     conversationOptions.characters[i].name
    //   );
    // }


    conversation = [];
    currentSpeaker = 0;
    extraMessageCount = 0;
    isPaused = false; //for prototype
    handRaised = false;
    meetingDate = new Date();

    //State variables that are stored in database
    conversationOptions.state = {
      alreadyInvited: false
    };

    const storeResult = await insertMeeting({
      options: conversationOptions,
      audio: [],
      conversation: [],
      date: meetingDate.toISOString(),
    });

    meetingId = storeResult.insertedId;

    socket.emit("meeting_started", { meeting_id: meetingId });
    console.log(`[session ${socket.id} meeting ${meetingId}] started`);
    handleConversationTurn();
  });

  const handleConversationTurn = async () => {
    try {
      const thisMeetingId = meetingId;
      if (!run) return;
      if (handRaised) return;
      if (isPaused) return;
      if (conversation.length >= conversationOptions.options.conversationMaxLength + extraMessageCount) return;
      if (conversation.length > 0 && conversation[conversation.length - 1].type === 'awaiting_human_panelist') return;
      if (conversation.length > 0 && conversation[conversation.length - 1].type === 'awaiting_human_question') return;
      currentSpeaker = calculateCurrentSpeaker();

      //If we have reached a human panelist
      if (conversationOptions.characters[currentSpeaker].type === 'panelist') {

        //Set a waiting message at the end of the stack and wait
        conversation.push({
          type: 'awaiting_human_panelist',
          speaker: conversationOptions.characters[currentSpeaker].id
        });

        console.log(`[meeting ${meetingId}] awaiting human panelist on index ${conversation.length - 1}`);

        //Client will collect message once it reaches this message
        socket.emit("conversation_update", conversation);

        //TODO what if we restart while waiting for human input? Make sure it recovers correctly
        meetingsCollection.updateOne(
          { _id: meetingId },
          { $set: { conversation: conversation } }
        );

        //Don't continue further
        return;
      }

      let attempt = 1;
      let output = { response: "" };
      while (attempt < 5 && output.response === "") {
        output = await generateTextFromGPT(conversationOptions.characters[currentSpeaker]);

        if (!run) return;
        if (handRaised) return;
        if (isPaused) return;
        if (thisMeetingId != meetingId) return; //On prototype, its possible to receive a message from last conversation, since socket is not restarted
        attempt++;
        if (output.reponse === "") {
          console.log(`[meeting ${meetingId}] entire message trimmed, trying again. attempt ${attempt}`);
        }
      }

      let message = {
        id: output.id,
        speaker: conversationOptions.characters[currentSpeaker].id,
        text: output.response,
        sentences: output.sentences,
        trimmed: output.trimmed,
        pretrimmed: output.pretrimmed,
      };

      //If previous message in conversation is a question directly to this food, mark it as response
      if (conversation.length > 1 && conversation[conversation.length - 1].type === "human" && conversation[conversation.length - 1].askParticular === message.speaker) {
        message.type = "response";
      }

      if (message.text === "") {
        message.type = "skipped";
        console.warn(`[meeting ${meetingId}] failed to make a message. Skipping speaker ${conversationOptions.characters[currentSpeaker].id}`);
        reportError({ type: "warning", warning: `skipped speaker ${conversationOptions.characters[currentSpeaker].id} because message generation failed.`, message: message });
      }

      conversation.push(message);

      const message_index = conversation.length - 1;

      socket.emit("conversation_update", conversation);
      console.log(`[meeting ${meetingId}] message generated, index ${message_index}, speaker ${message.speaker}`);

      meetingsCollection.updateOne(
        { _id: meetingId },
        { $set: { conversation: conversation } }
      );

      generateAudio(message, conversationOptions.characters[currentSpeaker]);

      if (
        conversation.length >=
        conversationOptions.options.conversationMaxLength + extraMessageCount
      ) {
        socket.emit("conversation_end", conversation);
        return;
      }

      handleConversationTurn();
    } catch (error) {
      console.error("Error during conversation:", error);
      socket.emit("conversation_error", {
        message: "An error occurred during the conversation.",
        code: 500,
      });
      reportError(error);
    }
  };

  const generateAudio = async (message, speaker, skipMatching) => {
    //If audio creation is skipped on prototype
    if (conversationOptions.options.skipAudio) return;
    // const thisConversationCounter = conversationCounter;

    if (message.type === "skipped") {
      const audioUpdate = {
        id: message.id,
        type: "skipped",
      };
      console.warn(`[meeting ${meetingId}] skipped making audio for speaker ${message.speaker}`);
      socket.emit("audio_update", audioUpdate);
      return;
    }

    let buffer;
    //check if we already have it in the database
    let generateNew = true;
    try {
      //will return null if not found
      const existingAudio = await audioCollection.findOne({
        _id: message.id,
      });
      if (existingAudio) {
        buffer = existingAudio.buffer;
        generateNew = false;
      }
    } catch (e) {
      console.log(e);
    }

    try {
      if (generateNew) {
        // console.log(`[meeting ${meetingId}] generating audio for speaker ${speaker.id}`);

        const mp3 = await openai.audio.speech.create({
          model: conversationOptions.options.voiceModel,
          voice: speaker.voice,
          speed: conversationOptions.options.audio_speed,
          input: message.text.substring(0, 4096),
          instructions: speaker.voiceInstruction
        });

        buffer = Buffer.from(await mp3.arrayBuffer());
      }


      const sentencesWithTimings = (conversationOptions.options.skipMatchingSubtitles || skipMatching) ? [] : await getSentenceTimings(buffer, message);

      const audioObject = {
        id: message.id,
        audio: buffer,
        sentences: sentencesWithTimings
      };

      // console.log(`[meeting ${meetingId}] audio generated for speaker ${speaker.id}`);

      socket.emit("audio_update", audioObject);

      //Don't store audio on prototype
      if (generateNew && environment !== "prototype") {
        const storedAudio = {
          date: new Date().toISOString(),
          meeting_id: meetingId,
          audio: buffer,
          sentences: sentencesWithTimings
        };

        //If there is a connection problem, it could be that the audio was already generated before the disconnect and then inserted into the db
        //Therefore we upsert instead of insert, so that there will not be duplication errors
        //In these cases, there will be two audio generations for the message, but only the latest one will be stored.
        await audioCollection.updateOne(
          { _id: audioObject.id },
          { $set: storedAudio },
          { upsert: true }
        );
      }
      if (environment !== "prototype") {
        await meetingsCollection.updateOne(
          { _id: meetingId },
          { $addToSet: { audio: audioObject.id } }
        );
      }
    } catch (error) {
      //Since generateAudio runs async, we need a separate try/catch block here to correctly throw errors
      console.error("Error generating audio:", error);
      socket.emit("conversation_error", {
        message: "An error occurred while resuming the conversation.",
        code: 500,
      });
      reportError(error);
    }
  };

  async function getSentenceTimings(buffer, message) {

    const audioFile = new File([buffer], "speech.mp3", { type: "audio/mpeg" });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"] // We need words to calculate exact sentence starts
    });

    const words = transcription.words;

    return mapSentencesToWords(message.sentences, words);
  }

  /**
    * Optimized sentence mapper with Multi-Token Anchoring.
    * Handles numbers ("1." vs "One") and skipped words automatically.
    */
  function mapSentencesToWords(sentences, words) {
    if (!words || words.length === 0) return [];

    // 1. Pre-process Whisper tokens for O(1) lookups
    const whisperTokens = words.map(w =>
      w.word.toLowerCase().replace(/[^\w]|_/g, "")
    );

    let cursor = 0;
    let lastEndTime = 0;

    return sentences.map((sentence) => {
      // 1. Tokenize (strips emojis/punctuation)
      const sentenceTokens = sentence.trim().split(/\s+/)
        .map(t => t.toLowerCase().replace(/[^\w]|_/g, ""))
        .filter(t => t.length > 0);

      // --- CASE: SILENT SENTENCE (Emojis/Punctuation only) ---
      // If there are no words to match, we can't find it in audio.
      // Instead of 0, assign it the timestamp where the LAST sentence ended.
      if (sentenceTokens.length === 0) {
        return {
          text: sentence,
          start: lastEndTime,
          end: lastEndTime // It effectively has 0 audio duration
        };
      }

      // --- NORMAL MATCHING LOGIC ---
      let startIndex = -1;

      // We scan a window of 15 words from the cursor
      const startSearchLimit = Math.min(cursor + 15, whisperTokens.length);

      // Multi-token start search
      for (let tokenOffset = 0; tokenOffset < Math.min(3, sentenceTokens.length); tokenOffset++) {
        const targetToken = sentenceTokens[tokenOffset];
        for (let i = cursor; i < startSearchLimit; i++) {
          if (whisperTokens[i] === targetToken) {
            // Found a match! Adjust start index back to the theoretical beginning
            startIndex = Math.max(cursor, i - tokenOffset);
            break;
          }
        }
        if (startIndex !== -1) break; // Stop if we found a match
      }

      // Fallback: If absolutely no words matched, stay at cursor
      if (startIndex === -1) startIndex = cursor;

      // Find End
      let endIndex = -1;
      const estimatedLength = sentenceTokens.length;
      // Look ahead from the FOUND start index
      const endSearchLimit = Math.min(startIndex + estimatedLength + 10, whisperTokens.length);

      // Try to match the last word, or the second to last (in case of punctuation issues)
      for (let tokenOffset = 0; tokenOffset < Math.min(3, sentenceTokens.length); tokenOffset++) {
        const targetToken = sentenceTokens[sentenceTokens.length - 1 - tokenOffset];

        // Scan backwards from limit to start (preferred for end words) or forwards
        // Here we scan forwards for simplicity and speed
        for (let i = startIndex; i < endSearchLimit; i++) {
          if (whisperTokens[i] === targetToken) {
            endIndex = i;
            // Heuristic: If we found the word very early, it might be a duplicate "the". 
            // Keep searching if it's too close, otherwise take it.
            if (i > startIndex + (estimatedLength * 0.5)) break;
          }
        }
        if (endIndex !== -1) break;
      }

      // Fallback: Calculate based on length if end not found
      if (endIndex === -1) {
        endIndex = Math.min(startIndex + estimatedLength - 1, whisperTokens.length - 1);
      }

      // Update cursor for next loop
      cursor = endIndex + 1;

      // --- BOUNDS SAFETY ---
      // Ensure we don't crash or return "questions" for everything if we run off the end
      const safeStart = words[startIndex] || words[words.length - 1];
      const safeEnd = words[endIndex] || words[words.length - 1];

      // Update our tracker so the NEXT emoji sentence knows where to start
      lastEndTime = safeEnd ? safeEnd.end : lastEndTime;

      return {
        text: sentence,
        start: safeStart ? safeStart.start : 0,
        end: safeEnd ? safeEnd.end : 0
      };
    });
  }

  const generateTextFromGPT = async (speaker) => {
    try {
      const messages = buildMessageStack(speaker);

      const completion = await openai.chat.completions.create({
        model: conversationOptions.options.gptModel,
        max_completion_tokens:
          speaker.id === conversationOptions.options.chairId
            ? conversationOptions.options.chairMaxTokens
            : conversationOptions.options.maxTokens,
        temperature: conversationOptions.options.temperature,
        frequency_penalty: conversationOptions.options.frequencyPenalty,
        presence_penalty: conversationOptions.options.presencePenalty,
        stop: "\n---",
        messages: messages,
      });

      let response = completion.choices[0].message.content
        .trim()
        .replaceAll("**", "");

      let pretrimmedContent;
      if (response.startsWith(speaker.name + ":")) {
        pretrimmedContent = response.substring(0, speaker.name.length + 1);
        response = response.substring(speaker.name.length + 1).trim();
      }

      let trimmedContent;
      let originalResponse = response;

      //Remove last half paragraphs
      if (completion.choices[0].finish_reason != "stop") {
        if (conversationOptions.options.trimSentance) {
          const lastPeriodIndex = response.lastIndexOf(".");
          if (lastPeriodIndex !== -1) {
            trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
            response = response.substring(0, lastPeriodIndex + 1);
          }
        }

        if (conversationOptions.options.trimParagraph) {
          const lastNewLineIndex = response.lastIndexOf("\n\n");
          if (lastNewLineIndex !== -1) {
            trimmedContent = originalResponse.substring(lastNewLineIndex);
            response = response.substring(0, lastNewLineIndex);
          }
        }
      }

      //Check that we are not answering for someone else
      for (var i = 0; i < conversationOptions.characters.length; i++) {
        if (i === currentSpeaker) continue;
        const nameIndex = response.indexOf(conversationOptions.characters[i].name + ":");
        if (nameIndex != -1 && nameIndex < 20) {
          response = response.substring(0, nameIndex).trim();
          trimmedContent = originalResponse.substring(nameIndex);
        }
      }

      //Split message into sentences
      let sentences = splitSentences(response);

      if (completion.choices[0].finish_reason != "stop") {
        // Check if we can re-add some messages from the end, to put back some of the list of questions that chair often produces
        if (conversationOptions.options.trimChairSemicolon) {
          if (speaker.id === conversationOptions.options.chairId) {

            const trimmedSentences = splitSentences(trimmedContent?.trim()).filter((sentence) => sentence.length > 0 && sentence !== ".");

            if (
              trimmedSentences &&
              sentences &&
              (sentences[sentences.length - 1]?.slice(-1) === ":" ||
                trimmedSentences[0]?.slice(-1) === ":")
            ) {
              if (
                trimmedSentences.length > 2 &&
                trimmedSentences[0]?.slice(0, 1) === "1" &&
                trimmedSentences[1]?.slice(0, 1) === "2"
              ) {
                trimmedContent = trimmedSentences[trimmedSentences.length - 1];
                sentences = sentences.concat(trimmedSentences.slice(0, trimmedSentences.length - 1));
                response = sentences.join("\n");
              } else if (
                trimmedSentences.length > 3 &&
                trimmedSentences[0]?.slice(-1) === ":" &&
                trimmedSentences[1]?.slice(0, 1) === "1" &&
                trimmedSentences[2]?.slice(0, 1) === "2"
              ) {
                trimmedContent = trimmedSentences[trimmedSentences.length - 1];
                sentences = sentences.concat(trimmedSentences.slice(0, trimmedSentences.length - 1));
                response = sentences.join("\n");
              } else {
                //otherwise remove also the last presentation of the list of topics
                trimmedContent = trimmedContent
                  ? sentences[sentences.length - 1] + "\n" + trimmedContent
                  : sentences[sentences.length - 1];
                sentences = sentences.slice(0, sentences.length - 1);
                response = sentences.join("\n");
              }
            }
          }
        }
      }

      return {
        id: completion.id,
        response: response,
        sentences: sentences,
        trimmed: trimmedContent,
        pretrimmed: pretrimmedContent,
      };
    } catch (error) {
      console.error("Error during API call:", error);
      throw error;
    }
  };

  function splitSentences(response) {
    // BREAKDOWN:
    // 1. (?:\d+\.\s+)? -> Optional Numbered List
    // 2. .*?           -> Content
    // 3. Delimiter Block:
    //    a. (?:[.!?…;]|:(?!\xa0))+  -> Match .!?…; OR a Colon (ONLY if NOT followed by \xa0)
    //    b. ["']?                   -> Optional Quote
    //    c. (?:[ \t]*[\p{Extended_Pictographic}]+)* -> Optional Emojis
    //    d. (?=\s|$)                -> Must be followed by ANY whitespace (including \xa0) or End
    
    const sentenceRegex = /(?:\d+\.\s+)?.*?(?:(?:[.!?…;]|:(?!\xa0))+["']?(?:[ \t]*[\p{Extended_Pictographic}]+)*(?=\s|$)|$|\n)/gu;

    return response
      .match(sentenceRegex)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
  }

  socket.on('request_clientkey', async () => {
    console.log(`[meeting ${meetingId}] clientkey requested`);
    try {
      const sessionConfig = JSON.stringify({
        session: {
          "type": "transcription",
          "audio": {
            "input": {
              "format": {
                "type": "audio/pcm",
                "rate": 24000
              },
              "noise_reduction": {
                "type": "near_field"
              },
              "transcription": {
                "model": conversationOptions.options.transcribeModel,
                "prompt": conversationOptions.options.transcribePrompt[conversationOptions.language],
                "language": conversationOptions.language
              },
              "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 500
              }
            }
          }
        }
      });

      const response = await fetch(
        "https://api.openai.com/v1/realtime/client_secrets",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openai.apiKey}`,
            "Content-Type": "application/json",
          },
          body: sessionConfig,
        }
      );

      const data = await response.json();
      socket.emit("clientkey_response", data);
      console.log(`[meeting ${meetingId}] clientkey sent`);
    } catch (error) {
      console.error("Error during conversation:", error);
      socket.emit(
        "conversation_error",
        {
          message: "An error occurred during the conversation.",
          code: 500
        }
      );
      reportError(error);
    }
  });

  socket.on("disconnect", () => {
    run = false;
    console.log(
      `[session ${socket.id} meeting ${meetingId ?? "unstarted"}] disconnected`
    );
  });
});

httpServer.listen(3001, () => {
  console.log("[init] Listening on *:3001");
});

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM shutdown');
  process.exit(1);
});
process.on('SIGINT', () => {
  console.log('[Shutdown] SIGINT shutdown');
  process.exit(1);
});