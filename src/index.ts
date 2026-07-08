import compatRule from "./rules/compat";
import pkg from "../package.json" with { type: "json" };
import type { ESLint, Linter } from "eslint";

const pluginBase = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    compat: compatRule,
  },
  processors: {},
} satisfies ESLint.Plugin;

const plugin = {
  ...pluginBase,
  configs: {
    recommended: {
      name: "compat/recommended",
      plugins: {
        compat: pluginBase,
      },
      rules: {
        "compat/compat": "error",
      },
    },
  },
} satisfies ESLint.Plugin & {
  configs: {
    recommended: Linter.Config;
  };
};

export default plugin;
