require("dotenv").config();
const environment = process.env.NODE_ENV ?? 'production';
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const OpenAI = require("openai");
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid"); // Import UUID library

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // pingTimeout: 60000, // Increase ping timeout
  // maxHttpBufferSize: 1e8, // Increase maximum buffer size
  // transports: ["websocket", "polling"], // Ensure WebSocket is used primarily
});

if(!process.env.COUNCIL_OPENAI_API_KEY){
  throw new Error("COUNCIL_OPENAI_API_KEY environment variable not set.");
}
const openai = new OpenAI({ apiKey: process.env.COUNCIL_OPENAI_API_KEY });
const globalOptions = require("./global-options");

// Database setup
if(!process.env.COUNCIL_DB_URL){
  throw new Error("COUNCIL_DB_URL environment variable not set.");
}
const mongoClient = new MongoClient(process.env.COUNCIL_DB_URL);
if(!process.env.COUNCIL_DB_PREFIX){
  throw new Error("COUNCIL_DB_PREFIX environment variable not set.");
}

const { reportError } = require('./errorbot');

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
  app.use(express.static(path.join(__dirname, "../prototype/", 'public')));
  app.get("/foods.json", function (req, res) {
    res.sendFile(path.join(__dirname, "../client/src/prompts", "foods.json"));
  });
  app.get("/topics.json", function (req, res) {
    res.sendFile(path.join(__dirname, "../client/src/prompts", "topics.json"));
  });
} else if (environment !== "development") {
  app.use(express.static(path.join(__dirname, "../client/build")));
  app.get("/*", function (req, res) {
    res.sendFile(path.join(__dirname, "../client/build", "index.html"));
  });
}

io.on("connection", (socket) => {
  console.log(`[session ${socket.id}] connected`);

  //Session variables
  let run = true;
  let handRaised = false;
  let isPaused = false;//for prototype
  let conversation = [];
  let currentSpeaker = 0;
  let extraMessageCount = 0;
  let meetingId;
  let meetingDate;
  let conversationOptions = {
    topic: "",
    characters: {},
  };

  const calculateCurrentSpeaker = () => {
    if (conversation.length === 0) return 0;
    if (conversation.length === 1) return 1;
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].type === 'human') continue;
      if (conversation[i].type === 'invitation') continue;
      const lastSpeakerIndex = conversationOptions.characters.findIndex(char => char.name === conversation[i].speaker);

      return lastSpeakerIndex >= conversationOptions.characters.length - 1 ? 0 : lastSpeakerIndex + 1;
    }
  }

  if (environment === 'prototype') {
    socket.on('pause_conversation', () => {
      isPaused = true;
      console.log(`[meeting ${meetingId}] paused`);
    });

    socket.on('resume_conversation', () => {
      console.log(`[meeting ${meetingId}] resumed`);
      isPaused = false;
      handleConversationTurn();
    });

    socket.on('submit_injection', async (message) => {
      let { response, id } = await chairInterjection(
        message.text.replace("[DATE]",message.date),
        message.index,
        message.length,
        true
      );

      let summary = {
        id: id,
        speaker: conversationOptions.characters[0].name,
        text: response,
        type: "interjection"
      };

      conversation.push(summary);

      socket.emit("conversation_update", conversation);
      console.log(
        `[meeting ${meetingId}] interjection generated on index ${conversation.length - 1}`
      );

      generateAudio(id, response, conversationOptions.characters[0].name);
    });

    socket.on('remove_last_message', () => {
      conversation.pop();
      socket.emit('conversation_update', conversation);
    });
  }

  socket.on("raise_hand", async (handRaisedOptions) => {

    console.log(`[meeting ${meetingId}] hand raised on index ${handRaisedOptions.index - 1}`);
    handRaised = true;
    conversationOptions.humanName = handRaisedOptions.humanName;

    let { response, id } = await chairInterjection(
      conversationOptions.options.raiseHandPrompt.replace(
        "[NAME]",
        conversationOptions.humanName
      ),
      handRaisedOptions.index,
      conversationOptions.options.raiseHandInvitationLength
    );

    const firstNewLineIndex = response.indexOf("\n\n");
    if (firstNewLineIndex !== -1) {
      response = response.substring(0, firstNewLineIndex);
    }

    let invitation = {
      id: id,
      speaker: conversationOptions.characters[0].name,
      text: response,
      type: "invitation",
      message_index: handRaisedOptions.index,
    };

    // Cut everything after the invitation
    conversation[invitation.message_index] = invitation;
    conversation = conversation.slice(0, invitation.message_index + 1);

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation } }
    );

    console.log(`[meeting ${meetingId}] invitation generated, on index ${handRaisedOptions.index}`);

    socket.emit("conversation_update", conversation);

    generateAudio(id, response, conversationOptions.characters[0].name);
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
        max_tokens: length,
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
      socket.emit(
        "conversation_error",
        {
          message: "An error occurred during the conversation.",
          code: 500
        }
      );
      reportError(error);
    }
  };

  const buildMessageStack = function (speaker, upToIndex) {
    let messages = [];

    messages.push({
      role: "system",
      content: `${conversationOptions.topic}\n\n${speaker.prompt}`.trim(),
    });

    conversation.forEach((msg) => {
      if (msg.type === "skipped") return;
      messages.push({
        role: speaker.name === msg.speaker ? "assistant" : "user",
        content: msg.speaker + ": " + msg.text + "\n---",
      });
    });

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
    console.log(`[meeting ${meetingId}] human input on index ${conversation.length - 1}`);
    message.text = conversationOptions.humanName + " said: " + message.text;
    message.id = "human-" + uuidv4(); // Use UUID for unique message IDs for human messages
    message.type = "human";
    message.speaker = conversationOptions.humanName;

    //Overwrite the last message in the conversation, deleting the invitation
    conversation[conversation.length - 1] = message;

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation } }
    );

    socket.emit("conversation_update", conversation);

    generateAudio(
      message.id,
      message.text,
      conversationOptions.characters[0].name
    );

    isPaused = false;
    handRaised = false;
    handleConversationTurn();
  });

  socket.on("wrap_up_meeting", async (message) => {
    const summaryPrompt = conversationOptions.options.finalizeMeetingPrompt.replace("[DATE]", message.date);

    let { response, id } = await chairInterjection(
      summaryPrompt,
      conversation.length,
      conversationOptions.options.finalizeMeetingLength,
      true
    );

    let summary = {
      id: id,
      speaker: conversationOptions.characters[0].name,
      text: response,
      type: "summary"
    };

    conversation.push(summary);

    socket.emit("conversation_update", conversation);
    console.log(
      `[meeting ${meetingId}] summary generated on length ${conversation.length}`
    );

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation } },
      { $set: { summary: summary } }
    );

    generateAudio(id, response, conversationOptions.characters[0].name);
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
        extraMessageCount = options.conversationMaxLength - conversationOptions.options.conversationMaxLength;

        //If some audio are missing, try to regenerate them
        let missingAudio = [];
        for (let i = 0; i < conversation.length; i++) {
          if (existingMeeting.audio.indexOf(conversation[i].id) === -1) {
            missingAudio.push(conversation[i]);
          }
        }
        for (let i = 0; i < missingAudio.length; i++) {
          generateAudio(missingAudio[i].id, missingAudio[i].text, missingAudio[i].speaker);
        }

        console.log(`[meeting ${meetingId}] resumed`);
        handleConversationTurn(); // TODO: Do we need to find the correct message index to play from?
      } else {
        socket.emit("meeting_not_found", { meeting_id: meetingId });
        console.log(`[meeting ${meetingId}] not found`);
      }
    } catch (error) {
      console.error("Error resuming conversation:", error);
      socket.emit(
        "conversation_error",
        {
          message: "An error occurred while resuming the conversation.",
          code: 500
        }
      );
      reportError(error);
    }
  });

  socket.on("start_conversation", async (options) => {
    conversationOptions = options;
    if (environment === 'prototype') {
      conversationOptions.options = options.options ?? globalOptions;
    } else {
      conversationOptions.options = globalOptions;
    }

    for (let i = 0; i < conversationOptions.characters.length; i++) {
      conversationOptions.characters[i].name = toTitleCase(
        conversationOptions.characters[i].name
      );
    }
    conversation = [];
    currentSpeaker = 0;
    extraMessageCount = 0;
    isPaused = false;//for prototype
    handRaised = false;
    meetingDate = new Date();

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
      currentSpeaker = calculateCurrentSpeaker();

      let attempt = 1;
      let output = { response: "" };
      while (attempt < 5 && output.response === "") {
        output = await generateTextFromGPT(conversationOptions.characters[currentSpeaker]);

        if (!run) return;
        if (handRaised) return;
        if (isPaused) return;
        if (thisMeetingId != meetingId) return;//On prototype, its possible to receive a message from last conversation, since socket is not restarted
        attempt++;
        if (output.reponse === "") {
          console.log(`[meeting ${meetingId}] entire message trimmed, trying again. attempt ${attempt}`);
        }
      }

      let message = {
        id: output.id,
        speaker: conversationOptions.characters[currentSpeaker].name,
        text: output.response,
        trimmed: output.trimmed,
        pretrimmed: output.pretrimmed
      };
      if (message.text === "") {
        message.type = "skipped";
        console.log("Skipped a message");
      }

      conversation.push(message);

      const message_index = conversation.length - 1;

      socket.emit("conversation_update", conversation);
      console.log(
        `[meeting ${meetingId}] message generated, index ${message_index}`
      );

      meetingsCollection.updateOne(
        { _id: meetingId },
        { $set: { conversation: conversation } }
      );

      if (message.type != "skipped") {
        generateAudio(message.id, message.text, conversationOptions.characters[currentSpeaker].name);
      } else {
        const audioUpdate = {
          id: message.id,
          type: "skipped",
        };
        socket.emit("audio_update", audioUpdate);
      }

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
      socket.emit(
        "conversation_error",
        {
          message: "An error occurred during the conversation.",
          code: 500
        }
      );
      reportError(error);
    }
  };

  const generateAudio = async (id, text, speakerName) => {
    //If audio creation is skipped
    if (conversationOptions.options.skipAudio) return;
    // const thisConversationCounter = conversationCounter;
    const voiceName = conversationOptions.characters.find((char) => char.name === speakerName).voice;

    let buffer;
    //check if we already have it in the database
    let generateNew = true;
    try {
      //will return null if not found
      const existingAudio = await audioCollection.findOne({
        _id: id,
      });
      if (existingAudio) {
        buffer = existingAudio.buffer;
        generateNew = false;
      }
    } catch (e) {
      console.log(e);
    }

    if (generateNew) {
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voiceName,
        speed: conversationOptions.options.audio_speed,
        input: text.substring(0, 4096),
      });

      buffer = Buffer.from(await mp3.arrayBuffer());
    }

    const audioObject = {
      id: id,
      audio: buffer,
    };

    socket.emit("audio_update", audioObject);

    if (generateNew) {
      const storedAudio = {
        _id: audioObject.id,
        date: new Date().toISOString(),
        meeting_id: meetingId,
        // message_index: index,
        audio: buffer,
      };

      //Don't store audio on prototype
      if (environment !== 'prototype') {
        await audioCollection.insertOne(storedAudio);
      }
    }
    if (environment !== 'prototype') {
      await meetingsCollection.updateOne(
        { _id: meetingId },
        { $addToSet: { audio: audioObject.id } }
      );
    }
  };

  const generateTextFromGPT = async (speaker) => {
    try {
      const messages = buildMessageStack(speaker);

      const completion = await openai.chat.completions.create({
        model: conversationOptions.options.gptModel,
        max_tokens:
          speaker.name === conversationOptions.options.chairName
            ? conversationOptions.options.chairMaxTokens
            : conversationOptions.options.maxTokens,
        temperature: conversationOptions.options.temperature,
        frequency_penalty: conversationOptions.options.frequencyPenalty,
        presence_penalty: conversationOptions.options.presencePenalty,
        stop: "\n---",
        messages: messages,
      });

      let response = completion.choices[0].message.content.trim().replaceAll("**", "");

      let pretrimmedContent;
      if (response.startsWith(speaker.name + ":")) {
        pretrimmedContent = response.substring(0, speaker.name.length + 1);
        response = response.substring(speaker.name.length + 1).trim();
      }

      let trimmedContent;
      let originalResponse = response;

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

        if (conversationOptions.options.trimChairSemicolon) {
          if (speaker.name === conversationOptions.options.chairName) {
            // Make sure to use the same sentence splitter as on the client side
            const sentenceRegex = /(\d+\.\s+.{3,}?(?:\n|\?!\*|\?!|!\?|\?"|!"|\."|!\*|\?\*|\?|!|\?|;|\.{3}|…|\.|$))|.{3,}?(?:\n|\?!\*|\?!|!\?|\?"|!"|\."|!\*|\?\*|!|\?|;|\.{3}|…|\.|$)/gs;
            const sentences = response.match(sentenceRegex).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0 && sentence !== ".");
            const trimmedSentences = trimmedContent?.trim().match(sentenceRegex)?.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0 && sentence !== ".");


            // Check if we can re-add some messages from the end, to put back some of the list of questions that water often produces
            if (trimmedSentences && sentences && (sentences[sentences.length - 1]?.slice(-1) === ':' || trimmedSentences[0]?.slice(-1) === ':')) {
              if (trimmedSentences.length > 2 && trimmedSentences[0]?.slice(0, 1) === '1' && trimmedSentences[1]?.slice(0, 1) === '2') {
                trimmedContent = trimmedSentences[trimmedSentences.length - 1];
                response = sentences.concat(trimmedSentences.slice(0, trimmedSentences.length - 1)).join('\n');
              } else if (trimmedSentences.length > 3 && trimmedSentences[0]?.slice(-1) === ':' && trimmedSentences[1]?.slice(0, 1) === '1' && trimmedSentences[2]?.slice(0, 1) === '2') {
                trimmedContent = trimmedSentences[trimmedSentences.length - 1];
                response = sentences.concat(trimmedSentences.slice(0, trimmedSentences.length - 1)).join('\n');
              } else {
                //otherwise remove also the last presentation of the list of topics
                trimmedContent = trimmedContent ? sentences[sentences.length - 1] + '\n' + trimmedContent : sentences[sentences.length - 1];
                response = sentences.slice(0, sentences.length - 1).join('\n');
              }
            }
          }
        }

      }

      for (var i = 0; i < conversationOptions.characters.length; i++) {
        if (i === currentSpeaker) continue;
        const nameIndex = response.indexOf(
          conversationOptions.characters[i].name + ":"
        );
        if (nameIndex != -1 && nameIndex < 20) {
          response = response.substring(0, nameIndex).trim();
          trimmedContent = originalResponse.substring(nameIndex);
        }
      }

      return {
        id: completion.id,
        response: response,
        trimmed: trimmedContent,
        pretrimmed: pretrimmedContent,
      };
    } catch (error) {
      console.error("Error during API call:", error);
      throw error;
    }
  };

  socket.on("disconnect", () => {
    run = false;
    console.log(`[session ${socket.id} meeting ${meetingId ?? 'unstarted'}] disconnected`);
  });
});

httpServer.listen(3001, () => {
  console.log("[init] Listening on *:3001");
});

function toTitleCase(string) {
  return string
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM shutdown');
  process.exit(1);
});
process.on('SIGINT', () => {
  console.log('[Shutdown] SIGINT shutdown');
  process.exit(1);
});