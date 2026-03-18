/**
 * AudioController
 * 
 * Manages the Web Audio API context, handles audio queueing, sequential playback, 
 * and state management for the conversation audio.
 * 
 * It ensures that audio messages are played in strict order and handles cases where
 * the conversation might end before all audio packets have been received/decoded.
 */
class AudioController {
    constructor() {
        // defined non-enumerable to prevent Vue reactivity issues with AudioContext
        Object.defineProperty(this, 'ctx', {
            value: new (window.AudioContext || window.webkitAudioContext)(),
            writable: true,
            enumerable: false, // Hidden from Vue
            configurable: true
        });

        // Maps index -> { buffer: AudioBuffer, rawAudio: ArrayBuffer, skipped: boolean }
        this.items = new Map();

        // The index of the message currently being played (or about to be played)
        this.currentIndex = 0;

        // Total number of messages expected in the conversation.
        // Critical for preventing premature "Queue Finished" state if the conversation 
        // ends while the last audio packet is still processing.
        this.expectedLength = 0;


        // Reactive State for Vue
        this.isActive = false; // "System" is trying to play
        this.isPaused = false; // "User" has explicitly paused
        this.isConversationComplete = false; // No more items expected
        this.hasItems = false; // Helper since Map isn't reactive

        this.currentSource = null;



        this.onLog = (category, message, data) => { console.log(category, message, data); };
    }

    setLogCallback(onLog) {
        this.onLog = onLog;
    }

    reset() {
        this.stopCurrent();
        // Do not close/recreate context, just reuse it.

        this.items.clear();
        this.currentIndex = 0;
        this.expectedLength = 0;
        this.isActive = false;
        this.isPaused = false;
        this.isConversationComplete = false;
        this.hasItems = false;
    }

    /**
     * Checks if the queue has finished playing all available content.
     * 
     * This method contains critical logic to prevent race conditions:
     * It only marks the queue as "Finished" if:
     * 1. We are currently active.
     * 2. We have no item for the current index (meaning we played everything we have).
     * 3. The conversation is marked as complete by the server.
     * 4. CRITICAL: We have reached or exceeded the `expectedLength` of the conversation.
     * 
     * The last check ensures that if the "Conversation End" signal arrives BEFORE 
     * the final audio packet, we don't stop prematurely.
     */
    checkQueueStatus() {
        // Only finish if we have no item AND we aren't waiting for it to decode
        // AND we have actually played past the expected number of items (or at least reached it if we assume 0-indexed count vs length)
        // If length is 10, indices are 0..9. We are finished if currentIndex is 10.
        if (this.isActive &&
            !this.items.has(this.currentIndex) &&
            this.isConversationComplete &&
            this.currentIndex >= this.expectedLength
        ) {
            this.onLog('AUDIO', 'Queue Finished.');
            this.isActive = false;
            this.isPaused = false;
        }
    }

    setExpectedLength(length) {
        this.expectedLength = length;

    }

    markComplete() {
        this.isConversationComplete = true;
        this.checkQueueStatus();
    }

    /**
     * Adds an audio packet to the playlist.
     * 
     * This handles the async decoding of the audio data.
     * Once decoded, it attempts to "auto-play" if the controller is active and waiting for this specific index.
     * 
     * @param {number} index - The message index this audio belongs to.
     * @param {ArrayBuffer} audioData - The raw MP3 audio data.
     * @param {boolean} isSkipped - Whether this message should be skipped silently.
     */
    async addToPlaylist(index, audioData, isSkipped) {
        if (isSkipped) {
            this.items.set(index, { skipped: true });
        } else {
            try {
                // Clone the buffer because decodeAudioData detaches it
                const audioDataForDecoding = audioData.slice(0);
                const buffer = await this.ctx.decodeAudioData(audioDataForDecoding);

                // Store BOTH the decoded buffer (for playback) AND the raw arraybuffer (for download)
                this.items.set(index, {
                    buffer,
                    rawAudio: audioData,
                    skipped: false
                });
            } catch (e) {
                this.onLog('ERROR', 'Failed to decode audio', { index, e });
                return;
            }
        }

        this.hasItems = true;
        this.attemptAutoPlay(index);

        // Check status just in case
        this.checkQueueStatus();
    }

    attemptAutoPlay(index) {
        if (this.isActive && !this.isPaused && index === this.currentIndex && !this.currentSource) {
            if (this.ctx.state === "running") {
                this.playInternal();
            } else if (this.ctx.state === "suspended") {
                this.ctx.resume();
                this.playInternal();
            }
        }
    }

    hasAudio(index) {
        const item = this.items.get(index);
        return item && !item.skipped && !!item.rawAudio;
    }

    hasItem(index) {
        return this.items.has(index);
    }

    downloadAudio(index, filename) {
        const item = this.items.get(index);
        if (!item || !item.rawAudio) {
            this.onLog('ERROR', "No audio found for index", { index });
            return;
        }

        const blob = new Blob([item.rawAudio], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        window.setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);

        this.onLog('SYSTEM', 'Downloaded Audio', { filename });
    }

    start() {
        if (!this.isPaused) {
            this.play();
        }
    }

    play() {
        this.isPaused = false;
        this.isActive = true;

        if (this.isFinished()) {
            this.currentIndex = 0;
            // Do NOT reset isConversationComplete. The conversation is still done, we are just re-listening.
        }

        if (this.ctx.state === "suspended") {
            this.ctx.resume();
            if (this.currentSource) return;
        }

        this.playInternal();
    }

    pause() {
        this.isPaused = true;
        this.isActive = false;

        if (this.ctx.state === "running") {
            this.ctx.suspend();
        }
    }

    togglePause() {
        if (this.isActive && !this.isPaused) {
            this.pause();
        } else {
            this.play();
        }
    }

    stopCurrent() {
        // Capture local reference
        const oldSource = this.currentSource;
        if (oldSource) {
            // Nullify BEFORE stopping to ensure onended check fails
            this.currentSource = null;
            try { oldSource.stop(); } catch (e) { }
        }
    }

    /**
     * Internal playback logic.
     * 
     * It fetches the buffer for `currentIndex` and plays it.
     * When playback ends, `onended` triggers incrementing `currentIndex` and calling `playInternal` again,
     * creating a playback loop until the queue is exhausted.
     */
    playInternal() {
        if (this.isPaused) return;
        if (this.currentSource) return;
        if (!this.isActive) return;

        const item = this.items.get(this.currentIndex);

        if (!item) {
            this.onLog('AUDIO', 'Waiting for audio...', { index: this.currentIndex });
            this.checkQueueStatus();
            return;
        }

        if (item.skipped) {
            this.onLog('AUDIO', 'Skipping Track', { index: this.currentIndex });
            this.currentIndex++;
            this.playInternal();
            return;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = item.buffer;
        source.connect(this.ctx.destination);

        source.onended = () => {
            // Ignore if source was changed (stop/skip)
            if (this.currentSource !== source) {
                return;
            }

            this.currentSource = null;
            this.onLog('AUDIO', 'Playback Ended', { index: this.currentIndex });

            if (this.isActive && !this.isPaused) {
                this.currentIndex++;
                this.playInternal();
            }
        };

        this.currentSource = source;
        source.start();
        this.onLog('AUDIO', 'Playing Track', { index: this.currentIndex });
    }



    isFinished() {
        return this.isConversationComplete && !this.items.has(this.currentIndex) && this.currentIndex > 0;
    }

    // Navigation
    next() {
        if (this.isPaused) return;

        if (this.isActive) {
            this.stopCurrent(); // This nulls currentSource, effectively cancelling its onended
            this.currentIndex++;
            this.playInternal();
        } else {
            this.currentIndex++;
        }
    }

    back() {
        if (this.isPaused) return;

        if (this.isActive) {
            this.stopCurrent(); // cancels onended
            this.currentIndex = Math.max(0, this.currentIndex - 1);
            this.playInternal();
        } else {
            this.currentIndex = Math.max(0, this.currentIndex - 1);
        }
    }
}
