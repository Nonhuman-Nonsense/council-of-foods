require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const openai = new OpenAI(process.env.OPENAI_API_KEY);

//Names of OpenAI voices
const audioVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

if(process.env.NODE_ENV != 'development'){
  //Don't server the static build in development
  app.use(express.static(path.join(__dirname, "../client/build")));
}

io.on("connection", (socket) => {
  //Set up the variables accessible to this socket
  //These can be accessed within any function
  console.log("A user connected");

  let run = true; //Flag to cancel recursive api calls if socket is closed, ie. disconnected etc.
  let isPaused = false; // Flag to check if the conversation is paused
  let handRaised = false;
  let conversation = [];
  let conversationCount = 0;
  let currentSpeaker = 0;
  let extraMessageCount = 0;

  //Every time we restart, this is incremented, so that all messages from previous conversations are dropped
  let conversationCounter = 0;

  //These are updated on conversation start and resume
  let topic = "";
  let characters = {};
  let options = {};

  socket.on("pause_conversation", () => {
    isPaused = true;
    // console.log('Conversation has been paused');
  });

  // Add a new event to resume the conversation
  socket.on("resume_conversation", (promptsAndOptions) => {
    // console.log('Conversation has been resumed');
    isPaused = false;
    parsePromptsAndOptions(promptsAndOptions);
    handleConversationTurn();
  });

  socket.on("raise_hand", async (promptsAndOptions) => {
    parsePromptsAndOptions(promptsAndOptions);

    //When hand is raised, ignore all incoming messages until we have a human message
    handRaised = true;

    chairInterjection(
      options.raiseHandPrompt.replace("[NAME]", options.humanName)
    );
  });

  socket.on("lower_hand", async (promptsAndOptions) => {
    parsePromptsAndOptions(promptsAndOptions);

    await chairInterjection(
      options.neverMindPrompt.replace("[NAME]", options.humanName)
    );

    handRaised = false;
    isPaused = false;
    //Start the conversation again
    handleConversationTurn();
  });

  const chairInterjection = async (interjectionPrompt) => {
    try {
      const thisConversationCounter = conversationCounter;
      //Chairman is always first character
      const chair = characters[0];
      // Generate response using GPT-4 for AI characters
      // Build the array of messages for the completion request
      const messages = [];

      // System message for overall context
      messages.push({
        role: "system",
        content: `${topic}\n\n${chair.role}`,
      });

      // Add previous messages as separate user objects
      conversation.forEach((msg) => {
        messages.push({
          role: chair.name == msg.speaker ? "assistant" : "user",
          content: msg.text,
        });
      });

      messages.push({
        role: "system",
        content: interjectionPrompt,
      });

      // Prepare the completion request
      // console.log(conversation.length);
      // console.log(messages);
      const completion = await openai.chat.completions.create({
        model: options.gptModel,
        max_tokens: 100,
        temperature: options.temperature,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        messages: messages,
      });

      // Extract and clean up the response
      let response = completion.choices[0].message.content.trim();

      if (thisConversationCounter != conversationCounter) return;
      conversation.push({
        id: completion.id,
        speaker: chair.name,
        text: response,
      });

      //A rolling index of the message number, so that audio can be played in the right order etc.
      const message_index = conversation.length - 1;

      //  TEST: Emit only one message instead of the whole conversation
      // socket.emit("conversation_update", conversation);
      socket.emit("conversation_update", {
        id: completion.id,
        speaker: chair.name,
        text: response,
      });

      //This is an async function, and since we are not waiting for the response, it will run in a paralell thread.
      //The result will be emitted to the socket when it's ready
      //The rest of the conversation continues
      const voice = characters[0].voice ? characters[0].voice : audioVoices[0];
      generateAudio(completion.id, message_index, response, voice);
    } catch (error) {
      console.error("Error during conversation:", error);
      socket.emit(
        "conversation_error",
        "An error occurred during the conversation."
      );
    }
  };

  socket.on("submit_human_message", (message) => {
    //Add it to the stack, and then start the conversation again
    // message.type = 'human';
    message.id = "human-" + conversationCounter + "-" + conversation.length;
    conversation.push(message);

    //  TEST: Emit only one message instead of the whole conversation
    // socket.emit("conversation_update", conversation);
    socket.emit("conversation_update", message);

    //Don't read human messages for now
    //Otherwise, generate audio here
    socket.emit("audio_update", {
      id: message.id,
      message_index: conversation.length - 1,
      type: "human",
    });

    isPaused = false;
    handRaised = false;
    handleConversationTurn();
  });

  socket.on("continue_conversation", (promptsAndOptions) => {
    // console.log('Conversation has been continued');
    parsePromptsAndOptions(promptsAndOptions);
    extraMessageCount += options.conversationMaxLength;
    isPaused = false;
    // Determine the next speaker
    currentSpeaker =
      currentSpeaker >= characters.length - 1 ? 0 : currentSpeaker + 1;
    // Start with the chairperson introducing the topic
    handleConversationTurn();
  });

  socket.on("start_conversation", (promptsAndOptions) => {
    parsePromptsAndOptions(promptsAndOptions);
    conversation = [];
    conversationCount = 0;
    currentSpeaker = 0;
    extraMessageCount = 0;
    isPaused = false;
    handRaised = false;
    conversationCounter++;
    console.log("Counter " + conversationCounter);

    // Start with the chairperson introducing the topic
    handleConversationTurn();
  });

  const handleConversationTurn = async () => {
    try {
      const thisConversationCounter = conversationCounter;
      if (!run) return;
      if (isPaused) return; // Don't proceed if the conversation is paused
      if (handRaised) return;

      // Generate response using GPT-4 for AI characters
      const { id, response, trimmed } = await generateTextFromGPT(
        characters[currentSpeaker]
      );

      //If hand is raised or conversation is paused, just stop here, ignore this message
      if (isPaused) return;
      if (handRaised) return;
      if (thisConversationCounter != conversationCounter) return;

      // Add the response to the conversation
      conversation.push({
        id: id,
        speaker: characters[currentSpeaker].name,
        text: response,
        trimmed: trimmed,
      });

      //A rolling index of the message number, so that audio can be played in the right order etc.
      const message_index = conversation.length - 1;

      //  TEST: Emit only one message instead of the whole conversation
      // socket.emit("conversation_update", conversation);
      socket.emit("conversation_update", {
        id: id,
        speaker: characters[currentSpeaker].name,
        text: response,
        trimmed: trimmed,
      });

      //This is an async function, and since we are not waiting for the response, it will run in a paralell thread.
      //The result will be emitted to the socket when it's ready
      //The rest of the conversation continues
      const voice = characters[currentSpeaker].voice
        ? characters[currentSpeaker].voice
        : audioVoices[currentSpeaker % audioVoices.length];
      generateAudio(id, message_index, response, voice);

      // Check for conversation end
      if (
        conversation.length >=
        options.conversationMaxLength + extraMessageCount
      ) {
        socket.emit("conversation_end", conversation);
        return;
      }

      // Determine the next speaker
      currentSpeaker =
        currentSpeaker >= characters.length - 1 ? 0 : currentSpeaker + 1;

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
    //Request the audio
    const thisConversationCounter = conversationCounter;
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voiceName,
      input: text,
    });

    //Wait until the whole buffer is downloaded.
    //This is better if we can pipe it to a stream in the future, so that we don't have to wait until it's done.
    const buffer = Buffer.from(await mp3.arrayBuffer());
    if (thisConversationCounter != conversationCounter) return;
    socket.emit("audio_update", {
      id: id,
      message_index: index,
      audio: buffer,
    });
  };

  const generateTextFromGPT = async (speaker) => {
    try {
      // Build the array of messages for the completion request
      const messages = [];

      // System message for overall context
      messages.push({
        role: "system",
        content: `${topic}\n\n${speaker.role}`,
      });

      // Add previous messages as separate user objects
      conversation.forEach((msg) => {
        messages.push({
          role: speaker.name == msg.speaker ? "assistant" : "user",
          content: msg.text,
        });
      });

      // Prepare the completion request
      // console.log(conversation.length);
      // console.log(messages);
      const completion = await openai.chat.completions.create({
        model: options.gptModel,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        messages: messages,
      });

      // Extract and clean up the response
      let response = completion.choices[0].message.content.trim();

      //If model has already stopped, don't worry about trying to crop it to a proper sentence
      let trimmedContent;
      if (completion.choices[0].finish_reason != "stop") {
        let originalResponse = response;
        //Remove the last half sentence
        if (options.trimSentance) {
          response = response.replace(/\s+$/, ""); //not sure what this is doing?
          const lastPeriodIndex = response.lastIndexOf(".");
          if (lastPeriodIndex !== -1) {
            trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
            response = response.substring(0, lastPeriodIndex + 1);
          }
        }

        //Remove the last half paragraph
        if (options.trimParagraph) {
          const lastNewLineIndex = response.lastIndexOf("\n\n");
          if (lastNewLineIndex !== -1) {
            trimmedContent = originalResponse.substring(lastNewLineIndex);
            response = response.substring(0, lastNewLineIndex);
          }
        }

        if (!options.showTrimmed) {
          trimmedContent = undefined;
        }
      }

      return { id: completion.id, response: response, trimmed: trimmedContent };
    } catch (error) {
      console.error("Error during API call:", error);
      throw error;
    }
  };

  const parsePromptsAndOptions = (p) => {
    topic = p.topic;
    characters = p.characters;
    options = p.options;

    if (Object.keys(characters).length === 0) {
      console.error("No valid characters found.");
      socket.emit(
        "conversation_error",
        "No valid characters for conversation."
      );
      return;
    }
  };

  socket.on("disconnect", () => {
    run = false;
    console.log("User disconnected");
    //After this, the socket and all variables will be garbage collected automatically, since all loops stop
  });
});

httpServer.listen(3001, () => {
  console.log("Listening on *:3001");
});
