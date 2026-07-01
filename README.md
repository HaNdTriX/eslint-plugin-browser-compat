# eslint-plugin-browser-compat

[![npm version](https://img.shields.io/npm/v/eslint-plugin-browser-compat)](https://www.npmjs.com/package/eslint-plugin-browser-compat)
[![CI](https://github.com/handtrix/eslint-plugin-browser-compat/actions/workflows/ci.yml/badge.svg)](https://github.com/handtrix/eslint-plugin-browser-compat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An ESLint plugin that reports browser API usage incompatible with your configured [browserslist](https://browsersl.ist/) targets, powered by [@mdn/browser-compat-data](https://github.com/mdn/browser-compat-data).

Designed as a drop-in replacement for [eslint-plugin-compat](https://github.com/amilajack/eslint-plugin-compat) with the following differences:

|                           | eslint-plugin-browser-compat | eslint-plugin-compat |
| ------------------------- | ---------------------------- | -------------------- |
| Compatibility data source | `@mdn/browser-compat-data`   | `caniuse` + `MDN`    |
| Config style              | Flat config only             | Legacy + flat config |
| ES built-in linting       | Enabled by default           | Opt-in               |

## Requirements

- ESLint ≥ 10
- Node.js ≥ 18

## Installation

```bash
# pnpm
pnpm add -D eslint eslint-plugin-browser-compat @mdn/browser-compat-data

# npm
npm install -D eslint eslint-plugin-browser-compat @mdn/browser-compat-data

# yarn
yarn add -D eslint eslint-plugin-browser-compat @mdn/browser-compat-data
```

## Quick start

```js
// eslint.config.mjs
import compat from "eslint-plugin-browser-compat";

export default [compat.configs.recommended];
```

With a `browserslist` field in your `package.json` (or a `.browserslistrc` file), the plugin will automatically pick up your targets:

```json
{
  "browserslist": ["> 0.5%", "last 2 versions", "not dead"]
}
```

## Rules

| Rule                                    | Description                                                 | Recommended |
| --------------------------------------- | ----------------------------------------------------------- | ----------- |
| [`compat/compat`](docs/rules/compat.md) | Reports API usage unsupported by configured browser targets | ✅          |

## Configure target browsers

Targets are resolved via browserslist. The plugin reads from the standard browserslist config locations (`package.json`, `.browserslistrc`, etc.) automatically.

You can also set explicit targets in your ESLint config using the `browsers` or `targets` setting:

```js
// eslint.config.mjs
import compat from "eslint-plugin-browser-compat";

export default [
  compat.configs.recommended,
  {
    settings: {
      browsers: ["chrome >= 100", "firefox >= 100", "safari >= 15"],
    },
  },
];
```

## Settings

All settings are optional and passed under the `settings` key in your ESLint config.

| Setting                   | Type                              | Default | Description                                                                                     |
| ------------------------- | --------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `browsers`                | `string[]`                        | —       | Explicit browserslist queries. Alias for `targets`.                                             |
| `targets`                 | `string[]`                        | —       | Explicit browserslist queries. Takes precedence over `browsers` when both are set.              |
| `polyfills`               | `string[]`                        | `[]`    | APIs to suppress reports for — use when your runtime includes a polyfill.                       |
| `lintAllEsApis`           | `boolean`                         | `true`  | When `true`, lint ES built-ins such as `Array.from` or `Promise.allSettled`.                    |
| `ignoreConditionalChecks` | `boolean`                         | `false` | When `false`, APIs guarded by feature detection (e.g. `if (fetch) { ... }`) are still reported. |
| `browserslistOpts`        | `{ env?: string; path?: string }` | —       | Options passed directly to the browserslist resolver.                                           |

### Polyfills

Use the `polyfills` setting to suppress reports for APIs you have polyfilled at runtime:

```js
// eslint.config.mjs
import compat from "eslint-plugin-browser-compat";

export default [
  compat.configs.recommended,
  {
    settings: {
      polyfills: [
        "Promise", // suppress an entire API and all its members
        "WebAssembly.compile", // suppress a specific static method
        "fetch", // suppress a global function
        "Array.prototype.flat", // suppress an instance method
      ],
    },
  },
];
```

## Troubleshooting

### False positives

1. **Local or imported binding** — The identifier may shadow a browser global. Imported and locally-declared bindings are not treated as browser APIs.
2. **Polyfilled API** — Add the API to `settings.polyfills`.
3. **Unexpected target set** — Run `npx browserslist` in your project to confirm which browsers are resolved.
4. **Outdated compatibility data** — Update `@mdn/browser-compat-data` to get the latest browser support entries.

### Already-handled scenarios

- Constructors imported from npm packages (e.g. `new Navigation()`) are not treated as browser globals.
- Type-only imports and TypeScript type references are ignored.
- Local object members (e.g. `rect.bottom` from `getBoundingClientRect()`) are not checked.

## Known limitations

- Computed property access (e.g. `obj[dynamicKey]`) cannot be resolved to a compatibility key and is therefore not checked.
- Some API chains may require key normalization heuristics and can still miss edge cases.
- Unknown features are treated as not-reportable instead of errors.

## Keep BCD updated

[@mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) is a peer dependency, so users can update it independently:

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
