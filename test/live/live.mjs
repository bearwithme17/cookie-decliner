// Manual check against real sites. Not part of `npm test`.
//   node test/live/live.mjs [--control] site1 site2 ...
// Loads each site in Chromium with the extension (or without, with --control),
// waits, and reports what is on screen. Screenshots go to test/live/out/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '..', '..', 'extension');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const control = args.includes('--control');
const sites = args.filter((a) => !a.startsWith('--'));
const WAIT = Number(process.env.CD_WAIT || 14000);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-live-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, locale: 'de-DE', viewport: { width: 1280, height: 900 },
  args: control ? [] : [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const consoleFromExt = [];
const cap = (promise, ms, what) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + what)), ms))]);

const BANNER = `(() => {
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 40 && r.height > 20 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05; };
  const sel = ['#onetrust-banner-sdk', '#onetrust-pc-sdk', '#CybotCookiebotDialog', '#didomi-popup', '#didomi-notice', '#usercentrics-root', '#usercentrics-cmp-ui', 'div[id^="sp_message_container_"]', '#qc-cmp2-ui', '.cmpbox', '#cmpbox', '#truste-consent-track', '.fc-consent-root', '#cookie-banner', '[id*="cookie" i][class*="banner" i]', '[class*="cookie-banner" i]', '[class*="cookiebanner" i]', '[id*="consent" i][role="dialog"]', '[class*="consent" i][role="dialog"]', '[aria-label*="cookie" i][role="dialog"]', 'dialog[open]', '#sp-cc', '[data-testid="consent-banner"]', '[data-cookiebanner]', '#gdpr-banner', '.cc-window', '#cmp-container', 'tiktok-cookie-banner', '[data-testid*="cookie" i]', '#BorlabsCookieBox', '.cmplz-cookiebanner', '#cookiescript_injected', '#uc-center-container', '#consent-layer', '#cookieConsent', '[id*="cookie-consent" i]', '[class*="cookie-consent" i]', '[class*="CookieConsent"]', '[id*="CookieConsent"]', '[class*="privacy-layer" i]', '[id*="privacy-layer" i]'];
  const seen = [];
  for (const s of sel) { try { for (const e of document.querySelectorAll(s)) if (vis(e) || (e.shadowRoot && e.shadowRoot.childElementCount > 0 && e.id.startsWith('usercentrics') && vis(e.shadowRoot.firstElementChild))) { seen.push(s); break; } } catch {} }
  const text = (document.body && document.body.innerText || '').slice(0, 200000);
  const words = /(alle akzeptieren|accept all|alle cookies akzeptieren|zustimmen und weiter|einwilligen und weiter|accept all cookies|alle zulassen|allow all|agree and continue|i accept|tout accepter)/i.exec(text);
  const y0 = scrollY; scrollTo(0, 600); const scrolled = scrollY > y0 || document.documentElement.scrollHeight <= innerHeight + 700; scrollTo(0, y0);
  return { banners: seen, acceptWord: words ? words[0] : null, scrolls: scrolled, bodyOverflow: getComputedStyle(document.body).overflow, textLen: text.length };
})()`;

for (const site of sites) {
  const page = await context.newPage();
  page.on('console', (m) => { const u = m.location().url || ''; if (u.startsWith('chrome-extension://')) consoleFromExt.push(`${site}: ${m.text()}`); });
  const row = { site };
  try {
    await page.goto('https://' + site, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(WAIT);
    Object.assign(row, await cap(page.evaluate(BANNER), 10000, 'evaluate'));
    const frames = [];
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      try {
        const b = await cap(f.evaluate(() => [...document.querySelectorAll('.message-button, button')].filter((e) => e.offsetParent && /akzept|accept|zustimm|einwillig|ablehn|reject/i.test(e.innerText || '')).slice(0, 4).map((e) => (e.innerText || '').trim().slice(0, 30))), 4000, 'frame');
        if (b.length) frames.push(b.join('|'));
      } catch {}
    }
    row.frameButtons = frames;
    const cookies = await cap(context.cookies('https://' + site), 5000, 'cookies');
    const pick = (n) => cookies.find((c) => c.name === n);
    const interesting = {};
    for (const n of ['OptanonConsent', 'OptanonAlertBoxClosed', 'CookieConsent', 'euconsent-v2', 'consentUUID', 'didomi_token', 'cmpconsent', 'uc_settings', 'CONSENT', 'SOCS', 'cookie_consent', 'cookieconsent_status', 'borlabs-cookie', 'cmplz_banner-status', 'FCCDCF', 'eupubconsent-v2', 'OTAdditionalConsentString']) {
      const c = pick(n);
      if (c) interesting[n] = decodeURIComponent(c.value).slice(0, 900);
    }
    row.cookieCount = cookies.length;
    row.consent = interesting;
    await cap(page.screenshot({ path: path.join(OUT, `${site.replace(/[^a-z0-9.]/gi, '_')}${control ? '.control' : ''}.png`), timeout: 12000 }), 15000, 'screenshot').catch((e) => { row.shot = String(e.message).slice(0, 40); });
  } catch (e) {
    row.error = String(e.message).slice(0, 120);
  }
  console.log(JSON.stringify(row));
  await cap(page.close(), 6000, 'close').catch(() => {});
}
if (!control) console.log(JSON.stringify({ extensionConsoleMessages: consoleFromExt }));
await cap(context.close(), 10000, 'context').catch(() => {});
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
