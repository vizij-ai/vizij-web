import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Import groups banned from vizij-authoring's two extractable layers.
 *
 * Specifiers there are relative, so these match on path segments rather than a
 * package name. They deliberately do NOT include a `components/` segment: a file
 * in `components/ui/` reaches a sibling feature directory as `../app/AppMenuBar`,
 * with no `components/` in the specifier at all, so a `**\/components/app/**`
 * pattern silently misses the most likely violation. Bare directory names catch
 * both that and the deeper `../../components/app/x` form.
 */
const NO_APP_STATE = ["**/state/*", "**/state/**"];
const NO_FEATURE_CODE = [
  "**/app/**",
  "**/panels/**",
  "**/inspector/**",
  "**/animation/**",
  "**/binding/**",
  "**/scene-composer/**",
  "**/poseRig/**",
  "**/discrepancy/**",
  "**/common/**",
  "**/motiongraph/**",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.vite/**",
      "**/.turbo/**",
      "**/build/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        tsconfigRootDir: rootDir,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      import: importPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "off",
      "react-refresh/only-export-components": "off",
      "no-console": [
        "warn",
        {
          allow: ["warn", "error", "log"],
        },
      ],
      "import/no-cycle": "off",
      "import/order": [
        "error",
        {
          distinctGroup: false,
          "newlines-between": "never",
        },
      ],
      "import/newline-after-import": [
        "error",
        {
          count: 1,
        },
      ],
      "no-empty": [
        "error",
        {
          allowEmptyCatch: true,
        },
      ],
      "no-useless-catch": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='JSON'][callee.property.name='parse'] > CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
          message:
            "Do not use JSON.parse(JSON.stringify(...)) for deep cloning. Use cloneDeepSafe from @vizij/utils instead.",
        },
      ],
    },
  },
  // ---------------------------------------------------------------------------
  // vizij-authoring layer boundaries.
  //
  // `apps/vizij-authoring/docs/references/component-graph.md` renders the import
  // graph and shows the ui/ -> editor/ -> feature direction currently holds. That
  // is a snapshot; these rules are what keep it true. Both layers are intended to
  // be extractable for other editor applications, and a single import of app
  // state or a feature directory is enough to make that impossible.
  //
  // Specifiers here are relative, so the patterns match on path segments rather
  // than on a package name — `**/state/*` catches `../../state/x` and
  // `../../../state/x` alike.
  // ---------------------------------------------------------------------------
  //
  // Each block below carries its COMPLETE pattern list. Flat config resolves a
  // rule's options last-wins rather than merging them, so a second block scoped
  // to `ui/` would silently discard a shared block's patterns instead of adding
  // to them. (Found by planting two violations and seeing only one reported.)
  {
    files: ["apps/vizij-authoring/src/components/editor/**/*.{ts,tsx}"],
    ignores: ["**/*.stories.tsx", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...NO_APP_STATE, ...NO_FEATURE_CODE],
              message:
                "editor/ must not read app state or import feature code: take the value as a prop and let the feature layer bind the store. See editor/hooks/useRowLock (callback pair) and ui/ThemeToggle (value + handler) for the two shapes this takes. Importing ui/ is fine — composition goes that way.",
            },
          ],
        },
      ],
    },
  },
  // `ui/` is the lower of the two layers, so it additionally may not reach up
  // into `editor/`.
  {
    files: ["apps/vizij-authoring/src/components/ui/**/*.{ts,tsx}"],
    ignores: ["**/*.stories.tsx", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...NO_APP_STATE, ...NO_FEATURE_CODE, "**/editor/**"],
              message:
                "ui/ is the primitive layer: no app state, no feature code, and no imports from editor/. Composition goes the other way round.",
            },
          ],
        },
      ],
    },
  },
);
