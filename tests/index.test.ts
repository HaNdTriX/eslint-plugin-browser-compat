import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import tsParser from "@typescript-eslint/parser";

import plugin from "../src/index";

function lint(code: string, settings: Record<string, unknown> = {}) {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(
    code,
    [
      plugin.configs.recommended,
      {
        settings,
      },
    ],
    "test.js",
  );
}

describe("compat/compat", () => {
  it("reports unsupported web APIs", () => {
    const messages = lint("fetch('/api')", {
      browsers: ["ie 11"],
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.ruleId).toBe("compat/compat");
    expect(messages[0]?.message).toContain("fetch()");
  });

  it("does not report polyfilled APIs", () => {
    const messages = lint("fetch('/api')", {
      browsers: ["ie 11"],
      polyfills: ["fetch"],
    });

    expect(messages).toHaveLength(0);
  });

  it("ignores feature-detection conditionals by default", () => {
    const messages = lint("if (fetch) { console.log('ok') }", {
      browsers: ["ie 11"],
    });

    expect(messages).toHaveLength(0);
  });

  it("reports feature-detection conditionals when enabled", () => {
    const messages = lint("if (fetch) { console.log('ok') }", {
      browsers: ["ie 11"],
      ignoreConditionalChecks: true,
    });

    expect(messages.length).toBeGreaterThan(0);
  });

  it("lints ES built-ins by default", () => {
    const messages = lint("Array.from([1, 2, 3])", {
      browsers: ["ie 8"],
    });

    expect(messages.length).toBeGreaterThan(0);
  });

  it("can opt out of ES built-in linting", () => {
    const messages = lint("Array.from([1, 2, 3])", {
      browsers: ["ie 8"],
      lintAllEsApis: false,
    });

    expect(messages).toHaveLength(0);
  });

  it("reports features only available behind a flag", () => {
    const messages = lint("new AmbientLightSensor()", {
      browsers: ["chrome 120"],
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(
      messages.some(
        (m) =>
          m.ruleId === "compat/compat" &&
          m.message.includes("AmbientLightSensor"),
      ),
    ).toBe(true);
  });

  it("reports features only available in preview builds", () => {
    const messages = lint("navigator.preferences", {
      browsers: ["chrome 120"],
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(
      messages.some(
        (m) =>
          m.ruleId === "compat/compat" && m.message.includes("preferences"),
      ),
    ).toBe(true);
  });

  it("exposes flat recommended config", () => {
    expect(plugin.configs.recommended).toBeTruthy();
    expect(plugin.configs.recommended.rules?.["compat/compat"]).toBe("error");
  });

  it("does not report imported types used in type positions", () => {
    const linter = new Linter({ configType: "flat" });
    const messages = linter.verify(
      "import type { Metadata } from 'somewhere'; type Foo = { bar: Metadata };",
      [
        plugin.configs.recommended,
        {
          languageOptions: {
            parser: tsParser,
            sourceType: "module",
            ecmaVersion: "latest",
          },
          settings: {
            browsers: ["ie 11"],
          },
        },
      ],
      "test.ts",
    );

    const compatMessages = messages.filter(
      (message) => message.ruleId === "compat/compat",
    );
    expect(compatMessages).toHaveLength(0);
  });

  it("does not report imported constructors", () => {
    const linter = new Linter({ configType: "flat" });
    const code = `
      import { Navigation } from '@virtualstate/navigation'

      const navigation =
        typeof window.navigation !== 'undefined'
          ? window.navigation
          : new Navigation()
    `;

    const messages = linter.verify(
      code,
      [
        plugin.configs.recommended,
        {
          languageOptions: {
            sourceType: "module",
            ecmaVersion: "latest",
          },
          settings: {
            browsers: ["firefox 140"],
          },
        },
      ],
      "test.js",
    );

    const navigationMessages = messages.filter(
      (message) =>
        message.ruleId === "compat/compat" &&
        message.message.includes("Navigation"),
    );
    expect(navigationMessages).toHaveLength(0);
  });

  it("reports window.navigation.entries for unsupported Firefox versions", () => {
    const messages = lint("console.log(window.navigation.entries())", {
      browsers: ["firefox 140"],
    });

    const compatMessages = messages.filter(
      (message) =>
        message.ruleId === "compat/compat" &&
        message.message.includes("navigation.entries()"),
    );

    expect(compatMessages.length).toBeGreaterThan(0);
  });

  it("supports Node.js targets from browserslist", () => {
    const messages = lint("fetch('/api')", {
      targets: ["node 16"],
    });

    const compatMessages = messages.filter(
      (message) =>
        message.ruleId === "compat/compat" &&
        message.message.includes("fetch()") &&
        message.message.includes("node"),
    );

    expect(compatMessages.length).toBeGreaterThan(0);
  });

  it("does not report supported Node.js targets", () => {
    const messages = lint("fetch('/api')", {
      targets: ["node 20"],
    });

    const compatMessages = messages.filter(
      (message) =>
        message.ruleId === "compat/compat" &&
        message.message.includes("fetch()"),
    );

    expect(compatMessages).toHaveLength(0);
  });

  it("supports browserslist-only browser families via BCD aliases", () => {
    const messages = lint("fetch('/api')", {
      targets: ["ie_mob 11"],
    });

    const compatMessages = messages.filter(
      (message) =>
        message.ruleId === "compat/compat" &&
        message.message.includes("fetch()") &&
        message.message.includes("ie_mob"),
    );

    expect(compatMessages.length).toBeGreaterThan(0);
  });

  it("does not report properties on local DOMRect values", () => {
    const messages = lint(
      "const domelement = document.createElement('div'); const rect = domelement.getBoundingClientRect(); console.log(rect.bottom)",
      {
        browsers: ["defaults"],
      },
    );

    const rectMessages = messages.filter(
      (message) =>
        message.ruleId === "compat/compat" &&
        message.message.includes("rect.bottom"),
    );

    expect(rectMessages).toHaveLength(0);
  });
});
