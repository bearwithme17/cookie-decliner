# Third-party notices

## @duckduckgo/autoconsent 18.9.0

- Licence: Mozilla Public License 2.0. The full text ships at `extension/vendor/autoconsent/LICENSE`.
- Source code: https://github.com/duckduckgo/autoconsent
- Release used: https://registry.npmjs.org/@duckduckgo/autoconsent/-/autoconsent-18.9.0.tgz
- Hashes of the files taken from it, and their place in the tarball: `extension/vendor/autoconsent/VENDORED.json`

Files in `extension/vendor/autoconsent/`:

| File | Relation to upstream |
|---|---|
| `autoconsent.esm.js` | Unmodified copy of `dist/autoconsent.esm.js`. |
| `LICENSE` | Unmodified copy. |
| `autoconsent.content.js` | Modified: the unmodified bytes of `dist/autoconsent.cjs.js` between a two-line function header and a one-line footer. |
| `compact-rules.js` | Modified: `export default ` + the unmodified bytes of `rules/compact-rules.json` + `;`. |
| `snippets.generated.js` | Modified: the functions of upstream's `lib/eval-snippets.ts` (as compiled in the ESM bundle), each wrapped in try/catch. Three are replaced and ten opt-in snippets are left out; `tools/snippet-overrides.mjs` lists them with reasons. |

The three modified files remain under the MPL-2.0. They are produced by `tools/vendor.mjs`, which is the complete record of the modifications.

Everything outside `extension/vendor/autoconsent/` is this project's own code. It is also published under the MPL-2.0 (see `LICENSE` in the project root), but it is a separate work from autoconsent.

## Public Suffix List

- Licence: Mozilla Public License 2.0.
- Source: https://publicsuffix.org/list/public_suffix_list.dat
- `extension/background/psl.js` holds its rules (Unicode names converted to punycode, comments removed). It is produced by `tools/vendor-psl.mjs`, which checks the downloaded list against a pinned SHA-256.

## Development-only dependencies

`jsdom`, `playwright` and `web-ext` are used to run the tests, and `esbuild` bundles the background script for the Safari build. They are installed into `node_modules/`; the Safari build's background.js holds this project's and autoconsent's code only.
