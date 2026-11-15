import tseslint from "typescript-eslint"
import eslintPluginYml from "eslint-plugin-yml"

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/coverage/",
      "legacy/**",
      "fixtures/**/*.js",
      "pnpm-lock.yaml",
      "bench/results/**",
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
