import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.ts", "test/**/*.integration-spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
  },
});
