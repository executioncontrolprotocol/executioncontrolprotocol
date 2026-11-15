import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**/*.ts", "packages/quickjs/src/**/*.ts"],
      exclude: ["legacy/**", "**/dist/**", "**/*.d.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/**/test/**/*.test.ts", "plugins/**/test/**/*.test.ts"],
          exclude: ["legacy/**", "**/dist/**"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["packages/host/test/integration/**/*.test.ts"],
          exclude: ["legacy/**", "**/dist/**"],
        },
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["test/e2e/**/*.test.ts"],
          exclude: ["legacy/**"],
        },
      },
    ],
  },
})
