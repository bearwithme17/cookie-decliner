// The manifest is the extension's whole capability list. Pin it exactly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

// Update these two lists together with the manifest when a feature needs more
// (the cookie wipe for pay-or-consent sites will add cookies, browsingData,
// storage and possibly tabs; the options page adds options_ui).
const EXPECTED_PERMISSIONS = ['alarms', 'browsingData', 'cookies', 'declarativeNetRequestWithHostAccess', 'scripting', 'storage'];
const EXPECTED_TOP_LEVEL_KEYS = [
  'background', 'browser_specific_settings', 'content_scripts', 'declarative_net_request', 'description',
  'host_permissions', 'icons', 'manifest_version', 'minimum_chrome_version', 'name', 'options_ui', 'permissions', 'version',
];
const FORBIDDEN_PERMISSIONS = [
  'tabs',
  'webRequest', 'webRequestBlocking', 'declarativeNetRequestFeedback', 'history', 'webNavigation', 'downloads',
  'nativeMessaging', 'management', 'debugger', 'proxy', 'identity', 'topSites', 'bookmarks', 'clipboardRead',
  'notifications', 'geolocation', 'unlimitedStorage',
];
const FORBIDDEN_KEYS = ['update_url', 'web_accessible_resources', 'externally_connectable', 'content_security_policy', 'optional_permissions', 'optional_host_permissions', 'key', 'oauth2', 'sandbox'];

test('manifest version and exact permission set', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), EXPECTED_PERMISSIONS);
  assert.deepEqual(manifest.host_permissions, ['*://*/*']);
  for (const p of FORBIDDEN_PERMISSIONS) assert.equal(manifest.permissions.includes(p), false, `${p} must not be requested`);
});

test('no unexpected top-level keys; forbidden keys absent', () => {
  assert.deepEqual(Object.keys(manifest).sort(), EXPECTED_TOP_LEVEL_KEYS);
  for (const k of FORBIDDEN_KEYS) assert.equal(k in manifest, false, `${k} must be absent`);
  assert.equal('update_url' in (manifest.browser_specific_settings.gecko || {}), false);
});

test('background: one module, both browser keys', () => {
  assert.deepEqual(manifest.background, { service_worker: 'background.js', scripts: ['background.js'], type: 'module' });
  assert.ok(fs.existsSync(path.join(EXT, 'background.js')));
});

test('gecko settings: id, minimum version, no data collection', () => {
  const gecko = manifest.browser_specific_settings.gecko;
  assert.equal(gecko.id, 'cookie-decliner@bearwithme17.github.io');
  assert.equal(gecko.strict_min_version, '140.0');
  assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
  assert.equal(manifest.minimum_chrome_version, '121');
});

test('content scripts: MAIN-world GPC script and the isolated engine, every frame, document_start', () => {
  assert.equal(manifest.content_scripts.length, 2);
  const [main, isolated] = manifest.content_scripts;
  for (const cs of manifest.content_scripts) {
    assert.deepEqual(cs.matches, ['*://*/*']);
    assert.equal(cs.run_at, 'document_start');
    assert.equal(cs.all_frames, true);
    assert.equal(cs.match_about_blank, true);
    assert.equal(cs.match_origin_as_fallback, true);
    assert.equal('css' in cs, false);
    for (const f of cs.js) assert.ok(fs.existsSync(path.join(EXT, f)), `${f} is missing`);
  }
  assert.equal(main.world, 'MAIN');
  assert.deepEqual(main.js, ['content/gpc-main.js']);
  assert.equal('world' in isolated, false);
  assert.deepEqual(isolated.js, [
    'content/00-shim.js',
    'vendor/autoconsent/autoconsent.content.js',
    'content/10-heuristic.js',
    'content/20-supervisor.js',
    'content/30-watch.js',
  ]);
  assert.deepEqual(manifest.options_ui, { page: 'options/options.html', open_in_tab: false });
});

test('declarativeNetRequest: one static ruleset that only sets Sec-GPC: 1', () => {
  assert.deepEqual(manifest.declarative_net_request, { rule_resources: [{ id: 'gpc', enabled: true, path: 'rules/gpc.json' }] });
  const rules = JSON.parse(fs.readFileSync(path.join(EXT, 'rules', 'gpc.json'), 'utf8'));
  assert.equal(rules.length, 3);
  assert.deepEqual(rules.map((r) => r.id), [1, 2, 3]);
  for (const rule of rules) {
    assert.deepEqual(rule.action, { type: 'modifyHeaders', requestHeaders: [{ header: 'Sec-GPC', operation: 'set', value: '1' }] });
    assert.equal(rule.condition.urlFilter, rule.id === 3 ? '|ws' : '|http');
    assert.equal('responseHeaders' in rule.action, false);
  }
  // '|http' never matches ws:// or wss://, so WebSocket handshakes get their own rule.
  assert.deepEqual(rules[2].condition.resourceTypes, ['websocket']);
  // Rule 1 names main_frame because a condition without resourceTypes excludes it.
  assert.deepEqual(rules[0].condition.resourceTypes, ['main_frame']);
  assert.equal('resourceTypes' in rules[1].condition, false);
});

test('every file in extension/ is accounted for (nothing stray ships)', () => {
  const walk = (dir, base = '') => fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, path.join(base, e.name)) : [path.join(base, e.name)]));
  // Chrome writes _metadata/generated_indexed_rulesets/ into an unpacked extension
  // when it indexes rules/gpc.json. That folder is Chrome's, holds only the
  // compiled rule file, and is ignored here.
  const shipped = walk(EXT).filter((f) => !f.endsWith('.DS_Store') && !f.startsWith('_metadata' + path.sep));
  assert.deepEqual(shipped.sort(), [
    'background.js',
    'background/extra-rules.js',
    'background/psl.js',
    'background/wipe.js',
    'content/00-shim.js',
    'content/10-heuristic.js',
    'content/20-supervisor.js',
    'content/30-watch.js',
    'content/gpc-main.js',
    'icons/icon-128.png',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-96.png',
    'manifest.json',
    'options/options.html',
    'options/options.js',
    'rules/gpc.json',
    'vendor/autoconsent/LICENSE',
    'vendor/autoconsent/VENDORED.json',
    'vendor/autoconsent/autoconsent.content.js',
    'vendor/autoconsent/autoconsent.esm.js',
    'vendor/autoconsent/compact-rules.js',
    'vendor/autoconsent/snippets.generated.js',
  ]);
});

test('icons: every size the manifest names exists as a square PNG of that size', () => {
  for (const [size, file] of Object.entries(manifest.icons)) {
    const buf = fs.readFileSync(path.join(EXT, file));
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', file);
    assert.equal(buf.readUInt32BE(16), Number(size), file + ' width');
    assert.equal(buf.readUInt32BE(20), Number(size), file + ' height');
  }
});
