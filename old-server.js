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

const maxResponseLength = 200;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected');
    let conversation = [];
    let characterRoles = {};

    socket.on('start_conversation', ({ characterData, topic }) => {
        console.log(`Conversation started on topic: ${topic}`);
        console.log('Character Data:', characterData);
        
        conversation = [];
        characterRoles = {};
    
        if (!Array.isArray(characterData) || characterData.length === 0) {
            console.error('Invalid character data received.');
            socket.emit('conversation_error', 'Invalid character data.');
            return;
        }
    
        characterData.forEach(char => {
            characterRoles[char.name.trim()] = char.role.trim();
        });
    
        if (Object.keys(characterRoles).length === 0) {
            console.error('No valid characters found.');
            socket.emit('conversation_error', 'No valid characters for conversation.');
            return;
        }
    
        const firstSpeaker = Object.keys(characterRoles)[0];
        console.log('First Speaker:', firstSpeaker);
    
        const firstPrompt = { speaker: firstSpeaker, text: `${firstSpeaker}, ${topic}` };
        handleConversationTurn(firstPrompt, socket, conversation, topic, characterRoles);
    });    

    const handleConversationTurn = async (prompt, socket, conversation, topic, characterRoles) => {
        try {
            const response = await generateTextFromGPT4(prompt.text, prompt.speaker);
            conversation.push({ speaker: prompt.speaker, text: response });

            socket.emit('conversation_update', conversation);
            if (conversation.length >= 10) {
            socket.emit('conversation_end', conversation);
            return;
            }

            const nextSpeaker = determineNextSpeaker(conversation);
            const role = characterRoles[nextSpeaker] || 'Participant';
            const nextPromptText = `${conversation.map(turn => turn.text).join(' ')} ${role} ${nextSpeaker}, ${topic}`;
            const nextPrompt = { speaker: nextSpeaker, text: nextPromptText };

            handleConversationTurn(nextPrompt, socket, conversation, topic, characterRoles);
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
            model: "gpt-4",
            max_tokens: maxResponseLength
        });
    
        let response = completion.choices[0].message.content.trim();
    
        response = response.replace(/\s+$/, '');
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

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

httpServer.listen(3000, () => {
    console.log('Listening on *:3000');
});
