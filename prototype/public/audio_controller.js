class AudioController {
    constructor() {
        // defined non-enumerable to prevent Vue reactivity issues with AudioContext
        Object.defineProperty(this, 'ctx', {
            value: new (window.AudioContext || window.webkitAudioContext)(),
            writable: true,
            enumerable: false, // Hidden from Vue
            configurable: true
        });

        this.items = new Map(); // Index -> { buffer, skipped }
        this.currentIndex = 0;
        this.expectedLength = 0; // Total count of messages in conversation

        // Reactive State for Vue
        this.isActive = false; // "System" is trying to play
        this.isPaused = false; // "User" has explicitly paused
        this.isConversationComplete = false; // No more items expected
        this.hasItems = false; // Helper since Map isn't reactive

        this.currentSource = null;

        // No more _ignoreEnded flag needed!

        this.onLog = (category, message, data) => { console.log(category, message, data); };
    }

    setLogCallback(onLog) {
        this.onLog = onLog;
    }

    reset() {
        this.stopCurrent();
        // Do not close/recreate context, just reuse it.
        // If suspended or running, we just leave it. We will clear items.
        // Ideally we ensure it's clean.

        this.items.clear();
        this.currentIndex = 0;
        this.expectedLength = 0;
        this.isActive = false;
        this.isPaused = false;
        this.isConversationComplete = false;
        this.hasItems = false;
    }

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
        // If we updated length, maybe we are now finished (or not)?
        // Don't auto-stop here normally, but worth checking queue status?
        // Usually conversation update comes before audio update.
    }

    markComplete() {
        this.isConversationComplete = true;
        this.checkQueueStatus();
    }

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
            // IDENTITY CHECK:
            // If this.currentSource is NOT the source triggering this event,
            // then it means we have already moved on (manually stopped/skipped).
            // So we ignore this event.
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
