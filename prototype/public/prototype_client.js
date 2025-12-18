const { createApp } = Vue;

createApp({
  data() {
    return {
      socket: null,

      // UI State
      loading: false,
      conversationActive: false,
      conversationStarted: false,
      currentRoomIndex: 0,
      injectionStatus: '',
      endMessage: '',

      // Data Model
      options: {
        gptModel: "gpt-4o-mini",
        temperature: 1,
        maxTokens: 200,
        chairMaxTokens: 250,
        frequencyPenalty: 0,
        presencePenalty: 0,
        audio_speed: 1.15,

        trimSentance: false,
        trimParagraph: true,
        trimChairSemicolon: true,
        showTrimmed: true,

        conversationMaxLength: 10,
        extraMessageCount: 5,
        skipAudio: false,

        injectPrompt: "",
        maxTokensInject: 800,

        language: 'en',

        // Hardcoded
        voiceModel: "gpt-4o-mini-tts",
        skipMatchingSubtitles: true
      },

      // Language storage
      languageData: {
        en: { system: '', rooms: [] }
      },
      available_languages: ['en'],

      // Conversation Data
      conversation: [],

      // Audio State
      audioCtx: null,
      audioPlaylist: [],
      currentAudio: 0,
      audioIsPlaying: false,
      audioPaused: false,
      nextOrBackClicked: false,

      // Constants
      audioVoices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"]
    }
  },

  computed: {
    currentLanguageData() {
      if (!this.languageData[this.options.language]) {
        this.languageData[this.options.language] = { system: '', rooms: [] };
      }
      return this.languageData[this.options.language];
    },

    currentRoom() {
      const rooms = this.currentLanguageData.rooms;
      if (!rooms || rooms.length === 0) return null;
      return rooms[this.currentRoomIndex];
    },

    currentSystemPrompt: {
      get() {
        return this.currentLanguageData.system;
      },
      set(val) {
        this.currentLanguageData.system = val;
      }
    }
  },

  watch: {
    options: {
      handler() { this.save(); },
      deep: true
    },
    languageData: {
      handler() { this.save(); },
      deep: true
    }
  },

  mounted() {
    this.socket = io();
    this.setupSocketListeners();
    this.startup();
  },

  methods: {
    // ===========================
    //   STARTUP & PERSISTENCE
    // ===========================
    async startup() {
      try {
        const stored = JSON.parse(localStorage.getItem("PromptsAndOptions"));
        if (stored) {
          console.log("Restoring from localStorage", stored);
          // Merge stored options to handle new fields gracefully
          this.options = { ...this.options, ...stored.options };
          this.languageData = stored.language;
        } else {
          throw new Error("No stored data");
        }
      } catch (e) {
        console.log("Resetting to defaults", e);
        await this.factoryReset();
      }
    },

    async factoryReset() {
      let default_prompts = {};
      for (const lang of this.available_languages) {
        default_prompts[lang] = {};
        const resp = await fetch(`./foods_${lang}.json`);
        default_prompts[lang] = await resp.json();
        const resp2 = await fetch(`./topics_${lang}.json`);
        default_prompts[lang].topics = await resp2.json();

        this.languageData[lang] = {
          system: default_prompts[lang].topics.system,
          rooms: default_prompts[lang].topics.topics.map(topic => ({
            name: topic.title,
            topic: topic.prompt,
            characters: JSON.parse(JSON.stringify(default_prompts[lang].foods))
          }))
        };
      }
      this.options.language = 'en';
      this.currentRoomIndex = 0;
      this.save();
    },

    save() {
      // Ensure current room ID is set for the server
      if (this.currentRoom && this.currentRoom.characters.length > 0) {
        this.options.chairId = this.currentRoom.characters[0].id;
      }

      const payload = {
        options: this.options,
        language: this.languageData
      };
      localStorage.setItem("PromptsAndOptions", JSON.stringify(payload));
    },

    getPayload() {
      // Pre-process payload for server (similar to updatePromptsAndOptions return)

      let replacedCharacters = JSON.parse(JSON.stringify(this.currentRoom.characters));

      if (replacedCharacters[0]) {
        let participants = this.currentRoom.characters
          .slice(1)
          .map(c => this.toTitleCase(c.name))
          .join(", ");

        replacedCharacters[0].prompt = replacedCharacters[0].prompt
          .replace("[FOODS]", participants)
          .replace('[HUMANS]', '');
      }

      return {
        options: this.options,
        topic: this.currentLanguageData.system.replace("[TOPIC]", this.currentRoom.topic),
        characters: replacedCharacters
      };
    },

    // ===========================
    //   SOCKET LISTENERS
    // ===========================
    setupSocketListeners() {
      this.socket.on("conversation_update", (conversationUpdate) => {
        this.conversation = conversationUpdate;
        this.scrollToBottom();
      });

      this.socket.on("audio_update", (update) => {
        this.handleAudioUpdate(update);
      });

      this.socket.on("conversation_end", () => {
        this.loading = false;
        this.conversationActive = false;
        this.endMessage = "End of Conversation";
      });

      this.socket.on("conversation_error", (errorMessage) => {
        console.error(errorMessage);
        this.loading = false;
        alert(errorMessage.message);
      });
    },

    // ===========================
    //   UI ACTIONS
    // ===========================
    addRoom() {
      this.currentLanguageData.rooms.push({
        name: "New Room",
        topic: "",
        characters: []
      });
      this.currentRoomIndex = this.currentLanguageData.rooms.length - 1;
    },

    removeRoom() {
      if (this.currentLanguageData.rooms.length > 1) {
        this.currentLanguageData.rooms.splice(this.currentRoomIndex, 1);
        if (this.currentRoomIndex >= this.currentLanguageData.rooms.length) {
          this.currentRoomIndex = this.currentLanguageData.rooms.length - 1;
        }
      }
    },

    addCharacter() {
      if (this.currentRoom) {
        this.currentRoom.characters.push({});
      }
    },

    removeCharacter() {
      if (this.currentRoom && this.currentRoom.characters.length > 0) {
        this.currentRoom.characters.pop();
      }
    },

    toggleConversation() {
      if (this.conversationActive) {
        // Pause
        this.conversationActive = false;
        this.loading = false;
        this.socket.emit("pause_conversation");
      } else {
        // Start/Resume
        this.loading = true;
        this.conversationActive = true;

        if (!this.conversationStarted) {
          // Start fresh
          this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          this.conversationStarted = true;
          this.socket.emit("start_conversation", this.getPayload());
        } else {
          // Resume
          console.log("Resuming...");
          this.socket.emit("resume_conversation");
        }
      }
    },

    restartConversation() {
      this.loading = true;
      this.conversationActive = true;
      this.endMessage = "";
      this.conversation = [];
      this.stopCurrentAudio();

      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.audioPlaylist = [];
      this.currentAudio = 0;

      this.socket.emit("start_conversation", this.getPayload());
    },

    continueConversation() {
      this.loading = true;
      this.conversationActive = true;
      this.endMessage = "";
      this.socket.emit("continue_conversation", this.getPayload());
    },

    removeLastMessage() {
      this.socket.emit("remove_last_message");
    },

    submitInjection() {
      const message = {
        text: this.options.injectPrompt,
        length: this.options.maxTokensInject,
        index: this.conversation.length,
        // Use local browser date
        date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      };

      this.injectionStatus = "Instruction injected, just wait...";
      setTimeout(() => this.injectionStatus = "", 5000);

      this.socket.emit("submit_injection", message);
    },

    // ===========================
    //   AUDIO HANDLING
    // ===========================
    async handleAudioUpdate(update) {
      // If message not found (e.g. restart happened), skip
      const msgIndex = this.conversation.findIndex(c => c.id === update.id);
      if (msgIndex === -1) return;

      console.log("Audio update", update);

      if (update.type == "skipped") {
        this.addToPlaylist(msgIndex, null, true); // skip = true
        return;
      }

      await this.addToPlaylist(msgIndex, update.audio, false);

      // Auto-play if not playing and not paused
      if (!this.audioIsPlaying && this.audioPlaylist[this.currentAudio] && !this.audioPaused) {
        this.audioPlaylist[this.currentAudio].play();
      }
    },

    async addToPlaylist(index, audioData, isSkipped) {
      if (isSkipped) {
        this.audioPlaylist[index] = {
          play: () => {
            this.advancePlaylist();
          },
          stop: () => { this.audioIsPlaying = false; },
          skip: true
        };
        return;
      }

      const buffer = await this.audioCtx.decodeAudioData(audioData);
      let source;

      const play = () => {
        source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);
        source.addEventListener("ended", async () => {
          if (this.audioPaused) return;
          if (this.nextOrBackClicked) {
            this.nextOrBackClicked = false;
            return;
          }

          // Audio ended naturally
          if (this.audioPlaylist[this.currentAudio + 1]) {
            // Wait a bit
            await new Promise(r => setTimeout(r, 1000));
            this.advancePlaylist();
          } else if (this.audioIsPlaying) {
            // End of queue
            this.audioIsPlaying = false;
            this.currentAudio++;
          }
        });
        source.start();
        this.audioIsPlaying = true;
      };

      const stop = () => {
        if (source) {
          try { source.stop(); } catch (e) { }
        }
        this.audioIsPlaying = false;
      };

      this.audioPlaylist[index] = { play, stop };
    },

    advancePlaylist() {
      this.currentAudio++;
      if (this.audioPlaylist[this.currentAudio]) {
        this.audioPlaylist[this.currentAudio].play();
      }
    },

    stopCurrentAudio() {
      if (this.audioIsPlaying && this.audioPlaylist[this.currentAudio]) {
        this.audioPlaylist[this.currentAudio].stop();
      }
    },

    audioBack() {
      if (this.audioPaused) return;

      if (this.audioIsPlaying) {
        this.stopCurrentAudio();
        this.nextOrBackClicked = true;
      }

      if (this.currentAudio > 0) this.currentAudio--;
      while (this.currentAudio > 0 && this.audioPlaylist[this.currentAudio]?.skip) {
        this.currentAudio--;
      }

      if (this.audioPlaylist[this.currentAudio]) {
        this.audioPlaylist[this.currentAudio].play();
      }
    },

    audioToggle() {
      if (this.audioIsPlaying) {
        this.audioCtx.suspend();
        this.audioIsPlaying = false;
      } else if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
        this.audioIsPlaying = true;
      } else if (this.audioPlaylist[this.currentAudio]) {
        this.audioPlaylist[this.currentAudio].play();
      }

      this.audioPaused = !this.audioPaused;
    },

    audioNext() {
      if (this.audioPaused) return;
      if (this.audioPlaylist[this.currentAudio + 1]) {
        if (this.audioIsPlaying) {
          this.stopCurrentAudio();
          this.nextOrBackClicked = true;
        }
        this.currentAudio++;
        this.audioPlaylist[this.currentAudio].play();
      }
    },

    // ===========================
    //   DRAG & DROP
    // ===========================
    onDragStart(event, index) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index);
      event.target.style.opacity = '0.5';
    },

    onDrop(event, targetIndex) {
      event.preventDefault();
      const draggedIndex = parseInt(event.dataTransfer.getData('text/plain'));
      if (isNaN(draggedIndex)) return;

      const chars = this.currentRoom.characters;
      const [movedItem] = chars.splice(draggedIndex, 1);
      chars.splice(targetIndex, 0, movedItem);

      // Clean up styles (simple approach, Vue re-render handles most)
      // In a real app we might reference refs to clean up opacity
      // but Vue's reactivity usually resets the DOM element when list changes order

      // Force save
      this.save();
    },

    // ===========================
    //   UTILS
    // ===========================
    scrollToBottom() {
      this.$nextTick(() => {
        const container = document.getElementById("conversation-container");
        if (container) container.scrollTop = container.scrollHeight;
      });
    },

    toTitleCase(str) {
      if (!str) return "";
      return str.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    }
  }
}).mount('#app');
