// Safari smoke test: opens the fixture chain in the installed Safari, where the
// Cookie Decliner app built by tools/build-safari.mjs is enabled, and checks what
// the fixture server recorded. Safari cannot be driven headless, so a window opens.
//
//   node test/e2e/safari-smoke.mjs
//
// One-time setup in Safari (see INSTALLATION.md):
//   - open dist/safari/Cookie Decliner.app once, so Safari knows the extension;
//   - ad-hoc builds only: Develop → Allow Unsigned Extensions (resets when Safari quits);
//   - Settings → Extensions: turn on Cookie Decliner and allow it on every website.

import { execFileSync } from 'node:child_process';
import { startServer } from './server.mjs';
import { selectFixtures, chainUrls, budgetMs, runChecks } from './smoke-checks.mjs';

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok: Boolean(ok) });
  process.stdout.write(`${ok ? 'ok    ' : 'NOT OK'} ${name}${!ok && info ? `\n         ${info}` : ''}\n`);
}

// Safari sometimes restarts a page load internally (a fraction of a second after
// the first try, e.g. when it moves the page to another process). That repeated
// request can go out before the extension's header rule applies to it. The
// strict header checks for page loads are replaced by the safariGpc check below.
const SKIP = {
  'Sec-GPC: 1 on every "document" request': 'checked by the Safari rule below',
  'Sec-GPC: 1 on all ': 'checked by the Safari rule below',
};

const FIXTURES = selectFixtures();
const server = await startServer();
server.chain = chainUrls(server, FIXTURES);

let exitCode = 1;
try {
  execFileSync('open', ['-a', 'Safari', `${server.origin}/__next?i=0`]);
  const done = await server.waitFor(() => server.events.some((e) => e.event === 'chain-done'), budgetMs(FIXTURES));
  check('the fixture chain ran to its end in Safari', done === true, `timed out; last events: ${JSON.stringify(server.events.slice(-5))}`);
  runChecks(server, FIXTURES, check, SKIP);
  {
    const missing = server.requests.filter((r) => r.gpc !== '1');
    const unexplained = missing.filter((r) => {
      if (r.dest !== 'document') return true;
      // Explained only as a repeat of the same page that did carry the header just before.
      return !server.requests.some((q) => q !== r && q.path === r.path && q.dest === 'document' && q.gpc === '1' && q.t <= r.t && r.t - q.t < 1500);
    });
    check(`Sec-GPC: 1 on all ${server.requests.length} requests, except Safari's internal repeats of a page load (${missing.length - unexplained.length} seen)`, unexplained.length === 0, JSON.stringify(unexplained.slice(0, 5)));
  }
  for (const e of server.events.filter((x) => x.event === 'cd-debug')) process.stdout.write(`debug ${e.fixture}: ${typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}\n`);
  // For every path that once came without Sec-GPC, show all its requests in order.
  const noGpc = new Set(server.requests.filter((r) => r.gpc !== '1').map((r) => r.path));
  for (const p of noGpc) {
    const list = server.requests.map((r, i) => ({ i, ...r })).filter((r) => r.path === p);
    process.stdout.write(`requests for ${p}: ${list.map((r) => `#${r.i} ${r.dest || '-'} ${r.mode} purpose=${r.purpose || '-'} gpc=${r.gpc} t=${r.t - server.requests[0].t}`).join(' | ')}\n`);
  }
  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length} passed, ${failed.length} failed (Safari)\n`);
  if (failed.length && !server.events.some((e) => e.event === 'rejected')) {
    process.stdout.write('Nothing was rejected at all: is the extension enabled and allowed on every website in Safari?\n');
  }
  exitCode = failed.length === 0 ? 0 : 1;
} finally {
  // Close the test tab, so later runs do not see this site as still open.
  for (const o of [server.origin, server.frameOrigin]) {
    try {
      execFileSync('osascript', ['-e', `tell application "Safari"\n  repeat with w in windows\n    close (every tab of w whose URL starts with "${o}")\n  end repeat\nend tell`]);
    } catch (e) {
      // Safari closed or not allowed to be controlled: leave the tab
    }
  }
  await server.close();
}
process.exit(exitCode);
