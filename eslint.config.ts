import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "eslint-plugin-eslint-plugin";
import js from "@eslint/js";
import ts from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
  ]),
  eslint.configs.recommended,
  js.configs.recommended,
  ts.configs.recommended,
]);
