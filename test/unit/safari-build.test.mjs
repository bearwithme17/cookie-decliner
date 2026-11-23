// tools/build-safari.mjs: the manifest changes made for Safari.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { safariManifest } from '../../tools/build-safari.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));

test('Safari manifest: classic background, no browsingData, same scripts and rules', () => {
  const m = safariManifest(manifest);
  assert.deepEqual(m.background, { service_worker: 'background.js' }, 'Safari loads no module background');
  assert.equal(m.permissions.includes('browsingData'), false, 'Safari has no browsingData API');
  assert.deepEqual(m.permissions, manifest.permissions.filter((p) => p !== 'browsingData'));
  assert.deepEqual(m.host_permissions, manifest.host_permissions);
  assert.deepEqual(m.declarative_net_request, manifest.declarative_net_request);
  assert.deepEqual(m.content_scripts.map((c) => c.js), manifest.content_scripts.map((c) => c.js), 'no extra (debug) content script');
  assert.equal(m.content_scripts[0].world, 'MAIN', 'the GPC getter still runs in the page world');
  assert.equal(m.version, manifest.version);
  assert.equal(m.browser_specific_settings.gecko.id, manifest.browser_specific_settings.gecko.id);
  assert.notEqual(m, manifest);
  assert.equal(manifest.background.type, 'module', 'the source manifest is not changed');
});
