export interface BrowserslistOpts {
  path?: string;
  env?: string;
}

export interface PluginSettings {
  browsers?: string[];
  targets?: string[];
  polyfills?: string[];
  lintAllEsApis?: boolean;
  ignoreConditionalChecks?: boolean;
  browserslistOpts?: BrowserslistOpts;
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
