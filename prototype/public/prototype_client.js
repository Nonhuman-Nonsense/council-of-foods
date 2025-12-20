const { createApp } = Vue;

const defaultOptions = {
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

  conversationMaxLength: 10,
  extraMessageCount: 5,
  skipAudio: false,

  injectPrompt: "",
  maxTokensInject: 800,

  language: 'en',

  // Hardcoded
  voiceModel: "gpt-4o-mini-tts",
  skipMatchingSubtitles: true
};

const defaultLocalOptions = {
  theme: '',
  showTrimmed: true,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  configCardExpanded: true,
  expandedCharacters: {},
  topicStates: {},
  currentTopicIndex: 0,
  editorWidthPercent: 50
};

createApp({
  data() {
    return {
      socket: null,

      // UI State
      loading: false,
      conversationActive: false,
      conversationStarted: false,
      injectionStatus: '',
      endMessage: '',

      // Data Model
      options: { ...defaultOptions },
      localOptions: { ...defaultLocalOptions },

      // Language storage
      languageData: {
        en: { system: '', topics: [] }
      },
      available_languages: ['en'],

      // Runtime
      audioVoices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"],
      sortableInstance: null,
      isResizing: false,

      // Conversation
      conversation: [],

      // Audio State
      audioCtx: null,
      audioPlaylist: [],
      currentAudio: 0,
      audioIsPlaying: false,
      audioPaused: false,
      nextOrBackClicked: false,
    }
  },

  computed: {
    currentLanguageData() {
      if (!this.languageData[this.options.language]) {
        this.languageData[this.options.language] = { system: '', topics: [] };
      }
      return this.languageData[this.options.language];
    },

    currentTopic() {
      const topics = this.currentLanguageData.topics;
      if (!topics || topics.length === 0) return null;
      // Use persisted index, fallback to 0
      const idx = this.localOptions.currentTopicIndex || 0;
      return topics[idx] || topics[0];
    },

    currentSystemPrompt: {
      get() {
        return this.currentLanguageData.system;
      },
      set(val) {
        this.currentLanguageData.system = val;
      }
    },
    // Split lists for UI
    activeCharacters() {
      return (this.currentLanguageData.characters || []).filter(c => this.isCharacterActive(c));
    },

    inactiveCharacters() {
      return (this.currentLanguageData.characters || []).filter(c => !this.isCharacterActive(c));
    }
  },

  watch: {
    options: {
      handler() { this.save(); },
      deep: true
    },
    localOptions: {
      handler() { this.save(); },
      deep: true
    },
    languageData: {
      handler() { this.save(); },
      deep: true
    },
    currentTopic: {
      handler(val) {
        if (val) {
          this.$nextTick(() => {
            this.initSortable();
          });
        }
      },
      immediate: true
    }
  },

  mounted() {
    this.socket = io();
    this.setupSocketListeners();
    this.startup();
  },

  methods: {
    isCharacterPinned(char) {
      // The first character in the global list is considered "The Chair" and is pinned.
      if (!this.currentLanguageData.characters || this.currentLanguageData.characters.length === 0) return false;
      return this.currentLanguageData.characters[0]._ui_id === char._ui_id;
    },

    isCharacterActive(char) {
      // Pinned characters are always active
      if (this.isCharacterPinned(char)) return true;

      if (!this.currentTopic) return false;
      const topicId = this.currentTopic.id;
      const topicState = this.localOptions.topicStates[topicId];
      const isActive = topicState?.activeCharacterIds?.[char._ui_id] || false;
      return isActive;
    },

    // Sort logic to keep Active at top in the data model
    enforceActiveCharacterSort() {
      if (!this.currentLanguageData.characters) return;

      const pinned = [];
      const active = [];
      const inactive = [];

      this.currentLanguageData.characters.forEach((c, index) => {
        // Index 0 is pinned.
        if (index === 0) {
          pinned.push(c);
          return;
        }

        if (this.isCharacterActive(c)) {
          active.push(c);
        } else {
          inactive.push(c);
        }
      });

      // Mutate the array structure directly: [Pinned, ...Active, ...Inactive]
      this.currentLanguageData.characters = [...pinned, ...active, ...inactive];
    },
    initSortable() {
      const el = document.getElementById('active-characters-list');
      if (!el) return;

      // If already initialized on the same element, skip
      if (this.sortableInstance && this.sortableInstance.el === el) return;
      if (this.sortableInstance) this.sortableInstance.destroy();

      this.sortableInstance = new Sortable(el, {
        animation: 150,
        handle: ".drag-handle",
        filter: ".pinned", // Cannot drag pinned items
        preventOnFilter: false, // Critical: Allow clicks/inputs to work in pinned items!
        onMove: (evt) => {
          // Prevent moving anything to index 0 (pinned position)
          // If the target is the pinned element (index 0), disallow
          if (evt.related.classList.contains('pinned')) return false;
          return true;
        },
        onEnd: (evt) => {
          if (evt.oldIndex === evt.newIndex) return;

          // Because we enforceActiveCharacterSort, active chars are at indices 0..N
          // So the visual index corresponds exactly to the global array index for this subset.

          const globalList = this.currentLanguageData.characters;

          // Safety: ensure indices are within bounds
          if (evt.oldIndex >= globalList.length) return;

          const item = globalList.splice(evt.oldIndex, 1)[0];
          globalList.splice(evt.newIndex, 0, item);

          this.save();
        }
      });
    },
    // ===========================
    //   STARTUP & PERSISTENCE
    // ===========================
    async startup() {
      try {
        const stored = JSON.parse(localStorage.getItem("PromptsAndOptions"));
        if (stored) {
          // Merge stored options to handle new fields gracefully
          this.options = { ...defaultOptions, ...stored.options };
          this.localOptions = { ...JSON.parse(JSON.stringify(defaultLocalOptions)), ...stored.localOptions };

          // Backwards compatibility: if theme was in options
          if (stored.options && stored.options.theme) {
            this.localOptions.theme = stored.options.theme;
            delete this.options.theme;
          }

          // Ensure Global Characters and Topic IDs for each language
          Object.keys(stored.language).forEach(lang => {
            const data = stored.language[lang];

            // Ensure characters array
            if (!data.characters) data.characters = [];

            // Ensure activeCharacterIds logic persists or migrates? 
            // Since we renamed key, old roomStates are lost unless migrated.
            // Simplified: User accepted reset. We focus on new structure.

            // Ensure Topics
            if (data.topics) {
              data.topics.forEach(topic => {
                if (!topic.id) topic.id = 'topic_' + Date.now() + Math.random();
              });
            } else if (data.rooms) {
              // Migration path if needed, but likely better to just encourage reset for clean state
              data.topics = data.rooms.map(r => ({ ...r, prompt: r.topic }));
              delete data.rooms;
            }
          });

          this.languageData = stored.language;

          if (this.localOptions.theme) {
            this.setTheme(this.localOptions.theme);
          }

          this.sanitizeData();

          // Ensure sorting is enforced on load so index 0 is pinned correcty
          this.enforceActiveCharacterSort();
        } else {
          throw new Error("No stored data");
        }
      } catch (e) {
        console.log("Resetting to defaults", e);
        await this.factoryReset();
      }
    },

    async factoryReset() {
      // Reset options to defaults
      this.options = { ...defaultOptions };
      // Deep copy defaults to ensure clean slate
      this.localOptions = { ...JSON.parse(JSON.stringify(defaultLocalOptions)) };
      this.setTheme(this.localOptions.theme);

      // Initialize languages from server
      for (const lang of this.available_languages) {
        try {
          const [foodsResp, topicsResp] = await Promise.all([
            fetch(`./foods_${lang}.json`),
            fetch(`./topics_${lang}.json`)
          ]);

          if (!foodsResp.ok) throw new Error(`Failed to fetch foods_${lang}: ${foodsResp.status}`);
          if (!topicsResp.ok) throw new Error(`Failed to fetch topics_${lang}: ${topicsResp.status}`);

          const foodsParams = await foodsResp.json();
          const topics = await topicsResp.json();

          // Map Characters (Global)
          // foodsParams is { foods: [...] }
          const characters = foodsParams.foods.map(f => ({
            ...f,
            _ui_id: Date.now() + Math.random() // Ensure unique ID
          }));

          // Map Topics
          const topicsList = topics.topics.map(t => ({
            id: 'topic_' + Date.now() + Math.random(),
            name: t.title,
            prompt: t.prompt
          }));

          this.languageData[lang] = {
            system: topics.system,
            characters: characters,
            topics: topicsList
          };

          // Explicitly set default active state: Only Pinned (Index 0) is active
          if (characters.length > 0) {
            const pinnedChar = characters[0];

            topicsList.forEach((topic, rIndex) => {
              // Ensure topicStates object exists
              if (!this.localOptions.topicStates) this.localOptions.topicStates = {};

              this.localOptions.topicStates[topic.id] = {
                activeCharacterIds: {
                  [pinnedChar._ui_id]: true
                }
              };
            });
          }

        } catch (err) {
          console.error(`Failed to load defaults for ${lang}:`, err);
          // Fallback if fetch fails
          this.languageData[lang] = { system: "Error loading defaults.", characters: [], topics: [] };
        }
      }

      this.options.language = 'en';
      this.sanitizeData();

      this.save();
    },

    save() {
      const data = {
        options: this.options,
        localOptions: this.localOptions,
        language: this.languageData
      };
      localStorage.setItem("PromptsAndOptions", JSON.stringify(data));
    },

    getPayload() {
      // Pre-process payload for server (similar to updatePromptsAndOptions return)

      // Construct participant list based on ACTIVE characters in current TOPIC
      // We must manually filter the global list based on currentTopic active IDs.

      // We need real characters, not deep copy yet
      const allChars = this.currentLanguageData.characters || [];
      const topicId = this.currentTopic.id;
      const activeIds = this.localOptions.topicStates[topicId]?.activeCharacterIds || {};

      // Filter active
      let activeChars = allChars.filter(c => activeIds[c._ui_id]);

      // Sort logic is enforced on UI, but we should double check data sort?
      // The data array is sorted. So filtering in order works.

      let replacedCharacters = JSON.parse(JSON.stringify(activeChars));

      // Ensure every character has an ID (default to name) and voice (default to "alloy")
      replacedCharacters.forEach(c => {
        if (!c.id && c.name) c.id = c.name;
        if (!c.voice) c.voice = this.audioVoices[0];
      });

      if (replacedCharacters[0]) {
        let participants = activeChars
          .slice(1)
          .map(c => this.toTitleCase(c.name))
          .join(", ");

        replacedCharacters[0].prompt = replacedCharacters[0].prompt
          .replace("[FOODS]", participants)
          .replace('[HUMANS]', '');
      }

      return {
        options: this.options,
        prompt: this.currentSystemPrompt.replace("[TOPIC]", this.currentTopic.prompt),
        characters: replacedCharacters,
        // For logging/debug, maybe send topic name too?
        topicName: this.currentTopic.name
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
    addTopic() {
      this.currentLanguageData.topics.push({
        id: 'topic_' + Date.now(),
        name: "New Topic",
        prompt: "",
      });
      // Switch to new topic
      this.localOptions.currentTopicIndex = this.currentLanguageData.topics.length - 1;
    },

    removeTopic() {
      if (this.currentLanguageData.topics.length > 1) {
        this.currentLanguageData.topics.splice(this.localOptions.currentTopicIndex, 1);
        if (this.localOptions.currentTopicIndex >= this.currentLanguageData.topics.length) {
          this.localOptions.currentTopicIndex = this.currentLanguageData.topics.length - 1;
        }
      }
    },

    addCharacter() {
      // Ensure global list exists for current language
      if (!this.currentLanguageData.characters) this.currentLanguageData.characters = [];

      const newId = Date.now() + Math.random();
      const voiceIndex = this.currentLanguageData.characters.length % this.audioVoices.length;

      // Add at the BOTTOM (End) and maintain Inactive state
      this.currentLanguageData.characters.push({
        voice: this.audioVoices[voiceIndex],
        voiceInstruction: "",
        _ui_id: newId,
        name: "",
        prompt: ""
      });

      // Auto-expand in UI logic
      this.localOptions.expandedCharacters[newId] = true;

      // Do NOT auto-activate. User wants it inactive (at bottom).
      // if (this.currentTopic) {
      //   this.toggleCharacterActive({ _ui_id: newId });
      // }

      this.save();
    },

    removeCharacter(index) {
      // Global Removal
      if (!this.currentLanguageData.characters || this.currentLanguageData.characters.length === 0) return;

      // If index not provided, remove the character at the BOTTOM (Last)
      let indexToRemove = (typeof index === 'number') ? index : this.currentLanguageData.characters.length - 1;

      // Safety check to protect Chair (Index 0)
      if (indexToRemove === 0 && this.currentLanguageData.characters.length > 1) {
        // Try removing the last one instead if they accidentally tried to pop the chair contextually
        indexToRemove = this.currentLanguageData.characters.length - 1;
      }
      // If only chair remains, allowing removal might be bad, but usually UI prevents it.

      const char = this.currentLanguageData.characters[indexToRemove];
      if (char) {
        // Cleanup expansion state
        if (this.localOptions.expandedCharacters[char._ui_id]) {
          delete this.localOptions.expandedCharacters[char._ui_id];
        }
      }

      this.currentLanguageData.characters.splice(indexToRemove, 1);
      this.save();
    },

    toggleCharacterActive(char) {
      console.log("toggleCharacterActive called", char);
      // Toggle functionality inside Active vs Inactive logic
      if (!this.currentTopic) return;
      const topicId = this.currentTopic.id;

      // Ensure state object
      if (!this.localOptions.topicStates[topicId]) {
        this.localOptions.topicStates[topicId] = { activeCharacterIds: {} };
      }

      const activeIds = this.localOptions.topicStates[topicId].activeCharacterIds;

      if (activeIds[char._ui_id]) {
        console.log("Deactivating", char._ui_id);
        delete activeIds[char._ui_id];
      } else {
        console.log("Activating", char._ui_id);
        activeIds[char._ui_id] = true;
      }

      // Re-sort to move activated to top / deactivated to bottom
      this.enforceActiveCharacterSort();
      this.save();
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
      if (!this.audioIsPlaying && this.audioPlaylist[this.currentAudio] && !this.localOptions.audioPaused) {
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
          if (this.localOptions.audioPaused) return;
          if (this.localOptions.nextOrBackClicked) {
            this.localOptions.nextOrBackClicked = false;
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
      if (this.localOptions.audioPaused) return;

      if (this.audioIsPlaying) {
        this.stopCurrentAudio();
        this.localOptions.nextOrBackClicked = true;
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

      this.localOptions.audioPaused = !this.localOptions.audioPaused;
    },

    audioNext() {
      if (this.localOptions.audioPaused) return;
      if (this.audioPlaylist[this.currentAudio + 1]) {
        if (this.audioIsPlaying) {
          this.stopCurrentAudio();
          this.localOptions.nextOrBackClicked = true;
        }
        this.currentAudio++;
        this.audioPlaylist[this.currentAudio].play();
      }
    },

    // ===========================
    //   UI LAYOUT
    // ===========================
    toggleSidebar(side) {
      if (side === 'left') this.localOptions.leftSidebarOpen = !this.localOptions.leftSidebarOpen;
      if (side === 'right') this.localOptions.rightSidebarOpen = !this.localOptions.rightSidebarOpen;
    },

    toggleCharacterExpanded(id) {
      if (this.localOptions.expandedCharacters[id]) {
        delete this.localOptions.expandedCharacters[id];
      } else {
        this.localOptions.expandedCharacters[id] = true;
      }
    },

    startResize(event) {
      this.isResizing = true;
      document.addEventListener('mousemove', this.handleResize);
      document.addEventListener('mouseup', this.stopResize);
      // Prevent text selection
      document.body.style.userSelect = 'none';
    },

    handleResize(event) {
      if (!this.isResizing) return;
      const container = document.getElementById('split-view-container');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      let percent = (x / rect.width) * 100;

      // Constraints (min 20%, max 80%)
      if (percent < 20) percent = 20;
      if (percent > 80) percent = 80;

      this.localOptions.editorWidthPercent = percent;
    },

    stopResize() {
      this.isResizing = false;
      document.removeEventListener('mousemove', this.handleResize);
      document.removeEventListener('mouseup', this.stopResize);
      document.body.style.userSelect = '';

      // Trigger resize for potential chart/canvas updates (if any)
      window.dispatchEvent(new Event('resize'));
    },

    setTheme(themeName) {
      this.localOptions.theme = themeName || '';
      document.body.className = ''; // reset
      if (themeName) {
        document.body.classList.add('theme-' + themeName);
      }
    },

    // ===========================
    //   DRAG & DROP
    // ===========================
    // Handled by SortableJS in mounted()

    // ===========================
    //   UTILS
    // ===========================
    sanitizeData() {
      // Ensure all characters across all languages and rooms have a unique UI ID
      // This is critical for Vue + SortableJS stability
      if (!this.languageData) return;

      Object.values(this.languageData).forEach(lang => {
        if (!lang.topics) return;
        lang.topics.forEach(topic => {
          if (!topic.characters) return; // characters are global now, so this check might be legacy, but safe to keep or remove.
          // Actually, characters are global. This loop was probably checking old structure.
          // But if we have global characters, we iterate them:
        });
        // Correct global character ID check:
        if (lang.characters) {
          lang.characters.forEach(c => {
            if (!c._ui_id) c._ui_id = Date.now() + Math.random();
          });
        }
      });
    },

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
})
  .directive('auto-resize', {
    mounted(el) {
      const adjustHeight = () => {
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 2) + 'px'; // +2 for border
      };
      // Adjust initially
      adjustHeight();
      // Adjust on input
      el.addEventListener('input', adjustHeight);
    },
    updated(el) {
      // Also adjust if the content changes programmatically (e.g. factory reset)
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight + 2) + 'px';
    }
  })
  .mount('#app');
