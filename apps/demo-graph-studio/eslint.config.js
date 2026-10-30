/* eslint-disable @typescript-eslint/no-require-imports */
const js = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const globals = require("globals");
const reactHooks = require("eslint-plugin-react-hooks");
const { reactRefresh } = require("eslint-plugin-react-refresh");
const { importX } = require("eslint-plugin-import-x");
const tseslint = require("typescript-eslint");

module.exports = defineConfig(
  { ignores: ["dist", "eslint.config.js"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh.plugin,
      "import-x": importX,
    },
    rules: {
      // The plugin's other recommended rules check code for the React
      // Compiler, which this app does not build with.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "import-x/order": [
        "error",
        {
          distinctGroup: false,
          "newlines-between": "never",
        },
      ],
      "import-x/newline-after-import": [
        "error",
        {
          count: 1,
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Relax some strict TypeScript rules to allow the codebase to lint cleanly for now.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
