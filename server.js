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

const maxResponseLength = 100;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected');
    let conversation = [];
    let characterRoles = {};
    let chairperson = {};
    let frequency = 5; // Default frequency
    let conversationCount = 0;
    let topic;

    let isPaused = false; // Flag to check if the conversation is paused

    socket.on('pause_conversation', () => {
        isPaused = true;
    });

    socket.on('submit_human_message', (message) => {
        if (isPaused) {
            console.log('Message received:', message);
            const humanPrompt = { speaker: 'Human', text: message };
            isPaused = false; // Resume the conversation
            handleConversationTurn(humanPrompt, socket, conversation, topic, characterRoles);
        }
    });

    socket.on('start_conversation', ({ characterData, topic, chairpersonData, frequencyInput }) => {
        // console.log(`Conversation started on topic: ${topic}`);
        
        conversation = [];
        characterRoles = {};
        chairperson = chairpersonData;
        frequency = frequencyInput || 5; // Set frequency or default
        conversationCount = 0;
    
        characterData.forEach(char => {
            characterRoles[char.name.trim()] = char.role.trim();
        });

        // Add chairperson to character roles
        if (chairperson && chairperson.name) {
            characterRoles[chairperson.name] = chairperson.role;
        }
    
        if (Object.keys(characterRoles).length === 0) {
            console.error('No valid characters found.');
            socket.emit('conversation_error', 'No valid characters for conversation.');
            return;
        }

        // console.log(characterData);
    
        // Start with the chairperson introducing the topic
        const firstPrompt = { speaker: chairperson.name, text: topic };
        // console.log(firstPrompt);
        handleConversationTurn(firstPrompt, socket, conversation, topic, characterRoles);
    });    


    const handleConversationTurn = async (prompt, socket, conversation, topic, characterRoles) => {
        try {
            if (isPaused) return; // Don't proceed if the conversation is paused
    
            let response;
    
            if (prompt.speaker === 'Human') {
                // Directly use the human's message
                response = prompt.text;
            } else {
                // Generate response using GPT-4 for AI characters
                response = await generateTextFromGPT4(topic, prompt.speaker);
            }
    
            // Add the response to the conversation
            conversation.push({ speaker: prompt.speaker, text: response });
            socket.emit('conversation_update', conversation);
    
            // Check for conversation end
            if (conversation.length >= 20) {
                socket.emit('conversation_end', conversation);
                return;
            }
    
            // Determine the next speaker
            let nextSpeaker;
            if (conversationCount % (frequency * 5) === 0 && conversationCount !== 0) {
                nextSpeaker = chairperson.name;
            } else {
                nextSpeaker = determineNextSpeaker();
            }
    
            // Prepare the next prompt
            const role = characterRoles[nextSpeaker] || 'Participant';
            const nextPromptText = `${role} ${nextSpeaker}, ${topic}`;
            const nextPrompt = { speaker: nextSpeaker, text: nextPromptText };
    
            handleConversationTurn(nextPrompt, socket, conversation, topic, characterRoles);
            conversationCount++;

            // console.log('conversationasdfasdf', conversation)
        } catch (error) {
            console.error('Error during conversation:', error);
            socket.emit('conversation_error', 'An error occurred during the conversation.');
        }
    };      

    const generateTextFromGPT4 = async (topic, speaker) => {
        try {
            // Check if it's the first message in the conversation
            const isFirstMessage = conversation.length === 0;
    
            let systemMessageContent, userMessageContent;
    
            if (isFirstMessage) {
                // Content for the first message
                systemMessageContent = `You are currently role-playing as a ${speaker} in a panel discussion. You are the moderator. Start the conversation on the topic.`;
                userMessageContent = `As ${speaker}, initiate the conversation about: ${topic}`;
            } else {
                // Content for subsequent messages
                const lastThreeMessages = conversation.slice(-3).map(turn => `${turn.speaker}: ${turn.text}`).join(' ');
                systemMessageContent = `You are currently role-playing as a ${speaker} on a panel discussion.`;
                userMessageContent = `Please respond to the participants and build on the conversation. Do not add your name before your message!\n\nHere are the past 3 messages of the conversation: ${lastThreeMessages}.\n\nAlso here's the overall topic of the meeting: ${topic}`;
            }
    
            // Prepare the completion request
            const completion = await openai.chat.completions.create({
                messages: [
                    {
                        "role": "system",
                        "content": systemMessageContent
                    },
                    {
                        "role": "user",
                        "content": userMessageContent
                    }
                ],
                model: "gpt-4",
                max_tokens: maxResponseLength
            });
    
            // Extract and clean up the response
            let response = completion.choices[0].message.content.trim();
    
            response = response.replace(/\s+$/, '');
            const lastPeriodIndex = response.lastIndexOf('.');
            if (lastPeriodIndex !== -1) {
                response = response.substring(0, lastPeriodIndex + 1);
            }

            // console.log('////', conversation, '////');
    
            return response;
        } catch (error) {
            console.error('Error during API call:', error);
            throw error;
        }
    };
    
 

    const determineNextSpeaker = () => {
        const speakers = Object.keys(characterRoles).filter(name => name !== chairperson.name);
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
