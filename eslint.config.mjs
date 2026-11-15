import tseslint from "typescript-eslint"
import eslintPluginYml from "eslint-plugin-yml"

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/coverage/",
      "fixtures/**/*.js",
      "examples/**/*.uxp.js",
      "pnpm-lock.yaml",
      "bench/results/**",
      // Vendored third-party OpenAPI specs (refreshed by the plugin's fetch-specs script).
      "plugins/*/openapi/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "child_process", "http", "https", "net"],
              message:
                "engine does no I/O. Pass effects in through services. node:crypto randomUUID belongs behind an injected id generator.",
            },
          ],
        },
      ],
    },
  },
  {
    // VERSION is read from package.json at load; the only allowed node: import in engine.
    files: ["packages/engine/src/version.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["plugins/**/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@executioncontrolprotocol/host",
                "@executioncontrolprotocol/host/*",
                "@executioncontrolprotocol/cli",
                "@executioncontrolprotocol/cli/*",
                "@executioncontrolprotocol/mcp-relay",
                "@executioncontrolprotocol/mcp-relay/*",
                "@executioncontrolprotocol/app",
                "@executioncontrolprotocol/app/*",
                "@executioncontrolprotocol/engine",
                "@executioncontrolprotocol/engine/*",
              ],
              message:
                "Plugins may depend on the plugin SDK, protocol types and their own libraries. They must not import the host, CLI, relay, App or engine.",
            },
          ],
        },
      ],
    },
  },
  ...eslintPluginYml.configs["flat/standard"],
  {
    files: ["**/*.{yml,yaml}"],
    rules: {
      "yml/no-empty-mapping-value": "off",
    },
  },
)
