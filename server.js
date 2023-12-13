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
    let chairperson = {};
    let chairmanFreq = 5; // Default frequency
    let conversationCount = 0;
    let topic;

    let isPaused = false; // Flag to check if the conversation is paused

    let lastPrompt;

    socket.on('pause_conversation', () => {
        isPaused = true;
        console.log('Conversation has been paused');
    });

    // Add a new event to resume the conversation
    socket.on('resume_conversation', () => {
        isPaused = false;
        console.log('Conversation has been resumed');
        console.log('Conversation has been resumed');
        if (lastPrompt) {
            handleConversationTurn(lastPrompt, socket, conversation, topic, characterRoles, chairmanFreq);
        }
    });

    socket.on('submit_human_message', (message) => {
        if (isPaused) {
            // Resume the conversation
            isPaused = false;
            console.log('Conversation has been resumed');
    
            // Now process the human message
            const humanPrompt = { speaker: 'Human', text: message };
            handleConversationTurn(humanPrompt, socket, conversation, topic, characterRoles, chairmanFreq);
        } else {
            // If the conversation is not paused, just process the message
            console.log('Message received:', message);
            const humanPrompt = { speaker: 'Human', text: message };
            handleConversationTurn(humanPrompt, socket, conversation, topic, characterRoles, chairmanFreq);
        }
    });
    

    socket.on('start_conversation', ({ characterData, topic, chairpersonData, chairmanFreq }) => {
        // console.log(`Conversation started on topic: ${topic}`);
        
        conversation = [];
        characterRoles = {};
        chairperson = chairpersonData;
        conversationCount = 0;
        chairmanFreq = chairmanFreq;
    
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
        handleConversationTurn(firstPrompt, socket, conversation, topic, characterRoles, chairmanFreq);
    }); 
    
    socket.on('resume_conversation', () => {
        isPaused = false;
        console.log('Conversation has been resumed');
        // Optional: Trigger the conversation to continue from where it was paused
    });

    const handleConversationTurn = async (prompt, socket, conversation, topic, characterRoles, chairmanFreq) => {
        try {
            if (isPaused) return; // Don't proceed if the conversation is paused
    
            let response;
    
            if (prompt.speaker === 'Human') {
                // Directly use the human's message
                response = prompt.text;
            } else {
                // Generate response using GPT-4 for AI characters
                response = await generateTextFromGPT4(topic, prompt.speaker, prompt.text);
                console.log(prompt);
            }
    
            // Add the response to the conversation
            conversation.push({ speaker: prompt.speaker, text: response });
            socket.emit('conversation_update', conversation);
    
            // Check for conversation end
            if (conversation.length >= 100) {
                socket.emit('conversation_end', conversation);
                return;
            }
    
            // Determine the next speaker
            let nextSpeaker;
            if ((conversation.length + 1) % chairmanFreq === 0) { // Chairman speaks every three messages
                nextSpeaker = chairperson.name;
            } else {
                nextSpeaker = determineNextSpeaker();
            }
    
            // Prepare the next prompt
            const role = characterRoles[nextSpeaker] || 'Participant';
            const nextPromptText = `${role} ${nextSpeaker}`;
            const nextPrompt = { speaker: nextSpeaker, text: nextPromptText };

            // Update lastPrompt with the current prompt before calling the function again
            lastPrompt = nextPrompt;
    
            handleConversationTurn(nextPrompt, socket, conversation, topic, characterRoles, chairmanFreq);
            // Increment conversationCount only if it's not the chairman speaking
            if (nextSpeaker !== chairperson.name) {
                conversationCount++;
            }
        } catch (error) {
            console.error('Error during conversation:', error);
            socket.emit('conversation_error', 'An error occurred during the conversation.');
        }
    };
         

    // const generateTextFromGPT4 = async (topic, speaker, speakerPrompt) => {
    //     try {
    //         // Check if it's the first message in the conversation
    //         const isFirstMessage = conversation.length === 0;
    
    //         let systemMessageContent, userMessageContent;
    
    //         if (isFirstMessage) {
    //             // Content for the first message
    //             systemMessageContent = `You are currently role-playing as a ${speaker} in a panel discussion. You are the moderator. Start the conversation on the topic.`;
    //             userMessageContent = `As ${speaker}, initiate the conversation about: ${topic}`;
    //         } else {
    //             // Content for subsequent messages
    //             const lastThreeMessages = conversation.slice(-3).map(turn => `${turn.speaker}: ${turn.text}`).join(' ');
    //             console.log(lastThreeMessages);
    //             systemMessageContent = `You are currently role-playing as a ${speaker} (${speakerPrompt}) on a panel discussion.`;
    //             userMessageContent = `Please respond to the participants and build on the conversation. You can also steer it in new directions. Never add your "name:" before your message!\n\nHere are the past 3 messages of the conversation for context: ${lastThreeMessages}.\n\nAlso, here's the overall topic of the conversation: ${topic}`;
    //         }
    
    //         // Prepare the completion request
    //         const completion = await openai.chat.completions.create({
    //             messages: [
    //                 {
    //                     "role": "system",
    //                     "content": systemMessageContent
    //                 },
    //                 {
    //                     "role": "assistant",
    //                     "content": userMessageContent
    //                 }
    //             ],
    //             // model: "gpt-3.5-turbo",
    //             model: "gpt-4",
    //             max_tokens: maxResponseLength
    //         });

            
    
    //         // Extract and clean up the response
    //         let response = completion.choices[0].message.content.trim();
    
    //         response = response.replace(/\s+$/, '');
    //         const lastPeriodIndex = response.lastIndexOf('.');
    //         if (lastPeriodIndex !== -1) {
    //             response = response.substring(0, lastPeriodIndex + 1);
    //         }

    //         // console.log('////', conversation, '////');
    
    //         return response;
    //     } catch (error) {
    //         console.error('Error during API call:', error);
    //         throw error;
    //     }
    // };

    const generateTextFromGPT4 = async (topic, speaker, speakerPrompt) => {
        try {
            // Build the array of messages for the completion request
            const messages = [];
    
            // System message for overall context
            messages.push({
                role: "system",
                content: `You are currently role-playing as a ${speaker} in a panel discussion. The topic is: ${topic}.`
            });
    
            // Assistant message for the current speaker's prompt
            messages.push({
                role: "assistant",
                content: speakerPrompt
            });
    
            // Add previous messages as separate user objects
            conversation.forEach((msg) => {
                messages.push({
                    role: "user",
                    content: msg.text
                });
            });
            
            console.log(messages);

            // Prepare the completion request
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                max_tokens: maxResponseLength,
                messages: messages
            });
    
            // Extract and clean up the response
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
