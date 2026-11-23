// Local fixture server for the end-to-end tests. Test code only.
//
// Two listeners on different ports share one handler, so a page on the first
// origin can embed a cross-origin frame from the second (Sourcepoint).
//
//   GET  /fixtures/<name>.html   static fixture page
//   GET  /harness.js             page-side recorder
//   GET  /index.html?message_id= the Sourcepoint message frame (fixtures/_sp-frame.html)
//   GET  /privacy-manager/index.html?message_id=  its privacy manager (fixtures/_sp-pm.html)
//   GET  /sdk/otSDKStub.js       OneTrust SDK stand-in (fixtures/_otSDKStub.js)
//   GET  /probe.(js|png|css)     tiny subresources for the header checks
//   GET  /__next?i=<n>           chain mode: redirect to the n-th URL in server.chain
//   POST /__event                {fixture, event, detail} from harness.js
//
// Every request is recorded with the headers the tests care about.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export async function startServer() {
  const events = []; // {fixture, event, detail, t}
  const requests = []; // {method, path, host, dest, gpc}
  const unknown = []; // requests that matched no route
  const waiters = new Set();

  const send = (res, status, type, body) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const file = (res, name) => {
    const full = path.join(FIXTURES, name);
    if (!full.startsWith(FIXTURES + path.sep) || !fs.existsSync(full)) return false;
    send(res, 200, TYPES[path.extname(full)] || 'application/octet-stream', fs.readFileSync(full));
    return true;
  };

  const handler = (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    requests.push({
      method: req.method,
      path: url.pathname,
      host: req.headers.host,
      dest: req.headers['sec-fetch-dest'] || '',
      gpc: req.headers['sec-gpc'] ?? null,
    });
    const p = url.pathname;
    if (req.method === 'POST' && p === '/__event') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const e = JSON.parse(body);
          events.push({ fixture: String(e.fixture), event: String(e.event), detail: e.detail ?? null, t: Date.now() });
          for (const w of waiters) w();
        } catch {
          unknown.push(`bad event body on ${p}`);
        }
        res.writeHead(204, { 'access-control-allow-origin': '*' });
        res.end();
      });
      return;
    }
    if (req.method === 'OPTIONS' && p === '/__event') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      unknown.push(`${req.method} ${p}`);
      return send(res, 405, 'text/plain', 'no');
    }
    if (p === '/favicon.ico') return send(res, 204, 'image/x-icon', '');
    if (p === '/__next') {
      // Chain mode: hand out the i-th URL of the list the test installed.
      const target = api.chain[Number(url.searchParams.get('i'))];
      if (!target) {
        events.push({ fixture: '(chain)', event: 'chain-done', detail: null, t: Date.now() });
        for (const w of waiters) w();
        return send(res, 200, TYPES['.html'], '<!doctype html><title>done</title><p>done</p>');
      }
      res.writeHead(302, { location: target, 'cache-control': 'no-store' });
      return res.end();
    }
    if (p === '/harness.js') return void file(res, 'harness.js');
    if (p === '/index.html' && url.searchParams.has('message_id')) return void file(res, '_sp-frame.html');
    if (p === '/privacy-manager/index.html' && url.searchParams.has('message_id')) return void file(res, '_sp-pm.html');
    if (p === '/sdk/otSDKStub.js') return void file(res, '_otSDKStub.js');
    if (p === '/probe.js') return send(res, 200, TYPES['.js'], 'window.__probeScript = true;');
    if (p === '/probe.css') return send(res, 200, TYPES['.css'], 'body{}');
    if (p === '/probe.png') return send(res, 200, TYPES['.png'], PNG);
    if (p === '/probe.json') return send(res, 200, 'application/json', '{"ok":true}');
    const m = /^\/fixtures\/([a-z0-9-]+\.html)$/.exec(p);
    if (m && !m[1].startsWith('_') && file(res, m[1])) return;
    unknown.push(`${req.method} ${p}`);
    send(res, 404, 'text/plain', 'not found');
  };

  const listen = () =>
    new Promise((resolve, reject) => {
      const s = http.createServer(handler);
      s.on('error', reject);
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
  const a = await listen();
  const b = await listen();

  const api = {
    chain: [], // URLs served in order by /__next?i=<n>
    // The first origin uses the name "localhost", the second the literal address,
    // so the two are cross-site as well as cross-origin.
    origin: `http://localhost:${a.address().port}`,
    frameOrigin: `http://127.0.0.1:${b.address().port}`,
    events,
    requests,
    unknown,
    eventsFor: (fixture) => events.filter((e) => e.fixture === fixture).map((e) => e.event),
    // Resolves once `predicate()` is true, checking after every recorded event.
    waitFor(predicate, timeoutMs) {
      return new Promise((resolve) => {
        if (predicate()) return resolve(true);
        const check = () => {
          if (predicate()) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve(true);
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          resolve(false);
        }, timeoutMs);
        waiters.add(check);
      });
    },
    async close() {
      await Promise.all([a, b].map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); })));
    },
  };
  return api;
}

// `node test/e2e/server.mjs` keeps the server up for manual poking.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  process.stdout.write(`fixtures: ${s.origin}/fixtures/<name>.html?frame=${encodeURIComponent(s.frameOrigin)}\n`);
}
