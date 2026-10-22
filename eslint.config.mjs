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
      "packages/vendor/**/src/generated/**",
      "packages/vendor/**/openapi/**",
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
  // depend only on @executioncontrolprotocol/types + @executioncontrolprotocol/core. They may not import host packages.
  // Scoped to `src` so integration tests may still use a host runtime.
  {
    files: [
      "packages/extensions/**/src/**/*.ts",
      "packages/vendor/**/src/**/*.ts",
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
                "Extensions must not import host packages (@executioncontrolprotocol/node, @executioncontrolprotocol/browser, @executioncontrolprotocol/cli, @executioncontrolprotocol/mcp). Depend on @executioncontrolprotocol/types and @executioncontrolprotocol/core only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/vendor/**/src/**/*.ts"],
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
                "@executioncontrolprotocol/core/*",
                "@executioncontrolprotocol/types/*",
                "**/packages/core/src/**",
                "**/packages/types/src/**",
                "**/../../core/**",
                "**/../../types/**",
                "**/../../../core/**",
                "**/../../../types/**",
              ],
              message:
                "Vendor packages must import only the public @executioncontrolprotocol/core and @executioncontrolprotocol/types entry points, the same surface external authors get.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/core/**/src/**/*.ts", "packages/types/**/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@executioncontrolprotocol/fal",
                "@executioncontrolprotocol/jsonata",
                "@executioncontrolprotocol/image-sharp",
                "@executioncontrolprotocol/adobe-firefly-services",
                "@executioncontrolprotocol/azure-blob-storage",
                "**/packages/vendor/**",
              ],
              message:
                "Core and types must not import vendor extensions.",
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
