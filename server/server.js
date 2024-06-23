// require("dotenv").config();
// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const path = require("path");
// const OpenAI = require("openai");
// const { Tiktoken } = require("tiktoken/lite");
// const cl100k_base = require("tiktoken/encoders/cl100k_base.json");
// const { MongoClient } = require("mongodb");

// const app = express();
// const httpServer = http.createServer(app);
// const io = new Server(httpServer);
// const openai = new OpenAI(process.env.OPENAI_API_KEY);
// const globalOptions = require("./global-options");

// //Names of OpenAI voices
// const audioVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

// //Database
// const mongoClient = new MongoClient(process.env.MONGO_URL);
// const db = mongoClient.db("CouncilOfFoods");
// const meetingsCollection = db.collection("meetings");
// const audioCollection = db.collection("audio");
// const counters = db.collection("counters");
// const initializeDB = async () => {
//   try {
//     await counters.insertOne({ _id: "meeting_id", seq: 0 });
//     console.log("[init] No meeting ID found, created initial meeting #0");
//   } catch (e) {
//     if (e.errorResponse?.code === 11000) {
//       console.log(
//         "[init] Meeting ID counter already found in database. Not creating meeting #0"
//       );
//       return;
//     }
//     throw e; //If any other error, re-throw
//   }
// };
// //https://www.mongodb.com/docs/v3.0/tutorial/create-an-auto-incrementing-field/
// const insertMeeting = async (meeting) => {
//   //Update the counter
//   const ret = await counters.findOneAndUpdate(
//     { _id: "meeting_id" },
//     { $inc: { seq: 1 } }
//   );
//   //old value is returned
//   meeting._id = ret.seq;
//   return await meetingsCollection.insertOne(meeting);
// };

// initializeDB();

// if (process.env.NODE_ENV != "development") {
//   //Don't server the static build in development
//   app.use(express.static(path.join(__dirname, "../client/build")));

//   app.get("/*", function (req, res) {
//     res.sendFile(path.join(__dirname, "../client/build", "index.html"));
//   });
// }

// io.on("connection", (socket) => {
//   //Set up the variables accessible to this socket
//   //These can be accessed within any function
//   console.log("[session] a user connected");

//   let run = true; //Flag to cancel recursive api calls if socket is closed, ie. disconnected etc.
//   let isPaused = false; // Flag to check if the conversation is paused
//   let handRaised = false;
//   let conversation = [];
//   let conversationCount = 0;
//   let currentSpeaker = 0;
//   let extraMessageCount = 0;
//   let meetingId;
//   let meetingDate;

//   //Every time we restart, this is incremented, so that all messages from previous conversations are dropped
//   let conversationCounter = 0;

//   //These are updated on conversation start and resume
//   let conversationOptions = {
//     topic: "",
//     characters: {},
//   };

//   let logit_biases = [];

//   let invitation;

//   // socket.on("pause_conversation", () => {
//   // isPaused = true;
//   // console.log('Conversation has been paused');
//   // });

//   // Add a new event to resume the conversation
//   // socket.on("resume_conversation", (options) => {
//   // conversationOptions = options;
//   // console.log('Conversation has been resumed');
//   // isPaused = false;
//   // handleConversationTurn();
//   // });

//   socket.on("raise_hand", async (handRaisedOptions) => {
//     //When hand is raised, ignore all incoming messages until we have a human message
//     handRaised = true;

//     let { response, id } = await chairInterjection(
//       globalOptions.raiseHandPrompt.replace(
//         "[NAME]",
//         conversationOptions.humanName
//       ),
//       handRaisedOptions.index,
//       globalOptions.raiseHandInvitationLength
//     );

//     //Trim it down to one paragraph
//     const firstNewLineIndex = response.indexOf("\n\n");
//     if (firstNewLineIndex !== -1) {
//       response = response.substring(0, firstNewLineIndex);
//     }

//     //Store the invitation, but keep the rest of the stack for now.
//     //If hand is lowered before invitation is played.
//     invitation = {
//       id: id,
//       speaker: conversationOptions.characters[0].name,
//       text: response,
//       purpose: "invitation",
//       message_index: handRaisedOptions.index,
//     };

//     //Cut everything after the submitted index + 1
//     //Because we want to include the new invitation
//     // conversation = conversation.slice(0, index + 1);

//     //Adjust the current message_index

//     socket.emit("invitation_to_speak", invitation);

//     //This is an async function, and since we are not waiting for the response, it will run in a paralell thread.
//     //The result will be emitted to the socket when it's ready
//     //The rest of the conversation continues

//     const voice = conversationOptions.characters[0].voice
//       ? conversationOptions.characters[0].voice
//       : audioVoices[0];

//     generateAudio(id, conversation.length - 1, response, voice);
//   });

//   socket.on("lower_hand", async () => {
//     handRaised = false;
//     isPaused = false;
//     invitation = null;
//     //Start the conversation again
//     handleConversationTurn();
//   });

//   const chairInterjection = async (
//     interjectionPrompt,
//     index,
//     length,
//     dontStop
//   ) => {
//     try {
//       const thisConversationCounter = conversationCounter;
//       // Chairman is always first character
//       const chair = conversationOptions.characters[0];
//       // Generate response using GPT-4 for AI characters
//       // Build the array of messages for the completion request
//       let messages = buildMessageStack(chair, index);

//       //inject the system prompt
//       messages.push({
//         role: "system",
//         content: interjectionPrompt,
//       });

//       // Prepare the completion request
//       const completion = await openai.chat.completions.create({
//         model: globalOptions.gptModel,
//         max_tokens: length,
//         temperature: globalOptions.temperature,
//         frequency_penalty: globalOptions.frequencyPenalty,
//         presence_penalty: globalOptions.presencePenalty,
//         stop: dontStop ? "" : "\n---",
//         messages: messages,
//       });

//       // Extract and clean up the response
//       let response = completion.choices[0].message.content.trim();

//       if (thisConversationCounter != conversationCounter) return;

//       //If the prompt starts with the character name, remove it
//       if (response.startsWith(chair.name + ":")) {
//         //save the trimmed content, for debugging the prompts
//         // pretrimmedContent = response.substring(0, speaker.name.length + 1);
//         //remove the name, and any additional whitespace created by this
//         response = response.substring(chair.name.length + 1).trim();
//       } else if (response.startsWith("**" + chair.name + "**:")) {
//         //save the trimmed content, for debugging the prompts
//         pretrimmedContent = response.substring(0, speaker.name.length + 5);
//         //remove the name, and any additional whitespace created by this
//         response = response.substring(speaker.name.length + 5).trim();
//       }

//       return { response, id: completion.id };
//     } catch (error) {
//       console.error("Error during conversation:", error);
//       socket.emit(
//         "conversation_error",
//         "An error occurred during the conversation."
//       );
//     }
//   };

//   const buildMessageStack = function (speaker, upToIndex) {
//     let messages = [];

//     // System message for overall context
//     messages.push({
//       role: "system",
//       content: `${conversationOptions.topic}\n\n${speaker.prompt}`.trim(),
//     });

//     // Add previous messages as separate user objects
//     conversation.forEach((msg) => {
//       if (msg.type == "skipped") return; //skip certain messages
//       messages.push({
//         role: speaker.name == msg.speaker ? "assistant" : "user",
//         content: msg.speaker + ": " + msg.text + "\n---", //We add the name of the character before each message, so that they will be less confused about who said what.
//       });
//     });

//     //Cut everything after the submitted index
//     if (upToIndex) {
//       //System prompt + up desired index
//       //upToIndex is not included in returned array by slice function
//       messages = messages.slice(0, 1 + upToIndex);
//       return messages;
//     }

//     //Push a message with the character name at the end of the conversation, in the hope that the character will understand who they are and not repeat their name
//     //Works most of the time.
//     messages.push({
//       role: "system",
//       content: speaker.name + ": ",
//     });

//     return messages;
//   };

//   socket.on("submit_human_message", (message) => {
//     //If we have a human message, means that we previously had an invitation
//     conversation[invitation.message_index] = invitation;

//     //Cut all messages after this
//     conversation = conversation.slice(0, invitation.message_index + 1);

//     //Add the human name to the beginning of the message
//     message.text = conversationOptions.humanName + " said: " + message.text;

//     //Add the human message to the stack, and then start the conversation again
//     message.id = "human-" + conversationCounter + "-" + conversation.length;
//     message.type = "human";
//     message.speaker = conversationOptions.humanName;
//     conversation.push(message);

//     //Emit the new complete conversation
//     socket.emit("conversation_update", conversation);

//     //Update the database
//     meetingsCollection.updateOne(
//       { _id: meetingId },
//       { $set: { conversation: conversation } }
//     );

//     //Don't read human messages for now
//     //Otherwise, generate audio here

//     //Use Water voice for now, otherwise change to separate human voice
//     generateAudio(
//       message.id,
//       conversation.length - 1,
//       message.text,
//       audioVoices[0]
//     );

//     // socket.emit("audio_update", {
//     // id: message.id,
//     // message_index: conversation.length - 1,
//     // type: "human",
//     // });

//     isPaused = false;
//     handRaised = false;
//     // Determine the next speaker
//     // currentSpeaker = currentSpeaker >= conversationOptions.characters.length - 1 ? 0 : currentSpeaker + 1;
//     // TODO: Might be a problem here?
//     handleConversationTurn();
//   });

//   socket.on("wrap_up_meeting", async () => {
//     const summaryPrompt = globalOptions.finalizeMeetingPrompt.replace(
//       "[DATE]",
//       meetingDate.toISOString().split("T")[0]
//     );

//     let { response, id } = await chairInterjection(
//       summaryPrompt,
//       conversation.length,
//       globalOptions.finalizeMeetingLength,
//       true
//     );

//     let summary = {
//       id: id,
//       speaker: conversationOptions.characters[0].name,
//       text: response,
//       purpose: "summary",
//       shouldResume: true,
//     };

//     const voice = conversationOptions.characters[0].voice
//       ? conversationOptions.characters[0].voice
//       : audioVoices[0];

//     socket.emit("meeting_summary", summary);

//     //Save the summary
//     meetingsCollection.updateOne(
//       { _id: meetingId },
//       { $set: { summary: summary } }
//     );

//     generateAudio(id, conversation.length - 1, response, voice);
//   });

//   socket.on("continue_conversation", () => {
//     // console.log('Conversation has been continued');
//     // extraMessageCount += globalOptions.conversationMaxLength;

//     // Get 5 extra messages
//     extraMessageCount += 5;

//     isPaused = false;
//     // Determine the next speaker
//     currentSpeaker =
//       currentSpeaker >= conversationOptions.characters.length - 1
//         ? 0
//         : currentSpeaker + 1;

//     // Start with the chairperson introducing the topic
//     handleConversationTurn((shouldResume = true));
//   });

//   const resumeConversation = async (meetingId) => {
//     console.log(`!!!Resuming meeting #${meetingId}...`);

//     try {
//       const existingMeeting = await meetingsCollection.findOne({
//         _id: meetingId,
//       });

//       if (existingMeeting) {
//         meetingId = existingMeeting._id;
//         conversation = existingMeeting.conversation;
//         conversationOptions = existingMeeting.options;
//         conversationDate = new Date(existingMeeting.date);
//         // TODO: Set current message???
//         console.log(`[meeting ${meetingId}] resumed`);
//         handleConversationTurn((shouldResume = true)); // Start the conversation with resume flag set to true
//       } else {
//         socket.emit("meeting_not_found", { meeting_id: meetingId });
//         console.log(`[meeting ${meetingId}] not found`);
//       }
//     } catch (error) {
//       console.error("Error resuming conversation:", error);
//       socket.emit(
//         "conversation_error",
//         "An error occurred while resuming the conversation."
//       );
//     }
//   };

//   socket.on("start_conversation", async (options) => {
//     conversationOptions = options;

//     if (conversationOptions.meetingId) {
//       // Resume conversation
//       resumeConversation(conversationOptions.meetingId);
//     } else {
//       for (let i = 0; i < conversationOptions.characters.length; i++) {
//         conversationOptions.characters[i].name = toTitleCase(
//           conversationOptions.characters[i].name
//         );
//       }
//       conversation = [];
//       conversationCount = 0;
//       currentSpeaker = 0;
//       extraMessageCount = 0;
//       isPaused = false;
//       handRaised = false;
//       conversationCounter++;
//       console.log("[session] session counter: " + conversationCounter);
//       logit_biases = calculateLogitBiases();
//       meetingDate = new Date();

//       //Start a new meeting
//       const storeResult = await insertMeeting({
//         options: conversationOptions,
//         audio: [],
//         conversation: [],
//         date: meetingDate.toISOString(),
//       });

//       meetingId = storeResult.insertedId;

//       socket.emit("meeting_started", { meeting_id: meetingId });
//       console.log(`[meeting ${meetingId}] started`);
//       // Start with the chairperson introducing the topic
//       handleConversationTurn();
//     }
//   });

//   const calculateLogitBiases = () => {
//     const encoding = new Tiktoken(
//       cl100k_base.bpe_ranks,
//       cl100k_base.special_tokens,
//       cl100k_base.pat_str
//     );

//     let biases = [];
//     for (var i = 0; i < conversationOptions.characters.length; i++) {
//       let forbidden_tokens = [];
//       for (var j = 0; j < conversationOptions.characters.length; j++) {
//         if (i == j) continue;
//         const chars = encoding.encode(conversationOptions.characters[j].name);
//         for (var k = 0; k < chars.length; k++) {
//           forbidden_tokens.push(chars[k]);
//         }
//       }
//       let bias = {};
//       for (let l = 0; l < forbidden_tokens.length; l++) {
//         bias[forbidden_tokens[l]] = globalOptions.logitBias;
//       }
//       biases[i] = bias;
//     }

//     // don't forget to free the encoder after it is not used
//     encoding.free();

//     return biases;
//   };

//   const handleConversationTurn = async (shouldResume = false) => {
//     try {
//       const thisConversationCounter = conversationCounter;
//       if (!run) return;
//       if (isPaused) return; // Don't proceed if the conversation is paused
//       if (handRaised) return;

//       let response = "";
//       let attempt = 1;
//       let output = { response: "" };
//       // Try three times
//       while (attempt < 5 && output.response == "") {
//         output = await generateTextFromGPT(
//           conversationOptions.characters[currentSpeaker]
//         );

//         //If hand is raised or conversation is paused, just stop here, ignore this message
//         if (isPaused) return;
//         if (handRaised) return;
//         if (thisConversationCounter != conversationCounter) return;
//         attempt++;
//       }

//       let message = {
//         id: output.id,
//         speaker: conversationOptions.characters[currentSpeaker].name,
//         text: output.response,
//         trimmed: output.trimmed,
//         pretrimmed: output.pretrimmed,
//         shouldResume,
//       };
//       //If a character has completely answered for someone else, skip it, and go to the next
//       if (message.text == "") {
//         message.type = "skipped";
//         console.log("Skipped a message");
//       }

//       // Add the response to the conversation
//       conversation.push(message);

//       //A rolling index of the message number, so that audio can be played in the right order etc.
//       const message_index = conversation.length - 1;

//       socket.emit("conversation_update", conversation);
//       console.log(
//         `[meeting ${meetingId}] conversation length ${conversation.length}`
//       );

//       //Update the database
//       meetingsCollection.updateOne(
//         { _id: meetingId },
//         { $set: { conversation: conversation } }
//       );

//       //This is an async function, and since we are not waiting for the response, it will run in a paralell thread.
//       //The result will be emitted to the socket when it's ready
//       //The rest of the conversation continues
//       const voice = conversationOptions.characters[currentSpeaker].voice
//         ? conversationOptions.characters[currentSpeaker].voice
//         : audioVoices[currentSpeaker % audioVoices.length];
//       if (message.type != "skipped") {
//         generateAudio(message.id, message_index, message.text, voice);
//       } else {
//         //If we have an empty message, removed because this character pretended to be someone else
//         //Send down a message saying this the audio of this message should be skipped
//         const audioUpdate = {
//           id: message.id,
//           message_index: message_index,
//           type: "skipped",
//         };
//         socket.emit("audio_update", audioUpdate);
//       }

//       // Check for conversation end
//       if (
//         conversation.length >=
//         globalOptions.conversationMaxLength + extraMessageCount
//       ) {
//         socket.emit("conversation_end", conversation);
//         return;
//       }

//       // Determine the next speaker
//       currentSpeaker =
//         currentSpeaker >= conversationOptions.characters.length - 1
//           ? 0
//           : currentSpeaker + 1;

//       handleConversationTurn();
//     } catch (error) {
//       console.error("Error during conversation:", error);
//       socket.emit(
//         "conversation_error",
//         "An error occurred during the conversation."
//       );
//     }
//   };

//   const generateAudio = async (id, index, text, voiceName) => {
//     //Request the audio
//     const thisConversationCounter = conversationCounter;

//     const mp3 = await openai.audio.speech.create({
//       model: "tts-1",
//       voice: voiceName,
//       input: text.substring(0, 4096), //Max input length
//     });

//     //Wait until the whole buffer is downloaded.
//     //This is better if we can pipe it to a stream in the future, so that we don't have to wait until it's done.
//     const buffer = Buffer.from(await mp3.arrayBuffer());
//     if (thisConversationCounter != conversationCounter) return;

//     //Save the audio also here on server, so that we can put it in the database later
//     const audioObject = {
//       id: id,
//       message_index: index,
//       audio: buffer,
//     };

//     socket.emit("audio_update", audioObject);

//     //Update the database
//     const storedAudio = {
//       _id: audioObject.id,
//       date: new Date().toISOString(),
//       meeting_id: meetingId,
//       message_index: index,
//       audio: buffer,
//     };

//     await audioCollection.insertOne(storedAudio);

//     meetingsCollection.updateOne(
//       { _id: meetingId },
//       { $push: { audio: audioObject.id } }
//     );
//   };

//   const generateTextFromGPT = async (speaker) => {
//     try {
//       // Build the array of messages for the completion request
//       const messages = buildMessageStack(speaker);

//       // Prepare the completion request
//       const completion = await openai.chat.completions.create({
//         model: globalOptions.gptModel,
//         max_tokens:
//           speaker.name == "Water"
//             ? globalOptions.chairMaxTokens
//             : globalOptions.maxTokens,
//         temperature: globalOptions.temperature,
//         frequency_penalty: globalOptions.frequencyPenalty,
//         presence_penalty: globalOptions.presencePenalty,
//         stop: "\n---",
//         logit_bias:
//           conversation.length == 0 ? null : logit_biases[currentSpeaker], //no logit bias on first message by water
//         messages: messages,
//       });

//       // Extract and clean up the response
//       let response = completion.choices[0].message.content.trim();

//       let pretrimmedContent;
//       //If the prompt starts with the character name, remove it
//       if (response.startsWith(speaker.name + ":")) {
//         //save the trimmed content, for debugging the prompts
//         pretrimmedContent = response.substring(0, speaker.name.length + 1);
//         //remove the name, and any additional whitespace created by this
//         response = response.substring(speaker.name.length + 1).trim();
//       } else if (response.startsWith("**" + speaker.name + "**:")) {
//         //save the trimmed content, for debugging the prompts
//         pretrimmedContent = response.substring(0, speaker.name.length + 5);
//         //remove the name, and any additional whitespace created by this
//         response = response.substring(speaker.name.length + 5).trim();
//       }

//       let trimmedContent;
//       let originalResponse = response;

//       //If model has already stopped, don't worry about trying to crop it to a proper sentence
//       if (completion.choices[0].finish_reason != "stop") {
//         //Remove the last half sentence
//         if (globalOptions.trimSentance) {
//           // response = response.replace(/\s+$/, ""); //not sure what this is doing?
//           const lastPeriodIndex = response.lastIndexOf(".");
//           if (lastPeriodIndex !== -1) {
//             trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
//             response = response.substring(0, lastPeriodIndex + 1);
//           }
//         }

//         //Remove the last half paragraph
//         if (globalOptions.trimParagraph) {
//           const lastNewLineIndex = response.lastIndexOf("\n\n");
//           if (lastNewLineIndex !== -1) {
//             trimmedContent = originalResponse.substring(lastNewLineIndex);
//             response = response.substring(0, lastNewLineIndex);
//           }
//         }
//       }

//       //if we find someone elses name in there, trim it
//       for (var i = 0; i < conversationOptions.characters.length; i++) {
//         if (i == currentSpeaker) continue; //Don't cut things from our own name
//         const nameIndex = response.indexOf(
//           conversationOptions.characters[i].name + ":"
//         );
//         if (nameIndex != -1 && nameIndex < 20) {
//           response = response.substring(0, nameIndex).trim();
//           trimmedContent = originalResponse.substring(nameIndex);
//         }
//       }

//       return {
//         id: completion.id,
//         response: response,
//         trimmed: trimmedContent,
//         pretrimmed: pretrimmedContent,
//       };
//     } catch (error) {
//       console.error("Error during API call:", error);
//       throw error;
//     }
//   };

//   socket.on("disconnect", () => {
//     run = false;
//     console.log("[session] a user disconnected");
//     //After this, the socket and all variables will be garbage collected automatically, since all loops stop
//   });
// });

// httpServer.listen(3001, () => {
//   console.log("[init] Listening on *:3001");
// });

// function toTitleCase(string) {
//   return string
//     .toLowerCase()
//     .split(" ")
//     .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
//     .join(" ");
// }

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
  pingTimeout: 60000, // Increase ping timeout
  maxHttpBufferSize: 1e8, // Increase maximum buffer size
  transports: ["websocket", "polling"], // Ensure WebSocket is used primarily
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

  let run = true;
  let isPaused = false;
  let handRaised = false;
  let conversation = [];
  let conversationCount = 0;
  let currentSpeaker = 0;
  let extraMessageCount = 0;
  let meetingId;
  let meetingDate;
  let conversationCounter = 0;
  let conversationOptions = {
    topic: "",
    characters: {},
  };
  let logit_biases = [];
  let invitation;

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

    socket.emit("invitation_to_speak", invitation);

    const voice = conversationOptions.characters[0].voice
      ? conversationOptions.characters[0].voice
      : audioVoices[0];

    generateAudio(id, conversation.length - 1, response, voice);
  });

  socket.on("lower_hand", async () => {
    handRaised = false;
    isPaused = false;
    invitation = null;
    handleConversationTurn();
  });

  const chairInterjection = async (
    interjectionPrompt,
    index,
    length,
    dontStop
  ) => {
    try {
      const thisConversationCounter = conversationCounter;
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

      if (thisConversationCounter != conversationCounter) return;

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
    message.id = uuidv4(); // Use UUID for unique message IDs
    message.type = "human";
    message.speaker = conversationOptions.humanName;
    conversation.push(message);

    socket.emit("conversation_update", conversation);

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { conversation: conversation } }
    );

    generateAudio(
      message.id,
      conversation.length - 1,
      message.text,
      audioVoices[0]
    );

    isPaused = false;
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

    const voice = conversationOptions.characters[0].voice
      ? conversationOptions.characters[0].voice
      : audioVoices[0];

    socket.emit("meeting_summary", summary);

    meetingsCollection.updateOne(
      { _id: meetingId },
      { $set: { summary: summary } }
    );

    generateAudio(id, conversation.length - 1, response, voice);
  });

  socket.on("continue_conversation", () => {
    extraMessageCount += 5;
    isPaused = false;
    currentSpeaker =
      currentSpeaker >= conversationOptions.characters.length - 1
        ? 0
        : currentSpeaker + 1;

    handleConversationTurn((shouldResume = true));
  });

  const resumeConversation = async (meetingId) => {
    console.log(`!!!Resuming meeting #${meetingId}...`);

    try {
      const existingMeeting = await meetingsCollection.findOne({
        _id: meetingId,
      });

      if (existingMeeting) {
        meetingId = existingMeeting._id;
        conversation = existingMeeting.conversation;
        conversationOptions = existingMeeting.options;
        conversationDate = new Date(existingMeeting.date);
        console.log(`[meeting ${meetingId}] resumed`);
        handleConversationTurn((shouldResume = true));
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
  };

  socket.on("start_conversation", async (options) => {
    conversationOptions = options;

    if (conversationOptions.meetingId) {
      resumeConversation(conversationOptions.meetingId);
    } else {
      for (let i = 0; i < conversationOptions.characters.length; i++) {
        conversationOptions.characters[i].name = toTitleCase(
          conversationOptions.characters[i].name
        );
      }
      conversation = [];
      conversationCount = 0;
      currentSpeaker = 0;
      extraMessageCount = 0;
      isPaused = false;
      handRaised = false;
      conversationCounter++;
      console.log("[session] session counter: " + conversationCounter);
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
    }
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
      const thisConversationCounter = conversationCounter;
      if (!run) return;
      if (isPaused) return;
      if (handRaised) return;

      let response = "";
      let attempt = 1;
      let output = { response: "" };
      while (attempt < 5 && output.response == "") {
        output = await generateTextFromGPT(
          conversationOptions.characters[currentSpeaker]
        );

        if (isPaused) return;
        if (handRaised) return;
        if (thisConversationCounter != conversationCounter) return;
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

      const voice = conversationOptions.characters[currentSpeaker].voice
        ? conversationOptions.characters[currentSpeaker].voice
        : audioVoices[currentSpeaker % audioVoices.length];
      if (message.type != "skipped") {
        generateAudio(message.id, message_index, message.text, voice);
      } else {
        const audioUpdate = {
          id: message.id,
          message_index: message_index,
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

      currentSpeaker =
        currentSpeaker >= conversationOptions.characters.length - 1
          ? 0
          : currentSpeaker + 1;

      handleConversationTurn();
    } catch (error) {
      console.error("Error during conversation:", error);
      socket.emit(
        "conversation_error",
        "An error occurred during the conversation."
      );
    }
  };

  const generateAudio = async (id, index, text, voiceName) => {
    const thisConversationCounter = conversationCounter;

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voiceName,
      input: text.substring(0, 4096),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    if (thisConversationCounter != conversationCounter) return;

    const audioId = uuidv4();

    const audioObject = {
      id: audioId,
      message_id: id,
      message_index: index,
      audio: buffer,
    };

    socket.emit("audio_update", audioObject);

    const storedAudio = {
      _id: audioObject.id,
      date: new Date().toISOString(),
      meeting_id: meetingId,
      message_index: index,
      audio: buffer,
    };

    try {
      await audioCollection.insertOne(storedAudio);
      await meetingsCollection.updateOne(
        { _id: meetingId },
        { $push: { audio: audioObject.id } }
      );
    } catch (error) {
      if (error.code === 11000) {
        console.error("Duplicate key error: ", error.keyValue);
      } else {
        throw error;
      }
    }
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
