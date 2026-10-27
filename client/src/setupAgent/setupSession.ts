import { setLogContext } from "@/logging/serverLogSink";

/**
 * The visit's setup, as the server named it at the setup agent's first bootstrap. A reconnect
 * sends it back so the visit stays one setup; creating the meeting sends it so the setup's
 * usage joins the meeting on the footprint meter. Cleared when the meeting is created or the
 * visit ends at the landing page, so the next visitor starts a new one.
 */
let currentSetupId: string | undefined;

export const setupSession = {
  get: (): string | undefined => currentSetupId,
  set: (setupId: string): void => {
    currentSetupId = setupId;
    // Lines logged from here on belong to this visit's setup.
    setLogContext({ setupId });
  },
  clear: (): void => {
    currentSetupId = undefined;
    setLogContext({ setupId: undefined });
  },
};

export type SetupSession = typeof setupSession;
