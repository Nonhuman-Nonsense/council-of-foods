require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const OpenAI = require("openai");
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid"); // Import UUID library

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // pingTimeout: 60000, // Increase ping timeout
  // maxHttpBufferSize: 1e8, // Increase maximum buffer size
  // transports: ["websocket", "polling"], // Ensure WebSocket is used primarily
});

const openai = new OpenAI(process.env.OPENAI_API_KEY);
const globalOptions = require("./global-options");

// Names of OpenAI voices
const audioVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

// Database setup
const mongoClient = new MongoClient(process.env.MONGO_URL);
const db = mongoClient.db("CouncilOfFoods");
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

if (process.env.NODE_ENV !== "development") {
  app.use(express.static(path.join(__dirname, "../client/build")));
  app.get("/*", function (req, res) {
    res.sendFile(path.join(__dirname, "../client/build", "index.html"));
  });
}

io.on("connection", (socket) => {
  console.log("[session] a user connected");

  //Session variables
  let run = true;
  // let isPaused = false; //this is for prototype, deactivate for now
  let handRaised = false;
  let conversation = [];
  let currentSpeaker = 0;
  let extraMessageCount = 0;
  let meetingId;
  let meetingDate;
  // let conversationCounter = 0; //this is for prototype, deactivate for now
  let conversationOptions = {
    topic: "",
    characters: {},
  };
  let logit_biases = [];
  let invitation;

  const calculateCurrentSpeaker = () => {
    if(conversation.length == 0) return 0;
    if(conversation.length == 1) return 1;
    for (let i = conversation.length - 1; i > 0; i--) {
      if(conversation[i].type == 'human') continue;
      if(conversation[i].purpose == 'invitation') continue;
      const lastSpeakerIndex = conversationOptions.characters.findIndex(char => char.name === conversation[i].speaker);

      return lastSpeakerIndex >= conversationOptions.characters.length - 1 ? 0 : lastSpeakerIndex + 1;
    }
  }

  socket.on("raise_hand", async (handRaisedOptions) => {
    handRaised = true;

    let { response, id } = await chairInterjection(
      globalOptions.raiseHandPrompt.replace(
        "[NAME]",
        conversationOptions.humanName
      ),
      handRaisedOptions.index,
      globalOptions.raiseHandInvitationLength
    );

    const firstNewLineIndex = response.indexOf("\n\n");
    if (firstNewLineIndex !== -1) {
      response = response.substring(0, firstNewLineIndex);
    }

    invitation = {
      id: id,
      speaker: conversationOptions.characters[0].name,
      text: response,
      purpose: "invitation",
      message_index: handRaisedOptions.index,
    };

    //We must store the invitation in database also, in case of a reconnect
    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { invitation: invitation } }
    );

    socket.emit("invitation_to_speak", invitation);

    // const voice = conversationOptions.characters[0].voice
    //   ? conversationOptions.characters[0].voice
    //   : audioVoices[0];

    generateAudio(id, response, conversationOptions.characters[0].name);
  });

  socket.on("lower_hand", async () => {
    handRaised = false;
    // isPaused = false;
    invitation = null;
    meetingsCollection.updateOne(
      { _id: meetingId },
      { $unset: { invitation: "" } }
    );
    handleConversationTurn();
  });

  const chairInterjection = async (
    interjectionPrompt,
    index,
    length,
    dontStop
  ) => {
    try {
      // const thisConversationCounter = conversationCounter;
      const chair = conversationOptions.characters[0];
      let messages = buildMessageStack(chair, index);

      messages.push({
        role: "system",
        content: interjectionPrompt,
      });

      const completion = await openai.chat.completions.create({
        model: globalOptions.gptModel,
        max_tokens: length,
        temperature: globalOptions.temperature,
        frequency_penalty: globalOptions.frequencyPenalty,
        presence_penalty: globalOptions.presencePenalty,
        stop: dontStop ? "" : "\n---",
        messages: messages,
      });

      let response = completion.choices[0].message.content.trim();

      // if (thisConversationCounter != conversationCounter) return;

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
        "An error occurred during the conversation."
      );
    }
  };

  const buildMessageStack = function (speaker, upToIndex) {
    let messages = [];

    messages.push({
      role: "system",
      content: `${conversationOptions.topic}\n\n${speaker.prompt}`.trim(),
    });

    conversation.forEach((msg) => {
      if (msg.type == "skipped") return;
      messages.push({
        role: speaker.name == msg.speaker ? "assistant" : "user",
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
    conversation[invitation.message_index] = invitation;
    conversation = conversation.slice(0, invitation.message_index + 1);
    message.text = conversationOptions.humanName + " said: " + message.text;
    message.id = "human-" + uuidv4(); // Use UUID for unique message IDs for human messages
    message.type = "human";
    message.speaker = conversationOptions.humanName;
    conversation.push(message);
    invitation = null;

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation }, $unset: { invitation: ""} }
    );

    socket.emit("conversation_update", conversation);

    generateAudio(
      message.id,
      message.text,
      conversationOptions.characters[0].name
    );

    // isPaused = false;
    handRaised = false;
    handleConversationTurn();
  });

  socket.on("wrap_up_meeting", async () => {
    const summaryPrompt = globalOptions.finalizeMeetingPrompt.replace(
      "[DATE]",
      meetingDate.toISOString().split("T")[0]
    );

    let { response, id } = await chairInterjection(
      summaryPrompt,
      conversation.length,
      globalOptions.finalizeMeetingLength,
      true
    );

    let summary = {
      id: id,
      speaker: conversationOptions.characters[0].name,
      text: response,
      purpose: "summary",
      shouldResume: true,
    };

    // const voice = conversationOptions.characters[0].voice
    //   ? conversationOptions.characters[0].voice
    //   : audioVoices[0];

    socket.emit("meeting_summary", summary);

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { summary: summary } }
    );

    generateAudio(id, response, conversationOptions.characters[0].name);
  });

  socket.on("continue_conversation", () => {
    extraMessageCount += 5;
    // isPaused = false;
    // currentSpeaker =
    //   currentSpeaker >= conversationOptions.characters.length - 1
    //     ? 0
    //     : currentSpeaker + 1;

    handleConversationTurn((shouldResume = true));
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
        logit_biases = calculateLogitBiases();
        handRaised = options.handRaised;
        extraMessageCount = options.conversationMaxLength - globalOptions.conversationMaxLength;
        invitation = existingMeeting.invitation;//if there is one, otherwise will be correctly set to null/undefined

        //If some audio are missing, try to regenerate them
        let missingAudio = [];
        for (let i = 0; i < conversation.length; i++) {
          if(existingMeeting.audio.indexOf(conversation[i].id) == -1){
            missingAudio.push(conversation[i]);
          }
        }
        for (let i = 0; i < missingAudio.length; i++) {
          generateAudio(missingAudio[i].id, missingAudio[i].text, missingAudio[i].speaker);
        }

        console.log(`[meeting ${meetingId}] resumed`);
        handleConversationTurn((shouldResume = true)); // TODO: Do we need to find the correct message index to play from?
      } else {
        socket.emit("meeting_not_found", { meeting_id: meetingId });
        console.log(`[meeting ${meetingId}] not found`);
      }
    } catch (error) {
      console.error("Error resuming conversation:", error);
      socket.emit(
        "conversation_error",
        "An error occurred while resuming the conversation."
      );
    }
  });

  socket.on("start_conversation", async (options) => {
    conversationOptions = options;

    for (let i = 0; i < conversationOptions.characters.length; i++) {
      conversationOptions.characters[i].name = toTitleCase(
        conversationOptions.characters[i].name
      );
    }
    conversation = [];
    currentSpeaker = 0;
    extraMessageCount = 0;
    // isPaused = false;
    handRaised = false;
    // conversationCounter++;
    // console.log("[session] session counter: " + conversationCounter);
    logit_biases = calculateLogitBiases();
    meetingDate = new Date();

    const storeResult = await insertMeeting({
      options: conversationOptions,
      audio: [],
      conversation: [],
      date: meetingDate.toISOString(),
    });

    meetingId = storeResult.insertedId;

    socket.emit("meeting_started", { meeting_id: meetingId });
    console.log(`[meeting ${meetingId}] started`);
    handleConversationTurn();
  });

  const calculateLogitBiases = () => {
    const encoding = new Tiktoken(
      cl100k_base.bpe_ranks,
      cl100k_base.special_tokens,
      cl100k_base.pat_str
    );

    let biases = [];
    for (var i = 0; i < conversationOptions.characters.length; i++) {
      let forbidden_tokens = [];
      for (var j = 0; j < conversationOptions.characters.length; j++) {
        if (i == j) continue;
        const chars = encoding.encode(conversationOptions.characters[j].name);
        for (var k = 0; k < chars.length; k++) {
          forbidden_tokens.push(chars[k]);
        }
      }
      let bias = {};
      for (let l = 0; l < forbidden_tokens.length; l++) {
        bias[forbidden_tokens[l]] = globalOptions.logitBias;
      }
      biases[i] = bias;
    }

    encoding.free();

    return biases;
  };

  const handleConversationTurn = async (shouldResume = false) => {
    try {
      // const thisConversationCounter = conversationCounter;
      if (!run) return;
      // if (isPaused) return;
      if (handRaised) return;
      if (conversation.length >= globalOptions.conversationMaxLength + extraMessageCount) return;
      currentSpeaker = calculateCurrentSpeaker();

      let response = "";
      let attempt = 1;
      let output = { response: "" };
      while (attempt < 5 && output.response == "") {
        output = await generateTextFromGPT(
          conversationOptions.characters[currentSpeaker]
        );

        // if (isPaused) return;
        if (handRaised) return;
        // if (thisConversationCounter != conversationCounter) return;
        attempt++;
      }

      let message = {
        id: output.id,
        speaker: conversationOptions.characters[currentSpeaker].name,
        text: output.response,
        trimmed: output.trimmed,
        pretrimmed: output.pretrimmed,
        shouldResume,
      };
      if (message.text == "") {
        message.type = "skipped";
        console.log("Skipped a message");
      }

      conversation.push(message);

      const message_index = conversation.length - 1;

      socket.emit("conversation_update", conversation);
      console.log(
        `[meeting ${meetingId}] conversation length ${conversation.length}`
      );

      meetingsCollection.updateOne(
        { _id: meetingId },
        { $set: { conversation: conversation } }
      );

      // const voice = conversationOptions.characters[currentSpeaker].voice
      //   ? conversationOptions.characters[currentSpeaker].voice
      //   : audioVoices[currentSpeaker % audioVoices.length];
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
        globalOptions.conversationMaxLength + extraMessageCount
      ) {
        socket.emit("conversation_end", conversation);
        return;
      }

      // currentSpeaker =
      //   currentSpeaker >= conversationOptions.characters.length - 1
      //     ? 0
      //     : currentSpeaker + 1;

      handleConversationTurn();
    } catch (error) {
      console.error("Error during conversation:", error);
      socket.emit(
        "conversation_error",
        "An error occurred during the conversation."
      );
    }
  };

  const generateAudio = async (id, text, speakerName) => {
    // const thisConversationCounter = conversationCounter;
    const voiceName = conversationOptions.characters.find((char) => char.name == speakerName).voice;

    let buffer;
    //check if we already have it in the database
    let generateNew = true;
    try {
      //will return null if not found
      const existingAudio = await audioCollection.findOne({
        _id: id,
      });
      if(existingAudio){
        buffer = existingAudio.buffer;
        generateNew = false;
      }
    }catch(e){
      console.log(e);
    }

    if(generateNew){
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voiceName,
        input: text.substring(0, 4096),
      });

      buffer = Buffer.from(await mp3.arrayBuffer());
      // if (thisConversationCounter != conversationCounter) return;
    }

    const audioObject = {
      id: id,
      message_id: id,
      // message_index: index,
      audio: buffer,
    };

    socket.emit("audio_update", audioObject);

    const storedAudio = {
      _id: audioObject.id,
      date: new Date().toISOString(),
      meeting_id: meetingId,
      // message_index: index,
      audio: buffer,
    };

    await audioCollection.replaceOne({_id: audioObject.id}, storedAudio, {upsert: true});
    await meetingsCollection.updateOne(
      { _id: meetingId },
      { $push: { audio: audioObject.id } }
    );
  };

  const generateTextFromGPT = async (speaker) => {
    try {
      const messages = buildMessageStack(speaker);

      const completion = await openai.chat.completions.create({
        model: globalOptions.gptModel,
        max_tokens:
          speaker.name == "Water"
            ? globalOptions.chairMaxTokens
            : globalOptions.maxTokens,
        temperature: globalOptions.temperature,
        frequency_penalty: globalOptions.frequencyPenalty,
        presence_penalty: globalOptions.presencePenalty,
        stop: "\n---",
        logit_bias:
          conversation.length == 0 ? null : logit_biases[currentSpeaker],
        messages: messages,
      });

      let response = completion.choices[0].message.content.trim();

      let pretrimmedContent;
      if (response.startsWith(speaker.name + ":")) {
        pretrimmedContent = response.substring(0, speaker.name.length + 1);
        response = response.substring(speaker.name.length + 1).trim();
      } else if (response.startsWith("**" + speaker.name + "**:")) {
        pretrimmedContent = response.substring(0, speaker.name.length + 5);
        response = response.substring(speaker.name.length + 5).trim();
      }

      let trimmedContent;
      let originalResponse = response;

      if (completion.choices[0].finish_reason != "stop") {
        if (globalOptions.trimSentance) {
          const lastPeriodIndex = response.lastIndexOf(".");
          if (lastPeriodIndex !== -1) {
            trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
            response = response.substring(0, lastPeriodIndex + 1);
          }
        }

        if (globalOptions.trimParagraph) {
          const lastNewLineIndex = response.lastIndexOf("\n\n");
          if (lastNewLineIndex !== -1) {
            trimmedContent = originalResponse.substring(lastNewLineIndex);
            response = response.substring(0, lastNewLineIndex);
          }
        }
      }

      for (var i = 0; i < conversationOptions.characters.length; i++) {
        if (i == currentSpeaker) continue;
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
    console.log("[session] a user disconnected");
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
