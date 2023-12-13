document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Adding a character to the panel
    const addCharacterBtn = document.getElementById('add-character');
    addCharacterBtn.addEventListener('click', () => {
        const characters = document.getElementById('characters');
        const characterCount = characters.getElementsByClassName('character').length;

        if (characterCount < 10) {
            const newCharacterDiv = document.createElement('div');
            newCharacterDiv.classList.add('character');
            newCharacterDiv.innerHTML = `
                <input type="text" placeholder="character name"> 
                <textarea id="character-role" placeholder="character role"></textarea>
            `;
            characters.appendChild(newCharacterDiv);
        } else {
            alert('Maximum of 10 characters reached');
        }
    });

    let conversationActive = false;
    let conversationStarted = false;

    const toggleConversationBtn = document.getElementById('toggleConversationBtn');

    toggleConversationBtn.addEventListener('click', () => {
        if (conversationActive) {
            socket.emit('pause_conversation');
            toggleConversationBtn.textContent = 'Start';
            conversationActive = false;

            document.querySelector('.loader').style.display = 'none';
        } else {
            document.querySelector('.loader').style.display = 'block';

            if (!conversationStarted) {
                startConversation();
            } else {
                // Resume the conversation if it's paused
                isPaused = false;  // Assuming 'isPaused' is accessible here
                console.log('Conversation has been resumed');
            }
            toggleConversationBtn.textContent = 'Pause';
            conversationActive = true;
        }
    });
    

    const startConversation = () => {
        // Show the spinner or some loading indication
        document.getElementById('spinner').style.display = 'block';
    
        // Gather character data
        const characters = document.querySelectorAll('#characters .character');
        const characterData = Array.from(characters).map(characterDiv => {
            const nameInput = characterDiv.querySelector('input').value; // Assuming the first input is still for the name
            const roleTextarea = characterDiv.querySelector('textarea').value; // Select the textarea for the role
        
            return {
                name: nameInput,
                role: roleTextarea
            };
        });
    
        // Gather chairperson data
        const chairpersonName = document.getElementById('character-name').value;
        const chairpersonRole = document.getElementById('character-role').value;
        const chairpersonData = {
            name: chairpersonName,
            role: chairpersonRole
        };
    
        // Retrieve the panel topic
        const topic = document.getElementById('panel-prompt').value;
    
        // Retrieve the frequency of chairperson interjections
        const chairmanFreq = document.querySelector('#chairman-freq').value;
    
        // Emit the start conversation event with all necessary data
        socket.emit('start_conversation', { characterData, topic, chairpersonData, chairmanFreq });
    
        // Handle conversation updates
        socket.on('conversation_update', (conversation) => {
            const conversationDiv = document.getElementById('conversation');
            conversationDiv.innerHTML = conversation
                .map(turn => `<p><strong>${turn.speaker}:</strong> ${turn.text}</p>`)
                .join('');
        });
    
        // Handle conversation end
        socket.on('conversation_end', () => {
            document.getElementById('spinner').style.display = 'none';
        });
    
        // Handle conversation error
        socket.on('conversation_error', (errorMessage) => {
            console.error(errorMessage);
            document.getElementById('spinner').style.display = 'none';
        });

        conversationStarted = true;
    };    

    // Start the conversation
    // document.getElementById('startBtn').addEventListener('click', () => {
    //     // Show the spinner
    //     document.getElementById('spinner').style.display = 'block';

    //     // Gather character data
    //     const characters = document.querySelectorAll('#characters .character');
    //     const characterData = Array.from(characters).map(characterDiv => {
    //         const nameInput = characterDiv.querySelector('input').value; // Assuming the first input is still for the name
    //         const roleTextarea = characterDiv.querySelector('textarea').value; // Select the textarea for the role
        
    //         return {
    //             name: nameInput,
    //             role: roleTextarea
    //         };
    //     });

    //     // Gather chairperson data
    //     const chairpersonName = document.getElementById('character-name').value;
    //     const chairpersonRole = document.getElementById('character-role').value;
    //     const chairpersonData = {
    //         name: chairpersonName,
    //         role: chairpersonRole
    //     };

    //     // Retrieve the panel prompt
    //     const topic = document.getElementById('panel-prompt').value;

    //     // Retrieve the frequency of chairperson interjections
    //     const chairmanFreq = document.querySelector('#chairman-freq').value;

    //     console.log(characterData, chairpersonData);

    //     // Emit the start conversation event with all necessary data
    //     socket.emit('start_conversation', { characterData, topic, chairpersonData, chairmanFreq });

    //     // Listening to conversation updates
    //     socket.on('conversation_update', (conversation) => {
    //         const conversationDiv = document.getElementById('conversation');
    //         conversationDiv.innerHTML = conversation
    //             .map(turn => `<p><strong>${turn.speaker}:</strong> ${turn.text}</p>`)
    //             .join('');
    //     });

    //     // Handle conversation end
    //     socket.on('conversation_end', () => {
    //         // alert('Conversation has ended!');

    //         // Hide the spinner
    //         document.getElementById('spinner').style.display = 'none';
    //     });

    //     socket.on('conversation_error', (errorMessage) => {
    //         console.error(errorMessage);

    //         // Hide the spinner
    //         document.getElementById('spinner').style.display = 'none';
    //     });
    // });

    // Pause button event listener
    // document.getElementById('pauseBtn').addEventListener('click', () => {
    //     socket.emit('pause_conversation');
    // });
        
    
    // Handle submission of human input
    document.getElementById('submitHumanInput').addEventListener('click', () => {
        let humanMessage = document.getElementById('humanInput').value;

        if (conversationActive == false) {
            socket.emit('submit_human_message', humanMessage);
            toggleConversationBtn.textContent = 'Pause';
            conversationActive = true;

            document.querySelector('.loader').style.display = 'block';
        } else {
            socket.emit('submit_human_message', humanMessage);
        }
    });
    
    

});
