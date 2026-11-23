#!/usr/bin/env node
// Developer-time wrapper: runs web-ext with the given arguments and starts it
// again when Node itself dies during start-up.
//
// Why: with Node 24.14 on this machine, `web-ext lint` (and sometimes `run`)
// is killed by SIGBUS inside Node's native CommonJS lexer while it loads its own
// dependencies, before it prints anything. It happens with a one-line manifest
// too, so it is unrelated to this extension. A retry gets past it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const args = process.argv.slice(2);
const MAX = 40;

for (let attempt = 1; attempt <= MAX; attempt++) {
  const started = Date.now();
  const child = spawn(process.execPath, [bin, ...args], { stdio: 'inherit' });
  const forward = (sig) => child.kill(sig);
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
  const { code, signal } = await new Promise((resolve) => child.on('exit', (c, s) => resolve({ code: c, signal: s })));
  process.off('SIGINT', forward);
  process.off('SIGTERM', forward);
  // Never retried: a sign run may already have uploaded a version.
  const crashedEarly = args[0] !== 'sign' && (signal === 'SIGBUS' || signal === 'SIGSEGV') && Date.now() - started < 15000;
  if (!crashedEarly) process.exit(code ?? (signal ? 1 : 0));
}
process.stderr.write(`web-ext kept crashing during start-up (${MAX} attempts)\n`);
process.exit(1);
