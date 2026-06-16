import { useEffect } from "react";
import { talkButtonService } from "./talkButtonService";

/**
 * Starts the museum talk-button kiosk service for the app lifetime.
 */
export function useTalkButtonService(): void {
  useEffect(() => {
    talkButtonService.start();
    return () => {
      talkButtonService.stop();
    };
  }, []);
}
