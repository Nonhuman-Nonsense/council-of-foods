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
        const characters = document.querySelectorAll('#characters .character');
        const characterData = Array.from(characters).map(characterDiv => {
            const inputs = characterDiv.querySelectorAll('input');
            return {
                name: inputs[0].value,
                role: inputs[1].value
            };
        });

        // Retrieve the topic from the panel-prompt element
        const topic = document.getElementById('panel-prompt').value;
        console.log(topic);
        console.log(characterData);

        socket.emit('start_conversation', { characterData, topic });

        // Listening to conversation updates
        socket.on('conversation_update', (conversation) => {
            const conversationDiv = document.getElementById('conversation');
            conversationDiv.innerHTML = conversation
                .map(turn => `<p><strong>${turn.speaker}:</strong> ${turn.text}</p>`)
                .join('');
        });

        // Handle conversation end
        socket.on('conversation_end', () => {
            alert('Conversation has ended!');
        });

        socket.on('conversation_error', (errorMessage) => {
            console.error(errorMessage);
        });
    });
});
