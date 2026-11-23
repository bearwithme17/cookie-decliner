#!/usr/bin/env node
// Developer-time script. Not part of the extension and never run by it.
//
//   node tools/vendor.mjs                 download the pinned version from the npm registry
//                                         (npm checks the tarball against the registry's
//                                         signed integrity hash), verify, generate
//   node tools/vendor.mjs 18.9.0          same, explicit version (must have a pin below)
//   node tools/vendor.mjs --from <dir>    use already-downloaded files instead of the network
//                                         (<dir> holds autoconsent.cjs.js, autoconsent.esm.js,
//                                          compact-rules.json, LICENSE)
//   node tools/vendor.mjs --out <dir>     write somewhere other than extension/vendor/autoconsent
//
// Every source file is checked against a pinned SHA-256 before anything is written.
// To move to a new upstream version: read the upstream diff, add a PINS entry with
// the new hashes (the script prints the hashes it saw when it aborts), run the
// script, then run the whole test suite.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { OVERRIDES, NEVER, REVIEWED, UPSTREAM_SHA256 } from './snippet-overrides.mjs';

export const PACKAGE = '@duckduckgo/autoconsent';
export const DEFAULT_VERSION = '18.9.0';

export const SOURCES = [
  { key: 'cjs', remote: 'dist/autoconsent.cjs.js', local: 'autoconsent.cjs.js' },
  { key: 'esm', remote: 'dist/autoconsent.esm.js', local: 'autoconsent.esm.js' },
  { key: 'rules', remote: 'rules/compact-rules.json', local: 'compact-rules.json' },
  { key: 'license', remote: 'LICENSE', local: 'LICENSE' },
];

export const PINS = {
  '18.9.0': {
    cjs: 'a8c58d606aaf15362546fb8e923a7c08323f6b0658deddd066cf736714d6a293',
    esm: 'baa0b54aa0041ea26cecfd14fef2cde32e8d850f5edb7af484f1eebbac6149ff',
    rules: '9708da9b0f21f9d7e520eba60e489eaa00a92f303cc3298f33421a338c2c5d2a',
    license: 'fab3dd6bdab226f1c08630b1dd917e11fcb4ec5e1e020e2c16f83a0a13863e85',
  },
};

// Identifiers that are lexically shadowed inside the engine. Only the first three
// receive a value; the rest are undefined there, so plain references to them in
// the engine do not reach the network, storage or the extension APIs. This is
// not a sandbox: globalThis.fetch, new Image().src, an injected <script> or a
// computed property name still work. The real control is reading the upstream
// diff before adding a PINS entry, backed by the token inventory in
// test/unit/no-logs.test.mjs.
export const WRAPPER_PARAMS = [
  'module', 'exports', 'console',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'indexedDB', 'localStorage', 'sessionStorage', 'caches',
  'chrome', 'browser',
];

export const contentPrefix = (version) =>
  `/* Generated from ${PACKAGE}@${version} dist/autoconsent.cjs.js (MPL-2.0). Do not edit. */\n` +
  `(function (${WRAPPER_PARAMS.join(', ')}) {\n`;
export const CONTENT_SUFFIX = '\n})(CD_MODULE, CD_MODULE.exports, CD_SILENT_CONSOLE);\n';

export const RULES_PREFIX = 'export default ';
export const RULES_SUFFIX = ';\n';

// A snippet matching this is assumed to grant consent unless it is listed in
// OVERRIDES, NEVER or REVIEWED. New upstream snippets therefore force a review.
const CONSENT_GRANTING = /accept|agree|opt_?in|allow|\(\s*true\s*\)|,\s*1\s*\)|submitAll|["']save["']/i;

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

class VendorError extends Error {}

// The files come from the package tarball on the npm registry. `npm pack`
// verifies the tarball against the integrity hash in the registry's package
// metadata, so the hashes printed for a new version are those of what npm
// publishes, not of whatever a CDN served.
async function download(version, dir) {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-pack-'));
  try {
    const out = execFileSync('npm', ['pack', `${PACKAGE}@${version}`, '--json', '--pack-destination', packDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const info = JSON.parse(out)[0];
    if (!info || info.version !== version || !info.integrity) throw new VendorError('npm pack returned no verified tarball');
    const tgz = path.join(packDir, info.filename);
    execFileSync('tar', ['-xzf', tgz, '-C', packDir]);
    for (const src of SOURCES) {
      const file = path.join(packDir, 'package', src.remote);
      if (!fs.existsSync(file)) throw new VendorError(`${src.remote} is missing from the npm tarball`);
      fs.copyFileSync(file, path.join(dir, src.local));
    }
  } finally {
    fs.rmSync(packDir, { recursive: true, force: true });
  }
}

function readVerified(version, dir) {
  const pins = PINS[version];
  const seen = {};
  const files = {};
  for (const src of SOURCES) {
    const file = path.join(dir, src.local);
    if (!fs.existsSync(file)) throw new VendorError(`missing source file: ${file}`);
    files[src.key] = fs.readFileSync(file);
    seen[src.key] = sha256(files[src.key]);
  }
  if (!pins) {
    throw new VendorError(
      `no SHA-256 pins for version ${version}. Review the upstream changes, then add to PINS in tools/vendor.mjs:\n` +
        `  '${version}': ${JSON.stringify(seen, null, 4)},`,
    );
  }
  for (const src of SOURCES) {
    if (seen[src.key] !== pins[src.key]) {
      throw new VendorError(
        `SHA-256 mismatch for ${src.remote}\n  expected ${pins[src.key]}\n  got      ${seen[src.key]}\nNothing was written.`,
      );
    }
  }
  return { files, hashes: seen };
}

export async function buildSnippets(esmFile, version) {
  const mod = await import(pathToFileURL(esmFile).href + `?v=${Date.now()}`);
  const snippets = mod.evalSnippets;
  if (!snippets || typeof snippets !== 'object') throw new VendorError('evalSnippets export not found');
  const ids = Object.keys(snippets).sort();
  for (const id of [...Object.keys(OVERRIDES), ...NEVER, ...REVIEWED]) {
    if (!ids.includes(id)) throw new VendorError(`snippet-overrides.mjs names ${id}, which upstream no longer has`);
  }
  // Overrides and reviews were made against one exact upstream body.
  for (const id of [...Object.keys(OVERRIDES), ...REVIEWED]) {
    const seen = sha256(snippets[id].toString());
    if (UPSTREAM_SHA256[id] !== seen) {
      throw new VendorError(
        `${id} changed upstream (or has no UPSTREAM_SHA256 entry). Review it again, then set\n` +
          `  ${id}: '${seen}',\nin tools/snippet-overrides.mjs. Upstream source:\n${snippets[id].toString()}`,
      );
    }
  }
  const lines = [];
  const kept = [];
  for (const id of ids) {
    if (!/^EVAL_[A-Z0-9_]+$/.test(id)) throw new VendorError(`unexpected snippet id: ${id}`);
    if (NEVER.includes(id)) continue;
    let src;
    if (Object.hasOwn(OVERRIDES, id)) {
      src = OVERRIDES[id];
    } else {
      src = snippets[id].toString();
      if (/console\s*\./.test(src)) throw new VendorError(`${id} writes to the console and has no override`);
      if (!REVIEWED.includes(id) && CONSENT_GRANTING.test(src.replace(/dis(agree|allow)/gi, ''))) {
        throw new VendorError(
          `${id} looks like it grants consent and is not listed in tools/snippet-overrides.mjs:\n${src}`,
        );
      }
    }
    if (!/^\(\)\s*=>/.test(src)) throw new VendorError(`${id} is not a "() =>" arrow function`);
    if (/console\s*\./.test(src)) throw new VendorError(`${id} override writes to the console`);
    // Parse check: must be a self-contained expression.
    try {
      new Function(`return (${src});`); // eslint-disable-line no-new-func
    } catch (e) {
      throw new VendorError(`${id} does not parse: ${e.message}`);
    }
    kept.push(id);
    lines.push(
      `  ${id}: () => { try { const r = (${src})(); ` +
        `return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; ` +
        `} catch (e) { return false; } },`,
    );
  }
  const text =
    `/* Generated from ${PACKAGE}@${version} lib/eval-snippets.ts (MPL-2.0) by tools/vendor.mjs. Do not edit.\n` +
    ` * Each function runs in the page's MAIN world, returns a boolean and cannot throw.\n` +
    ` * Opt-in snippets are omitted; console output is removed (see tools/snippet-overrides.mjs). */\n` +
    `export const SAFE_SNIPPETS = Object.freeze({\n__proto__: null,\n${lines.join('\n')}\n});\n`;
  return { text, kept, total: ids.length };
}

export async function generate({ version = DEFAULT_VERSION, fromDir = null, outDir }) {
  let tmp = null;
  try {
    let srcDir = fromDir;
    if (!srcDir) {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-vendor-'));
      srcDir = tmp;
      await download(version, srcDir);
    }
    const { files, hashes } = readVerified(version, srcDir);

    // Sanity: the rules must be plain JSON with the expected shape.
    const rules = JSON.parse(files.rules.toString('utf8'));
    if (rules.v !== 1 || !Array.isArray(rules.s) || !Array.isArray(rules.r) || !rules.index) {
      throw new VendorError('compact-rules.json has an unexpected shape');
    }

    // The snippets are built from the verified ESM bytes: they are copied into a
    // fresh private directory and imported from there, so a file swapped in the
    // source directory after the hash check is never executed.
    const verifiedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-esm-'));
    let snippets;
    try {
      const esmPath = path.join(verifiedDir, 'autoconsent.esm.js');
      fs.writeFileSync(esmPath, files.esm, { mode: 0o600 });
      snippets = await buildSnippets(esmPath, version);
    } finally {
      fs.rmSync(verifiedDir, { recursive: true, force: true });
    }

    fs.mkdirSync(outDir, { recursive: true });
    const out = (name, data) => fs.writeFileSync(path.join(outDir, name), data);
    out('autoconsent.esm.js', files.esm);
    out('LICENSE', files.license);
    out('autoconsent.content.js', Buffer.concat([Buffer.from(contentPrefix(version)), files.cjs, Buffer.from(CONTENT_SUFFIX)]));
    out('compact-rules.js', Buffer.concat([Buffer.from(RULES_PREFIX), files.rules, Buffer.from(RULES_SUFFIX)]));
    out('snippets.generated.js', snippets.text);
    const meta = {
      package: PACKAGE,
      version,
      license: 'MPL-2.0',
      source: 'https://github.com/duckduckgo/autoconsent',
      tarball: `https://registry.npmjs.org/${PACKAGE}/-/autoconsent-${version}.tgz`,
      vendoredOn: new Date().toISOString().slice(0, 10),
      files: Object.fromEntries(
        SOURCES.map((s) => [s.remote, { url: `https://unpkg.com/${PACKAGE}@${version}/${s.remote}`, bytes: files[s.key].length, sha256: hashes[s.key] }]),
      ),
      generated: {
        'autoconsent.esm.js': 'pristine copy of dist/autoconsent.esm.js',
        'autoconsent.content.js': 'function wrapper + pristine dist/autoconsent.cjs.js bytes',
        'compact-rules.js': '"export default " + pristine rules/compact-rules.json bytes + ";"',
        'snippets.generated.js': `${snippets.kept.length} of ${snippets.total} page-world snippets, try/catch wrapped`,
      },
      snippetOverrides: Object.keys(OVERRIDES),
      snippetsOmitted: NEVER,
    };
    out('VENDORED.json', JSON.stringify(meta, null, 2) + '\n');
    return meta;
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return null;
    const v = args[i + 1];
    args.splice(i, 2);
    return v ? path.resolve(v) : null;
  };
  const fromDir = take('--from');
  const outDir = take('--out') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'vendor', 'autoconsent');
  const version = args[0] || DEFAULT_VERSION;
  try {
    const meta = await generate({ version, fromDir, outDir });
    process.stdout.write(`vendored ${meta.package}@${meta.version} into ${outDir}\n${meta.generated['snippets.generated.js']}\n`);
  } catch (e) {
    process.stderr.write(`vendor: ${e instanceof VendorError ? e.message : e.stack}\n`);
    process.exit(1);
  }
}
