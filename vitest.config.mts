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
        "packages/mcp-relay/src/**/*.ts",
        "packages/app/src/graph/**/*.ts",
        "packages/app/src/form/**/*.ts",
        "packages/app/src/client/**/*.ts",
        "plugins/plugin-test/src/**/*.ts",
        "plugins/plugin-core/src/**/*.ts",
        "plugins/plugin-jsonata/src/**/*.ts",
        "plugins/plugin-anthropic/src/**/*.ts",
        "plugins/plugin-azure-blob-storage/src/**/*.ts",
        "plugins/plugin-adobe-firefly-services/src/**/*.ts",
      ],
      exclude: [
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
        // Stdio MCP server, host spawn, and HTTP forward/retry are covered by spawned e2e.
        "packages/mcp-relay/src/start-relay.ts",
        "packages/mcp-relay/src/host.ts",
        "packages/mcp-relay/src/forward.ts",
        "packages/mcp-relay/src/index.ts",
        "packages/mcp-relay/src/version.ts",
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
          setupFiles: ["test/unit-delay-hooks.ts"],
          include: [
            "packages/**/test/**/*.test.ts",
            "plugins/**/test/**/*.test.ts",
            "bench/**/*.test.ts",
          ],
          exclude: [
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
          exclude: ["**/dist/**", "**/node_modules/**"],
          globalSetup: ["test/e2e/global-setup.ts"],
          setupFiles: ["test/e2e/setup.ts"],
        },
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["test/e2e/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          globalSetup: ["test/e2e/global-setup.ts"],
          setupFiles: ["test/e2e/setup.ts"],
          // Spawned host/supervisor/MCP work; keep the default off the 5s Vitest floor.
          testTimeout: 120_000,
          hookTimeout: 60_000,
          // One e2e file at a time avoids cross-test host/port contention on CI runners.
          fileParallelism: false,
        },
      },
    ],
  },
})
