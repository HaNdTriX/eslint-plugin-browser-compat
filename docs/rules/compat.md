# compat/compat

Lint browser compatibility for API usage in source code.

## What it checks

The rule resolves API usage in code and validates support against your configured browserslist targets using @mdn/browser-compat-data.

## Configuration

```js
// eslint.config.mjs
import compat from "eslint-plugin-browser-compat";

export default [compat.configs.recommended];
```

## Options

This rule does not take rule-level options.

Use plugin settings instead:

- settings.browsers
- settings.targets
- settings.polyfills
- settings.lintAllEsApis
- settings.ignoreConditionalChecks
- settings.browserslistOpts

## Examples

Reported:

```js
fetch("/api");
```

Not reported with polyfill configuration:

```js
// eslint settings: { polyfills: ["fetch"] }
fetch("/api");
```

Not reported for local members:

```js
const rect = element.getBoundingClientRect();
console.log(rect.bottom);
```

## Notes

- Type-only imports/references are ignored.
- Imported/local bindings are not treated as browser globals.
- Computed member access cannot always be resolved.
