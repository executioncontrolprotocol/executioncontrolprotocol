import tseslint from "typescript-eslint";
import eslintPluginYml from "eslint-plugin-yml";

export default tseslint.config(
  {
    ignores: ["**/dist/", "**/node_modules/"],
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
  ...eslintPluginYml.configs["flat/base"],
  {
    files: ["**/*.yaml", "**/*.yml"],
    rules: {
      "yml/block-mapping": ["error", "always"],
    },
  },
);
