import { chromium } from 'playwright';
import fs from 'node:fs';
// Renders assets/icon.svg into the PNG sizes in extension/icons/.
// Usage: node tools/render-icons.mjs [svg] [out dir] [preview.png]
// Needs Playwright's Chromium (npx playwright install chromium).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [svgPath = path.join(root, 'assets/icon.svg'), outDir = path.join(root, 'extension/icons'), previewPath] = process.argv.slice(2);
const svg = fs.readFileSync(svgPath, 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
for (const s of [16, 32, 48, 96, 128]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
  await p.screenshot({ path: `${outDir}/icon-${s}.png`, omitBackground: true });
}
if (previewPath) {
const imgs = [16, 32, 48, 96, 128].map((s) => `<img src="data:image/png;base64,${fs.readFileSync(`${outDir}/icon-${s}.png`).toString('base64')}" style="margin:12px;vertical-align:middle">`).join('');
await p.setViewportSize({ width: 520, height: 330 });
await p.setContent(`<body style="margin:0;font-family:sans-serif"><div style="background:#fff;padding:8px">${imgs}</div><div style="background:#202124;padding:8px">${imgs}</div><div style="background:#fff;padding:8px">${svg.replace('<svg ', '<svg width="80" height="80" ')} 16px x4: <img src="data:image/png;base64,${fs.readFileSync(`${outDir}/icon-16.png`).toString('base64')}" style="width:64px;image-rendering:pixelated"></div></body>`);
await p.screenshot({ path: previewPath });
}
await b.close();
