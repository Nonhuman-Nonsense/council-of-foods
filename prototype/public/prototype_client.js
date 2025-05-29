document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  //State for conversation control
  let conversationActive = false;
  let conversationStarted = false;
  let promptsAndOptions;
  let conversation;

  const conversationContainer = document.getElementById(
    "conversation-container"
  );

  //Global graphic buttons and elements
  const toggleConversationBtn = document.getElementById(
    "toggleConversationBtn"
  );
  const restartBtn = document.getElementById("restartButton");
  const continueBtn = document.getElementById("continueButton");
  const conversationDiv = document.getElementById("conversation");
  const endMessage = document.getElementById("end-message");
  const spinner = document.getElementById("spinner");

  //Audio control
  const audioBackButton = document.getElementById("audioBack");
  const audioToggleButton = document.getElementById("audioToggle");
  const audioNextButton = document.getElementById("audioNext");

  //Human input
  const humanName = document.getElementById("human-name");
  const raiseHandButton = document.getElementById("raiseHand");
  const raiseHandIcon = document.getElementById("raiseHandIcon");
  const humanInputArea = document.getElementById("humanInput");
  const submitHumanInput = document.getElementById("submitHumanInput");
  const viewHumanInputPrompts = document.getElementById(
    "viewHumanInputPrompts"
  );
  const raiseHandPrompt = document.getElementById("raiseHandPrompt");
  const humanConfig = document.getElementById("humanConfig");
  const preHumanInputContainer = document.getElementById(
    "preHumanInputContainer"
  );
  // const humanInputContainer = document.getElementById('humanInputContainer');

  //System prompt
  const systemPrompt = document.getElementById("systemPrompt");

  //Inject
  const injectInputArea = document.getElementById("injectInputArea");
  const submitInjection = document.getElementById("submitInjection");
  const injectedMessage = document.getElementById("injectedMessage");
  const removeLastMessage = document.getElementById("removeLastMessage");

  //Objects for audio control
  let audioCtx;
  let audioPlaylist = [];
  let currentAudio = 0;
  let audioIsPlaying = false;
  let pauseAudio = false;
  let nextOrBackClicked = false;

  //Room control
  let currentRoom = 0;

  //Names of OpenAI voices
  const audioVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

  // Human input
  let handRaised = false;

  // ===========================
  //   UI UPDATING AND STORING
  // ===========================

  function unpackPromptsAndOptions() {
    //Update the UI with the data stored in localStorage
    //Do the same as update, but reverse
    document.getElementById("gpt-model").value =
      promptsAndOptions.options.gptModel;
    document.getElementById("temperature").value =
      promptsAndOptions.options.temperature;
    document.getElementById("temperature").previousSibling.value =
      promptsAndOptions.options.temperature;
    document.getElementById("max-tokens").value =
      promptsAndOptions.options.maxTokens;
    document.getElementById("max-tokens").previousSibling.value =
      promptsAndOptions.options.maxTokens;
    document.getElementById("chair-max-tokens").value =
      promptsAndOptions.options.chairMaxTokens;
    document.getElementById("chair-max-tokens").previousSibling.value =
      promptsAndOptions.options.chairMaxTokens;
    document.getElementById("raise-hand-invitation-length").value =
      promptsAndOptions.options.raiseHandInvitationLength;
    document.getElementById(
      "raise-hand-invitation-length"
    ).previousSibling.value =
      promptsAndOptions.options.raiseHandInvitationLength;
    document.getElementById("max-tokens-inject").value =
      promptsAndOptions.options.maxTokensInject;
    document.getElementById("max-tokens-inject").previousSibling.value =
      promptsAndOptions.options.maxTokensInject;
    document.getElementById("frequency-penalty").value =
      promptsAndOptions.options.frequencyPenalty;
    document.getElementById("frequency-penalty").previousSibling.value =
      promptsAndOptions.options.frequencyPenalty;
    document.getElementById("presence-penalty").value =
      promptsAndOptions.options.presencePenalty;
    document.getElementById("presence-penalty").previousSibling.value =
      promptsAndOptions.options.presencePenalty;

    document.getElementById("trim-response-to-full-sentance").checked =
      promptsAndOptions.options.trimSentance;
    document.getElementById("trim-response-to-full-paragraph").checked =
      promptsAndOptions.options.trimParagraph;
    document.getElementById(
      "trim-response-to-remove-waters-semicolon"
    ).checked = promptsAndOptions.options.trimWaterSemicolon;
    document.getElementById("show-trimmed").checked =
      promptsAndOptions.options.showTrimmed;
    document.getElementById("conversation-max-length").value =
      promptsAndOptions.options.conversationMaxLength;
    document.getElementById("extra-message-count").value =
      promptsAndOptions.options.extraMessageCount;
    document.getElementById("skip-audio").checked =
      promptsAndOptions.options.skipAudio;

    injectInputArea.value = promptsAndOptions.options.injectPrompt;

    raiseHandPrompt.value = promptsAndOptions.options.raiseHandPrompt;
    systemPrompt.value = promptsAndOptions.system;

    humanName.value = promptsAndOptions.options.humanName;

    // Room buttons
    let roomButtonsDiv = document.createElement("span");
    roomButtonsDiv.id = "room-buttons";
    if (promptsAndOptions.rooms.length > 0) {
      promptsAndOptions.rooms.forEach((room, i) => {
        const newDiv = document.createElement("button");
        newDiv.innerHTML = room.name;
        newDiv.setAttribute("room-id", i);
        newDiv.addEventListener("click", roomButtonClicked);
        roomButtonsDiv.appendChild(newDiv);
      });
    }
    document.getElementById("room-buttons").replaceWith(roomButtonsDiv);

    // Retrieve the panel topic and name
    document.getElementById("room-name").value =
      promptsAndOptions.rooms[currentRoom].name;
    document.getElementById("panel-prompt").value =
      promptsAndOptions.rooms[currentRoom].topic;

    // Build array of characters
    let characterDiv = document.createElement("div");
    characterDiv.id = "characters";
    if (promptsAndOptions.rooms[currentRoom].characters.length > 0) {
      promptsAndOptions.rooms[currentRoom].characters.forEach(
        (character, j) => {
          const newDiv = document.createElement("div");
          newDiv.className = "character";

          const inputDiv = document.createElement("input");
          inputDiv.placeholder = "character name";
          inputDiv.type = "text";
          inputDiv.value = character.name ?? "";

          const textDiv = document.createElement("textarea");
          textDiv.placeholder = "character prompt";
          textDiv.value = character.prompt ?? "";

          const voiceDiv = document.createElement("div");
          voiceDiv.className = "voices";
          const voicesDescDiv = document.createElement("span");
          voicesDescDiv.innerHTML = "voice: ";
          voiceDiv.appendChild(voicesDescDiv);
          for (let i = 0; i < audioVoices.length; i++) {
            const voiceRadioDiv = document.createElement("input");
            voiceRadioDiv.id = "voice-" + j + "-" + audioVoices[i];
            voiceRadioDiv.name = "voice-" + j;
            voiceRadioDiv.type = "radio";
            voiceRadioDiv.value = audioVoices[i];
            if (character.voice === undefined) {
              if (j % audioVoices.length == i) voiceRadioDiv.checked = true;
            } else {
              if (character.voice == audioVoices[i])
                voiceRadioDiv.checked = true;
            }
            voiceDiv.appendChild(voiceRadioDiv);
            const voiceRadioLabelDiv = document.createElement("label");
            voiceRadioLabelDiv.innerHTML = audioVoices[i];
            voiceRadioLabelDiv.htmlFor = "voice-" + j + "-" + audioVoices[i];
            voiceDiv.appendChild(voiceRadioLabelDiv);
          }

          newDiv.appendChild(inputDiv);
          newDiv.appendChild(textDiv);
          newDiv.appendChild(voiceDiv);
          characterDiv.appendChild(newDiv);
        }
      );
    }
    document.getElementById("characters").replaceWith(characterDiv);
  }

  const updatePromptsAndOptions = (reset = false) => {
    // Retrieve the global options
    promptsAndOptions.options = {}; //Reset to remove possible orphan options
    promptsAndOptions.options.gptModel =
      document.getElementById("gpt-model").value;
    promptsAndOptions.options.temperature =
      +document.getElementById("temperature").value;
    promptsAndOptions.options.maxTokens =
      +document.getElementById("max-tokens").value;
    promptsAndOptions.options.chairMaxTokens =
      +document.getElementById("chair-max-tokens").value;
    promptsAndOptions.options.raiseHandInvitationLength =
      +document.getElementById("raise-hand-invitation-length").value;
    promptsAndOptions.options.frequencyPenalty =
      +document.getElementById("frequency-penalty").value;
    promptsAndOptions.options.presencePenalty =
      +document.getElementById("presence-penalty").value;
    promptsAndOptions.options.trimSentance = document.getElementById(
      "trim-response-to-full-sentance"
    ).checked;
    promptsAndOptions.options.trimParagraph = document.getElementById(
      "trim-response-to-full-paragraph"
    ).checked;
    promptsAndOptions.options.trimWaterSemicolon = document.getElementById(
      "trim-response-to-remove-waters-semicolon"
    ).checked;
    promptsAndOptions.options.showTrimmed =
      document.getElementById("show-trimmed").checked;
    promptsAndOptions.options.conversationMaxLength = +document.getElementById(
      "conversation-max-length"
    ).value;
    promptsAndOptions.options.extraMessageCount = +document.getElementById(
      "extra-message-count"
    ).value;
    promptsAndOptions.options.skipAudio =
      document.getElementById("skip-audio").checked;

    promptsAndOptions.options.injectPrompt = injectInputArea.value;
    promptsAndOptions.options.maxTokensInject =
      +document.getElementById("max-tokens-inject").value;

    promptsAndOptions.options.raiseHandPrompt = raiseHandPrompt.value;
    promptsAndOptions.options.humanName = humanName.value;

    if (!reset) {
      promptsAndOptions.system = systemPrompt.value;
      // Retrieve the panel topic
      promptsAndOptions.rooms[currentRoom].name =
        document.getElementById("room-name").value;
      promptsAndOptions.rooms[currentRoom].topic =
        document.getElementById("panel-prompt").value;

      // Gather character data
      const characters = document.querySelectorAll("#characters .character");

      promptsAndOptions.rooms[currentRoom].characters = Array.from(
        characters
      ).map((characterDiv) => {
        const nameInput = characterDiv.querySelector("input").value; // Assuming the first input is still for the name
        const roleTextarea = characterDiv.querySelector("textarea").value; // Select the textarea for the role
        const voice = characterDiv.querySelector("input[type=radio]:checked");

        return {
          name: nameInput,
          prompt: roleTextarea,
          voice: voice?.value,
        };
      });
    }

    localStorage.setItem(
      "PromptsAndOptions",
      JSON.stringify(promptsAndOptions)
    );

    let replacedCharacters = structuredClone(
      promptsAndOptions.rooms[currentRoom].characters
    );

    if (replacedCharacters[0]) {
      let participants = "";
      promptsAndOptions.rooms[currentRoom].characters.forEach(function (
        food,
        index
      ) {
        if (index !== 0) participants += toTitleCase(food.name) + ", ";
      });
      participants = participants.substring(0, participants.length - 2);
      replacedCharacters[0].prompt = promptsAndOptions.rooms[
        currentRoom
      ].characters[0]?.prompt.replace("[FOODS]", participants);
    }

    return {
      options: promptsAndOptions.options,
      topic: promptsAndOptions.system.replace(
        "[TOPIC]",
        promptsAndOptions.rooms[currentRoom].topic
      ),
      characters: replacedCharacters,
    };
  };

  // ==================
  //   SOCKET EVENTS
  // ==================

  // Handle conversation updates
  socket.on("conversation_update", (conversationUpdate) => {
    conversation = conversationUpdate;
    reloadConversations();
    preHumanInputContainer.style.display = "none";
    postHumanInputContainer.style.display = "block";
    conversationContainer.scrollTop = conversationContainer.scrollHeight;
  });

  // Handle audio updates
  socket.on("audio_update", async (update) => {
    if (document.getElementById(update.id) === null) {
      //If an audio is received for a message that is not currently on screen, skip it!
      //This could happen after a restart etc.
      return;
    }
    console.log(update);

    let message_index;
    const conversationId = document.getElementById("conversation");
    for (let i = 0; i < conversationId.children.length; i++) {
      if (conversationId.children[i].id === update.id) message_index = i;
    }

    if (update.type == "skipped") {
      ignorePlaylist(message_index);
      return;
    }
    //This is an async function
    await addToPlaylist(update.audio, message_index);
    //If audio is not playing, we then need to move to the next item in playlist
    if (
      !audioIsPlaying &&
      audioPlaylist[currentAudio] !== undefined &&
      !pauseAudio
    ) {
      audioPlaylist[currentAudio].play();
    }
  });

  // Handle conversation end
  socket.on("conversation_end", () => {
    spinner.style.display = "none";
    toggleConversationBtn.style.display = "none";
    restartBtn.style.display = "inline";
    continueBtn.style.display = "inline";
    endMessage.innerHTML = "End of Conversation";
    conversationActive = false;
  });

  // Handle conversation error
  socket.on("conversation_error", (errorMessage) => {
    console.error(errorMessage);
    spinner.style.display = "none";
    alert(errorMessage.message);
  });

  // ==================
  //   AUDIO CONTROL
  // ==================

  const addToPlaylist = async (audio, index) => {
    //functions related to each audio is kept here in an object oriented way
    //so that they are properly scoped and garbage collected
    //and so that they can easily recreate the source buffer every time they are played

    const buffer = await audioCtx.decodeAudioData(audio);
    let source;

    const play = function () {
      source = audioCtx.createBufferSource();
      // set the buffer in the AudioBufferSourceNode
      source.buffer = buffer;
      // connect the AudioBufferSourceNode to the
      // destination so we can hear the sound
      source.connect(audioCtx.destination);
      source.addEventListener("ended", async () => {
        //If audio is paused, do nothing
        if (pauseAudio) return;
        if (nextOrBackClicked) {
          //If we just clicked next or back, skip this end event.
          nextOrBackClicked = false;
          return;
        }

        //Otherwise, audio should be playing
        //If next audio is ready to play
        if (audioPlaylist[currentAudio + 1] !== undefined) {
          //Wait a bit before the next audio plays
          //This type of waiting is non-blocking
          await new Promise((r) => setTimeout(r, 1000));

          //Play the next audio in the list
          currentAudio++;
          //Play next audio
          audioPlaylist[currentAudio].play();
        } else if (audioIsPlaying) {
          //If audio is still playing means we have reached the end of the queue
          //Otherwise, it might be stopped for other reasons
          audioIsPlaying = false;
          currentAudio++;
        }
      });
      source.start();
      audioIsPlaying = true;
    };

    const stop = function () {
      source.stop();
      audioIsPlaying = false;
    };

    //This array can be filled in a sparse way, because audio files might not be downloaded in the right order
    //This has to be handled in the playback
    audioPlaylist[index] = { play: play, stop: stop };
  };

  const ignorePlaylist = (index) => {
    const ignore = function () {
      if (audioPlaylist[currentAudio + 1] !== undefined) {
        //Play the next audio in the list
        currentAudio++;
        //Play next audio
        audioPlaylist[currentAudio].play();
      } else if (audioIsPlaying) {
        //If audio is still playing means we have reached the end of the queue
        //Otherwise, it might be stopped for other reasons
        audioIsPlaying = false;
        currentAudio++;
      }
    };
    const stop = function () {
      audioIsPlaying = false;
    };
    audioPlaylist[index] = { play: ignore, stop: stop, skip: true };
  };

  audioBackButton.addEventListener("click", async () => {
    //If audio is paused, do nothing
    if (pauseAudio) return;

    if (audioIsPlaying) {
      //If audio is playing
      //Stop the current audio
      audioPlaylist[currentAudio].stop();
      //Skip the next end event
      nextOrBackClicked = true;
    }
    if (currentAudio > 0) currentAudio--;
    //If there is anything to skip
    while (audioPlaylist[currentAudio].skip && currentAudio > 0) {
      currentAudio--;
    }
    if (audioPlaylist[currentAudio] !== undefined) {
      audioPlaylist[currentAudio].play();
    }
  });

  audioToggleButton.addEventListener("click", () => {
    if (audioIsPlaying) {
      //If audio is playing, pause it.
      audioCtx.suspend();
      audioIsPlaying = false;
    } else if (audioCtx && audioCtx.state == "suspended") {
      //If current playback is suspended, resume it.
      //Also check that audio context has been initialized
      audioCtx.resume();
      audioIsPlaying = true;
    } else if (audioPlaylist[currentAudio] !== undefined) {
      //If audio is not playing, and is not suspended, check if the current audio exists, and start it.
      audioPlaylist[currentAudio].play();
    }

    if (!pauseAudio) {
      pauseAudio = true;
      audioToggleButton.style.background = "red";
    } else {
      pauseAudio = false;
      audioToggleButton.style.background = null;
    }
  });

  audioNextButton.addEventListener("click", () => {
    //If audio is paused, do nothing
    if (pauseAudio) return;

    if (audioPlaylist[currentAudio + 1] !== undefined) {
      //If audio is playing
      if (audioIsPlaying) {
        //Stop the current audio
        audioPlaylist[currentAudio].stop();
        //Skip the next end event
        nextOrBackClicked = true;
      }
      currentAudio++;
      audioPlaylist[currentAudio].play();
    }
  });

  // ==================
  //   BUTTON CONTROL
  // ==================

  toggleConversationBtn.addEventListener("click", () => {
    if (conversationActive) {
      //Pause the conversation
      toggleConversationBtn.textContent = "Resume";
      restartBtn.style.display = "inline";
      conversationActive = false;
      spinner.style.display = "none";
      socket.emit("pause_conversation");
    } else {
      //Start from scratch or resume
      spinner.style.display = "block";
      continueBtn.style.display = "none";
      restartBtn.style.display = "none";
      toggleConversationBtn.textContent = "Pause";
      conversationActive = true;

      if (!conversationStarted) {
        //Start the conversation from scratch!
        spinner.style.display = "block";

        //Initialize the audio context
        audioCtx = new window.AudioContext();

        conversationStarted = true;
        // Emit the start conversation event with all necessary data
        const sentPromptsAndOptions = updatePromptsAndOptions();
        socket.emit("start_conversation", sentPromptsAndOptions);
      } else {
        // Resume the conversation if it's paused
        isPaused = false;
        console.log("Conversation has been resumed");
        socket.emit("resume_conversation");
      }
    }
  });

  restartBtn.addEventListener("click", () => {
    //Continue to generate more even after it has previously stopped
    spinner.style.display = "block";
    continueBtn.style.display = "none";
    restartBtn.style.display = "none";
    toggleConversationBtn.style.display = "inline";
    toggleConversationBtn.textContent = "Pause";
    preHumanInputContainer.style.display = "block";
    postHumanInputContainer.style.display = "none";
    raiseHandButton.innerHTML = "I want to say something/Raise hand";
    raiseHandIcon.style.display = "none";
    humanInputArea.style.display = "none";
    submitHumanInput.style.display = "none";
    conversationActive = true;
    endMessage.innerHTML = "";
    conversationDiv.innerHTML = "";
    raiseHandButton.style.display = "inline";
    handRaised = false;

    //Stop audio if it's playing, and reset the data
    if (audioIsPlaying) {
      audioPlaylist[currentAudio].stop();
    }
    audioCtx = new window.AudioContext();
    audioPlaylist = [];
    currentAudio = 0;

    const sentPromptsAndOptions = updatePromptsAndOptions();
    // Emit the start conversation event with all necessary data
    socket.emit("start_conversation", sentPromptsAndOptions);
  });

  continueBtn.addEventListener("click", () => {
    //Continue to generate more even after it has previously stopped
    spinner.style.display = "block";
    restartBtn.style.display = "none";
    continueBtn.style.display = "none";
    toggleConversationBtn.style.display = "inline";
    toggleConversationBtn.textContent = "Pause";
    conversationActive = true;
    endMessage.innerHTML = "";

    // Emit the start conversation event with all necessary data
    const sentPromptsAndOptions = updatePromptsAndOptions();
    socket.emit("continue_conversation", sentPromptsAndOptions);
  });

  removeLastMessage.addEventListener("click", () => {
    socket.emit("remove_last_message");
  });

  submitInjection.addEventListener("click", () => {
    reloadUI();

    const conversationLength =
      document.getElementById("conversation").children.length;
    const message = {
      text: injectInputArea.value,
      length: promptsAndOptions.options.maxTokensInject,
      index: conversationLength,
    };
    injectedMessage.innerHTML = "Instruction injected, just wait...";
    submitInjection.style.display = "none";
    setTimeout(function () {
      submitInjection.style.display = "inline";
      injectedMessage.innerHTML = "";
    }, 5000);
    socket.emit("submit_injection", message);
  });

  // Handle submission of human input
  submitHumanInput.addEventListener("click", () => {
    const message = {
      speaker: humanName.value,
      text: humanInputArea.value,
    };

    if (conversationActive == false) {
      toggleConversationBtn.textContent = "Pause";
      conversationActive = true;
      spinner.style.display = "block";
      toggleConversationBtn.style.display = "inline";
      restartBtn.style.display = "none";
      continueBtn.style.display = "none";
    }
    if (handRaised) {
      handRaised = false;
      raiseHandIcon.style.display = "none";
      raiseHandButton.style.display = "inline";
      raiseHandIcon.style.display = "none";
      humanInputArea.style.display = "none";
      submitHumanInput.style.display = "none";
      spinner.style.display = "block";
      endMessage.innerHTML = "";

      continueBtn.style.display = "none";
      restartBtn.style.display = "none";
      toggleConversationBtn.textContent = "Pause";
      conversationActive = true;
    }
    socket.emit("submit_human_message", message);
  });

  // Adding a character to the panel
  document.getElementById("add-character").addEventListener("click", () => {
    updatePromptsAndOptions();

    promptsAndOptions.rooms[currentRoom].characters.push({});
    unpackPromptsAndOptions();
  });

  // Remove the last character
  document.getElementById("remove-character").addEventListener("click", () => {
    const characters = document.getElementById("characters");
    if (characters.lastChild) characters.removeChild(characters.lastChild);
  });

  document
    .getElementById("factoryResetButton")
    .addEventListener("click", () => {
      localStorage.clear();
      location.reload();
    });

  const roomButtonClicked = function (e) {
    //First save what we have at the moment
    updatePromptsAndOptions();
    //Set the room
    currentRoom = e.target.getAttribute("room-id");
    //Update UI
    unpackPromptsAndOptions();
  };

  function reloadConversations() {
    if (!conversation) return;
    conversationDiv.innerHTML = conversation
      .map((turn) => {
        //If if we should skip this message, we still need to put the id in to the DOM, to keep track if which messages have received audio information
        //So we put a hidden object
        //This might not be the best idea
        if (!promptsAndOptions.options.showTrimmed && turn.type == "skipped") {
          return `<p id="${turn.id}" style="display:none;"></p>`;
        }
        let speech = `<p id="${turn.id}">`;
        speech += `<strong>${turn.speaker}:</strong> `;
        if (promptsAndOptions.options.showTrimmed && turn.pretrimmed) {
          speech += `<span class="trimmed">${turn.pretrimmed
            .split("\n")
            .join("<br>")}</span>`;
        }
        speech += turn.text.split("\n").join("<br>");
        if (promptsAndOptions.options.showTrimmed && turn.trimmed) {
          speech += `<span class="trimmed">${turn.trimmed
            .split("\n")
            .join("<br>")}</span>`;
        }
        speech += "</p>";
        return speech;
      })
      .join("");
  }

  document.getElementById("show-trimmed").addEventListener("click", () => {
    reloadUI();
  });

  // Remove the last character
  document.getElementById("add-room").addEventListener("click", () => {
    const rooms = document.getElementById("room-buttons");
    // const roomsCount = rooms.getElementsByTagName('button').length;

    const newRoomButton = document.createElement("button");
    newRoomButton.innerHTML = "New Room";
    rooms.appendChild(newRoomButton);

    //First save what we have at the moment
    updatePromptsAndOptions();

    //Add another room
    promptsAndOptions.rooms.push({
      name: "New Room",
      topic: "",
      characters: {},
    });
    currentRoom = promptsAndOptions.rooms.length - 1;
    unpackPromptsAndOptions();

    //Save again
    updatePromptsAndOptions();
  });

  document.getElementById("remove-room").addEventListener("click", () => {
    if (promptsAndOptions.rooms.length > 1) {
      updatePromptsAndOptions();
      const rooms = document.getElementById("room-buttons");
      if (rooms.lastChild) rooms.removeChild(rooms.lastChild);

      promptsAndOptions.rooms.pop();
      if (currentRoom > promptsAndOptions.rooms.length - 1)
        currentRoom = promptsAndOptions.rooms.length - 1;
      //Save
      unpackPromptsAndOptions();
      updatePromptsAndOptions();
    }
  });

  viewHumanInputPrompts.addEventListener("click", () => {
    if (viewHumanInputPrompts.innerHTML == "configure") {
      humanConfig.style.display = "block";
      viewHumanInputPrompts.innerHTML = "hide";
    } else {
      humanConfig.style.display = "none";
      viewHumanInputPrompts.innerHTML = "configure";
    }
  });

  //range sliders for model options
  Array.from(document.querySelectorAll("input[type=range]")).map((range) => {
    range.nextSibling.value = range.value;
    range.oninput = () => (range.nextSibling.value = range.value);
    range.nextSibling.oninput = () => (range.value = range.nextSibling.value);
    range.onmouseover = () => (range.previousSibling.style.display = "block");
    range.onmouseout = () => (range.previousSibling.style.display = "none");
  });

  raiseHandButton.addEventListener("click", () => {
    if (!handRaised) {
      handRaised = true;
      raiseHandButton.style.display = "none";
      raiseHandIcon.style.display = "block";
      spinner.style.display = "none";
      humanInputArea.style.display = "block";
      submitHumanInput.style.display = "block";
      endMessage.innerHTML = "Waiting for human input...";
      updatePromptsAndOptions();
      const conversationLength =
        document.getElementById("conversation").children.length;
      socket.emit("raise_hand", {
        humanName: promptsAndOptions.options.humanName,
        index: conversationLength,
      });
    }
  });

  //When to reload the UI

  const reloadUI = () => {
    updatePromptsAndOptions();
    unpackPromptsAndOptions();
    reloadConversations();
  };

  document.getElementById("room-name").addEventListener("change", reloadUI);

  //Lastly, try to fill the initial UI

  // ====================
  //   STARTUP COMMANDS
  // ====================

  try {
    promptsAndOptions = JSON.parse(localStorage.getItem("PromptsAndOptions"));
    console.log("Stored prompts and settings to restore:");
    console.log(promptsAndOptions);
    unpackPromptsAndOptions();
  } catch (e) {
    console.log(e);
    console.log("Resetting to default settings");

    let default_foods;
    let default_topics;
    fetch("./foods.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        default_foods = data.foods;
        return fetch("./topics.json");
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        default_topics = data;
        return Promise.resolve();
      })
      .then(() => {
        promptsAndOptions = {
          options: {},
          system: default_topics.system,
        };

        let rooms = [];
        for (let i = 0; i < default_topics.topics.length; i++) {
          const topic = default_topics.topics[i];
          rooms[i] = {
            name: topic.title,
            topic: topic.prompt,
            characters: default_foods,
          };
        }
        promptsAndOptions.rooms = rooms;

        updatePromptsAndOptions(true);
        unpackPromptsAndOptions();
        reloadConversations();
      })
      .catch((error) => console.error("Failed to reset:", error));
  }

  // //////////////
  // DRAG AND DROP CHARACTERS
  // //////////////

  let draggedElem = null;
  let draggedIndex = null;

  function enableDragAndDrop() {
    const charactersDiv = document.getElementById("characters");
    const charElems = charactersDiv.querySelectorAll(".character");

    charElems.forEach((charElem, index) => {
      charElem.setAttribute("draggable", true);
      charElem.dataset.index = index;
      charElem.style.cursor = "move";

      if (!charElem.querySelector(".drag-handle")) {
        const dragHandle = document.createElement("span");
        dragHandle.innerHTML = "⋮⋮ ";
        dragHandle.className = "drag-handle";
        dragHandle.style.cssText =
          "color: #ccc; font-weight: bold; margin-right: 5px;";
        charElem.insertBefore(dragHandle, charElem.firstChild);
      }

      charElem.addEventListener("dragstart", (e) => {
        draggedElem = charElem;
        draggedIndex = index;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index);
        charElem.style.opacity = "0.5";
        console.log(`Dragging character at index ${index}`);
      });

      charElem.addEventListener("dragend", (e) => {
        draggedElem = null;
        draggedIndex = null;
        charElem.style.opacity = "1";
      });

      charElem.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (charElem !== draggedElem) {
          charElem.style.borderTop = "2px solid #007cba";
        }
      });

      charElem.addEventListener("dragleave", (e) => {
        charElem.style.borderTop = "";
      });

      charElem.addEventListener("drop", (e) => {
        e.preventDefault();
        charElem.style.borderTop = "";

        if (!draggedElem || draggedElem === charElem) return;

        const targetIndex = parseInt(charElem.dataset.index);

        console.log(
          `Moving character from index ${draggedIndex} to ${targetIndex}`
        );

        updatePromptsAndOptions();

        const characters = promptsAndOptions.rooms[currentRoom].characters;
        const draggedChar = characters.splice(draggedIndex, 1)[0];
        characters.splice(targetIndex, 0, draggedChar);

        unpackPromptsAndOptions();

        setTimeout(() => enableDragAndDrop(), 100);

        console.log(
          "Character order updated:",
          characters.map((c) => c.name)
        );
      });
    });
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === "childList" &&
        mutation.target.id === "characters"
      ) {
        setTimeout(() => enableDragAndDrop(), 50);
      }
    });
  });

  observer.observe(document.getElementById("characters"), {
    childList: true,
    subtree: true,
  });

  setTimeout(() => enableDragAndDrop(), 100);
});

// //////////////
// UTILS
// //////////////

function toTitleCase(string) {
  return string
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
