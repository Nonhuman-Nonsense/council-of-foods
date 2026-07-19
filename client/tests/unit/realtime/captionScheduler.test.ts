import { describe, expect, it, vi } from "vitest";
import { createCaptionScheduler } from "@realtime/captionScheduler";

type ScheduledTask = {
    id: number;
    at: number;
    active: boolean;
    handler: () => void;
};

function createFakeClock() {
    let nowMs = 0;
    let nextId = 1;
    const tasks: ScheduledTask[] = [];

    const setTimeoutFn = (handler: () => void, timeoutMs: number) => {
        const task: ScheduledTask = {
            id: nextId++,
            at: nowMs + timeoutMs,
            active: true,
            handler,
        };
        tasks.push(task);
        return task.id as unknown as ReturnType<typeof setTimeout>;
    };

    const clearTimeoutFn = (handle: ReturnType<typeof setTimeout>) => {
        const id = handle as unknown as number;
        const task = tasks.find((t) => t.id === id);
        if (task) task.active = false;
    };

    const advanceTo = (targetMs: number) => {
        while (true) {
            const nextTask = tasks
                .filter((task) => task.active && task.at <= targetMs)
                .sort((a, b) => a.at - b.at)[0];
            if (!nextTask) break;
            nowMs = nextTask.at;
            nextTask.active = false;
            nextTask.handler();
        }
        nowMs = targetMs;
    };

    return {
        now: () => nowMs,
        setTimeoutFn,
        clearTimeoutFn,
        advanceTo,
    };
}

function durationFor(sentence: string, speed = 1): number {
    return Math.max(800, (sentence.length / (14 * speed)) * 1000);
}

describe("captionScheduler", () => {
    it("buffers transcript deltas and reveals complete sentences from the audio anchor", () => {
        const clock = createFakeClock();
        const onCaption = vi.fn();
        const scheduler = createCaptionScheduler({
            onCaption,
            now: clock.now,
            setTimeoutFn: clock.setTimeoutFn,
            clearTimeoutFn: clock.clearTimeoutFn,
        });

        scheduler.beginResponse();
        scheduler.appendDelta("I am here to guide you. Would you like me to share");
        expect(onCaption).not.toHaveBeenCalled();

        scheduler.setAudioAnchor(0);
        clock.advanceTo(0);
        expect(onCaption).toHaveBeenCalledTimes(1);
        expect(onCaption).toHaveBeenLastCalledWith("I am here to guide you.");

        scheduler.appendDelta(" the available topics for our discussion?");
        clock.advanceTo(durationFor("I am here to guide you.") - 1);
        expect(onCaption).toHaveBeenCalledTimes(1);

        clock.advanceTo(durationFor("I am here to guide you."));
        expect(onCaption).toHaveBeenCalledTimes(2);
        expect(onCaption).toHaveBeenLastCalledWith("Would you like me to share the available topics for our discussion?");
    });

    it("uses the final transcript to emit a trailing sentence without punctuation", () => {
        const clock = createFakeClock();
        const onCaption = vi.fn();
        const scheduler = createCaptionScheduler({
            onCaption,
            now: clock.now,
            setTimeoutFn: clock.setTimeoutFn,
            clearTimeoutFn: clock.clearTimeoutFn,
        });

        scheduler.beginResponse();
        scheduler.appendDelta("One complete. Trailing fragment");
        scheduler.setAudioAnchor(0);
        clock.advanceTo(0);
        expect(onCaption).toHaveBeenLastCalledWith("One complete.");

        scheduler.finalize("One complete. Trailing fragment");
        clock.advanceTo(durationFor("One complete."));
        expect(onCaption).toHaveBeenLastCalledWith("Trailing fragment");
    });

    it("clears pending captions when cancelled", () => {
        const clock = createFakeClock();
        const onCaption = vi.fn();
        const scheduler = createCaptionScheduler({
            onCaption,
            now: clock.now,
            setTimeoutFn: clock.setTimeoutFn,
            clearTimeoutFn: clock.clearTimeoutFn,
        });

        scheduler.beginResponse();
        scheduler.appendDelta("First sentence. Second sentence.");
        scheduler.setAudioAnchor(0);
        clock.advanceTo(0);
        expect(onCaption).toHaveBeenLastCalledWith("First sentence.");

        scheduler.cancel();
        clock.advanceTo(10_000);
        expect(onCaption).toHaveBeenLastCalledWith(null);
    });
});
