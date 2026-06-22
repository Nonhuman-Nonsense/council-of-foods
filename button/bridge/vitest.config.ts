import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = path.resolve(root, "../../client/src");

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": clientSrc,
      "@shared": path.resolve(root, "../../shared"),
    },
  },
});
