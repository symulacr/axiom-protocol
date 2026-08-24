import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/artifacts/**", "**/out/**", "**/cache/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Surface `any` rather than suppress it, so every untyped value is visible.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Type-aware rules need the backend's tsconfig project; frontend keeps the
    // lighter config above (its tsconfig spans JSX + browser globals). Test
    // files are excluded from apps/backend/tsconfig.json (bun runs them
    // directly), so they stay on the non-type-aware base rules.
    files: ["apps/backend/src/**/*.ts"],
    ignores: ["apps/backend/src/**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
);
