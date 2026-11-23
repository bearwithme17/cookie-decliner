// Static proof obligations for "no logs": our own code contains no logging,
// network, storage or dynamic-code primitive at all, and the vendored engine
// contains only the reviewed, counted occurrences.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentPrefix, CONTENT_SUFFIX } from '../../tools/vendor.mjs';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const walk = (dir, base = '') => fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, path.join(base, e.name)) : [path.join(base, e.name)]));
const OWN = walk(EXT).filter((f) => !f.startsWith('vendor' + path.sep) && /\.(js|json|html|css)$/.test(f));

// Substrings that must not occur anywhere in our own files, comments included.
// Extend this list, never shorten it. (When the cookie wipe and the options page
// arrive they need chrome.storage / chrome.cookies / chrome.browsingData; allow
// those per file below instead of deleting entries here.)
const FORBIDDEN = [
  'console.', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches.', 'document.cookie', '.storage', '.cookies',
  'eval(', 'new Function', 'setTimeout("', "setTimeout('", '.connect(', 'connectNative', 'sendNativeMessage',
  '.history', '.tabs.', 'webRequest', 'browsingData', 'http://', 'https://', 'innerHTML', 'document.write',
  'debugger', 'alert(', 'postMessage',
];
const ALLOWED = {
  // file (posix path) -> substrings permitted in that file
  // The cookie wipe: session-area tab list, the two settings, cookie and site-data deletion.
  'background/wipe.js': ['.storage', '.cookies', '.tabs.', 'browsingData', 'localStorage', 'indexedDB', 'http://', 'https://'],
  // Tab close / navigation events and the "hide the wall" message to the top frame.
  'background.js': ['.tabs.'],
  // The two switches.
  'options/options.js': ['.storage'],
  'manifest.json': ['browsingData'],
};

test('settings are the only thing written to the local storage area', () => {
  const wipe = fs.readFileSync(path.join(EXT, 'background', 'wipe.js'), 'utf8');
  assert.equal(/storage\.local\.(set|remove|clear)/.test(wipe), false, 'wipe.js only reads settings');
  assert.equal((wipe.match(/storage\.session\.set\(/g) || []).length, 1);
  assert.equal(/storage\.sync/.test(wipe), false);
  const options = fs.readFileSync(path.join(EXT, 'options', 'options.js'), 'utf8');
  assert.equal((options.match(/storage\.local\.set\(/g) || []).length, 1);
  assert.match(options, /change\[key\] = boxes\[key\]\.checked === true/);
  for (const f of OWN.filter((f) => f.startsWith('content'))) {
    const text = fs.readFileSync(path.join(EXT, f), 'utf8');
    assert.equal(/\bstorage\b/.test(text.replace(/\/\/.*$/gm, '')), false, `${f} must not use storage`);
  }
});

test('own files exist and are scanned', () => {
  assert.ok(OWN.includes('background.js'));
  assert.ok(OWN.includes(path.join('content', '20-supervisor.js')));
  assert.ok(OWN.length >= 7, OWN.join(','));
});

for (const file of OWN) {
  test(`no logging / network / storage primitive in ${file}`, () => {
    const text = fs.readFileSync(path.join(EXT, file), 'utf8');
    const allowed = ALLOWED[file.split(path.sep).join('/')] || [];
    for (const token of FORBIDDEN) {
      if (allowed.includes(token)) continue;
      assert.equal(text.includes(token), false, `"${token}" found in ${file}`);
    }
  });
}

test('only three message shapes are ever sent to the background', () => {
  const text = fs.readFileSync(path.join(EXT, 'content', '20-supervisor.js'), 'utf8');
  const sends = text.match(/sendMessage\(/g) || [];
  assert.equal(sends.length, 1, 'exactly one sendMessage call site (inside ask())');
  const asks = [...text.matchAll(/ask\((\{[^}]*\})\)/g)].map((m) => m[1].replace(/\s+/g, ' '));
  assert.deepEqual(asks.sort(), ["{ t: 'eval', s: msg.snippetId }", "{ t: 'init' }"]);
  const watch = fs.readFileSync(path.join(EXT, 'content', '30-watch.js'), 'utf8');
  assert.equal((watch.match(/sendMessage\(/g) || []).length, 1, 'one sendMessage call site in 30-watch.js (inside tell())');
  const tells = [...watch.matchAll(/tell\((\{[^}]*\})\)/g)].map((m) => m[1].replace(/\s+/g, ' '));
  assert.deepEqual(tells, ["{ t: 'wall' }"]);
});

test('generated page-world snippets contain no console use', () => {
  const text = fs.readFileSync(path.join(EXT, 'vendor', 'autoconsent', 'snippets.generated.js'), 'utf8');
  assert.equal(/console\s*[.[]/.test(text), false);
  for (const token of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'indexedDB', 'sessionStorage', 'importScripts']) {
    assert.equal(text.includes(token), false, `"${token}" found in snippets`);
  }
});

// The engine as shipped to pages. `console` is shadowed by a no-op there, so
// console calls are inert; the rest must match this reviewed inventory exactly.
// A new upstream version that changes any count fails here and forces a review.
test('vendored engine: network/storage tokens match the reviewed inventory', () => {
  const full = fs.readFileSync(path.join(EXT, 'vendor', 'autoconsent', 'autoconsent.content.js'), 'utf8');
  const meta = JSON.parse(fs.readFileSync(path.join(EXT, 'vendor', 'autoconsent', 'VENDORED.json'), 'utf8'));
  const text = full.slice(contentPrefix(meta.version).length, full.length - CONTENT_SUFFIX.length);
  const count = (re) => (text.match(re) || []).length;
  const inventory = {
    'fetch(': count(/\bfetch\s*\(/g),
    XMLHttpRequest: count(/XMLHttpRequest/g),
    sendBeacon: count(/sendBeacon/g),
    WebSocket: count(/WebSocket/g),
    EventSource: count(/EventSource/g),
    importScripts: count(/importScripts/g),
    indexedDB: count(/indexedDB/g),
    sessionStorage: count(/sessionStorage/g),
    'caches.': count(/\bcaches\./g),
    'chrome.': count(/\bchrome\./g),
    'browser.': count(/\bbrowser\./g),
    'eval(': count(/\beval\s*\(/g),
    'new Function': count(/new Function/g),
    'localStorage.setItem': count(/localStorage\.setItem/g),
    // Reads only, all inside page-world snippet sources (never executed in the
    // content script; `localStorage` is undefined inside the wrapper anyway).
    'localStorage.getItem': count(/localStorage\.getItem/g),
    // 17 reads inside snippet sources + 2 in the engine (TikTok check, cookieContains step).
    'document.cookie': count(/document\.cookie/g),
    'document.cookie =': count(/document\.cookie\s*=[^=]/g),
  };
  assert.deepEqual(inventory, {
    'fetch(': 0,
    XMLHttpRequest: 0,
    sendBeacon: 0,
    WebSocket: 0,
    EventSource: 0,
    importScripts: 0,
    indexedDB: 0,
    sessionStorage: 0,
    'caches.': 0,
    'chrome.': 0,
    'browser.': 0,
    'eval(': 0,
    'new Function': 0,
    'localStorage.setItem': 0,
    'localStorage.getItem': 6,
    'document.cookie': 19,
    'document.cookie =': 0,
  });
});
