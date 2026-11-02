import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "lib/**/*.test.ts",
      "../../packages/shared/src/**/*.test.ts",
    ],
    globals: false,

    restoreMocks: true,

    coverage: {
      provider: "v8",
      include: ["src/lib/**", "lib/**"],
      // Reporting only. No threshold is set yet, because a threshold on a new
      // suite fails the build before the suite has grown to meet it.
      thresholds: {},
    },
  },

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@teammate/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
});
