import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to `shared/prompts` for Node `fs` (Vitest `node` environment). */
export const SHARED_PROMPTS_DIR = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../shared/prompts",
);
