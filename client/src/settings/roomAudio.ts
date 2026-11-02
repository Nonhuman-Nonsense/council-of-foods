import { create } from "zustand";

/**
 * Room audio for this visit: a split output joined back into one mix, so a group in the room
 * hears the whole meeting — someone presenting the installation, say. Asked for through the
 * setup agent, and only over Split audio (see `getSplitAudioActive`).
 *
 * Held in memory only, never stored: it lasts until the app is back on the landing page, so
 * the next visit is on the staff setting again — and so is a reload.
 */
export const useRoomAudioStore = create<{ roomAudio: boolean }>(() => ({ roomAudio: false }));

export function getRoomAudio(): boolean {
  return useRoomAudioStore.getState().roomAudio;
}

export function setRoomAudio(roomAudio: boolean): void {
  useRoomAudioStore.setState({ roomAudio });
}
