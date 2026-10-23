import tseslint from "typescript-eslint";
import eslintPluginYml from "eslint-plugin-yml";
import * as espree from "espree";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/coverage/",
      "pnpm-lock.yaml",
      "plugins/plugin-adobe-firefly-services/src/generated/**",
      "plugins/plugin-adobe-firefly-services/openapi/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  // Package boundary: extensions are environment-agnostic and must
  // depend only on @executioncontrolprotocol/core (including ./types). They may not import host packages.
  // Scoped to `src` so integration tests may still use a host runtime.
  {
    files: [
      "plugins/**/src/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@executioncontrolprotocol/node",
                "@executioncontrolprotocol/node/*",
                "@executioncontrolprotocol/browser",
                "@executioncontrolprotocol/browser/*",
                "@executioncontrolprotocol/cli",
                "@executioncontrolprotocol/cli/*",
                "@executioncontrolprotocol/mcp",
                "@executioncontrolprotocol/mcp/*",
              ],
              message:
                "Extensions must not import host packages (@executioncontrolprotocol/node, @executioncontrolprotocol/browser, @executioncontrolprotocol/cli, @executioncontrolprotocol/mcp). Depend on @executioncontrolprotocol/core (including ./types) only.",
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
                "@executioncontrolprotocol/node",
                "@executioncontrolprotocol/node/*",
                "@executioncontrolprotocol/browser",
                "@executioncontrolprotocol/browser/*",
                "@executioncontrolprotocol/cli",
                "@executioncontrolprotocol/cli/*",
                "@executioncontrolprotocol/mcp",
                "@executioncontrolprotocol/mcp/*",
                "**/packages/core/src/**",
                "**/../../core/**",
                "**/../../../core/**",
              ],
              message:
                "Vendor packages must import only the public @executioncontrolprotocol/core and @executioncontrolprotocol/core/types entry points, the same surface external authors get.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/core/**/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "fs",
              message: "Core must not import Node host modules.",
            },
            {
              name: "path",
              message: "Core must not import Node host modules.",
            },
            {
              name: "child_process",
              message: "Core must not import Node host modules.",
            },
          ],
          patterns: [
            {
              group: [
                "node:*",
                "@executioncontrolprotocol/plugin-fal",
                "@executioncontrolprotocol/plugin-jsonata",
                "@executioncontrolprotocol/plugin-image-sharp",
                "@executioncontrolprotocol/plugin-adobe-firefly-services",
                "@executioncontrolprotocol/plugin-azure-blob-storage",
                "**/packages/vendor/**",
              ],
              message:
                "Core must not import Node host modules or vendor extensions.",
            },
          ],
        },
      ],
    },
  },
  ...eslintPluginYml.configs["flat/base"],
  {
    files: ["**/*.yaml", "**/*.yml"],
    rules: {
      "yml/block-mapping": ["error", "always"],
    },
  },
  // Use ESLint's JS parser for plain JS files (shebangs, CJS bins, scripts).
  // Placed at the end so it overrides the TypeScript parser configs above.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      parser: espree,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
    },
  },
  // CJS entrypoints (npm Windows shims) need `require`.
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
