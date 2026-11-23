import assert from 'node:assert/strict';
import test from 'node:test';
import { EXTRA_RULES, extraRulesFor } from '../../extension/background/extra-rules.js';

const rule = (name, runContext) => ({ name, detectCmp: [{ exists: '#x' }], detectPopup: [{ visible: '#x' }], optOut: [{ click: '#x .no' }], ...(runContext ? { runContext } : {}) });
const names = (list) => list.map((r) => r.name);

test('shipped extra rules: all named cd-*, none with an optIn', () => {
  assert.ok(Object.isFrozen(EXTRA_RULES));
  for (const r of EXTRA_RULES) {
    assert.match(r.name, /^cd-/);
    assert.equal('optIn' in r, false, `${r.name} has an optIn`);
  }
});

test('default context: main frame only', () => {
  const rules = [rule('cd-a')];
  assert.deepEqual(names(extraRulesFor('https://a.example/', true, rules)), ['cd-a']);
  assert.deepEqual(names(extraRulesFor('https://a.example/', false, rules)), []);
});

test('frame-only and both-context rules', () => {
  const rules = [rule('cd-frame', { main: false, frame: true }), rule('cd-both', { main: true, frame: true }), rule('cd-main', { main: true, frame: false })];
  assert.deepEqual(names(extraRulesFor('https://a.example/', true, rules)), ['cd-both', 'cd-main']);
  assert.deepEqual(names(extraRulesFor('https://a.example/', false, rules)), ['cd-frame', 'cd-both']);
});

test('urlPattern is applied; a broken pattern excludes the rule instead of throwing', () => {
  const rules = [rule('cd-site', { urlPattern: '^https://(www\\.)?example\\.de/' }), rule('cd-broken', { urlPattern: '([' }), rule('cd-any')];
  assert.deepEqual(names(extraRulesFor('https://www.example.de/x', true, rules)), ['cd-site', 'cd-any']);
  assert.deepEqual(names(extraRulesFor('https://other.example/', true, rules)), ['cd-any']);
});

test('rules without the cd- prefix or without a name are dropped', () => {
  const rules = [rule('borlabs'), { detectCmp: [] }, null, rule('cd-ok')];
  assert.deepEqual(names(extraRulesFor('https://a.example/', true, rules)), ['cd-ok']);
});
