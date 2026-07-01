import eslintPlugin from "eslint-plugin-eslint-plugin";
import { defineConfig } from "eslint/config";
import plugin from "./src/index";

export default defineConfig([
  eslintPlugin.configs.recommended,
  plugin.configs.recommended,
]);
