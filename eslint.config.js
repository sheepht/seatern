import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["**/dist", "**/node_modules"] },

  // Base config for all TS/JS files
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared rule overrides
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "semi": ["error", "always"],
    },
  },

  // React-specific rules for packages/web
  {
    files: ["packages/web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Node files (API, config files)
  {
    files: ["packages/api/**/*.ts", "*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
