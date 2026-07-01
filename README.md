# eslint-plugin-browser-compat

Lint browser compatibility of your JavaScript and TypeScript using @mdn/browser-compat-data.

The goal is a drop-in replacement for eslint-plugin-compat, with these differences:

- Uses @mdn/browser-compat-data as the compatibility source.
- Flat config is the supported config style.
- ES API linting defaults to enabled.

## Install

```bash
pnpm add -D eslint eslint-plugin-browser-compat @mdn/browser-compat-data
```

Minimum supported ESLint version: 10.

## Quick start

```js
// eslint.config.mjs
import compat from "eslint-plugin-browser-compat";

export default [compat.configs.recommended];
```

## Rule

- compat/compat: reports unsupported APIs for configured browser targets.

See detailed rule docs in [docs/rules/compat.md](docs/rules/compat.md).

## Configure target browsers

Targets are resolved with browserslist.

Example package.json:

```json
{
  "browserslist": ["> 0.5%", "last 2 versions", "not dead"]
}
```

You can also set explicit targets in ESLint settings:

```js
export default [
  compat.configs.recommended,
  {
    settings: {
      browsers: ["ie 11"],
      // or: targets: ["ie 11"]
    },
  },
];
```

## Settings

- browsers: string[]
- targets: string[]
- polyfills: string[]
- lintAllEsApis: boolean
- ignoreConditionalChecks: boolean
- browserslistOpts: { env?: string; path?: string }

Details:

- browsers: explicit browserslist queries. Alias for targets.
- targets: explicit browserslist queries. If both browsers and targets are present, targets wins.
- polyfills: suppress reports for known polyfilled APIs.
- lintAllEsApis: when true (default), lint ES built-ins (for example Array.from).
- ignoreConditionalChecks: when false (default), feature detection conditions such as if (fetch) are ignored.
- browserslistOpts: passed directly to browserslist resolution.

Polyfill examples:

```js
export default [
  compat.configs.recommended,
  {
    settings: {
      polyfills: [
        // Ignore an API and all of its members
        "Promise",
        // Ignore a specific member
        "WebAssembly.compile",
        // Ignore a global function
        "fetch",
        // Ignore an instance method
        "Array.prototype.flat",
      ],
    },
  },
];
```

## Troubleshooting false positives

If you hit a false positive, start with these checks:

1. Ensure the identifier is actually a browser API and not a local/imported binding.
2. Add a targeted polyfill entry in settings.polyfills if your runtime includes it.
3. Confirm your browserslist target set is what you expect.
4. Update @mdn/browser-compat-data to pick up latest compatibility changes.

Common scenarios that are already handled:

- Imported constructors (for example new Navigation() from a package) are not treated as browser globals.
- Type-only imports and type references are ignored.
- Local object members (for example rect.bottom from getBoundingClientRect()) are ignored.

## Known limitations

- Dynamic property access with computed keys (for example obj[prop]) is not resolved to compatibility keys.
- Some API chains may require key normalization heuristics and can still miss edge cases.
- Unknown features are treated as not-reportable instead of errors.

## Keep BCD updated

@mdn/browser-compat-data is a peer dependency, so users can update it independently:

```bash
pnpm up @mdn/browser-compat-data
```

## Thanks

Special thanks to [amilajack/eslint-plugin-compat](https://github.com/amilajack/eslint-plugin-compat) for pioneering browser compatibility linting and inspiring this plugin.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```
