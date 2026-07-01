export const DEFAULT_SERVER_PORT = 3001;
export const DEFAULT_CLIENT_DEV_PORT = 5173;

export type DevPorts = {
  server: number;
  clientDev: number;
};

/** Read `PORT` from env, defaulting to {@link DEFAULT_SERVER_PORT}. */
export function readServerPort(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  const raw = env.PORT?.trim();
  if (!raw) return DEFAULT_SERVER_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SERVER_PORT;
  }
  return parsed;
}

/**
 * Derive local dev ports from the server anchor port in `server/.env`.
 * Vite dev uses `5173 + (server - 3001)` so foods/forest can run side by side.
 */
export function resolveDevPorts(serverPort: number = DEFAULT_SERVER_PORT): DevPorts {
  const offset = serverPort - DEFAULT_SERVER_PORT;
  return {
    server: DEFAULT_SERVER_PORT + offset,
    clientDev: DEFAULT_CLIENT_DEV_PORT + offset,
  };
}
