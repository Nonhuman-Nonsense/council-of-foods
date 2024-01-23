document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    //State for conversation control
    let conversationActive = false;
    let conversationStarted = false;
    let promptsAndOptions;

    //Global graphic buttons and elements
    const toggleConversationBtn = document.getElementById('toggleConversationBtn');
    const restartBtn = document.getElementById('restartButton');
    const continueBtn = document.getElementById('continueButton');
    const conversationDiv = document.getElementById('conversation');
    const endMessage = document.getElementById('end-message');
    const spinner  = document.getElementById('spinner');

    //Objects for audio control
    let audioCtx;
    let audioPlaylist = [];
    let currentAudio = 0;
    let audioIsPlaying = false;

    // This is the global object containing all the prompts and options
    // It is sent to the server on conversation start, and resume.
    // Default types are added here just to describe data type
    try{
      promptsAndOptions = JSON.parse(localStorage.getItem("PromptsAndOptions"));
      console.log("Stored prompts and settings to restore:");
      console.log(promptsAndOptions);
      //Update the UI with the data stored in localStorage
      //Do the same as update, but reverse
      document.getElementById('max-response-char-count').value = promptsAndOptions.options.maxResponseCharCountInput;
      document.getElementById('trim-response-to-full-sentance').checked = promptsAndOptions.options.trimSentance;
      document.getElementById('trim-response-to-full-paragraph').checked = promptsAndOptions.options.trimParagraph;
      document.getElementById('show-trimmed').checked = promptsAndOptions.options.showTrimmed;
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
    }catch(e){
      console.log(e);
      console.log('Resetting to default settings');
      promptsAndOptions = {
        topic: "",
        characters: {},
        options: {}
      };
    }

    // Handle conversation updates
    socket.on('conversation_update', (conversation) => {
      console.log(conversation);
        conversationDiv.innerHTML = conversation
            .map(turn => {
              let speech = `<p id="${turn.id}">`;
              speech += `<strong>${turn.speaker}:</strong> `;
              speech += turn.text.split('\n').join('<br>');
              if(turn.trimmed){
                speech += `<span class="trimmed">${turn.trimmed.split('\n').join('<br>')}</span>`;
              }
              speech += "</p>"
              return speech;
            })
            .join('');
    });

    const addToPlaylist = async (audio, index) => {
      const buffer = await audioCtx.decodeAudioData(audio);
      const source = audioCtx.createBufferSource();

      // set the buffer in the AudioBufferSourceNode
      source.buffer = buffer;

      // connect the AudioBufferSourceNode to the
      // destination so we can hear the sound
      source.connect(audioCtx.destination);

      source.addEventListener('ended', async () => {
        //If next audio is ready to play
        if(audioPlaylist[currentAudio+1] !== undefined){
          //Wait a bit before the next audio plays
          //This type of waiting is non-blocking
          await new Promise(r => setTimeout(r, 1000));

          //Play the next audio in the list
          currentAudio++;
          //Play next audio
          audioPlaylist[currentAudio].start();
        }else if(audioIsPlaying){
          //If audio is still playing means we should stop it.
          //Otherwise, it might be stopped for other reasons
          audioIsPlaying = false;
          currentAudio++;
        }
      });

      //This array can be filled in a sparse way, because audio files might not be downloaded in the right order
      //This has to be handled in the playback
      audioPlaylist[index] = source;
    }

    // Handle audio updates
    socket.on('audio_update', async (update) => {
      if(document.getElementById(update.id) === null){
        //If an audio is received for a message that is not currently on screen, skip it!
        //This could happen after a restart etc.
        return;
      }
      //This is an async function
      await addToPlaylist(update.audio, update.message_index);
      //If audio is not playing, we then need to move to the next item in playlist
      if(!audioIsPlaying && audioPlaylist[currentAudio] !== undefined){
        audioPlaylist[currentAudio].start();
        audioIsPlaying = true;
      }
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


    const updatePromptsAndOptions = () => {
      // Retrieve the global options

      promptsAndOptions.options.maxResponseCharCountInput = +document.getElementById('max-response-char-count').value;
      promptsAndOptions.options.trimSentance = document.getElementById('trim-response-to-full-sentance').checked;
      promptsAndOptions.options.trimParagraph = document.getElementById('trim-response-to-full-paragraph').checked;
      promptsAndOptions.options.showTrimmed = document.getElementById('show-trimmed').checked;
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
            //Initialize the audio context
            audioCtx = new window.AudioContext();
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

      //Stop audio if it's playing, and reset the data
      if(audioIsPlaying){
          audioPlaylist[currentAudio].stop();
      }
      audioPlaylist = [];
      currentAudio = 0;
      audioIsPlaying = false;

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

    // Adding a character to the panel
    document.getElementById('add-character').addEventListener('click', () => {
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

});
