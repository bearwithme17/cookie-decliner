// Safari: a pay-or-accept site keeps its cookie when the tab leaves it and comes
// back within the grace period, and loses it once its last tab is closed. Safari
// has no browsingData API, so localStorage is kept (reported, not failed).
//
// Uses the installed Safari with the Cookie Decliner app enabled (see
// test/e2e/safari-smoke.mjs for the setup). Tabs are opened with `open` and closed
// through AppleScript, so macOS asks once whether the terminal may control Safari.
//
//   site A  http://[::1]:<pa>       shows a wall marker, sets a cookie + localStorage
//           (an address no other test uses: an open tab of the same site would
//           rightly keep its cookies)
//   site B  http://127.0.0.1:<pb>   an unrelated site with its own cookie
//
//   node test/e2e/safari-wipe.mjs
import { execFileSync } from 'node:child_process';
import http from 'node:http';

const seen = []; // { step, cookie, ls }
let wake = () => {};
const page = (body) => `<!doctype html><meta charset="utf-8"><title>t</title><body>${body}`;
let A = '';
let B = '';

function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const cookie = req.headers.cookie || '';
  const html = (body, headers = {}) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(page(body));
  };
  if (p === '/report') {
    seen.push({ step: url.searchParams.get('step'), cookie, ls: url.searchParams.get('ls') });
    wake();
    res.writeHead(204);
    return res.end();
  }
  if (p === '/favicon.ico' || p.startsWith('/apple-touch-icon')) {
    res.writeHead(204);
    return res.end();
  }
  const mode = url.searchParams.get('mode') || 'nav';
  if (p === '/wall') {
    return html(
      `<h1>Site A</h1><div class="message-container"><button class="message-button sp_choice_type_11" onclick="fetch('/report?step=ACCEPTED')">Alle akzeptieren</button>
       <button class="message-button sp_choice_type_9" onclick="fetch('/report?step=SUBSCRIBED')">Jetzt PUR abonnieren</button></div>
       <script>localStorage.setItem('cdwall','1');
       setTimeout(function(){ fetch('/report?step=before-${mode}&ls=' + localStorage.getItem('cdwall')); }, 2500);
       ${mode === 'nav' ? `setTimeout(function(){ location.href='${B}/other?mode=nav'; }, 5000);` : ''}</script>`,
      { 'set-cookie': 'cdwall=1; Max-Age=3600; Path=/' },
    );
  }
  if (p === '/other') {
    return html(
      `<h1>Site B</h1><script>setTimeout(function(){ location.href='${A}/check?mode=${mode}'; }, 5000);</script>`,
      { 'set-cookie': 'cdother=1; Max-Age=3600; Path=/' },
    );
  }
  if (p === '/check') {
    return html(
      `<h1>Site A again</h1><script>fetch('/report?step=after-${mode}&ls=' + localStorage.getItem('cdwall')).then(function(){ location.href='${B}/checkother?mode=${mode}'; });</script>`,
    );
  }
  if (p === '/checkother') {
    return html(`<h1>Site B again</h1><script>fetch('/report?step=other-${mode}');</script>`);
  }
  res.writeHead(404);
  res.end();
}

const listen = (host) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, host, () => resolve(s)); });
const sa = await listen('::1');
const sb = await listen('127.0.0.1');
A = `http://[::1]:${sa.address().port}`;
B = `http://127.0.0.1:${sb.address().port}`;

const until = (fn, ms) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), ms);
  const tick = () => { if (fn()) { clearTimeout(t); resolve(true); } };
  wake = tick;
  tick();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (step) => seen.find((s) => s.step === step);
const openUrl = (u) => execFileSync('open', ['-a', 'Safari', u]);
// Closes every Safari tab whose address starts with `prefix`.
const closeTabs = (prefix) => execFileSync('osascript', ['-e', `tell application "Safari"
  repeat with w in windows
    close (every tab of w whose URL starts with "${prefix}")
  end repeat
end tell`]);

const results = [];
const check = (name, ok, info = '') => {
  results.push(ok);
  process.stdout.write(`${ok ? 'ok    ' : 'NOT OK'} ${name}${!ok && info ? `\n         ${info}` : ''}\n`);
};
const note = (name, ok) => process.stdout.write(`note   ${name}: ${ok ? 'yes' : 'no'}\n`);

let code = 1;
try {
  // 1. Leave and come back within the grace period.
  openUrl(`${A}/wall?mode=nav`);
  await until(() => Boolean(get('other-nav')), 60000);
  // 2. Close the wall site's last tab.
  openUrl(`${A}/wall?mode=close`);
  await until(() => Boolean(get('before-close')), 30000);
  await sleep(1000);
  try {
    closeTabs(A);
  } catch (e) {
    process.stdout.write(`could not close the tab through AppleScript: ${e.message}\n`);
  }
  await sleep(4000);
  openUrl(`${A}/check?mode=close`);
  await until(() => Boolean(get('other-close')), 30000);

  const dump = JSON.stringify(seen);
  check('before leaving: the site has its cookie and localStorage', get('before-nav') && /cdwall=1/.test(get('before-nav').cookie) && get('before-nav').ls === '1', dump);
  check('never accepted or subscribed', !get('ACCEPTED') && !get('SUBSCRIBED'), dump);
  check('tab left and came back within the grace period: wall site cookie kept', get('after-nav') && /cdwall=1/.test(get('after-nav').cookie), dump);
  check('tab moved to another site: the other site keeps its cookie', get('other-nav') && /cdother=1/.test(get('other-nav').cookie), dump);
  check('before closing: the site has its cookie again', get('before-close') && /cdwall=1/.test(get('before-close').cookie), dump);
  check('tab closed: wall site cookie gone', get('after-close') && !/cdwall/.test(get('after-close').cookie), dump);
  check('tab closed: the other site keeps its cookie', get('other-close') && /cdother=1/.test(get('other-close').cookie), dump);
  note('tab closed: wall site localStorage gone (Safari has no browsingData API)', get('after-close') && get('after-close').ls === 'null');
  const failed = results.filter((r) => !r).length;
  process.stdout.write(`\n${results.length - failed} passed, ${failed} failed (Safari, wipe)\n`);
  code = failed ? 1 : 0;
} finally {
  try { closeTabs(A); closeTabs(B); } catch (e) { /* ignore */ }
  sa.close();
  sb.close();
}
process.exit(code);
