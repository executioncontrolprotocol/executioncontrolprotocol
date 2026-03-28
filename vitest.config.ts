import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/types.ts"],
      thresholds: {
        "packages/runtime/src/secrets/**": {
          statements: 70,
          branches: 60,
          functions: 59,
          lines: 70,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "packages/spec/test/**/*.test.ts",
            "packages/runtime/test/**/*.test.ts",
            "packages/cli/test/**/*.test.ts",
            "packages/recalled/test/**/*.test.ts",
          ],
          exclude: [
            "packages/runtime/test/integration/**",
            "packages/runtime/test/e2e/**",
            "packages/recalled/test/integration/**",
            "packages/recalled/test/e2e/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [
            "packages/runtime/test/integration/**/*.test.ts",
            "packages/recalled/test/integration/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: [
            "packages/runtime/test/e2e/**/*.test.ts",
            "packages/recalled/test/e2e/**/*.test.ts",
          ],
        },
      },
    ],
  },
});
