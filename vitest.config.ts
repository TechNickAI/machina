import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "./vitest.setup.ts")],
    include: [
      "__tests__/unit/**/*.{test,spec}.ts",
      "__tests__/integration/**/*.{test,spec}.ts",
      // Live tests only run when MACHINA_LIVE_TESTS=true
      ...(process.env.MACHINA_LIVE_TESTS === "true" ? ["__tests__/live/**/*.{test,spec}.ts"] : []),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "__tests__/", "**/*.config.*", "**/*.d.ts", "dist/", "coverage/"],
    },
    testTimeout: 30000,
  },
});
