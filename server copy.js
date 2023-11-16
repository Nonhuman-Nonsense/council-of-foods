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

// Add a constant for maximum response length
const maxResponseLength = 100; // You can adjust this value as needed

// Topic
const topic = 'what do you think about the cost of produce in different EU countries?'

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('a user connected');
    let conversation = []; // Conversation state is now unique per socket
  
    socket.on('start_conversation', ({ initialPrompts }) => {
        console.log(`Conversation started with initial prompts: ${JSON.stringify(initialPrompts)}`);
        conversation = initialPrompts;
      
        // Update characterRoles with characterData from frontend
        characterRoles = {};
        characterData.forEach(char => {
          if(char.name && char.role) {
            characterRoles[char.name] = char.role;
          }
        });
        
      if (initialPrompts.length > 0) {
        // If there are initial prompts, handle the first turn with the first prompt
        handleConversationTurn(initialPrompts[0], socket, conversation);
      } else {
        // If there are no initial prompts, start with the first character
        const firstSpeaker = Object.keys(characterRoles)[0];
        const firstPrompt = { speaker: firstSpeaker, text: `${firstSpeaker}, what are your thoughts on sustainability in agriculture?` };
        handleConversationTurn(firstPrompt, socket, conversation);
      }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

const characterRoles = {
    'Carrot': 'A wise carrot Albert Heijn',
    'Potato': 'A Curious organic Potato from Whole Foods',
    'Broccoli': 'The Jovial Broccoli from a local farm'
};

const handleConversationTurn = async (prompt, socket, conversation) => {
  try {
    const response = await generateTextFromGPT4(prompt.text, prompt.speaker);
    conversation.push({ speaker: prompt.speaker, text: response });

    socket.emit('conversation_update', conversation);
    if (conversation.length >= 10) {
      socket.emit('conversation_end', conversation);
      return;
    }

    const nextSpeaker = determineNextSpeaker(conversation);
    const role = characterRoles[nextSpeaker] || 'Participant'; // Default role if not found
    const nextPromptText = `${conversation.map(turn => turn.text).join(' ')} ${role} ${nextSpeaker}, ${topic}`;
    const nextPrompt = { speaker: nextSpeaker, text: nextPromptText };

    handleConversationTurn(nextPrompt, socket, conversation);
  } catch (error) {
    console.error('Error during conversation:', error);
    socket.emit('conversation_error', 'An error occurred during the conversation.');
  }
};

const generateTextFromGPT4 = async (prompt, speaker) => {
    try {
      const roleIntroduction = characterRoles[speaker] ? `I am ${characterRoles[speaker]}. ` : '';
      const promptWithRole = roleIntroduction + prompt;
  
      const completion = await openai.chat.completions.create({
        messages: [
          {"role": "system", "content": `You are currently role-playing as a ${speaker} on a panel discussion.`},
          {"role": "user", "content": promptWithRole}
        ],
        model: "gpt-3.5-turbo",
        max_tokens: maxResponseLength
      });
  
      let response = completion.choices[0].message.content.trim();
  
      // Trim to the last complete sentence to avoid cutting off mid-sentence
      response = response.replace(/\s+$/, ''); // Remove trailing whitespace
      const lastPeriodIndex = response.lastIndexOf('.');
      if (lastPeriodIndex !== -1) {
        response = response.substring(0, lastPeriodIndex + 1);
      }
  
      return response;
    } catch (error) {
      console.error('Error during API call:', error);
      throw error;
    }
  };
  

const determineNextSpeaker = (conversation) => {
    const speakers = Object.keys(characterRoles);
    const lastSpeaker = conversation.length > 0 ? conversation[conversation.length - 1].speaker : null;
    const lastSpeakerIndex = speakers.indexOf(lastSpeaker);

    const nextSpeakerIndex = lastSpeakerIndex === -1 ? 0 : (lastSpeakerIndex + 1) % speakers.length;
    return speakers[nextSpeakerIndex];
};  

httpServer.listen(3000, () => {
  console.log('listening on *:3000');
});
