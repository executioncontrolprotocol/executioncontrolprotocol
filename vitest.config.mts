import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"

const repoRoot = path.dirname(fileURLToPath(import.meta.url))

/** Load repo `.env` / `.env.local` into process.env without clobbering existing values. */
function loadRepoDotEnv(root: string): void {
  for (const name of [".env", ".env.local"] as const) {
    const filePath = path.join(root, name)
    if (!existsSync(filePath)) continue
    for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      const current = process.env[key]
      if (current === undefined || current.trim() === "") {
        process.env[key] = value
      }
    }
  }
}

loadRepoDotEnv(repoRoot)

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      "@executioncontrolprotocol/core/types": path.resolve(repoRoot, "packages/core/src/types/index.ts"),
      "@executioncontrolprotocol/core/environment": path.resolve(
        repoRoot,
        "packages/core/src/environment/environment.ts"
      ),
      "@executioncontrolprotocol/core/environment/config-resolver": path.resolve(
        repoRoot,
        "packages/core/src/environment/config-resolver.ts"
      ),
      "@executioncontrolprotocol/core/registry": path.resolve(repoRoot, "packages/core/src/registry/registry.ts"),
      "@executioncontrolprotocol/core/registry/errors": path.resolve(
        repoRoot,
        "packages/core/src/registry/errors.ts"
      ),
      "@executioncontrolprotocol/core/bindings/extension": path.resolve(
        repoRoot,
        "packages/core/src/bindings/extension.ts"
      ),
      "@executioncontrolprotocol/core/bindings/policy": path.resolve(
        repoRoot,
        "packages/core/src/bindings/policy.ts"
      ),
      "@executioncontrolprotocol/core/config-schema": path.resolve(
        repoRoot,
        "packages/core/src/config-schema/index.ts"
      ),
      "@executioncontrolprotocol/core/runtime/context": path.resolve(
        repoRoot,
        "packages/core/src/runtime/context.ts"
      ),
      "@executioncontrolprotocol/core/runtime/in-memory-executor": path.resolve(
        repoRoot,
        "packages/core/src/runtime/in-memory-executor.ts"
      ),
      "@executioncontrolprotocol/core/runtime/executor": path.resolve(
        repoRoot,
        "packages/core/src/runtime/executor.ts"
      ),
      "@executioncontrolprotocol/core/definitions/types": path.resolve(
        repoRoot,
        "packages/core/src/definitions/types.ts"
      ),
      "@executioncontrolprotocol/core": path.resolve(repoRoot, "packages/core/src/index.ts"),
      "@executioncontrolprotocol/plugin-sdk": path.resolve(repoRoot, "packages/plugin-sdk/src/index.ts"),
      "@executioncontrolprotocol/policies": path.resolve(repoRoot, "packages/policies/src/index.ts"),
      "@executioncontrolprotocol/plugin-sdk": path.resolve(
        repoRoot,
        "packages/plugin-sdk/src/index.ts"
      ),
      "@executioncontrolprotocol/node": path.resolve(repoRoot, "packages/environments/node/src/index.ts"),
      "@executioncontrolprotocol/browser": path.resolve(repoRoot, "packages/environments/browser/src/index.ts"),
      "@executioncontrolprotocol/extension-openai": path.resolve(
        repoRoot,
        "packages/extensions/openai/src/index.ts"
      ),
      "@executioncontrolprotocol/format-toon": path.resolve(repoRoot, "packages/extensions/format-toon/src/index.ts"),
      "@executioncontrolprotocol/format-mermaid": path.resolve(repoRoot, "packages/extensions/format-mermaid/src/index.ts"),
      "@executioncontrolprotocol/anthropic": path.resolve(repoRoot, "packages/extensions/anthropic/src/index.ts"),
      "@executioncontrolprotocol/extension-ollama": path.resolve(
        repoRoot,
        "packages/extensions/ollama/src/index.ts"
      ),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      // Vitest 4 + projects: avoid `!` negation in test.include — those globs are
      // merged into coverage.exclude and zero the report (vitest#10164).
      include: [
        "packages/core/src/**/*.{ts,js}",
        "packages/policies/src/**/*.{ts,js}",
        "packages/cli/src/**/*.{ts,js}",
        "packages/mcp/src/**/*.{ts,js}",
        "packages/extensions/format-toon/src/**/*.{ts,js}",
        "packages/extensions/format-mermaid/src/**/*.{ts,js}",
        "packages/environments/node/src/**/*.{ts,js}",
        "packages/plugin-sdk/src/**/*.{ts,js}",
        "plugins/plugin-jsonata/src/**/*.{ts,js}",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/dist/**",
        "**/fixtures/**",
        "**/node_modules/**",
      ],
      thresholds: {
        // Global floor across included packages (ratchet toward 90%; never lower to green CI).
        lines: 80,
        functions: 84,
        branches: 66,
        statements: 78,
        // Package floors — raise toward 90 as suites fill positive/negative/edge cases.
        "packages/core/src/**": {
          lines: 70,
          functions: 80,
          branches: 55,
          statements: 70,
        },
        "packages/core/src/types/**": {
          lines: 90,
          functions: 80,
          branches: 70,
          statements: 90,
        },
        "packages/policies/src/**": {
          lines: 75,
          functions: 80,
          branches: 65,
          statements: 75,
        },
        "packages/cli/src/**": {
          // Operation handlers and hooks have in-process unit tests; spawn tests still
          // cover the oclif wiring that v8 does not see.
          lines: 70,
          functions: 75,
          branches: 55,
          statements: 70,
        },
        "packages/plugin-sdk/src/**": {
          lines: 80,
          functions: 85,
          branches: 70,
          statements: 80,
        },
        "packages/mcp/src/**": {
          lines: 40,
          functions: 50,
          branches: 15,
          statements: 40,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "packages/core/test/**/*.test.ts",
            "packages/policies/test/**/*.test.ts",
            "packages/cli/test/**/*.test.ts",
            "packages/mcp/**/*.test.ts",
            "packages/extensions/**/*.test.ts",
            "packages/vendor/*/test/**/*.test.ts",
            "packages/plugin-sdk/test/**/*.test.ts",
            "packages/environments/node/**/*.test.ts",
            "plugins/**/*.test.ts",
            "packages/environments/browser/test/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: "@executioncontrolprotocol/core/types",
              replacement: path.resolve(repoRoot, "packages/core/src/types/index.ts"),
            },
            {
              find: "@executioncontrolprotocol/core",
              replacement: path.resolve(repoRoot, "packages/core/src/index.ts"),
            },
          ],
        },
        test: {
          name: "browser",
          include: [
            "packages/core/test/**/*.test.ts",
            "packages/environments/browser/test/browser/**/*.test.ts",
          ],
          exclude: [
            "**/node_modules/**",
            "packages/core/test/compile/**",
            "packages/core/test/compile.test.ts",
            "packages/core/test/fluent-api.test.ts",
            "packages/core/test/fluent/encode.test.ts",
            "packages/core/test/encoding/**",
            "packages/core/test/patch/**",
            "packages/core/test/testing/**",
            "packages/core/test/environment-events.test.ts",
            "packages/core/test/weekly-brief.test.ts",
            "packages/core/test/secret-serialization.test.ts",
            "packages/core/test/workflow-io.test.ts",
            "packages/core/test/metadata-prose-guard.test.ts",
            "packages/core/test/package-boundary.test.ts",
            "packages/core/test/types/schemas.test.ts",
          ],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["packages/mcp/test/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["packages/extensions/ollama/test/e2e/**/*.test.ts"],
        },
      },
    ],
  },
})
