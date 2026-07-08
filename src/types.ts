import type { Options } from "browserslist";

export interface PluginSettings {
  browsers?: string[];
  targets?: string[];
  polyfills?: string[];
  lintAllEsApis?: boolean;
  ignoreConditionalChecks?: boolean;
  browserslistOpts?: Options;
}

export interface BrowserTarget {
  browser: string;
  version: string;
}

export interface UnsupportedBrowser {
  browser: string;
  version: string;
}

export interface CompatLookupResult {
  unsupported: UnsupportedBrowser[];
}
