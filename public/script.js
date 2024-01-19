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

    document.getElementById('factoryResetButton').addEventListener('click', () => {
      localStorage.clear();
      location.reload();
    });


    let conversationActive = false;
    let conversationStarted = false;
    let promptsAndOptions;

    const unpackPromptsAndOptions = () => {
      console.log(promptsAndOptions);
      //Update the UI with the data stored in localStorage
      //Do the same as update, but reverse
      document.getElementById('max-response-char-count').value = promptsAndOptions.options.maxResponseCharCountInput;
      document.getElementById('trim-response-to-full-sentance').checked = promptsAndOptions.options.trimSentance;
      document.getElementById('conversation-max-length').value = promptsAndOptions.options.conversationMaxLength;
      document.getElementById('gpt-model').value = promptsAndOptions.options.gptModel;

      // Retrieve the panel topic
      document.getElementById('panel-prompt').value = promptsAndOptions.topic;

      // Build array of characters
      let characterDiv = document.createElement("div");
      characterDiv.id = "characters";
      promptsAndOptions.characters.forEach((character) => {
        const newDiv = document.createElement("div");
        newDiv.className = "character";
        const inputDiv = document.createElement("input");
        inputDiv.id = "character-name";
        inputDiv.placeholder = "character name";
        inputDiv.type = "text";
        inputDiv.value = character.name;
        const textDiv = document.createElement("textarea");
        textDiv.id = "character-role";
        textDiv.placeholder = "character role";
        textDiv.value = character.role;
        newDiv.appendChild(inputDiv);
        newDiv.appendChild(textDiv);
        characterDiv.appendChild(newDiv);
      });
      document.getElementById('characters').replaceWith(characterDiv);
    }

    // This is the global object containing all the prompts and options
    // It is sent to the server on conversation start, and resume.
    // Default types are added here just to describe data type
    try{
      promptsAndOptions = JSON.parse(localStorage.getItem("PromptsAndOptions"));
      unpackPromptsAndOptions();
    }catch(e){
      console.log(e);
      console.log('Resetting to default settings');
      promptsAndOptions = {
        topic: "",
        characters: {},
        options: {}
      };
    }

    const toggleConversationBtn = document.getElementById('toggleConversationBtn');
    const restartBtn = document.getElementById('restartButton');
    const continueBtn = document.getElementById('continueButton');
    const conversationDiv = document.getElementById('conversation');
    const endMessage = document.getElementById('end-message');
    const spinner  = document.getElementById('spinner');

    toggleConversationBtn.addEventListener('click', () => {
        if (conversationActive) {
          //Pause the conversation
            toggleConversationBtn.textContent = 'Resume';
            restartBtn.style.display = 'inline';
            conversationActive = false;
            spinner.style.display = 'none';
            socket.emit('pause_conversation');
        } else {
          //Start from scratch or resume
          spinner.style.display = 'block';
          continueBtn.style.display = 'none';
          restartBtn.style.display = 'none';
          toggleConversationBtn.textContent = 'Pause';
          conversationActive = true;

          if (!conversationStarted) {
            //Start the conversation from scratch!
            spinner.style.display = 'block';
            updatePromptsAndOptions();
            // Emit the start conversation event with all necessary data
            conversationStarted = true;
            socket.emit('start_conversation', promptsAndOptions);
          } else {
            // Resume the conversation if it's paused
            isPaused = false;
            console.log('Conversation has been resumed');
            updatePromptsAndOptions();
            socket.emit('resume_conversation', promptsAndOptions);
          }
        }
    });

    restartBtn.addEventListener('click', () => {
      //Continue to generate more even after it has previously stopped
      spinner.style.display = 'block';
      continueBtn.style.display = 'none';
      restartBtn.style.display = 'none';
      toggleConversationBtn.style.display = 'inline';
      toggleConversationBtn.textContent = 'Pause';
      conversationActive = true;
      endMessage.innerHTML = "";
      conversationDiv.innerHTML = "";
      updatePromptsAndOptions();
      // Emit the start conversation event with all necessary data
      socket.emit('start_conversation', promptsAndOptions);
    });

    continueBtn.addEventListener('click', () => {
      //Continue to generate more even after it has previously stopped
      spinner.style.display = 'block';
      restartBtn.style.display = 'none';
      continueBtn.style.display = 'none';
      toggleConversationBtn.style.display = 'inline';
      toggleConversationBtn.textContent = 'Pause';
      conversationActive = true;
      endMessage.innerHTML = "";
      updatePromptsAndOptions();
      // Emit the start conversation event with all necessary data
      socket.emit('continue_conversation', promptsAndOptions);
    });

    const updatePromptsAndOptions = () => {
      // Retrieve the global options

      promptsAndOptions.options.maxResponseCharCountInput = +document.getElementById('max-response-char-count').value;
      promptsAndOptions.options.trimSentance = document.getElementById('trim-response-to-full-sentance').checked;
      promptsAndOptions.options.conversationMaxLength = +document.getElementById('conversation-max-length').value;
      promptsAndOptions.options.gptModel = document.getElementById('gpt-model').value;

      // Retrieve the panel topic
      promptsAndOptions.topic = document.getElementById('panel-prompt').value;

      // Gather character data
      const characters = document.querySelectorAll('#characters .character');

      promptsAndOptions.characters = Array.from(characters).map(characterDiv => {
          const nameInput = characterDiv.querySelector('input').value; // Assuming the first input is still for the name
          const roleTextarea = characterDiv.querySelector('textarea').value; // Select the textarea for the role

          return {
              name: nameInput,
              role: roleTextarea
          };
      });

      localStorage.setItem("PromptsAndOptions", JSON.stringify(promptsAndOptions));
    }


    // Handle conversation updates
    socket.on('conversation_update', (conversation) => {
        conversationDiv.innerHTML = conversation
            .map(turn => `<p><strong>${turn.speaker}:</strong> ${turn.text.split('\n').join('<br>')}</p>`)
            .join('');
    });

    // Handle conversation end
    socket.on('conversation_end', () => {
        spinner.style.display = 'none';
        toggleConversationBtn.style.display = 'none';
        restartBtn.style.display = 'inline';
        continueBtn.style.display = 'inline';
        endMessage.innerHTML = "End of Conversation";
        conversationActive = false;
    });

    // Handle conversation error
    socket.on('conversation_error', (errorMessage) => {
        console.error(errorMessage);
        spinner.style.display = 'none';
    });


    // Handle submission of human input
    document.getElementById('submitHumanInput').addEventListener('click', () => {
      const message = {
        speaker: document.getElementById('human-name').value,
        text: document.getElementById('humanInput').value
      }

        if (conversationActive == false) {
          socket.emit('submit_human_message', message);
          toggleConversationBtn.textContent = 'Pause';
          conversationActive = true;
          spinner.style.display = 'block';
          toggleConversationBtn.style.display = 'inline';
          restartBtn.style.display = 'none';
          continueBtn.style.display = 'none';
        } else {
            socket.emit('submit_human_message', message);
        }
    });

});
