import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@jarvis/ai": `${root}packages/ai/src/index.ts`,
      "@jarvis/agents": `${root}packages/agents/src/index.ts`,
      "@jarvis/context": `${root}packages/context/src/index.ts`,
      "@jarvis/database": `${root}packages/database/src/index.ts`,
      "@jarvis/evaluation": `${root}packages/evaluation/src/index.ts`,
      "@jarvis/memory": `${root}packages/memory/src/index.ts`,
      "@jarvis/security": `${root}packages/security/src/index.ts`,
      "@jarvis/shared": `${root}packages/shared/src/index.ts`,
      "@jarvis/tools": `${root}packages/tools/src/index.ts`,
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
