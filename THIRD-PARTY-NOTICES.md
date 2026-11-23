# Third-party notices

## @duckduckgo/autoconsent 18.9.0

- Licence: Mozilla Public License 2.0. The full text ships at `extension/vendor/autoconsent/LICENSE`.
- Source code: https://github.com/duckduckgo/autoconsent
- Release used: https://registry.npmjs.org/@duckduckgo/autoconsent/-/autoconsent-18.9.0.tgz
- Hashes and download URLs of the files taken from it: `extension/vendor/autoconsent/VENDORED.json`

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

## Development-only dependencies

`jsdom`, `playwright` and `web-ext` are used to run the tests. They are installed into `node_modules/` and are not part of the extension.
