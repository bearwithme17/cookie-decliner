#!/usr/bin/env node
// Developer-time tool, never run by the tests: opens real sites in Playwright's
// Chromium with extension/ loaded (fresh throw-away profile) and prints what the
// extension's content script concluded in each frame, plus whether a known
// banner container is still visible. The only network traffic is the browser
// loading the sites named on the command line.
//
//   node tools/live-probe.mjs https://www.heise.de/ https://www.zeit.de/
//   CD_HEADED=1 CD_WAIT=30000 node tools/live-probe.mjs <url>...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const urls = process.argv.slice(2);
const WAIT = Number(process.env.CD_WAIT) || 20000;
if (urls.length === 0) {
  process.stderr.write('usage: node tools/live-probe.mjs <url>...\n');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BANNERS = "#onetrust-banner-sdk,#onetrust-pc-sdk,#usercentrics-root,#usercentrics-cmp-ui,#CybotCookiebotDialog,div[id^='sp_message_container_'],#cmpbox,#didomi-popup,#didomi-notice,.cmplz-cookiebanner,#BorlabsCookieBox,.brlbs-cmpnt-dialog,#qc-cmp2-ui,.fc-consent-root,#truste-consent-track,.klaro .cookie-notice,.klaro .cookie-modal";

async function statuses(context, target) {
  const out = [];
  let cdp;
  try {
    cdp = await context.newCDPSession(target);
  } catch {
    return out; // same-process child frame: already covered by its page's session
  }
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', (e) => contexts.push(e.context));
  await cdp.send('Runtime.enable');
  await sleep(300);
  for (const c of contexts.filter((x) => x.name === 'Cookie Decliner')) {
    const r = await cdp
      .send('Runtime.evaluate', { contextId: c.id, returnByValue: true, expression: 'JSON.stringify({host: location.host, path: location.pathname.slice(0, 40), top: window.top === window, size: innerWidth + "x" + innerHeight, s: CD.status, cmp: CD.engine && CD.engine.foundCmp ? CD.engine.foundCmp.name : null})' })
      .catch(() => null);
    if (r?.result?.value) out.push(JSON.parse(r.result.value));
  }
  await cdp.detach().catch(() => {});
  return out;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-live-'));
const hadMetadata = fs.existsSync(path.join(EXT, '_metadata'));
const context = await chromium.launchPersistentContext(dir, {
  channel: 'chromium',
  headless: process.env.CD_HEADED !== '1',
  locale: 'de-DE',
  viewport: { width: 1366, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  await Promise.all(
    urls.map(async (url) => {
      const page = await context.newPage();
      const lines = [`== ${url}`];
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await sleep(WAIT);
        const all = [...(await statuses(context, page))];
        for (const f of page.frames()) if (f !== page.mainFrame()) all.push(...(await statuses(context, f)));
        for (const f of all.filter((x) => x.top || x.s.runs > 0 && (x.s.acted || x.cmp))) {
          lines.push(`   ${f.top ? 'top  ' : 'frame'} ${f.host}${f.top ? '' : f.path} ${f.size}  cmp=${f.cmp}  lifecycle=${f.s.lifecycle} acted=${f.s.acted} done=${f.s.done} running=${f.s.running}`);
        }
        lines.push(`   frames with our content script: ${all.length}, with an engine run: ${all.filter((x) => x.s.runs > 0).length}`);
        const dom = await page.evaluate((sel) => {
          const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 5 && r.height > 5 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
          return {
            visible: [...document.querySelectorAll(sel)].filter(vis).map((el) => el.id || el.className).slice(0, 5),
            hidden: [...document.querySelectorAll(sel)].filter((el) => !vis(el)).map((el) => el.id || el.className).slice(0, 5),
            scrollLocked: getComputedStyle(document.documentElement).overflowY === 'hidden' || getComputedStyle(document.body).overflowY === 'hidden',
            gpc: navigator.globalPrivacyControl,
          };
        }, BANNERS);
        lines.push(`   known banner containers still visible: ${JSON.stringify(dom.visible)}  hidden/handled: ${JSON.stringify(dom.hidden)}  scroll locked: ${dom.scrollLocked}  gpc: ${dom.gpc}`);
      } catch (e) {
        lines.push(`   failed: ${String(e.message).split('\n')[0]}`);
      }
      process.stdout.write(lines.join('\n') + '\n');
      await page.close().catch(() => {});
    }),
  );
} finally {
  await context.close().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
  if (!hadMetadata) fs.rmSync(path.join(EXT, '_metadata'), { recursive: true, force: true });
}
