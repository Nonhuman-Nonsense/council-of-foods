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
                <input type="text" placeholder="character role">
            `;
            characters.appendChild(newCharacterDiv);
        } else {
            alert('Maximum of 10 characters reached');
        }
    });

    // Start the conversation
    document.getElementById('startBtn').addEventListener('click', () => {
        // Show the spinner
        document.getElementById('spinner').style.display = 'block';

        // Gather character data
        const characters = document.querySelectorAll('#characters .character');
        const characterData = Array.from(characters).map(characterDiv => {
            const inputs = characterDiv.querySelectorAll('input');
            return {
                name: inputs[0].value,
                role: inputs[1].value
            };
        });

        // Gather chairperson data
        const chairpersonName = document.getElementById('character-name').value;
        const chairpersonRole = document.getElementById('character-role').value;
        const chairpersonData = {
            name: chairpersonName,
            role: chairpersonRole
        };

        // Retrieve the panel prompt
        const topic = document.getElementById('panel-prompt').value;

        // Retrieve the frequency of chairperson interjections
        const frequencyInput = document.querySelector('#panel-prompt-el input[type="number"]').value;

        console.log(characterData, chairpersonData);

        // Emit the start conversation event with all necessary data
        socket.emit('start_conversation', { characterData, topic, chairpersonData, frequencyInput });

        // Listening to conversation updates
        socket.on('conversation_update', (conversation) => {
            const conversationDiv = document.getElementById('conversation');
            conversationDiv.innerHTML = conversation
                .map(turn => `<p><strong>${turn.speaker}:</strong> ${turn.text}</p>`)
                .join('');
        });

        // Handle conversation end
        socket.on('conversation_end', () => {
            // alert('Conversation has ended!');

            // Hide the spinner
            document.getElementById('spinner').style.display = 'none';
        });

        socket.on('conversation_error', (errorMessage) => {
            console.error(errorMessage);

            // Hide the spinner
            document.getElementById('spinner').style.display = 'none';
        });
    });
    
    
    // Handle submission of human input
    document.getElementById('submitHumanInput').addEventListener('click', () => {
        socket.emit('pause_conversation');
        let humanMessage = document.getElementById('humanInput').value;
        socket.emit('submit_human_message', humanMessage); // Emit an event with the human message
        document.getElementById('humanInput').value = '';
        // document.getElementById('humanInput').style.display = 'none';
        // document.getElementById('submitHumanInput').style.display = 'none';
    });
    

});
