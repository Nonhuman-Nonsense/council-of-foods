const { createApp } = Vue;
const CHARACTERS_FILE = "foods";

const PROTOTYPE_CUSTOM_TOPIC_ID = "customtopic";
const PROTOTYPE_CUSTOM_TOPIC_TOKEN = "[VISITOR_INPUT]";

function usesCustomVoiceId(character) {
  return character?.voiceProvider === 'inworld' || character?.voiceProvider === 'elevenlabs';
}

function usesInworldTts2(character) {
  return Boolean(character?.voiceLocale?.trim());
}

const LANGUAGE_MODEL_KEYS = [
  'conversationModel',
  'conversationReasoning',
  'voiceModel',
  'geminiVoiceModel',
  'inworldVoiceModel',
  'elevenlabsVoiceModel',
];

const defaultLanguageModelProfile = {
  conversationModel: "mistral/mistral-large-3",
  conversationReasoning: "none",
  voiceModel: "gpt-4o-mini-tts",
  geminiVoiceModel: "gemini-2.5-flash-tts",
  inworldVoiceModel: "inworld-tts-1.5-max",
  elevenlabsVoiceModel: "eleven_flash_v2_5",
};

const defaultLanguageModels = {
  en: { ...defaultLanguageModelProfile },
  sv: { ...defaultLanguageModelProfile },
};

const defaultOptions = {
  languageModels: JSON.parse(JSON.stringify(defaultLanguageModels)),
  temperature: 1,
  maxTokens: 200,
  chairMaxTokens: 250,
  defaultAudioSpeed: 1.15,

  trimSentance: false,
  trimParagraph: true,
  trimChairSemicolon: true,

  conversationMaxLength: 10,
  /** Increment applied server-side on "Extend" (matches server `extraMessageCount`). */
  extraMessageCount: 5,
  /** Absolute cap for extends (server `meetingVeryMaxLength`); hard cap skips `query_extension` and concludes directly. */
  meetingVeryMaxLength: 30,
  skipAudio: false,
  directedSpeakerRouting: false,

  injectPrompt: "",
  maxTokensInject: 800,

  language: 'en',

  skipMatchingSubtitles: true
};

/**
 * Rows that participate in TTS (excludes trailing `query_extension` synthetic with no audio).
 */
function countPlayableMessages(conversation) {
  if (!conversation || conversation.length === 0) return 0;
  const last = conversation[conversation.length - 1];
  if (last && last.type === 'query_extension') {
    return conversation.length - 1;
  }
  return conversation.length;
}

const defaultLocalOptions = {
  theme: '',
  showTrimmed: true,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  configCardExpanded: true,
  expandedCharacters: {},
  topicStates: {},
  selectedTopicId: null,
  editorWidthPercent: 50,
  isInjectionDrawerOpen: false,
  customTopicVisitorInput: "",
  languageModelsText: JSON.stringify(defaultLanguageModels.en, null, 2),
  languageModelsError: "",
};

function normalizeLanguageModelProfile(profile, fallback = defaultLanguageModelProfile) {
  const base = { ...fallback, ...(profile || {}) };
  for (const key of LANGUAGE_MODEL_KEYS) {
    if (typeof base[key] !== 'string' || !base[key].trim()) {
      base[key] = fallback[key];
    }
  }
  return base;
}

function normalizeLanguageModels(models) {
  const normalized = JSON.parse(JSON.stringify(defaultLanguageModels));
  if (!models || typeof models !== 'object') return normalized;
  for (const lang of Object.keys(models)) {
    normalized[lang] = normalizeLanguageModelProfile(models[lang], defaultLanguageModels[lang] || defaultLanguageModelProfile);
  }
  return normalized;
}



const CharacterCard = {
  template: '#character-card-template',
  props: ['character', 'isActive', 'isExpanded', 'voiceLists', 'isSorting', 'isPinned'],
  emits: ['toggle-active', 'toggle-expanded'],
  methods: {
    usesInworldTts2(char) {
      return usesInworldTts2(char);
    },
    usesCustomVoiceId(char) {
      return usesCustomVoiceId(char);
    },
    onProviderChange() {
      const char = this.character;
      if (char.voiceProvider === 'gemini') {
        char.voice = this.voiceLists.gemini[0];
        if (!char.voiceLocale) char.voiceLocale = 'en-GB';
        if (char.voiceInstruction === undefined) char.voiceInstruction = "";
      } else if (char.voiceProvider === 'inworld') {
        if (!char.voice) char.voice = "";
        if (char.voiceTemperature === undefined) char.voiceTemperature = 1.1;
      } else if (char.voiceProvider === 'elevenlabs') {
        if (!char.voice) char.voice = "";
        if (char.voiceStability === undefined) char.voiceStability = 0.5;
        if (char.voiceStyle === undefined) char.voiceStyle = 0;
      } else {
        char.voice = this.voiceLists.openai[0];
        if (char.voiceInstruction === undefined) char.voiceInstruction = "";
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
      audioVoicesGemini: [
        "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
        "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Pulcherrima",
        "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi"
      ],
      sortableInstance: null,
      isResizing: false,

      // Meeting
      meetingId: null,
      liveKey: null,

      // Conversation
      conversation: [],

      // Audio State
      audioController: null,
      nextOrBackClicked: false,
      customTopicId: PROTOTYPE_CUSTOM_TOPIC_ID,
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
      const lang = this.currentLanguageData;
      if (this.isCustomTopicSelected) {
        return lang.customTopic || null;
      }

      const topics = lang.topics;
      if (!topics || topics.length === 0) {
        return lang.customTopic || null;
      }

      const selectedId = this.localOptions.selectedTopicId;
      if (selectedId) {
        const found = topics.find((topic) => topic.id === selectedId);
        if (found) return found;
      }

      return topics[0];
    },

    isCustomTopicSelected() {
      return this.localOptions.selectedTopicId === PROTOTYPE_CUSTOM_TOPIC_ID;
    },

    resolvedCustomTopicPrompt() {
      const template = this.currentLanguageData.customTopic?.prompt || PROTOTYPE_CUSTOM_TOPIC_TOKEN;
      const visitor = String(this.localOptions.customTopicVisitorInput || "").trim();
      return template.replaceAll(PROTOTYPE_CUSTOM_TOPIC_TOKEN, visitor || "(no visitor input yet)");
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
    },

    /** Number of rows that have TTS (excludes trailing `query_extension`). */
    playableCount() {
      return countPlayableMessages(this.conversation);
    },

    /** Last index with audio; -1 when empty. */
    lastPlayableIndex() {
      const n = this.playableCount;
      return n > 0 ? n - 1 : -1;
    },

    /** Conversation ended at soft cap — `continue_conversation` is available. */
    hasQueryExtension() {
      const last = this.conversation[this.conversation.length - 1];
      return !!(last && last.type === 'query_extension');
    },

    languageModelsText: {
      get() {
        return this.localOptions.languageModelsText;
      },
      set(value) {
        this.localOptions.languageModelsText = value;
        this.applyLanguageModelsText(value, this.options.language || 'en');
      },
    },
  },

  watch: {
    'options.language'(newLang, oldLang) {
      if (oldLang && newLang !== oldLang) {
        this.applyLanguageModelsText(this.localOptions.languageModelsText, oldLang);
        this.localOptions.languageModelsError = '';
      }
      this.syncLanguageModelsText();
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
    formatClientError(errorPayload) {
      if (!errorPayload || typeof errorPayload !== 'object') {
        return String(errorPayload ?? 'Unknown error');
      }

      let text = errorPayload.message || 'Unknown error';
      const debug = errorPayload.debug;
      if (!debug) return text;

      if (debug.context) {
        text = `[${debug.context}] ${text}`;
      }
      if (debug.stack) {
        text += `\n\n${debug.stack}`;
      } else if (debug.zodIssues) {
        text += `\n\n${JSON.stringify(debug.zodIssues, null, 2)}`;
      } else if (debug.raw != null) {
        text += `\n\n${JSON.stringify(debug.raw, null, 2)}`;
      } else if (debug.name) {
        text += `\n\n${debug.name}`;
      }
      return text;
    },

    formatApiErrorBody(body, status) {
      if (body && typeof body === 'object' && body.message) {
        return this.formatClientError({ message: body.message, code: status, debug: body.debug });
      }
      return typeof body === 'string' && body.trim() ? body : `Request failed (${status})`;
    },

    /**
     * Centralized fetch for /api/* routes — logs API_OUT before the request and API_IN after.
     * @param {string} path - e.g. "/api/meetings"
     * @param {{ method?: string, body?: unknown, headers?: Record<string, string>, context?: string }} [options]
     * @returns {Promise<unknown>} Parsed JSON (or raw text) on success
     */
    async apiFetch(path, { method = 'GET', body, headers = {}, context } = {}) {
      const logSuffix = context ? ` (${context})` : '';
      this.log('API_OUT', `${method} ${path}${logSuffix}`, {
        method,
        path,
        ...(body !== undefined ? { body } : {}),
      });

      const init = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!init.headers['Content-Type']) {
          init.headers['Content-Type'] = 'application/json';
        }
      }

      let status;
      let ok;
      let responseBody;
      try {
        const res = await fetch(path, init);
        status = res.status;
        ok = res.ok;
        const text = await res.text();
        if (text) {
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text;
          }
        }
      } catch (networkError) {
        this.log('API_IN', `${method} ${path} → network error${logSuffix}`, {
          error: networkError.message || String(networkError),
        });
        throw networkError;
      }

      this.log('API_IN', `${method} ${path} → ${status}${logSuffix}`, {
        status,
        ok,
        body: responseBody ?? null,
      });

      if (!ok) {
        throw new Error(this.formatApiErrorBody(responseBody, status));
      }
      return responseBody;
    },

    async createMeeting(context) {
      return this.apiFetch('/api/meetings', {
        method: 'POST',
        body: this.getMeetingBody(),
        context,
      });
    },

    emitStartConversation(context) {
      const setupPayload = {
        meetingId: this.meetingId,
        liveKey: this.liveKey,
        serverOptions: this.getServerOptions(),
      };
      this.log('SOCKET_OUT', `start_conversation${context ? ` (${context})` : ''}`, setupPayload);
      this.socket.emit('start_conversation', setupPayload);
    },

    log(category, message, data = null) {
      const styles = {
        'API_OUT': 'color: #f59e0b; font-weight: bold;',    // Amber
        'API_IN': 'color: #d97706; font-weight: bold;',     // Dark amber
        'FILE_IN': 'color: #0891b2; font-weight: bold;',    // Cyan
        'SOCKET_OUT': 'color: #10b981; font-weight: bold;', // Green
        'SOCKET_IN': 'color: #3b82f6; font-weight: bold;',  // Blue
        'AUDIO': 'color: #8b5cf6; font-weight: bold;',      // Purple
        'ERROR': 'color: #ef4444; font-weight: bold;',      // Red
        'SYSTEM': 'color: #6b7280; font-weight: bold;'      // Gray
      };

      const icon = {
        'API_OUT': '🌐',
        'API_IN': '📥',
        'FILE_IN': '📄',
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
      if (char.voiceProvider === 'gemini') {
        char.voice = this.audioVoicesGemini[0];
      } else if (char.voiceProvider === 'inworld') {
        char.voice = "";
      } else if (char.voiceProvider === 'elevenlabs') {
        char.voice = "";
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

          // Fix: Ensure we are reordering relative to the Active list, not just raw global indices.
          // The visual list represents 'activeCharacters'. We must reflect that reorder in the global list.

          // 1. Get current active characters (which matches visual order BEFORE the drag)
          const activeRefs = [...this.activeCharacters];

          // 2. Apply the move to this active list subset
          if (evt.oldIndex >= activeRefs.length) return;
          const [movedItem] = activeRefs.splice(evt.oldIndex, 1);
          activeRefs.splice(evt.newIndex, 0, movedItem);

          // 3. Get all other (inactive) characters
          const inactiveRefs = (this.currentLanguageData.characters || []).filter(c => !this.isCharacterActive(c));

          // 4. Reconstruct global list: [Reordered Active] + [Inactive]
          // This enforces "Active at Top" AND applies the user's sort.
          this.currentLanguageData.characters = [...activeRefs, ...inactiveRefs];

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
     * 3. Loads default prompts from the app-specific character bundle if startup fails or is fresh.
     * 4. Ensures character sorting (Pinned > Active > Inactive).
     */
    async startup() {
      try {
        const stored = JSON.parse(localStorage.getItem("PromptsAndOptions"));
        if (stored) {
          // Merge stored options to handle new fields gracefully
          this.options = { ...defaultOptions, ...(stored.options || {}) };
          this.localOptions = { ...JSON.parse(JSON.stringify(defaultLocalOptions)), ...stored.localOptions };

          this.options.languageModels = normalizeLanguageModels(this.options.languageModels);
          this.syncLanguageModelsText();

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

            // Ensure Topics
            if (data.topics) {
              data.topics.forEach(topic => {
                if (!topic.id) topic.id = 'topic_' + Date.now() + Math.random();
              });
            } else if (data.rooms) {
              data.topics = data.rooms.map(r => ({ ...r, prompt: r.topic }));
              delete data.rooms;
            }

          });

          this.languageData = stored.language;

          // Migrate legacy index-based selection to topic id.
          if (!this.localOptions.selectedTopicId) {
            const lang = this.options.language || 'en';
            const data = this.languageData[lang];
            const legacyIndex = this.localOptions.currentTopicIndex;
            if (data?.topics?.length && typeof legacyIndex === 'number' && legacyIndex >= 0 && legacyIndex < data.topics.length) {
              this.localOptions.selectedTopicId = data.topics[legacyIndex].id;
            } else if (data?.topics?.[0]?.id) {
              this.localOptions.selectedTopicId = data.topics[0].id;
            }
          }

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
      this.options = {
        ...defaultOptions,
        languageModels: JSON.parse(JSON.stringify(defaultLanguageModels)),
      };
      // Deep copy defaults to ensure clean slate
      this.localOptions = { ...JSON.parse(JSON.stringify(defaultLocalOptions)) };
      this.syncLanguageModelsText();
      this.setTheme(this.localOptions.theme);

      // Initialize languages from server
      for (const lang of this.available_languages) {
        try {
          const charactersPath = `./${CHARACTERS_FILE}_${lang}.json`;
          const topicsPath = `./topics_${lang}.json`;

          const [charactersResp, topicsResp] = await Promise.all([
            fetch(charactersPath),
            fetch(topicsPath)
          ]);

          if (!charactersResp.ok) throw new Error(`Failed to fetch ${CHARACTERS_FILE}_${lang}: ${charactersResp.status}`);
          if (!topicsResp.ok) throw new Error(`Failed to fetch topics_${lang}: ${topicsResp.status}`);

          const charactersParams = await charactersResp.json();
          const topics = await topicsResp.json();

          this.log('FILE_IN', `GET ${charactersPath} → ${charactersResp.status}`, charactersParams);
          this.log('FILE_IN', `GET ${topicsPath} → ${topicsResp.status}`, topics);

          // Map Characters (Global)
          // charactersParams is { characters: [...] }
          const characters = charactersParams.characters.map(f => ({
            ...f,
            _ui_id: Date.now() + Math.random() // Ensure unique ID
          }));

          // Map Topics
          const topicsList = topics.topics.map(t => ({
            id: t.id || ('topic_' + Date.now() + Math.random()),
            name: t.title,
            description: t.description || "",
            prompt: t.prompt,
            agendaPoints: Array.isArray(t.agendaPoints) ? [...t.agendaPoints] : [],
          }));

          const customTopicSource = topics.custom_topic || {};
          const customTopic = {
            id: customTopicSource.id || PROTOTYPE_CUSTOM_TOPIC_ID,
            name: customTopicSource.title || "Custom Topic",
            prompt: customTopicSource.prompt || PROTOTYPE_CUSTOM_TOPIC_TOKEN,
          };

          this.languageData[lang] = {
            system: topics.system,
            characters: characters,
            topics: topicsList,
            customTopic,
          };

          // Default active state per topic: chair only.
          if (characters.length > 0) {
            const pinnedChar = characters[0];
            if (!this.localOptions.topicStates) this.localOptions.topicStates = {};

            const initTopicState = () => ({
              activeCharacterIds: {
                [pinnedChar._ui_id]: true,
              },
            });

            topicsList.forEach((topic) => {
              this.localOptions.topicStates[topic.id] = initTopicState();
            });
            this.localOptions.topicStates[customTopic.id] = initTopicState();
          }

        } catch (err) {
          this.log('ERROR', `Failed to load defaults for ${lang}:`, err);
          // Fallback if fetch fails
          this.languageData[lang] = { system: "Error loading defaults.", characters: [], topics: [] };
        }
      }

      this.options.language = 'en';
      if (!this.localOptions.selectedTopicId) {
        const firstTopic = this.languageData.en?.topics?.[0];
        this.localOptions.selectedTopicId = firstTopic?.id || PROTOTYPE_CUSTOM_TOPIC_ID;
      }
      this.sanitizeData();

      this.save();
    },

    buildCharacters() {
      const allChars = this.currentLanguageData.characters || [];
      const topicId = this.currentTopic.id;
      const activeIds = this.localOptions.topicStates[topicId]?.activeCharacterIds || {};

      let activeChars = allChars.filter(c => activeIds[c._ui_id]);
      let replacedCharacters = JSON.parse(JSON.stringify(activeChars));

      replacedCharacters.forEach(c => {
        if (!c.id && c.name) c.id = c.name;
        if (!c.voiceProvider) c.voiceProvider = 'openai';
        if (!c.voice) {
          if (c.voiceProvider === 'gemini') c.voice = this.audioVoicesGemini[0];
          else if (c.voiceProvider !== 'inworld' && c.voiceProvider !== 'elevenlabs') c.voice = this.audioVoices[0];
        }
        delete c._ui_id;
      });

      if (replacedCharacters[0]) {
        let participants = activeChars
          .slice(1)
          .map(c => this.toTitleCase(c.name))
          .join(", ");

        replacedCharacters[0].prompt = replacedCharacters[0].prompt
          .replace("[CHARACTERS]", participants)
          .replace('[HUMANS]', '');

        const chairPrompt = replacedCharacters[0].prompt;
        if (chairPrompt.includes('[RANDOM_AGENDA_POINT]')) {
          replacedCharacters[0].prompt = this.injectRandomAgendaPoint(
            chairPrompt,
            this.currentTopic.agendaPoints,
          );
        }
      }

      return replacedCharacters;
    },

    selectTopic(topicId) {
      this.localOptions.selectedTopicId = topicId;
    },

    nonEmptyAgendaPoints(agendaPoints) {
      return (agendaPoints || [])
        .map((point) => (point || '').trim())
        .filter((point) => point.length > 0);
    },

    buildAgendaPointsText(agendaPoints) {
      const points = this.nonEmptyAgendaPoints(agendaPoints);
      if (points.length === 0) {
        return '';
      }

      const numbered = points.map((point, index) => `${index + 1}. ${point}`).join('\n\n');
      return `\nToday's Agenda Points:\n\n${numbered}`;
    },

    removeAgendaPointsPlaceholder(system) {
      return (system || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n?\[AGENDA_POINTS\]\n?/g, '\n')
        .replace(/\[AGENDA_POINTS\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    buildMeetingSystemPrompt(system, topicPrompt, agendaPoints) {
      const agendaText = this.buildAgendaPointsText(agendaPoints);
      let result = (system || '').replace('[TOPIC]', (topicPrompt || '').trim());

      if (agendaText) {
        result = result.replace('[AGENDA_POINTS]', agendaText);
      } else {
        result = this.removeAgendaPointsPlaceholder(result);
      }

      return result;
    },

    injectRandomAgendaPoint(chairPrompt, agendaPoints) {
      if (!chairPrompt.includes('[RANDOM_AGENDA_POINT]')) {
        return chairPrompt;
      }

      const count = this.nonEmptyAgendaPoints(agendaPoints).length;
      const replacement =
        count > 0
          ? String(Math.floor(Math.random() * count) + 1)
          : "Choose ONE point from todays agenda in RANDOM order, just because it is at the top of the list doesn't mean it always comes first.";

      return chairPrompt.replaceAll('[RANDOM_AGENDA_POINT]', replacement);
    },

    getMeetingBody() {
      const isCustom = this.isCustomTopicSelected;
      const topic = this.currentTopic;
      if (!topic) {
        throw new Error("No topic selected");
      }

      return {
        topic: {
          id: topic.id,
          title: topic.name,
          description: isCustom
            ? String(this.localOptions.customTopicVisitorInput || "").trim()
            : (topic.description || ""),
          prompt: isCustom
            ? this.buildMeetingSystemPrompt(
                this.currentSystemPrompt,
                this.resolvedCustomTopicPrompt,
                [],
              )
            : this.buildMeetingSystemPrompt(
                this.currentSystemPrompt,
                topic.prompt,
                topic.agendaPoints,
              ),
        },
        characters: this.buildCharacters(),
        language: this.options.language,
      };
    },

    parseLanguageModelProfileText(text, lang) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object of model settings.');
      }
      if (!('conversationModel' in parsed) && (parsed.en || parsed.sv)) {
        throw new Error('Paste only this language\'s settings object, not the full en/sv map.');
      }
      return normalizeLanguageModelProfile(
        parsed,
        defaultLanguageModels[lang] || defaultLanguageModelProfile,
      );
    },

    applyLanguageModelsText(text, lang) {
      try {
        const normalized = this.parseLanguageModelProfileText(text, lang);
        this.options.languageModels = { ...this.options.languageModels, [lang]: normalized };
        this.localOptions.languageModelsError = '';
      } catch (error) {
        this.localOptions.languageModelsError = error.message || String(error);
      }
    },

    syncLanguageModelsText() {
      const lang = this.options.language || 'en';
      const profile = this.options.languageModels[lang] || defaultLanguageModelProfile;
      this.localOptions.languageModelsText = JSON.stringify(profile, null, 2);
      this.localOptions.languageModelsError = '';
    },

    getServerOptions() {
      const lang = this.options.language || 'en';
      const languageModels = this.options.languageModels[lang] || this.options.languageModels.en || defaultLanguageModelProfile;
      return {
        conversationModel: languageModels.conversationModel,
        conversationReasoning: languageModels.conversationReasoning,
        temperature: this.options.temperature,
        maxTokens: this.options.maxTokens,
        chairMaxTokens: this.options.chairMaxTokens,
        defaultAudioSpeed: this.options.defaultAudioSpeed,
        trimSentance: this.options.trimSentance,
        trimParagraph: this.options.trimParagraph,
        trimChairSemicolon: this.options.trimChairSemicolon,
        skipAudio: this.options.skipAudio,
        directedSpeakerRouting: this.options.directedSpeakerRouting,
        conversationMaxLength: this.options.conversationMaxLength,
        extraMessageCount: this.options.extraMessageCount,
        meetingVeryMaxLength: this.options.meetingVeryMaxLength,
        voiceModel: languageModels.voiceModel,
        geminiVoiceModel: languageModels.geminiVoiceModel,
        inworldVoiceModel: languageModels.inworldVoiceModel,
        elevenlabsVoiceModel: languageModels.elevenlabsVoiceModel,
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
          this.audioController.setExpectedLength(countPlayableMessages(this.conversation));
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
        this.log('SOCKET_IN', 'Conversation End (length cap — see query_extension in conversation)');
        this.status = 'ENDED';
        if (this.audioController) this.audioController.markComplete();
      });

      this.socket.on("conversation_error", (errorMessage) => {
        this.log('ERROR', 'Conversation Error', errorMessage);
        this.status = 'ERROR';
        alert(this.formatClientError(errorMessage));
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
        agendaPoints: [],
      };
      this.currentLanguageData.topics.push(newTopic);
      this.log('SYSTEM', 'Topic Added', newTopic);

      if (this.currentLanguageData.characters && this.currentLanguageData.characters.length > 0) {
        const pinnedChar = this.currentLanguageData.characters[0];
        if (!this.localOptions.topicStates) this.localOptions.topicStates = {};

        this.localOptions.topicStates[newTopic.id] = {
          activeCharacterIds: {
            [pinnedChar._ui_id]: true
          }
        };
      }

      this.localOptions.selectedTopicId = newTopic.id;
    },

    addAgendaPoint() {
      if (!this.currentTopic) return;
      if (!Array.isArray(this.currentTopic.agendaPoints)) {
        this.currentTopic.agendaPoints = [];
      }
      this.currentTopic.agendaPoints.push("");
      this.save();
    },

    removeAgendaPoint() {
      if (!this.currentTopic || !Array.isArray(this.currentTopic.agendaPoints)) return;
      if (this.currentTopic.agendaPoints.length === 0) return;
      this.currentTopic.agendaPoints.pop();
      this.save();
    },

    removeTopic() {
      if (this.isCustomTopicSelected) return;
      if (this.currentLanguageData.topics.length <= 1) return;

      const selectedId = this.localOptions.selectedTopicId;
      const removeIndex = this.currentLanguageData.topics.findIndex((topic) => topic.id === selectedId);
      if (removeIndex === -1) return;

      const removed = this.currentLanguageData.topics[removeIndex];
      this.log('SYSTEM', 'Topic Removed', removed);

      this.currentLanguageData.topics.splice(removeIndex, 1);
      if (this.localOptions.topicStates?.[removed.id]) {
        delete this.localOptions.topicStates[removed.id];
      }

      const nextTopic = this.currentLanguageData.topics[Math.min(removeIndex, this.currentLanguageData.topics.length - 1)];
      this.localOptions.selectedTopicId = nextTopic?.id || PROTOTYPE_CUSTOM_TOPIC_ID;
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
      // Safety: Cannot toggle pinned characters (they must remain active)
      if (this.isCharacterPinned(char)) return;

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



    deriveExportId(name, fallback = 'unknown') {
      if (!name) return fallback;
      return name.toLowerCase().replace(/\s+/g, '');
    },

    buildCharacterExportEntry(rest, exportId) {
      const provider = rest.voiceProvider || 'openai';
      const charExport = {
        id: exportId,
        name: rest.name,
        voice: rest.voice,
        voiceProvider: provider,
        size: rest.size,
        description: rest.description || "",
        prompt: rest.prompt || ""
      };

      if (rest.voiceSpeed !== undefined) {
        charExport.voiceSpeed = rest.voiceSpeed;
      }

      if (provider === 'gemini') {
        charExport.voiceLocale = rest.voiceLocale || 'en-GB';
        charExport.voiceInstruction = rest.voiceInstruction || "";
      } else if (provider === 'openai') {
        charExport.voiceInstruction = rest.voiceInstruction || "";
      } else if (provider === 'inworld') {
        if (rest.voiceLocale?.trim()) charExport.voiceLocale = rest.voiceLocale.trim();
        charExport.voiceTemperature = rest.voiceTemperature || 1.1;
      } else if (provider === 'elevenlabs') {
        if (rest.voiceLocale?.trim()) charExport.voiceLocale = rest.voiceLocale.trim();
        if (rest.voiceStability !== undefined) charExport.voiceStability = rest.voiceStability;
        if (rest.voiceStyle !== undefined) charExport.voiceStyle = rest.voiceStyle;
      }

      return charExport;
    },

    buildCanonicalCharacterExport(editedCharacters, rawEnCharactersList, rawLocaleCharactersList, useEnglishCanonicalIds) {
      const editedById = new Map();
      (editedCharacters || []).forEach((character) => {
        const id = character.id || this.deriveExportId(character.name, '');
        if (id) editedById.set(id, character);
      });

      const findEditedCharacter = (canonical) => {
        const byId = editedById.get(canonical.id);
        if (byId) return byId;

        const localeCharacter = (rawLocaleCharactersList || []).find((character) => character.id === canonical.id);
        if (!localeCharacter) return null;

        return (editedCharacters || []).find((character) =>
          character.id === canonical.id || character.name === localeCharacter.name
        ) || null;
      };

      const consumedUiIds = new Set();
      const renamedCharacters = [];
      const exportedCharacters = [];
      const canonicalIds = new Set((rawEnCharactersList || []).map((character) => character.id));

      for (const canonical of rawEnCharactersList || []) {
        const edited = findEditedCharacter(canonical);
        if (!edited) continue;

        consumedUiIds.add(edited._ui_id);
        const exportId = useEnglishCanonicalIds
          ? canonical.id
          : this.deriveExportId(edited.name, canonical.id);

        if (!useEnglishCanonicalIds && exportId !== canonical.id) {
          renamedCharacters.push({
            name: edited.name || canonical.name,
            fromId: canonical.id,
            toId: exportId
          });
        }

        const { _ui_id, ...rest } = edited;
        exportedCharacters.push(this.buildCharacterExportEntry(rest, exportId));
      }

      for (const edited of editedCharacters || []) {
        if (consumedUiIds.has(edited._ui_id)) continue;

        const { _ui_id, ...rest } = edited;
        const exportId =
          (rest.id && !canonicalIds.has(rest.id) ? rest.id : null) ||
          this.deriveExportId(rest.name, '') ||
          `character_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        exportedCharacters.push(this.buildCharacterExportEntry(rest, exportId));
      }

      return { exportedCharacters, renamedCharacters };
    },

    buildCanonicalTopicExport(editedTopics, rawTopicsList, rawTopicsEnList, useEnglishCanonicalIds) {
      const consumedTopicIds = new Set();
      const exportedTopics = [];
      const canonicalTopicIds = new Set((rawTopicsEnList || []).map((topic) => topic.id));

      const findEditedTopic = (canonical) => {
        const localeTopic = rawTopicsList.find((topic) => topic.id === canonical.id);

        return (editedTopics || []).find((topic) => {
          if (topic.id && !String(topic.id).startsWith('topic_') && topic.id === canonical.id) {
            return true;
          }
          if (localeTopic && topic.name === localeTopic.title) {
            return true;
          }
          if (!useEnglishCanonicalIds && topic.name === canonical.title) {
            return true;
          }
          return false;
        });
      };

      for (const canonical of rawTopicsEnList || []) {
        const edited = findEditedTopic(canonical);
        if (!edited) continue;

        consumedTopicIds.add(edited.id);
        const localeMatch = rawTopicsList.find((topic) => topic.id === canonical.id || topic.title === edited.name);

        exportedTopics.push({
          id: canonical.id,
          title: edited.name,
          description: edited.description || (localeMatch ? localeMatch.description : edited.prompt),
          prompt: edited.prompt,
          ...(this.nonEmptyAgendaPoints(edited.agendaPoints).length > 0
            ? { agendaPoints: this.nonEmptyAgendaPoints(edited.agendaPoints) }
            : {}),
        });
      }

      for (const edited of editedTopics || []) {
        if (consumedTopicIds.has(edited.id)) continue;

        const exportId =
          (edited.id && !String(edited.id).startsWith('topic_') && !canonicalTopicIds.has(edited.id) ? edited.id : null) ||
          this.deriveExportId(edited.name, '') ||
          `topic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        exportedTopics.push({
          id: exportId,
          title: edited.name,
          description: edited.description || edited.prompt,
          prompt: edited.prompt,
          ...(this.nonEmptyAgendaPoints(edited.agendaPoints).length > 0
            ? { agendaPoints: this.nonEmptyAgendaPoints(edited.agendaPoints) }
            : {}),
        });
      }

      return exportedTopics;
    },

    buildTopicsExportPayload(rawTopics, rawTopicsEn, system, editedTopics, editedCustomTopic, rawTopicsList, rawTopicsEnList, useEnglishCanonicalIds, now, pad) {
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const metadataSource = rawTopicsEn.metadata || rawTopics.metadata;
      const metadata = metadataSource
        ? { ...metadataSource, last_updated: `${dateStr} ${timeStr}` }
        : { version: '1.0.0', last_updated: `${dateStr} ${timeStr}` };

      const fallbackCustom = rawTopicsEn.custom_topic || rawTopics.custom_topic || {
        id: PROTOTYPE_CUSTOM_TOPIC_ID,
        title: 'Custom Topic',
      };
      const customTopic = {
        id: editedCustomTopic?.id || fallbackCustom.id || PROTOTYPE_CUSTOM_TOPIC_ID,
        title: editedCustomTopic?.name || fallbackCustom.title || 'Custom Topic',
        ...(editedCustomTopic?.prompt
          ? { prompt: editedCustomTopic.prompt }
          : (fallbackCustom.prompt ? { prompt: fallbackCustom.prompt } : {})),
      };

      return {
        metadata,
        system,
        custom_topic: customTopic,
        topics: this.buildCanonicalTopicExport(
          editedTopics,
          rawTopicsList,
          rawTopicsEnList,
          useEnglishCanonicalIds
        ),
      };
    },

    async exportPrompts() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const lang = this.options.language || 'en';

      let rawCharacters = { characters: [] };
      let rawTopics = { topics: [] };
      let rawCharactersEn = { characters: [] };
      let rawTopicsEn = { topics: [] };

      try {
        const charactersPath = `./${CHARACTERS_FILE}_${lang}.json`;
        const topicsPath = `./topics_${lang}.json`;
        const charactersEnPath = `./${CHARACTERS_FILE}_en.json`;
        const topicsEnPath = './topics_en.json';

        const [charactersResp, topicsResp, charactersEnResp, topicsEnResp] = await Promise.all([
          fetch(charactersPath),
          fetch(topicsPath),
          fetch(charactersEnPath),
          fetch(topicsEnPath)
        ]);

        if (charactersResp.ok) {
          rawCharacters = await charactersResp.json();
          this.log('FILE_IN', `GET ${charactersPath} → ${charactersResp.status}`, rawCharacters);
        }
        if (topicsResp.ok) {
          rawTopics = await topicsResp.json();
          this.log('FILE_IN', `GET ${topicsPath} → ${topicsResp.status}`, rawTopics);
        }
        if (charactersEnResp.ok) {
          rawCharactersEn = await charactersEnResp.json();
          this.log('FILE_IN', `GET ${charactersEnPath} → ${charactersEnResp.status}`, rawCharactersEn);
        }
        if (topicsEnResp.ok) {
          rawTopicsEn = await topicsEnResp.json();
          this.log('FILE_IN', `GET ${topicsEnPath} → ${topicsEnResp.status}`, rawTopicsEn);
        }
      } catch (e) {
        this.log('ERROR', "Failed to fetch raw data", e);
      }

      const rawEnCharactersList = rawCharactersEn.characters || [];
      const rawLocaleCharactersList = rawCharacters.characters || [];
      const rawTopicsList = rawTopics.topics || [];
      const rawTopicsEnList = rawTopicsEn.topics || [];
      const useEnglishCanonicalIds = lang !== 'en';

      // 1. Export Characters
      let charactersExport = JSON.parse(JSON.stringify(rawCharacters));

      if (charactersExport.metadata) {
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        charactersExport.metadata.last_updated = `${dateStr} ${timeStr}`;
      }

      const { exportedCharacters, renamedCharacters } = this.buildCanonicalCharacterExport(
        this.currentLanguageData.characters,
        rawEnCharactersList,
        rawLocaleCharactersList,
        useEnglishCanonicalIds
      );
      charactersExport.characters = exportedCharacters;

      // 2. Export Topics — always emit metadata, system, custom_topic, topics (in that order).
      const topicsExport = this.buildTopicsExportPayload(
        rawTopics,
        rawTopicsEn,
        this.currentLanguageData.system,
        this.currentLanguageData.topics,
        this.currentLanguageData.customTopic,
        rawTopicsList,
        rawTopicsEnList,
        useEnglishCanonicalIds,
        now,
        pad
      );

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

      download(`${CHARACTERS_FILE}_${lang}_${timestamp}.json`, charactersExport);
      download(`topics_${lang}_${timestamp}.json`, topicsExport);

      if (renamedCharacters.length > 0) {
        const lines = renamedCharacters.map(({ name, fromId, toId }) =>
          `- ${name}: "${fromId}" -> "${toId}"`
        );
        alert(
          'Some characters were renamed and their IDs changed. You may need to migrate database/media references:\n\n' +
          lines.join('\n')
        );
      }

      this.log('SYSTEM', 'Exported Prompts to JSON');
    },

    async startConversation() {
      if (this.localOptions.languageModelsError) {
        alert(`Fix model JSON before starting:\n\n${this.localOptions.languageModelsError}`);
        return;
      }

      this.status = 'CONNECTING';
      this.audioController.reset();

      try {
        const { meetingId, liveKey } = await this.createMeeting('start conversation');
        this.meetingId = Number(meetingId);
        this.liveKey = liveKey;
        this.emitStartConversation('start');
      } catch (e) {
        this.log('ERROR', 'Failed to create meeting', e);
        this.status = 'ERROR';
        alert(e.message);
      }
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

    async restartConversation() {
      if (this.localOptions.languageModelsError) {
        alert(`Fix model JSON before restarting:\n\n${this.localOptions.languageModelsError}`);
        return;
      }

      this.status = 'CONNECTING';
      this.conversation = [];
      this.audioController.reset();

      try {
        const { meetingId, liveKey } = await this.createMeeting('restart conversation');
        this.meetingId = Number(meetingId);
        this.liveKey = liveKey;
        this.emitStartConversation('restart');
      } catch (e) {
        this.log('ERROR', 'Failed to create meeting for restart', e);
        this.status = 'ERROR';
        alert(e.message);
      }
    },

    continueConversation() {
      this.status = 'CONNECTING';
      // Match web client: drop synthetic tail locally so UI matches server after strip.
      const queryExtensionIndex = this.conversation.findIndex((m) => m.type === 'query_extension');
      if (queryExtensionIndex !== -1) {
        this.conversation = this.conversation.slice(0, queryExtensionIndex);
        if (this.audioController) {
          this.audioController.setExpectedLength(countPlayableMessages(this.conversation));
        }
      }
      this.log('SOCKET_OUT', 'Continuing Conversation');
      this.socket.emit("continue_conversation");
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
      if (!this.languageData) return;

      Object.values(this.languageData).forEach((lang) => {
        if (lang.characters) {
          lang.characters.forEach(c => {
            if (!c._ui_id) c._ui_id = Date.now() + Math.random();
            if (!c.id && c.name) {
              c.id = c.name.toLowerCase().replace(/\s+/g, '');
            }
          });
        }

        if (!lang.customTopic) {
          lang.customTopic = { id: PROTOTYPE_CUSTOM_TOPIC_ID, name: "Custom Topic", prompt: PROTOTYPE_CUSTOM_TOPIC_TOKEN };
        } else {
          lang.customTopic.id = lang.customTopic.id || PROTOTYPE_CUSTOM_TOPIC_ID;
          lang.customTopic.name = lang.customTopic.name || "Custom Topic";
          lang.customTopic.prompt = lang.customTopic.prompt || PROTOTYPE_CUSTOM_TOPIC_TOKEN;
        }
        if (!this.localOptions.topicStates) this.localOptions.topicStates = {};

        // Ensure every topic (including custom) has a topicState with the chair active.
        const chairId = lang.characters?.[0]?._ui_id;
        const allTopicIds = [
          ...(lang.topics || []).map(t => t.id),
          lang.customTopic.id,
        ];
        allTopicIds.forEach(topicId => {
          if (!this.localOptions.topicStates[topicId]) {
            this.localOptions.topicStates[topicId] = { activeCharacterIds: {} };
          }
          if (chairId) {
            this.localOptions.topicStates[topicId].activeCharacterIds[chairId] = true;
          }
        });

        if (lang.topics) {
          lang.topics.forEach((topic) => {
            if (!Array.isArray(topic.agendaPoints)) {
              topic.agendaPoints = [];
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
      this.sanitizeData();
      localStorage.setItem("PromptsAndOptions", JSON.stringify({
        options: this.options,
        localOptions: this.localOptions,
        language: this.languageData,
      }));
    },

    toTitleCase(str) {
      if (!str) return "";
      return str.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    },

    formatSpeakerLabel(idOrName) {
      if (!idOrName) return "—";
      const chars = this.currentLanguageData?.characters || [];
      const match = chars.find((c) => c.id === idOrName || c.name === idOrName);
      return match?.name || match?.id || idOrName;
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
