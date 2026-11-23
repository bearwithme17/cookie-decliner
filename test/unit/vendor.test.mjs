// The vendored files must be exactly the pinned upstream bytes plus the fixed
// wrappers, and the vendoring script must refuse anything else.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PINS, DEFAULT_VERSION, WRAPPER_PARAMS, contentPrefix, CONTENT_SUFFIX, RULES_PREFIX, RULES_SUFFIX, sha256 } from '../../tools/vendor.mjs';
import { OVERRIDES, NEVER } from '../../tools/snippet-overrides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = path.join(ROOT, 'extension', 'vendor', 'autoconsent');
const read = (name) => fs.readFileSync(path.join(V, name));
const meta = JSON.parse(read('VENDORED.json'));
const pins = PINS[meta.version];

// Hashes pinned a second time, independently of tools/vendor.mjs.
const EXPECTED_18_9_0 = {
  cjs: 'a8c58d606aaf15362546fb8e923a7c08323f6b0658deddd066cf736714d6a293',
  esm: 'baa0b54aa0041ea26cecfd14fef2cde32e8d850f5edb7af484f1eebbac6149ff',
  rules: '9708da9b0f21f9d7e520eba60e489eaa00a92f303cc3298f33421a338c2c5d2a',
  license: 'fab3dd6bdab226f1c08630b1dd917e11fcb4ec5e1e020e2c16f83a0a13863e85',
};

function unwrap(buf, prefix, suffix) {
  const p = Buffer.from(prefix);
  const s = Buffer.from(suffix);
  assert.ok(buf.subarray(0, p.length).equals(p), 'prefix differs');
  assert.ok(buf.subarray(buf.length - s.length).equals(s), 'suffix differs');
  return buf.subarray(p.length, buf.length - s.length);
}

test('vendored version has pins, and they are the reviewed 18.9.0 hashes', () => {
  assert.equal(meta.version, DEFAULT_VERSION);
  assert.ok(pins, `no pins for ${meta.version}`);
  if (meta.version === '18.9.0') assert.deepEqual(pins, EXPECTED_18_9_0);
});

test('autoconsent.esm.js and LICENSE are pristine', () => {
  assert.equal(sha256(read('autoconsent.esm.js')), pins.esm);
  assert.equal(sha256(read('LICENSE')), pins.license);
  assert.match(read('LICENSE').toString(), /Mozilla Public License Version 2\.0/);
});

test('autoconsent.content.js is the wrapper around the pristine CJS bytes', () => {
  const inner = unwrap(read('autoconsent.content.js'), contentPrefix(meta.version), CONTENT_SUFFIX);
  assert.equal(sha256(inner), pins.cjs);
  assert.ok(inner.toString().startsWith('"use strict";'), 'strict mode must be the first statement of the wrapper body');
});

test('wrapper parameter list shadows console, network, storage and extension APIs', () => {
  const header = read('autoconsent.content.js').toString().split('\n')[1];
  assert.equal(header, `(function (${WRAPPER_PARAMS.join(', ')}) {`);
  for (const name of ['module', 'exports', 'console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'indexedDB', 'localStorage', 'sessionStorage', 'caches', 'chrome', 'browser']) {
    assert.ok(WRAPPER_PARAMS.includes(name), `${name} is not shadowed`);
  }
  // Only three arguments are passed, so everything after `console` is undefined inside.
  assert.equal(CONTENT_SUFFIX.trim(), '})(CD_MODULE, CD_MODULE.exports, CD_SILENT_CONSOLE);');
});

test('compact-rules.js is "export default " + the pristine JSON + ";"', async () => {
  const inner = unwrap(read('compact-rules.js'), RULES_PREFIX, RULES_SUFFIX);
  assert.equal(sha256(inner), pins.rules);
  const viaImport = (await import(pathToFileURL(path.join(V, 'compact-rules.js')).href)).default;
  assert.deepEqual(viaImport, JSON.parse(inner.toString('utf8')));
});

test('VENDORED.json records the same hashes', () => {
  assert.equal(meta.files['dist/autoconsent.cjs.js'].sha256, pins.cjs);
  assert.equal(meta.files['dist/autoconsent.esm.js'].sha256, pins.esm);
  assert.equal(meta.files['rules/compact-rules.json'].sha256, pins.rules);
  assert.equal(meta.files['LICENSE'].sha256, pins.license);
  assert.equal(meta.license, 'MPL-2.0');
});

test('snippets.generated.js: every upstream snippet is present except the opt-in ones', async () => {
  const upstream = (await import(pathToFileURL(path.join(V, 'autoconsent.esm.js')).href)).evalSnippets;
  const { SAFE_SNIPPETS } = await import(pathToFileURL(path.join(V, 'snippets.generated.js')).href);
  const expected = Object.keys(upstream).filter((id) => !NEVER.includes(id)).sort();
  assert.deepEqual(Object.keys(SAFE_SNIPPETS).sort(), expected);
  for (const id of NEVER) assert.equal(Object.hasOwn(SAFE_SNIPPETS, id), false, `${id} must not ship`);
  assert.ok(Object.isFrozen(SAFE_SNIPPETS));
  assert.equal(Object.getPrototypeOf(SAFE_SNIPPETS), null);
});

test('snippets.generated.js: unchanged snippets carry the upstream source verbatim', async () => {
  const upstream = (await import(pathToFileURL(path.join(V, 'autoconsent.esm.js')).href)).evalSnippets;
  const text = read('snippets.generated.js').toString();
  for (const [id, fn] of Object.entries(upstream)) {
    if (NEVER.includes(id) || Object.hasOwn(OVERRIDES, id)) continue;
    assert.ok(text.includes(`  ${id}: () => { try { const r = (${fn.toString()})();`), `${id} differs from upstream`);
  }
});

test('snippets.generated.js: no console use, and no snippet throws or returns a non-boolean', async () => {
  const text = read('snippets.generated.js').toString();
  assert.equal(/console\s*\./.test(text), false);
  const { SAFE_SNIPPETS } = await import(pathToFileURL(path.join(V, 'snippets.generated.js')).href);
  // In Node there is no window/document: every snippet hits its error path.
  assert.equal(typeof globalThis.window, 'undefined');
  for (const [id, fn] of Object.entries(SAFE_SNIPPETS)) {
    let result;
    assert.doesNotThrow(() => { result = fn(); }, `${id} threw`);
    assert.equal(typeof result, 'boolean', `${id} returned ${typeof result}`);
  }
  assert.equal(SAFE_SNIPPETS.EVAL_0(), true);
  assert.equal(SAFE_SNIPPETS.EVAL_MICROSOFT_0(), false);
});

test('vendor.mjs regenerates byte-identical output from pristine input and refuses tampered input', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-vendor-test-'));
  try {
    const src = path.join(tmp, 'src');
    const out = path.join(tmp, 'out');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'autoconsent.esm.js'), read('autoconsent.esm.js'));
    fs.writeFileSync(path.join(src, 'LICENSE'), read('LICENSE'));
    fs.writeFileSync(path.join(src, 'autoconsent.cjs.js'), unwrap(read('autoconsent.content.js'), contentPrefix(meta.version), CONTENT_SUFFIX));
    fs.writeFileSync(path.join(src, 'compact-rules.json'), unwrap(read('compact-rules.js'), RULES_PREFIX, RULES_SUFFIX));
    const script = path.join(ROOT, 'tools', 'vendor.mjs');

    execFileSync(process.execPath, [script, meta.version, '--from', src, '--out', out], { stdio: 'pipe' });
    for (const name of ['autoconsent.esm.js', 'autoconsent.content.js', 'compact-rules.js', 'snippets.generated.js', 'LICENSE']) {
      assert.ok(fs.readFileSync(path.join(out, name)).equals(read(name)), `${name} is not reproducible`);
    }

    // One flipped byte in the engine: must abort and write nothing.
    const out2 = path.join(tmp, 'out2');
    const cjs = fs.readFileSync(path.join(src, 'autoconsent.cjs.js'));
    cjs[cjs.length - 10] ^= 1;
    fs.writeFileSync(path.join(src, 'autoconsent.cjs.js'), cjs);
    const bad = spawnSync(process.execPath, [script, meta.version, '--from', src, '--out', out2], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /SHA-256 mismatch for dist\/autoconsent\.cjs\.js/);
    assert.equal(fs.existsSync(out2), false, 'output was written despite the mismatch');

    // A version without pins: must abort as well.
    const unpinned = spawnSync(process.execPath, [script, '0.0.1', '--from', src, '--out', out2], { encoding: 'utf8' });
    assert.notEqual(unpinned.status, 0);
    assert.match(unpinned.stderr, /no SHA-256 pins for version 0\.0\.1/);
    assert.equal(fs.existsSync(out2), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
