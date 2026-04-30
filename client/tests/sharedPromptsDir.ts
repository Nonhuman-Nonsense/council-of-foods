import path from "node:path";

/** Absolute path to `shared/prompts` for Node-side tests run from the client package root. */
export const SHARED_PROMPTS_DIR = path.resolve(process.cwd(), "../shared/prompts");
