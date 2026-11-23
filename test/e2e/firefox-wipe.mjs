// Firefox: a pay-or-accept site keeps its cookies and localStorage when the tab
// leaves it and comes back within the grace period (sign-in, payment), and loses
// them once its tab is closed. The wipe after the grace period itself is covered
// by test/unit/wipe.test.mjs.
//
// Own Firefox instance with a throw-away profile via web-ext; two local sites:
//   site A  http://localhost:<pa>   shows a wall marker, sets a cookie + localStorage
//   site B  http://127.0.0.1:<pb>   an unrelated site with its own cookie
//
//   node test/e2e/firefox-wipe.mjs            headless
//   CD_HEADED=1 node test/e2e/firefox-wipe.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = process.env.CD_EXT_DIR ? path.resolve(process.env.CD_EXT_DIR) : path.join(ROOT, 'extension');
const FIREFOX = process.env.CD_FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
const HEADED = process.env.CD_HEADED === '1';
if (!fs.existsSync(FIREFOX)) {
  process.stdout.write(`Firefox not found at ${FIREFOX}\n`);
  process.exit(1);
}

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
  if (p === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  const mode = url.searchParams.get('mode') || 'nav';
  if (p === '/wall') {
    // The wall marker sits in the top document; the extension must never click it.
    return html(
      `<h1>Site A</h1><div class="message-container"><button class="message-button sp_choice_type_11" onclick="fetch('/report?step=ACCEPTED')">Alle akzeptieren</button>
       <button class="message-button sp_choice_type_9" onclick="fetch('/report?step=SUBSCRIBED')">Jetzt PUR abonnieren</button></div>
       <script>localStorage.setItem('cdwall','1');
       setTimeout(function(){ fetch('/report?step=before&ls=' + localStorage.getItem('cdwall')); }, 2500);
       setTimeout(function(){ ${mode === 'close' ? `window.open('${B}/other?mode=close'); setTimeout(function(){ window.close(); }, 1500);` : `location.href='${B}/other?mode=nav';`} }, ${Number(process.env.CD_STAY || 5000)});</script>`,
      { 'set-cookie': 'cdwall=1; Max-Age=3600; Path=/' },
    );
  }
  if (p === '/other') {
    return html(
      `<h1>Site B</h1><script>setTimeout(function(){ location.href='${A}/check?mode=${mode}'; }, ${mode === 'close' ? 7000 : 5000});</script>`,
      { 'set-cookie': 'cdother=1; Max-Age=3600; Path=/' },
    );
  }
  if (p === '/check') {
    return html(
      `<h1>Site A again</h1><script>fetch('/report?step=after-${mode}&ls=' + localStorage.getItem('cdwall')).then(function(){ location.href='${B}/checkother?mode=${mode}'; });</script>`,
    );
  }
  if (p === '/checkother') {
    return html(`<h1>Site B again</h1><script>fetch('/report?step=other-${mode}').then(function(){ ${mode === 'nav' ? `location.href='${A}/wall?mode=close';` : `fetch('/report?step=done');`} });</script>`);
  }
  res.writeHead(404);
  res.end();
}

const listen = () => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const sa = await listen();
const sb = await listen();
A = `http://localhost:${sa.address().port}`;
B = `http://127.0.0.1:${sb.address().port}`;

const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'web-ext.mjs'), 'run', '--source-dir', EXT, '--firefox', FIREFOX, '--start-url', `${A}/wall?mode=nav`, '--no-reload', '--no-input', '--pref', 'dom.allow_scripts_to_close_windows=true', '--pref', 'dom.disable_open_during_load=false'], {
  env: { ...process.env, ...(HEADED ? {} : { MOZ_HEADLESS: '1' }) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const exited = new Promise((resolve) => child.on('exit', resolve));

const until = (fn, ms) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), ms);
  const tick = () => { if (fn()) { clearTimeout(t); resolve(true); } };
  wake = tick;
  tick();
});

const results = [];
const check = (name, ok, info = '') => {
  results.push(ok);
  process.stdout.write(`${ok ? 'ok    ' : 'NOT OK'} ${name}${!ok && info ? `\n         ${info}` : ''}\n`);
};
const get = (step) => seen.find((s) => s.step === step);

let code = 1;
try {
  await Promise.race([until(() => Boolean(get('done')), 75000 + 2 * Number(process.env.CD_STAY || 0)), exited]);
  const dump = JSON.stringify(seen);
  check('before leaving: the site has its cookie and localStorage', get('before') && /cdwall=1/.test(get('before').cookie) && get('before').ls === '1', dump);
  check('never accepted or subscribed', !get('ACCEPTED') && !get('SUBSCRIBED'), dump);
  check('tab left and came back within the grace period: wall site cookie kept', get('after-nav') && /cdwall=1/.test(get('after-nav').cookie), dump);
  check('tab left and came back within the grace period: wall site localStorage kept', get('after-nav') && get('after-nav').ls === '1', dump);
  check('tab moved to another site: the other site keeps its cookie', get('other-nav') && /cdother=1/.test(get('other-nav').cookie), dump);
  check('tab closed: wall site cookie gone', get('after-close') && !/cdwall/.test(get('after-close').cookie), dump);
  check('tab closed: wall site localStorage gone', get('after-close') && get('after-close').ls === 'null', dump);
  check('tab closed: the other site keeps its cookie', get('other-close') && /cdother=1/.test(get('other-close').cookie), dump);
  const failed = results.filter((r) => !r).length;
  process.stdout.write(`\n${results.length - failed} passed, ${failed} failed (Firefox ${HEADED ? 'headed' : 'headless'}, wipe)\n`);
  if (failed && process.env.CD_VERBOSE === '1') process.stdout.write(log.slice(-2000) + '\n');
  code = failed ? 1 : 0;
} finally {
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 8000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  sa.close();
  sb.close();
}
process.exit(code);
