// Builds the Safari version: a macOS app that contains the extension.
//
//   node tools/build-safari.mjs              ad-hoc signed ("Sign to Run Locally")
//   CD_TEAM=<team id> node tools/build-safari.mjs   signed with your Apple Development certificate
//
// Steps:
//   1. Copy extension/ to dist/safari/extension/.
//   2. Bundle the background (an ES module in Chrome and Firefox) into one classic
//      script, because Safari does not load module background scripts.
//   3. Adjust manifest.json for Safari (see safariManifest below).
//   4. Generate an Xcode project with Apple's safari-web-extension-converter.
//   5. Build it with xcodebuild and copy the app to dist/safari/Cookie Decliner.app.
//
// Needs Xcode. Nothing in extension/ is changed.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'dist', 'safari');
const EXT = path.join(OUT, 'extension');
const APP_NAME = 'Cookie Decliner';
const BUNDLE_ID = 'io.github.bearwithme17.cookiedecliner';
// CD_DEBUG=1 adds tools/safari-debug/ (diagnostics for the Safari tests). Never ship it.
const DEBUG = process.env.CD_DEBUG === '1';
const VERSION = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).version;
// CFBundleVersion must grow with every release: 1.2.3 -> 10203.
const BUILD_NUMBER = String(VERSION.split('.').map(Number).reduce((n, part, i) => n + part * 100 ** (2 - i), 0));

// Files only the background uses: they end up inside the bundled background.js.
const BUNDLED_AWAY = [
  'background',
  'vendor/autoconsent/autoconsent.esm.js',
  'vendor/autoconsent/compact-rules.js',
  'vendor/autoconsent/snippets.generated.js',
];

export function safariManifest(m) {
  const out = structuredClone(m);
  out.background = { service_worker: 'background.js' };
  // Safari has no browsingData API: the wipe deletes cookies only.
  out.permissions = out.permissions.filter((p) => p !== 'browsingData');
  for (const cs of out.content_scripts) {
    delete cs.match_origin_as_fallback;
    delete cs.match_about_blank;
  }
  if (out.options_ui) delete out.options_ui.open_in_tab;
  if (DEBUG) out.content_scripts.push({ matches: ['*://*/*'], js: ['debug/content-debug.js'], run_at: 'document_idle', all_frames: false });
  delete out.minimum_chrome_version;
  return out;
}

function copyExtension() {
  fs.rmSync(EXT, { recursive: true, force: true });
  fs.cpSync(SRC, EXT, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(SRC, src);
      const base = path.basename(src);
      return !(base.startsWith('.') || rel === '_metadata' || rel.startsWith('_metadata' + path.sep));
    },
  });
}

async function bundleBackground() {
  await build({
    entryPoints: [DEBUG ? path.join(ROOT, 'tools', 'safari-debug', 'background-debug.js') : path.join(SRC, 'background.js')],
    outfile: path.join(EXT, 'background.js'),
    bundle: true,
    format: 'iife',
    target: 'safari16',
    legalComments: 'inline',
    logLevel: 'warning',
  });
  for (const rel of BUNDLED_AWAY) fs.rmSync(path.join(EXT, rel), { recursive: true, force: true });
  if (!DEBUG && fs.readFileSync(path.join(EXT, 'background.js'), 'utf8').includes('cd-debug')) {
    throw new Error('debug code in a release build');
  }
}

function writeManifest() {
  const m = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
  if (DEBUG) {
    fs.mkdirSync(path.join(EXT, 'debug'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'tools', 'safari-debug', 'content-debug.js'), path.join(EXT, 'debug', 'content-debug.js'));
  }
  fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(safariManifest(m), null, 2) + '\n');
}

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    process.stderr.write(`${cmd} failed:\n${String(e.stdout || '').slice(-4000)}${String(e.stderr || '').slice(-4000)}\n`);
    process.exit(1);
  }
}

function convert() {
  const proj = path.join(OUT, 'xcode');
  fs.rmSync(proj, { recursive: true, force: true });
  run('xcrun', [
    'safari-web-extension-converter', EXT,
    '--project-location', proj,
    '--app-name', APP_NAME,
    '--bundle-identifier', BUNDLE_ID,
    '--macos-only', '--copy-resources', '--no-open', '--no-prompt', '--force',
  ]);
  const xcodeproj = path.join(proj, APP_NAME, `${APP_NAME}.xcodeproj`);
  // The converter derives the app's bundle id from the app name; the extension's
  // id must start with the app's, so the app gets BUNDLE_ID itself.
  for (const name of fs.readdirSync(xcodeproj)) {
    const file = path.join(xcodeproj, name);
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    const fixed = text.replace(/(PRODUCT_BUNDLE_IDENTIFIER"?\s*[:=]\s*"?)([^";\n]+)/g, (all, key, id) =>
      id.endsWith('.Extension') ? key + BUNDLE_ID + '.Extension' : key + BUNDLE_ID)
      // The app and extension carry the manifest's version.
      .replace(/("MARKETING_VERSION"\s*:\s*")[^"]*(")/g, `$1${VERSION}$2`)
      .replace(/("CURRENT_PROJECT_VERSION"\s*:\s*")[^"]*(")/g, `$1${BUILD_NUMBER}$2`);
    if (fixed !== text) fs.writeFileSync(file, fixed);
  }
  return xcodeproj;
}

function xcodebuild(project) {
  const derived = path.join(OUT, 'build');
  const team = process.env.CD_TEAM;
  const signing = team
    ? [`DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', '-allowProvisioningUpdates']
    : ['CODE_SIGN_IDENTITY=-', 'CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=', 'PROVISIONING_PROFILE_SPECIFIER='];
  run('xcodebuild', [
    '-project', project,
    '-scheme', APP_NAME,
    '-configuration', 'Release',
    '-derivedDataPath', derived,
    '-quiet',
    ...signing,
    'build',
  ]);
  const app = path.join(derived, 'Build', 'Products', 'Release', `${APP_NAME}.app`);
  const dest = path.join(OUT, `${APP_NAME}.app`);
  fs.rmSync(dest, { recursive: true, force: true });
  // Moved, not copied: Safari lists every copy of the app it finds as its own extension.
  fs.renameSync(app, dest);
  fs.rmSync(path.join(derived, 'Build', 'Products'), { recursive: true, force: true });
  return dest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyExtension();
  await bundleBackground();
  writeManifest();
  const project = convert();
  const app = xcodebuild(project);
  process.stdout.write(`${app}\n`);
}
