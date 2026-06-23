import { describe, it, expect, vi, beforeEach } from "vitest";
import { setMeetingPlaybackSuspended } from "@/audio/meetingAudio";

describe("setMeetingPlaybackSuspended", () => {
  const suspend = vi.fn();
  const resume = vi.fn();

  beforeEach(() => {
    suspend.mockClear();
    resume.mockClear();
  });

  it("suspends the meeting context when suspended is true", () => {
    const meetingAudioContext = {
      current: { state: "running", suspend, resume } as unknown as AudioContext,
    };

    setMeetingPlaybackSuspended(meetingAudioContext, true);

    expect(suspend).toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("resumes the meeting context when suspended is false", () => {
    const meetingAudioContext = {
      current: { state: "suspended", suspend, resume } as unknown as AudioContext,
    };

    setMeetingPlaybackSuspended(meetingAudioContext, false);

    expect(resume).toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it("no-ops when the context ref is empty", () => {
    setMeetingPlaybackSuspended({ current: null }, true);
    expect(suspend).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });
});
