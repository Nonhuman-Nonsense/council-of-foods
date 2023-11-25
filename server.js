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
        console.log(`Conversation started on topic: ${topic}`);
        
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
    
        // Start with the chairperson introducing the topic
        const firstPrompt = { speaker: chairperson.name, text: topic };
        handleConversationTurn(firstPrompt, socket, conversation, topic, characterRoles);
    });    

    // const handleConversationTurn = async (prompt, socket, conversation, topic, characterRoles) => {
    //     try {
    //         console.log(isPaused);
    //         if (isPaused) return; // Don't proceed if the conversation is paused

    //         const response = await generateTextFromGPT4(prompt.text, prompt.speaker);
    //         conversation.push({ speaker: prompt.speaker, text: response });

    //         socket.emit('conversation_update', conversation);

    //         // Check for conversation end
    //         if (conversation.length >= 20) {
    //             socket.emit('conversation_end', conversation);
    //             return;
    //         }

    //         // Determine the next speaker
    //         let nextSpeaker;
    //         if (conversationCount % (frequency * 5) === 0 && conversationCount !== 0) {
    //             nextSpeaker = chairperson.name;
    //         } else {
    //             nextSpeaker = determineNextSpeaker();
    //         }

    //         // Apply dynamic elements to the conversation
    //         let conversationContext = conversation.map(turn => `${turn.speaker}: ${turn.text}`).join(' ');
    //         conversationContext = addDynamicElements(conversationContext, prompt.speaker);

    //         const role = characterRoles[nextSpeaker] || 'Participant';
    //         const nextPromptText = `${conversationContext} ${role} ${nextSpeaker}, ${topic}`;
    //         const nextPrompt = { speaker: nextSpeaker, text: nextPromptText };

    //         handleConversationTurn(nextPrompt, socket, conversation, topic, characterRoles);
    //         conversationCount++;
    //     } catch (error) {
    //         console.error('Error during conversation:', error);
    //         socket.emit('conversation_error', 'An error occurred during the conversation.');
    //     }
    // };

    const handleConversationTurn = async (prompt, socket, conversation, topic, characterRoles) => {
        try {
            if (isPaused) return; // Don't proceed if the conversation is paused
    
            let response;
    
            if (prompt.speaker === 'Human') {
                // Directly use the human's message
                response = prompt.text;
            } else {
                // Generate response using GPT-4 for AI characters
                response = await generateTextFromGPT4(prompt.text, prompt.speaker);
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
    
            // Apply dynamic elements to the conversation
            let conversationContext = conversation.map(turn => `${turn.speaker}: ${turn.text}`).join(' ');
            conversationContext = addDynamicElements(conversationContext, prompt.speaker);
    
            const role = characterRoles[nextSpeaker] || 'Participant';
            const nextPromptText = `${conversationContext} ${role} ${nextSpeaker}, ${topic}`;
            const nextPrompt = { speaker: nextSpeaker, text: nextPromptText };
    
            handleConversationTurn(nextPrompt, socket, conversation, topic, characterRoles);
            conversationCount++;
        } catch (error) {
            console.error('Error during conversation:', error);
            socket.emit('conversation_error', 'An error occurred during the conversation.');
        }
    };    

    const generateTextFromGPT4 = async (prompt, speaker) => {
        try {
            // Concatenate the last few turns of the conversation for context
            const conversationContext = conversation.slice(-5).map(turn => `${turn.speaker}: ${turn.text}`).join(' ');
    
            const roleIntroduction = characterRoles[speaker] ? `${speaker} (as ${characterRoles[speaker]}): ` : '';
            const promptWithRole = `${conversationContext} ${roleIntroduction}${prompt}`;
    
            console.log('START-----', promptWithRole, '-----END');
        
            const completion = await openai.chat.completions.create({
                messages: [
                    {"role": "system", "content": `You are currently role-playing as a ${speaker} on a panel discussion. No need to introduce yourself.`},
                    {"role": "user", "content": promptWithRole}
                ],
                model: "gpt-3.5-turbo",
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
    
    function addDynamicElements(conversation, currentSpeaker) {
        // Example dynamic elements
        const dynamicQuestions = [
            `What do you think is the most pressing issue regarding this topic?`,
            `How does this issue affect different communities?`,
            `Can you provide a unique perspective on this?`,
            `What are some potential solutions to this problem?`
        ];
    
        const randomQuestion = dynamicQuestions[Math.floor(Math.random() * dynamicQuestions.length)];
    
        // Add a dynamic question or statement every few turns
        if (conversation.length % 5 === 0) {
            return `${conversation} ${currentSpeaker}, ${randomQuestion}`;
        }
    
        return conversation;
    }

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
