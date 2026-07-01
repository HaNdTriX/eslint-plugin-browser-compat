import browserslist from "browserslist";
import bcd from "@mdn/browser-compat-data";

import type {
  BrowserTarget,
  BrowserslistOpts,
  CompatLookupResult,
  PluginSettings,
  UnsupportedBrowser,
} from "./types";

type CompatStatement = {
  version_added?: boolean | string | null;
  version_removed?: boolean | string | null;
};

type CompatNode = {
  __compat?: {
    support?: Record<string, CompatStatement | CompatStatement[]>;
  };
  [key: string]: unknown;
};

const BROWSER_NAME_MAP: Record<string, string> = {
  chrome: "chrome",
  firefox: "firefox",
  safari: "safari",
  edge: "edge",
  ie: "ie",
  ios_saf: "safari_ios",
  and_chr: "chrome_android",
  and_ff: "firefox_android",
  samsung: "samsunginternet_android",
  opera: "opera",
  op_mob: "opera_android",
  android: "webview_android",
  and_uc: "webview_android",
};

const CACHE = new Map<string, CompatLookupResult>();

let indexCache: Map<string, CompatNode> | null = null;

function buildFeatureIndex(): Map<string, CompatNode> {
  if (indexCache) {
    return indexCache;
  }

  const index = new Map<string, CompatNode>();

  const walk = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    const maybeNode = node as CompatNode;
    if (maybeNode.__compat && path.length > 0) {
      index.set(path.join("."), maybeNode);
    }

    for (const [key, value] of Object.entries(maybeNode)) {
      if (key === "__compat") {
        continue;
      }
      walk(value, [...path, key]);
    }
  };

  walk((bcd as { api?: unknown }).api, []);
  walk(
    (bcd as { javascript?: { builtins?: unknown } }).javascript?.builtins,
    [],
  );

  indexCache = index;
  return index;
}

export function resolveSettings(
  settings: PluginSettings | undefined,
): Required<PluginSettings> {
  return {
    browsers: settings?.browsers ?? [],
    targets: settings?.targets ?? [],
    polyfills: settings?.polyfills ?? [],
    lintAllEsApis: settings?.lintAllEsApis ?? true,
    ignoreConditionalChecks: settings?.ignoreConditionalChecks ?? false,
    browserslistOpts: settings?.browserslistOpts ?? {},
  };
}

export function resolveBrowserTargets(
  settings: Required<PluginSettings>,
): BrowserTarget[] {
  const configuredTargets =
    settings.targets.length > 0 ? settings.targets : settings.browsers;
  const resolved =
    configuredTargets.length > 0
      ? browserslist(
          configuredTargets,
          settings.browserslistOpts as BrowserslistOpts,
        )
      : browserslist(undefined, settings.browserslistOpts as BrowserslistOpts);

  return resolved
    .map((entry) => {
      const [browser, version] = entry.split(" ");
      return { browser, version };
    })
    .filter((target) => Boolean(target.browser) && Boolean(target.version));
}

function normalizeFeatureKey(input: string): string {
  return input.replace(/^window\./, "").replace(/^globalThis\./, "");
}

function upperFirst(value: string): string {
  if (!value) {
    return value;
  }

  return value[0].toUpperCase() + value.slice(1);
}

export function isPolyfilled(
  featureKey: string,
  settings: Required<PluginSettings>,
): boolean {
  const normalized = normalizeFeatureKey(featureKey);
  if (settings.polyfills.includes(normalized)) {
    return true;
  }

  const root = normalized.split(".")[0];
  if (settings.polyfills.includes(root)) {
    return true;
  }

  if (settings.polyfills.includes("es:all") && /^[A-Z]/.test(root)) {
    return true;
  }

  return false;
}

function parseVersionParts(version: string): number[] | null {
  if (version === "preview" || version.toLowerCase() === "tp") {
    return null;
  }

  const sanitized = version.replace(/^<=?\s*/, "");
  const parts = sanitized
    .split(".")
    .map((part) => Number(part.replace(/[^\d]/g, "")))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 0) {
    return null;
  }

  return parts;
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersionParts(a);
  const bParts = parseVersionParts(b);

  if (!aParts || !bParts) {
    return 0;
  }

  const len = Math.max(aParts.length, bParts.length);
  for (let idx = 0; idx < len; idx += 1) {
    const av = aParts[idx] ?? 0;
    const bv = bParts[idx] ?? 0;
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }

  return 0;
}

function statementSupportsVersion(
  statement: CompatStatement,
  targetVersion: string,
): boolean {
  const added = statement.version_added;
  if (added === false || added == null) {
    return false;
  }

  if (added === true) {
    if (
      statement.version_removed &&
      typeof statement.version_removed === "string"
    ) {
      return compareVersions(targetVersion, statement.version_removed) < 0;
    }
    return true;
  }

  if (typeof added === "string") {
    if (compareVersions(targetVersion, added) < 0) {
      return false;
    }

    if (
      statement.version_removed &&
      typeof statement.version_removed === "string"
    ) {
      return compareVersions(targetVersion, statement.version_removed) < 0;
    }

    return true;
  }

  return false;
}

function supportsTarget(node: CompatNode, target: BrowserTarget): boolean {
  const supportData = node.__compat?.support;
  if (!supportData) {
    return true;
  }

  const bcdBrowser = BROWSER_NAME_MAP[target.browser];
  if (!bcdBrowser) {
    return true;
  }

  const statement = supportData[bcdBrowser];
  if (!statement) {
    return true;
  }

  if (Array.isArray(statement)) {
    return statement.some((item) =>
      statementSupportsVersion(item, target.version),
    );
  }

  return statementSupportsVersion(statement, target.version);
}

function resolveFeatureNode(featureKey: string): CompatNode | undefined {
  const index = buildFeatureIndex();
  const normalized = normalizeFeatureKey(featureKey);

  const parts = normalized.split(".").filter(Boolean);
  const candidates = new Set<string>();

  candidates.add(normalized);
  // Instance method style, ex: Array.prototype.flat -> Array.flat in BCD builtins.
  candidates.add(normalized.replace(".prototype.", "."));

  if (parts.length > 0) {
    const [root, ...rest] = parts;
    const pascalRoot = upperFirst(root);

    // Example: navigation.entries -> Navigation.entries
    candidates.add([pascalRoot, ...rest].join("."));
    // Example: navigation -> Window.navigation
    candidates.add(`Window.${root}`);
    // Example: navigation.entries -> Window.navigation.entries
    candidates.add(`Window.${[root, ...rest].join(".")}`);
  }

  for (const candidate of candidates) {
    if (index.has(candidate)) {
      return index.get(candidate);
    }
  }

  return undefined;
}

export function lookupCompatibility(
  featureKey: string,
  targets: BrowserTarget[],
): CompatLookupResult {
  const cacheKey = `${featureKey}|${targets
    .map((target) => `${target.browser}:${target.version}`)
    .sort()
    .join(",")}`;

  const cached = CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const node = resolveFeatureNode(featureKey);
  if (!node) {
    const result = { unsupported: [] };
    CACHE.set(cacheKey, result);
    return result;
  }

  const unsupported: UnsupportedBrowser[] = [];

  for (const target of targets) {
    if (!supportsTarget(node, target)) {
      unsupported.push({ browser: target.browser, version: target.version });
    }
  }

  const result = { unsupported };
  CACHE.set(cacheKey, result);
  return result;
}
