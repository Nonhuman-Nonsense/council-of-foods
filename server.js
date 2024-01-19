require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// const maxResponseLength = 200;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {

    //Set up the variables accessible to this socket
    //These can be accessed within any function
    console.log('A user connected');

    let run = true; //Flag to cancel recursive api calls if socket is closed, ie. disconnected etc.
    let isPaused = false; // Flag to check if the conversation is paused
    let conversation = [];
    let conversationCount = 0;
    let currentSpeaker = 0;
    let extraMessageCount = 0;

    //These are updated on conversation start and resume
    let topic = "";
    let characters = {};
    let options = {};

    socket.on('pause_conversation', () => {
        isPaused = true;
        console.log('Conversation has been paused');
    });

    // Add a new event to resume the conversation
    socket.on('resume_conversation', (promptsAndOptions) => {
        console.log('Conversation has been resumed');
        isPaused = false;
        parsePromptsAndOptions(promptsAndOptions);
        handleConversationTurn();
    });

    socket.on('submit_human_message', (message) => {
      console.log("A human message is received!");
        if (isPaused) {
            // Resume the conversation
            isPaused = false;
            // Only needs to be started if it's not running
            handleConversationTurn();
        }
        //Just inject the message into the conversation stack, and let everyone deal with it!
        conversation.push(message);
    });

    socket.on('continue_conversation', (promptsAndOptions) => {
      console.log('Conversation has been continued');
      parsePromptsAndOptions(promptsAndOptions);
      extraMessageCount += options.conversationMaxLength;
      isPaused = false;
      // Determine the next speaker
      currentSpeaker = currentSpeaker >= characters.length - 1 ? 0 : currentSpeaker+1;
      // Start with the chairperson introducing the topic
      handleConversationTurn();
    });

    socket.on('start_conversation', (promptsAndOptions) => {
      parsePromptsAndOptions(promptsAndOptions);
      conversation = [];
      conversationCount = 0;
      currentSpeaker = 0;
      extraMessageCount = 0;
      isPaused = false;

      // Start with the chairperson introducing the topic
      handleConversationTurn();
    });

    const handleConversationTurn = async () => {
        try {
            if(!run) return;
            if (isPaused) return; // Don't proceed if the conversation is paused

            let response;

            // Generate response using GPT-4 for AI characters
            response = await generateTextFromGPT(characters[currentSpeaker]);

            // Add the response to the conversation
            conversation.push({ speaker: characters[currentSpeaker].name, text: response });
            socket.emit('conversation_update', conversation);

            // Check for conversation end
            if (conversation.length >= options.conversationMaxLength + extraMessageCount) {
                socket.emit('conversation_end', conversation);
                return;
            }

            // Determine the next speaker
            currentSpeaker = currentSpeaker >= characters.length - 1 ? 0 : currentSpeaker+1;

            handleConversationTurn();
        } catch (error) {
            console.error('Error during conversation:', error);
            socket.emit('conversation_error', 'An error occurred during the conversation.');
        }
    };

    const generateTextFromGPT = async (speaker) => {
        try {
            // Build the array of messages for the completion request
            const messages = [];

            // System message for overall context
            messages.push({
                role: "system",
                content: `${topic}\n\n${speaker.role}`
            });

            // Add previous messages as separate user objects
            conversation.forEach((msg) => {
                messages.push({
                    role: (speaker.name == msg.speaker ? "assistant" : "user"),
                    content: msg.text
                });
            });

            // Prepare the completion request
            // console.log(conversation.length);
            // console.log(messages);
            const completion = await openai.chat.completions.create({
                model: options.gptModel,
                max_tokens: options.maxResponseCharCountInput,
                messages: messages
            });

            // Extract and clean up the response
            let response = completion.choices[0].message.content.trim();

            //Remove the last half sentence
            if(options.trimSentance){
              response = response.replace(/\s+$/, '');
              const lastPeriodIndex = response.lastIndexOf('.');
              if (lastPeriodIndex !== -1) {
                  response = response.substring(0, lastPeriodIndex + 1);
              }
            }
            return response;
        } catch (error) {
            console.error('Error during API call:', error);
            throw error;
        }
    };

    const parsePromptsAndOptions = (p) => {
      topic = p.topic;
      characters = p.characters;
      options = p.options;

      if (Object.keys(characters).length === 0) {
        console.error('No valid characters found.');
        socket.emit('conversation_error', 'No valid characters for conversation.');
        return;
      }
    }

    socket.on('disconnect', () => {
        run = false;
        console.log('User disconnected');
        //After this, the socket and all variables will be garbage collected automatically, since all loops stop
    });
});

httpServer.listen(3000, () => {
    console.log('Listening on *:3000');
});
