// Proxy for "safe to import in an extension service worker": the modules the
// background imports must load in an environment without window or document
// and must not touch the network or print anything while loading.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const url = (rel) => pathToFileURL(path.join(EXT, rel)).href;

function runIsolated(code) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
}

test('pristine ESM, compact rules and snippets import with no DOM globals and no output', () => {
  const r = runIsolated(`
    if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('DOM globals present');
    globalThis.fetch = () => { throw new Error('network use during import'); };
    const lib = await import(${JSON.stringify(url('vendor/autoconsent/autoconsent.esm.js'))});
    const rules = (await import(${JSON.stringify(url('vendor/autoconsent/compact-rules.js'))})).default;
    const snip = await import(${JSON.stringify(url('vendor/autoconsent/snippets.generated.js'))});
    const main = lib.filterCompactRules(rules, { url: 'https://www.example.de/', mainFrame: true });
    const frame = lib.filterCompactRules(rules, { url: 'https://cdn.privacy-mgmt.com/index.html?message_id=1', mainFrame: false });
    process.stdout.write(JSON.stringify({
      exports: Object.keys(lib).sort(),
      rules: [rules.v, rules.r.length, rules.s.length],
      main: [main.v, main.r.length, JSON.stringify(main).length],
      frame: [frame.v, frame.r.length, JSON.stringify(frame).length],
      snippets: Object.keys(snip.SAFE_SNIPPETS).length,
    }));
  `);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.exports, ['decodeRules', 'default', 'encodeRules', 'evalSnippets', 'filterCMPs', 'filterCompactRules']);
  assert.equal(out.rules[0], 1);
  assert.ok(out.rules[1] > 1000, 'expected more than 1000 rules');
  assert.ok(out.main[1] > 500 && out.main[2] < 400_000, `main-frame payload: ${out.main}`);
  assert.ok(out.frame[1] > 0 && out.frame[1] < 50 && out.frame[2] < 20_000, `sub-frame payload: ${out.frame}`);
  assert.ok(out.snippets > 70);
});

test('background.js itself imports with only a minimal extension API present', () => {
  const r = runIsolated(`
    let listeners = 0;
    globalThis.chrome = { runtime: { id: 'x', onMessage: { addListener() { listeners++; } } }, scripting: {} };
    await import(${JSON.stringify(url('background.js'))});
    process.stdout.write(String(listeners));
  `);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, '1', 'exactly one onMessage listener, registered during module evaluation');
});
