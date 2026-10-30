import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import { importX } from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist", "eslint.config.js"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh.plugin,
      "import-x": importX,
    },
    rules: {
      // Of the plugin's recommended rules, those that flag ordinary render
      // bugs are on. `refs`, `immutability`, `set-state-in-effect` and
      // `globals` are off: they enforce what the React Compiler assumes, and
      // the existing code breaks them in a few hundred places.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/purity": "error",
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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
