import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"
import { browserPromptLoaderPlugin } from "./packages/runtimes/browser/test/vite-browser-prompts-plugin.js"

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const corePromptsDir = path.join(repoRoot, "packages/core/src/harness/prompts")
const promptLoaderStubDir = path.join(repoRoot, "packages/evals/test/stubs")
const browserPromptPlugins = [
  browserPromptLoaderPlugin({ corePromptsDir, stubDir: promptLoaderStubDir }),
]

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      "@executioncontrolprotocol/types": path.resolve(repoRoot, "packages/types/src/index.ts"),
      "@executioncontrolprotocol/core/compile": path.resolve(repoRoot, "packages/core/src/compile/entry.ts"),
      "@executioncontrolprotocol/core/loaders": path.resolve(repoRoot, "packages/core/src/loaders/index.ts"),
      "@executioncontrolprotocol/core/browser": path.resolve(repoRoot, "packages/core/src/browser.ts"),
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
      "@executioncontrolprotocol/core/bindings/runtime": path.resolve(
        repoRoot,
        "packages/core/src/bindings/runtime.ts"
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
      "@executioncontrolprotocol/policies": path.resolve(repoRoot, "packages/policies/src/index.ts"),
      "@executioncontrolprotocol/node": path.resolve(repoRoot, "packages/runtimes/node/src/index.ts"),
      "@executioncontrolprotocol/browser": path.resolve(repoRoot, "packages/runtimes/browser/src/index.ts"),
      "@executioncontrolprotocol/extension-memory": path.resolve(
        repoRoot,
        "packages/extensions/memory/src/index.ts"
      ),
      "@executioncontrolprotocol/extension-openai": path.resolve(
        repoRoot,
        "packages/extensions/openai/src/index.ts"
      ),
      "@executioncontrolprotocol/extension-slack": path.resolve(repoRoot, "packages/extensions/slack/src/index.ts"),
      "@executioncontrolprotocol/format-toon": path.resolve(repoRoot, "packages/extensions/format-toon/src/index.ts"),
      "@executioncontrolprotocol/format-mermaid": path.resolve(repoRoot, "packages/extensions/format-mermaid/src/index.ts"),
      "@executioncontrolprotocol/format-eql": path.resolve(repoRoot, "packages/extensions/format-eql/src/index.ts"),
      "@executioncontrolprotocol/chrome-ai": path.resolve(repoRoot, "packages/extensions/chrome-ai/src/index.ts"),
      "@executioncontrolprotocol/claude": path.resolve(repoRoot, "packages/extensions/claude/src/index.ts"),
      "@executioncontrolprotocol/extension-ollama": path.resolve(
        repoRoot,
        "packages/extensions/ollama/src/index.ts"
      ),
      "@executioncontrolprotocol/extension-fal": path.resolve(
        repoRoot,
        "packages/extensions/fal/src/index.ts"
      ),
      "@executioncontrolprotocol/extension-image-sharp": path.resolve(
        repoRoot,
        "packages/extensions/image-sharp/src/index.ts"
      ),
      "@executioncontrolprotocol/evals": path.resolve(repoRoot, "packages/evals/src/index.ts"),
      "@executioncontrolprotocol/harnesses-browser-nano": path.resolve(
        repoRoot,
        "packages/harnesses/browser-nano/src/index.ts"
      ),
      "@executioncontrolprotocol/harnesses-browser-nano/request-capability-hints": path.resolve(
        repoRoot,
        "packages/harnesses/browser-nano/src/_internal/request-capability-hints.ts"
      ),
      "@executioncontrolprotocol/harnesses-browser-coding": path.resolve(
        repoRoot,
        "packages/harnesses/browser-coding/src/index.ts"
      ),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "packages/extensions/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: {
        "packages/core/src/harness/**": { lines: 90, statements: 90 },
        "packages/core/src/validate/harness.ts": { lines: 90, statements: 90 },
        "packages/extensions/format-eql/src/**": { lines: 90, statements: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "packages/types/**/*.test.ts",
            "packages/core/test/**/*.test.ts",
            "packages/policies/test/**/*.test.ts",
            "packages/cli/test/**/*.test.ts",
            "packages/mcp/**/*.test.ts",
            "packages/extensions/**/*.test.ts",
            "packages/harnesses/**/test/**/*.test.ts",
            "!packages/harnesses/**/test/eval/**",
            "packages/runtimes/node/**/*.test.ts",
            "packages/runtimes/browser/test/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        plugins: browserPromptPlugins,
        resolve: {
          alias: [
            {
              find: "@executioncontrolprotocol/core",
              replacement: path.resolve(
                repoRoot,
                "packages/core/src/browser-runtime-entry.ts"
              ),
            },
            {
              find: "@executioncontrolprotocol/core/browser",
              replacement: path.resolve(repoRoot, "packages/core/src/browser.ts"),
            },
          ],
        },
        test: {
          name: "browser",
          include: ["packages/runtimes/browser/test/browser/**/*.test.ts"],
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
          name: "eval",
          include: [
            "packages/harnesses/browser-nano/test/eval/**/*.test.ts",
            "packages/harnesses/browser-coding/test/eval/**/*.test.ts",
            "packages/evals/test/fixtures/**/*.test.ts",
          ],
          testTimeout: 180_000,
          server: {
            deps: {
              inline: [
                "@executioncontrolprotocol/harnesses-browser-coding",
                "@executioncontrolprotocol/harnesses-browser-nano",
              ],
            },
          },
        },
      },
      {
        extends: true,
        plugins: browserPromptPlugins,
        resolve: {
          alias: [
            { find: "@executioncontrolprotocol/core", replacement: path.resolve(repoRoot, "packages/core/src/index.ts") },
            {
              find: "@executioncontrolprotocol/core/compile",
              replacement: path.resolve(repoRoot, "packages/core/src/compile/index.browser.ts"),
            },
            {
              find: "@executioncontrolprotocol/core/loaders",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-empty.ts"),
            },
            {
              find: "@executioncontrolprotocol/node",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-runtime-stub.ts"),
            },
            {
              find: "node:fs",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-fs-stub.ts"),
            },
            {
              find: "node:fs/promises",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-fs-stub.ts"),
            },
            {
              find: "node:path",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-path-stub.ts"),
            },
            {
              find: "node:url",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-url-stub.ts"),
            },
            {
              find: "node:os",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-empty.ts"),
            },
            {
              find: "node:http",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-empty.ts"),
            },
            {
              find: "node:child_process",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-empty.ts"),
            },
            {
              find: "node:util",
              replacement: path.resolve(repoRoot, "packages/evals/test/stubs/node-empty.ts"),
            },
            {
              find: "@executioncontrolprotocol/harnesses-browser-nano/request-capability-hints",
              replacement: path.resolve(
                repoRoot,
                "packages/harnesses/browser-nano/src/_internal/request-capability-hints.ts"
              ),
            },
          ],
        },
        test: {
          name: "eval-browser",
          include: ["packages/harnesses/browser-nano/test/eval/browser/**/*.eval.test.ts"],
          testTimeout: 180_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium", channel: "chrome" }],
          },
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
