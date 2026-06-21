const DEFAULT_CORS_SUFFIXES = ["council-of-forest.com", "council-of-foods.com"];

let corsSuffixesOverride: string[] | null = null;
let corsOriginsOverride: string[] | null = null;

/** Test hook — override suffix/origin allowlists. */
export function _setCorsAllowlistForTests(
  suffixes: string[] | null,
  exactOrigins: string[] | null = null,
): void {
  corsSuffixesOverride = suffixes;
  corsOriginsOverride = exactOrigins;
}

function readCsvEnv(name: string): string[] {
  const value = process.env[name]?.trim();
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getCorsSuffixes(): string[] {
  if (corsSuffixesOverride) return corsSuffixesOverride;
  const fromEnv = readCsvEnv("BUTTON_BRIDGE_CORS_SUFFIXES");
  return fromEnv.length > 0 ? fromEnv : DEFAULT_CORS_SUFFIXES;
}

function getExactCorsOrigins(): string[] {
  if (corsOriginsOverride) return corsOriginsOverride;
  return readCsvEnv("BUTTON_BRIDGE_CORS_ORIGINS");
}

function hostnameMatchesSuffix(hostname: string, suffix: string): boolean {
  const normalized = suffix.startsWith(".") ? suffix.slice(1) : suffix;
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

/** Allow browser fetches from local dev servers (Vite, etc.) to the bridge health endpoint. */
export function isAllowedLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  } catch {
    return false;
  }
}

/** True for local dev origins and configured museum web app HTTPS origins. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (isAllowedLocalOrigin(origin)) return true;

  if (getExactCorsOrigins().includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    return getCorsSuffixes().some((suffix) => hostnameMatchesSuffix(url.hostname, suffix));
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
