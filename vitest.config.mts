import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "packages/engine/src/**/*.ts",
        "packages/quickjs/src/**/*.ts",
        "packages/plugin-sdk/src/**/*.ts",
        "packages/local/src/**/*.ts",
        "packages/formatters/src/**/*.ts",
        "packages/host/src/**/*.ts",
        "packages/cli/src/**/*.ts",
        "plugins/plugin-test/src/**/*.ts",
      ],
      exclude: [
        "legacy/**",
        "**/dist/**",
        "**/*.d.ts",
        "**/bin/**",
        // Process entries + log rotation are covered by e2e (spawned supervisor/host).
        "packages/host/src/main.ts",
        "packages/host/src/supervisor.ts",
        "packages/host/src/log-rotate.ts",
        "packages/host/src/ports.ts",
        // oclif command/hook entrypoints and supervisor spawn are exercised by spawned e2e.
        "packages/cli/src/commands/**",
        "packages/cli/src/hooks/**",
        "packages/cli/src/lib/host-discovery.ts",
        "packages/cli/src/index.ts",
        "packages/cli/src/version.ts",
      ],
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
          exclude: [
            "legacy/**",
            "**/dist/**",
            "**/node_modules/**",
            "packages/host/test/integration/**",
          ],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["packages/host/test/integration/**/*.test.ts"],
          exclude: ["legacy/**", "**/dist/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["test/e2e/**/*.test.ts"],
          exclude: ["legacy/**", "**/node_modules/**"],
        },
      },
    ],
  },
})
