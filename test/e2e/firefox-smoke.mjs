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
import { selectFixtures, chainUrls, budgetMs as chainBudget, runChecks } from './smoke-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = process.env.CD_EXT_DIR ? path.resolve(process.env.CD_EXT_DIR) : path.join(ROOT, 'extension');
const FIREFOX = process.env.CD_FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
const HEADED = process.env.CD_HEADED === '1';

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok: Boolean(ok) });
  process.stdout.write(`${ok ? 'ok    ' : 'NOT OK'} ${name}${!ok && info ? `\n         ${info}` : ''}\n`);
}

const FIXTURES = selectFixtures();
const has = (name) => FIXTURES.some((fx) => fx.name === name);

if (!fs.existsSync(FIREFOX)) {
  process.stdout.write(`Firefox not found at ${FIREFOX}\n`);
  process.exit(1);
}

const server = await startServer();
server.chain = chainUrls(server, FIXTURES);
const budgetMs = chainBudget(FIXTURES);

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

  runChecks(server, FIXTURES, check);

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
