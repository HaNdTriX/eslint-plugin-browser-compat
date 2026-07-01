import compatRule from "./rules/compat";
import pkg from "../package.json" with { type: "json" };
import type { ESLint, Linter } from "eslint";

const plugin: ESLint.Plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  configs: {},
  rules: {
    compat: compatRule,
  },
  processors: {},
};

plugin.configs = {
  recommended: {
    name: "compat/recommended",
    plugins: {
      compat: plugin,
    },
    rules: {
      "compat/compat": "error",
    },
  },
} as const;

export default plugin as ESLint.Plugin & {
  configs: {
    recommended: Linter.Config;
  };
};
