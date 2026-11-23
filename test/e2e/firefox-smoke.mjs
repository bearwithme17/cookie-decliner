// Firefox smoke test: installs extension/ as a temporary add-on into the installed
// Firefox (fresh throw-away profile, via web-ext) and lets the fixtures chain
// themselves; the fixture server collects what happened.
//
//   node test/e2e/firefox-smoke.mjs              headless (MOZ_HEADLESS=1)
//   CD_HEADED=1 node test/e2e/firefox-smoke.mjs  with a window
//   CD_FIREFOX=/path/to/firefox node ...         another Firefox binary
//
// Nothing drives the browser from outside, so this cannot read the developer
// tools console. It checks: banners rejected, nothing accepted, Sec-GPC on every
// request kind, navigator.globalPrivacyControl as pages see it.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = process.env.CD_EXT_DIR ? path.resolve(process.env.CD_EXT_DIR) : path.join(ROOT, 'extension');
const FIREFOX = process.env.CD_FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
const HEADED = process.env.CD_HEADED === '1';

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok: Boolean(ok) });
  process.stdout.write(`${ok ? 'ok    ' : 'NOT OK'} ${name}${!ok && info ? `\n         ${info}` : ''}\n`);
}

const FIXTURES = [
  { name: 'plain', expect: 'untouched', after: 4000 },
  { name: 'onetrust', expect: 'rejected' },
  { name: 'onetrust-settings', expect: 'rejected' },
  { name: 'cookiebot', expect: 'rejected' },
  { name: 'sourcepoint', expect: 'rejected' },
  { name: 'sourcepoint-manager', expect: 'rejected' },
  { name: 'usercentrics', expect: 'rejected' },
  { name: 'consentmanager', expect: 'rejected' },
  { name: 'didomi', expect: 'rejected' },
  { name: 'borlabs', expect: 'rejected' },
  { name: 'complianz', expect: 'rejected' },
  { name: 'generic-de', expect: 'rejected' },
  { name: 'generic-de-notwendige', expect: 'rejected' },
  { name: 'sourcepoint-wall', expect: 'untouched', after: 8000 },
  { name: 'accept-only', expect: 'untouched', after: 8000 },
  { name: 'accept-rule', expect: 'untouched', after: 8000 },
  { name: 'blocked-onetrust', expect: 'untouched', after: 14000 },
].filter((fx) => !process.env.CD_ONLY || process.env.CD_ONLY.split(',').includes(fx.name));
const has = (name) => FIXTURES.some((fx) => fx.name === name);

if (!fs.existsSync(FIREFOX)) {
  process.stdout.write(`Firefox not found at ${FIREFOX}\n`);
  process.exit(1);
}

const server = await startServer();
server.chain = FIXTURES.map(
  (fx, i) => `${server.origin}/fixtures/${fx.name}.html?frame=${encodeURIComponent(server.frameOrigin)}&chain=${i}&after=${fx.after || 20000}`,
);
const budgetMs = FIXTURES.reduce((sum, fx) => sum + (fx.after || 20000), 0) + 60000;

const child = spawn(
  process.execPath,
  [
    path.join(ROOT, 'tools', 'web-ext.mjs'), 'run',
    '--source-dir', EXT,
    '--firefox', FIREFOX,
    '--start-url', `${server.origin}/__next?i=0`,
    '--no-reload', '--no-input',
  ],
  { env: { ...process.env, ...(HEADED ? {} : { MOZ_HEADLESS: '1' }) }, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const exited = new Promise((resolve) => child.on('exit', resolve));

let exitCode = 1;
try {
  const done = await Promise.race([
    server.waitFor(() => server.events.some((e) => e.event === 'chain-done'), budgetMs),
    exited.then(() => 'exited'),
  ]);
  check('the fixture chain ran to its end in Firefox', done === true, done === 'exited' ? `web-ext exited early:\n${log.slice(-1500)}` : `timed out; last events: ${JSON.stringify(server.events.slice(-5))}`);

  for (const fx of FIXTURES) {
    const ev = server.eventsFor(fx.name);
    const visited = server.requests.some((r) => r.path === `/fixtures/${fx.name}.html`);
    if (fx.expect === 'rejected') check(`${fx.name}: rejected`, ev.includes('rejected'), `visited=${visited} events: ${ev.join(',') || '(none)'}`);
    else check(`${fx.name}: left untouched`, visited && !ev.includes('rejected') && !ev.includes('accepted') && !ev.includes('subscribed'), `visited=${visited} events: ${ev.join(',')}`);
  }
  const bad = server.events.filter((e) => e.event === 'accepted' || e.event === 'subscribed');
  check('no fixture ever reported "accepted" or "subscribed"', bad.length === 0, JSON.stringify(bad));

  const ot = server.eventsFor('onetrust');
  if (has('onetrust')) check('onetrust: reject click came after the SDK was ready', ot.includes('sdk-ready') && ot.indexOf('sdk-ready') < ot.indexOf('rejected'), ot.join(','));
  const saved = server.events.find((e) => e.fixture === 'onetrust-settings' && e.event === 'rejected');
  if (has('onetrust-settings')) check('onetrust-settings: every optional toggle was off when saving', saved && saved.detail?.stillOn?.length === 0, JSON.stringify(saved?.detail));

  // The consentmanager fixture reports {api:true} only when __cmp('setConsent', 0)
  // was called in the page's own world, i.e. through scripting.executeScript.
  const cm = server.events.find((e) => e.fixture === 'consentmanager' && e.event === 'rejected');
  if (has('consentmanager')) check('consentmanager: rejected through the page-world API (MAIN-world eval works)', cm && cm.detail?.api === true, JSON.stringify(cm?.detail));

  if (has('plain')) check('navigator.globalPrivacyControl is true for the page (top frame)', server.eventsFor('plain').includes('gpc-top:true'), server.eventsFor('plain').join(','));
  if (has('plain')) check('navigator.globalPrivacyControl is true for the page (cross-origin child frame)', server.eventsFor('frame-child').includes('gpc-frame:true'), server.eventsFor('frame-child').join(','));

  const byDest = {};
  for (const r of server.requests) (byDest[r.dest || '(none)'] ||= []).push(r);
  for (const dest of has('plain') ? ['document', 'iframe', 'script', 'style', 'image', 'empty'] : []) {
    const list = byDest[dest] || [];
    check(`Sec-GPC: 1 on every "${dest}" request (${list.length} seen)`, list.length > 0 && list.every((r) => r.gpc === '1'), JSON.stringify(list.filter((r) => r.gpc !== '1').slice(0, 3)));
  }
  const missing = server.requests.filter((r) => r.gpc !== '1');
  check(`Sec-GPC: 1 on all ${server.requests.length} requests the server received`, missing.length === 0, JSON.stringify(missing.slice(0, 5)));
  check('fixture server saw only known fixture routes', server.unknown.length === 0, server.unknown.join(' | '));

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length} passed, ${failed.length} failed (Firefox ${HEADED ? 'headed' : 'headless'}, temporary add-on)\n`);
  if (failed.length && process.env.CD_VERBOSE === '1') process.stdout.write(`\nweb-ext output:\n${log.slice(-3000)}\n`);
  exitCode = failed.length === 0 ? 0 : 1;
} finally {
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 8000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await server.close();
}
process.exit(exitCode);
