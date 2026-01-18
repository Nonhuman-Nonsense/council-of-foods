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
  geminiVoiceModel: "gemini-2.5-flash-tts",
  inworldVoiceModel: "inworld-tts-1",
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
  editorWidthPercent: 50,
  isInjectionDrawerOpen: false
};


const CharacterCard = {
  template: '#character-card-template',
  props: ['character', 'isActive', 'isExpanded', 'voiceLists', 'isSorting', 'isPinned'],
  emits: ['toggle-active', 'toggle-expanded'],
  methods: {
    onProviderChange() {
      const char = this.character;
      if (char.voiceProvider === 'gemini') {
        char.voice = this.voiceLists.gemini[0];
      } else if (char.voiceProvider === 'inworld') {
        char.voice = this.voiceLists.inworld[0];
      } else {
        char.voice = this.voiceLists.openai[0];
      }
    }
  }
};

createApp({
  components: { CharacterCard },
  data() {
    return {
      socket: null,

      // UI State
      status: 'IDLE', // IDLE, CONNECTING, ACTIVE, PAUSED, ENDED, ERROR
      injectionStatus: '',
      endMessage: '',

      // Data Model
      options: { ...defaultOptions },
      localOptions: { ...defaultLocalOptions },

      // Language storage
      languageData: {
        en: { system: '', topics: [] }
      },
      available_languages: ['en', 'sv'],

      // Runtime
      audioVoices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"],
      audioVoicesGemini: [
        "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
        "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Pulcherrima",
        "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi"
      ],
      audioVoicesInworld: [
        "Alex", "Ashley", "Blake", "Carter", "Clive", "Craig", "Deborah", "Dennis", "Dominus", "Edward",
        "Elizabeth", "Hades", "Hana", "Julia", "Luna", "Mark", "Olivia", "Pixie", "Priya", "Ronald",
        "Sarah", "Shaun", "Theodore", "Timothy", "Wendy"
      ],
      sortableInstance: null,
      isResizing: false,

      // Conversation
      conversation: [],

      // Audio State
      audioController: null,
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

  created() {
    // Dynamic Watchers for Persistence
    ['options', 'localOptions', 'languageData'].forEach(key => {
      this.$watch(key, {
        handler() { this.save(); },
        deep: true
      });
    });
  },

  beforeUpdate() {
    // Global Scroll Guard (Left Pane)
    // Vue's patching process can sometimes cause layout shifts that reset scroll
    // We capture the position right before the patch is applied.
    const el = document.querySelector('.pane-scroll-area');
    if (el) {
      this._leftPaneScrollTop = el.scrollTop;
    }
  },
  updated() {
    // Restore scroll position immediately after DOM patch
    if (this._leftPaneScrollTop !== undefined) {
      const el = document.querySelector('.pane-scroll-area');
      if (el) {
        el.scrollTop = this._leftPaneScrollTop;
      }
    }
  },
  mounted() {
    this.audioController = new AudioController();
    this.audioController.setLogCallback(this.log);

    this.socket = io();
    this.setupSocketListeners();
    this.startup();
  },

  methods: {
    log(category, message, data = null) {
      const styles = {
        'SOCKET_OUT': 'color: #10b981; font-weight: bold;', // Green
        'SOCKET_IN': 'color: #3b82f6; font-weight: bold;',  // Blue
        'AUDIO': 'color: #8b5cf6; font-weight: bold;',      // Purple
        'ERROR': 'color: #ef4444; font-weight: bold;',      // Red
        'SYSTEM': 'color: #6b7280; font-weight: bold;'      // Gray
      };

      const icon = {
        'SOCKET_OUT': '⬆️',
        'SOCKET_IN': '⬇️',
        'AUDIO': '🎵',
        'ERROR': '❌',
        'SYSTEM': '⚙️'
      }[category] || '🔹';

      console.groupCollapsed(`%c${icon} [${category}] ${message}`, styles[category] || '');
      if (data) console.log(data);
      console.trace('Stack');
      console.groupEnd();
    },

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

    updateVoice(char) {
      // Reset voice to first available when provider switches
      if (char.voiceProvider === 'gemini') {
        char.voice = this.audioVoicesGemini[0];
      } else if (char.voiceProvider === 'inworld') {
        char.voice = this.audioVoicesInworld[0];
      } else {
        char.voice = this.audioVoices[0];
      }
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
    /**
     * Startup Sequence.
     * 
     * 1. Hydrates state from LocalStorage (`PromptsAndOptions`).
     * 2. Migrates legacy data if needed.
     * 3. Loads default prompts from `foods_en.json` if startup fails or is fresh.
     * 4. Ensures character sorting (Pinned > Active > Inactive).
     */
    async startup() {
      try {
        const stored = JSON.parse(localStorage.getItem("PromptsAndOptions"));
        if (stored) {
          // Merge stored options to handle new fields gracefully
          this.options = { ...defaultOptions, ...stored.options };
          this.localOptions = { ...JSON.parse(JSON.stringify(defaultLocalOptions)), ...stored.localOptions };

          this.log('SYSTEM', 'State Loaded from LocalStorage');

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
          this.log('SYSTEM', 'Fresh Startup - No Save Found');
          await this.factoryReset();
        }
      } catch (e) {
        this.log('ERROR', 'Save File Corrupted - Resetting', e);
        await this.factoryReset();
      }
    },

    async factoryReset() {
      // Reset options to defaults
      this.log('SYSTEM', 'Factory Reset Executed');
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
            description: t.description || "",
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
          this.log('ERROR', `Failed to load defaults for ${lang}:`, err);
          // Fallback if fetch fails
          this.languageData[lang] = { system: "Error loading defaults.", characters: [], topics: [] };
        }
      }

      this.options.language = 'en';
      this.sanitizeData();

      this.save();
    },

    save() {
      // Always sanitize before saving to ensure consistency
      this.sanitizeData();

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

        // Ensure voiceProvider is set
        if (!c.voiceProvider) c.voiceProvider = 'openai';

        if (!c.voice) {
          if (c.voiceProvider === 'gemini') c.voice = this.audioVoicesGemini[0];
          else c.voice = this.audioVoices[0];
        }
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
        topic: this.currentTopic.prompt || "", // Fix for Zod validation
        characters: replacedCharacters,
        // For logging/debug, maybe send topic name too?
        topicName: this.currentTopic.name
      };
    },

    // ===========================
    //   SOCKET LISTENERS
    // ===========================
    /**
     * Sets up socket.io event listeners.
     * 
     * Handles:
     * - `conversation_update`: Syncs conversation state and passes expected length to AudioController.
     * - `audio_update`: Receives new audio packets.
     * - `conversation_end`: Marks the Conversation (and potentially audio) as complete.
     */
    setupSocketListeners() {
      this.socket.on("conversation_update", (conversationUpdate) => {
        this.log('SOCKET_IN', 'Conversation Update', conversationUpdate);
        this.conversation = conversationUpdate;
        if (this.audioController) {
          this.audioController.setExpectedLength(this.conversation.length);
        }

        // If we get an update, we are active (unless paused, but usually this implies activity)
        if (this.status !== 'PAUSED') {
          this.status = 'ACTIVE';
        }

        this.injectionStatus = ""; // Clear status on response
        this.scrollToBottom();
      });

      this.socket.on("audio_update", (update) => {
        this.log('SOCKET_IN', 'Audio Update Received', update);
        this.handleAudioUpdate(update);
      });

      this.socket.on("conversation_end", () => {
        this.log('SOCKET_IN', 'Conversation End');
        this.status = 'ENDED';
        this.endMessage = "End of Conversation";
        if (this.audioController) this.audioController.markComplete();
      });

      this.socket.on("conversation_error", (errorMessage) => {
        this.log('ERROR', 'Conversation Error', errorMessage);
        this.status = 'ERROR';
        alert(errorMessage.message);
      });
    },

    // ===========================
    //   UI ACTIONS
    // ===========================
    addTopic() {
      const newTopic = {
        id: 'topic_' + Date.now(),
        name: "New Topic",
        description: "",
        prompt: "",
      };
      this.currentLanguageData.topics.push(newTopic);
      this.log('SYSTEM', 'Topic Added', newTopic);

      // Switch to new topic
      this.localOptions.currentTopicIndex = this.currentLanguageData.topics.length - 1;
    },

    removeTopic() {
      if (this.currentLanguageData.topics.length > 1) {
        const removed = this.currentLanguageData.topics[this.localOptions.currentTopicIndex];
        this.log('SYSTEM', 'Topic Removed', removed);

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
        voiceProvider: 'openai',
        voiceLocale: 'en-GB',
        voice: this.audioVoices[voiceIndex],
        voiceInstruction: "",
        _ui_id: newId,
        name: "",
        description: "",
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
      // Toggle functionality inside Active vs Inactive logic
      if (!this.currentTopic) return;
      const topicId = this.currentTopic.id;

      // Ensure state object
      if (!this.localOptions.topicStates[topicId]) {
        this.localOptions.topicStates[topicId] = { activeCharacterIds: {} };
      }

      const activeIds = this.localOptions.topicStates[topicId].activeCharacterIds;

      if (activeIds[char._ui_id]) {
        this.log('SYSTEM', "Deactivating Character", char._ui_id);
        delete activeIds[char._ui_id];
      } else {
        this.log('SYSTEM', "Activating Character", char._ui_id);
        activeIds[char._ui_id] = true;
      }

      // Re-sort to move activated to top / deactivated to bottom
      this.enforceActiveCharacterSort();
      this.save();
    },



    async exportPrompts() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const lang = this.options.language || 'en';

      // Always fetch raw data for export fidelity
      let rawFoods = { foods: [] };
      let rawTopics = { topics: [] };

      try {
        this.log('SYSTEM', 'Fetching raw data for export...');
        const [foodsResp, topicsResp] = await Promise.all([
          fetch(`./foods_${lang}.json`),
          fetch(`./topics_${lang}.json`)
        ]);
        if (foodsResp.ok && topicsResp.ok) {
          rawFoods = await foodsResp.json();
          rawTopics = await topicsResp.json();
        }
      } catch (e) {
        this.log('ERROR', "Failed to fetch raw data", e);
      }

      // 1. Export Characters (Foods)
      // Clone raw structure to preserve static fields (addHuman, panelWithHumans, metadata etc)
      // Clone raw structure to preserve static fields (addHuman, panelWithHumans, metadata etc)
      let foodsExport = JSON.parse(JSON.stringify(rawFoods));

      // Update timestamp if metadata exists
      if (foodsExport.metadata) {
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        foodsExport.metadata.last_updated = `${dateStr} ${timeStr}`;
      }

      // Update the "foods" array with current active characters
      foodsExport.foods = (this.currentLanguageData.characters || []).map(c => {
        // Exclude internal fields like _ui_id
        const { _ui_id, ...rest } = c;
        // Ensure structure matches schema
        return {
          id: rest.id || (rest.name ? rest.name.toLowerCase().replace(/\s+/g, '') : 'unknown'),
          name: rest.name,
          voice: rest.voice,
          voiceProvider: rest.voiceProvider || 'openai',
          voiceLocale: rest.voiceLocale,
          size: rest.size,
          voiceInstruction: rest.voiceInstruction || "",
          voiceTemperature: rest.voiceTemperature || 1.0,
          description: rest.description || "",
          prompt: rest.prompt || ""
        };
      });

      // 2. Export Topics
      // Clone raw structure
      // Clone raw structure
      let topicsExport = JSON.parse(JSON.stringify(rawTopics));

      // Update timestamp if metadata exists
      if (topicsExport.metadata) {
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        topicsExport.metadata.last_updated = `${dateStr} ${timeStr}`;
      }

      // Update system prompt (editable)
      topicsExport.system = this.currentLanguageData.system;

      // Update topics list
      // Reconcile with raw topics to preserve original IDs
      const rawTopicsList = (rawTopics && rawTopics.topics) ? rawTopics.topics : [];

      topicsExport.topics = (this.currentLanguageData.topics || []).map(t => {
        // Try to find matching original topic by title to restore ID and Description
        const match = rawTopicsList.find(rt => rt.title === t.name);

        return {
          id: match ? match.id : (t.id || (t.name ? t.name.toLowerCase().replace(/\s+/g, '') : 'unknown')),
          title: t.name,
          // Use current description if available (user edits), fallback to raw if needed, then prompt (legacy)
          description: t.description || (match ? match.description : t.prompt),
          prompt: t.prompt
        };
      });

      // Helper to trigger download
      const download = (filename, data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      download(`foods_${lang}_${timestamp}.json`, foodsExport);
      download(`topics_${lang}_${timestamp}.json`, topicsExport);

      this.log('SYSTEM', 'Exported Prompts to JSON');
    },

    startConversation() {
      // Start fresh
      this.status = 'CONNECTING';

      // Reset Audio State
      this.audioController.reset();

      const payload = this.getPayload();
      this.log('SOCKET_OUT', 'Starting Conversation', payload);
      this.socket.emit("start_conversation", payload);
    },

    pauseConversation() {
      this.log('SOCKET_OUT', 'Pausing Conversation');
      this.status = 'PAUSED';
      this.socket.emit("pause_conversation");
    },

    resumeConversation() {
      this.status = 'CONNECTING';
      this.log('SOCKET_OUT', 'Resuming Conversation');
      this.socket.emit("resume_conversation");
    },

    restartConversation() {
      this.status = 'CONNECTING';
      this.endMessage = "";
      this.conversation = [];

      // Reset Audio
      this.audioController.reset();

      const payload = this.getPayload();
      this.log('SOCKET_OUT', 'Restarting Conversation', payload);
      this.socket.emit("start_conversation", payload);
    },

    continueConversation() {
      this.status = 'CONNECTING';
      this.endMessage = "";
      const payload = this.getPayload();
      this.log('SOCKET_OUT', 'Continuing Conversation', payload);
      this.socket.emit("continue_conversation", payload);
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

      this.log('SOCKET_OUT', 'Submit Injection', message);
      this.socket.emit("submit_injection", message);
    },

    // ===========================
    //   AUDIO HANDLING
    // ===========================
    /**
     * Handles an incoming audio packet from the server.
     * 
     * It adds the audio to the AudioController playlist.
     * 
     * Critical Fix for Race Condition:
     * It checks if the AudioController is inactive AND the conversation is NOT complete
     * before triggering `start()`. 
     * If we trigger `start()` blindly when the conversation is already complete (e.g. late packet),
     * the AudioController might loop back to the beginning.
     * 
     * @param {Object} update - { id, audio, type }
     */
    async handleAudioUpdate(update) {
      // If message not found (e.g. restart happened), skip
      const msgIndex = this.conversation.findIndex(c => c.id === update.id);
      if (msgIndex === -1) {
        this.log('AUDIO', 'Update for unknown message', { id: update.id });
        return;
      }

      this.audioController.addToPlaylist(msgIndex, update.audio, update.type == "skipped");

      // Fix for Race Condition:
      // If a late packet arrives after we have already finished the conversation, 
      // calling start() blindly will cause the AudioController to see isFinished()=true 
      // and reset the index to 0, restarting playback unexpectedly.
      if (!this.audioController.isActive && !this.audioController.isConversationComplete) {
        this.audioController.start();
      }
    },

    downloadMessageAudio(index) {
      if (!this.audioController || !this.audioController.hasAudio(index)) {
        this.log('AUDIO', "No audio available to download", { index });
        return;
      }

      const msg = this.conversation[index];
      if (!msg) return;

      // Construct filename: [character.id]_[todays date and time]_[audio.id].mp3
      const speakerName = msg.speaker;
      let charId = speakerName;
      // Try to find official ID if possible
      if (this.currentLanguageData && this.currentLanguageData.characters) {
        const char = this.currentLanguageData.characters.find(c => c.name === speakerName);
        if (char && char.id) charId = char.id;
      }
      // Sanitize charId
      charId = charId.replace(/[^a-zA-Z0-9-_]/g, '');

      // Use message ID for stability so re-downloading gets same filename
      const filename = `${charId}_${msg.id || index}.mp3`;

      this.audioController.downloadAudio(index, filename);
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
            // Ensure ID matches Name
            if (c.name) {
              c.id = c.name.toLowerCase().replace(/\s+/g, '');
            }
          });
        }
      });
    },

    scrollToBottom() {
      this.$nextTick(() => {
        const container = document.getElementById("conversation-container");
        if (!container) return;

        // Smart Scroll: only auto-scroll if we are already near the bottom (or if it's the very start)
        const threshold = 100; // pixels from bottom
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        // If distance is small (user is at bottom), OR if we just started (scrollHeight is small?)
        // We assume that if a new message arrived, distanceToBottom includes that new message's height.
        // So we should be lenient. If user is way up (> 300px), don't scroll.
        if (distanceToBottom < 300) {
          container.scrollTop = container.scrollHeight;
        }
      });
    },



    save() {
      // Always sanitize before saving to ensure consistency
      this.sanitizeData();

      const data = {
        options: this.options,
        localOptions: this.localOptions,
        language: this.languageData
      };
      localStorage.setItem("PromptsAndOptions", JSON.stringify(data));
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
