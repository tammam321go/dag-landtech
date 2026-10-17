#!/usr/bin/env node
/*
 * Runs the Dag backend as a real HTTP server and serves the front end.
 *   node server/http.js            -> http://localhost:8787
 *   PORT=3000 node server/http.js  -> another port
 * No dependencies. The API files are the same ones the browser build and the
 * tests load. State is written to .data/store.json (DAG_DATA_DIR to move it).
 * The page is served with <meta name="dag-api" content="http">, so the phone
 * app calls this server with fetch() instead of running the backend itself.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DAG_DATA_DIR || path.join(ROOT, '.data');
const STORE = path.join(DATA_DIR, 'store.json');

// A tiny localStorage stand-in so js/server/server.js can persist to disk.
const mem = (() => {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch (e) {
    return {};
  }
})();
function flush() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(mem));
}
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
  setItem: (k, v) => {
    mem[k] = String(v);
    flush();
  },
  removeItem: (k) => {
    delete mem[k];
    flush();
  },
};

globalThis.nacl = require(path.join(ROOT, 'js/vendor/nacl-fast.min.js'));
for (const f of ['crypto', 'seed', 'engine', 'oracle', 'server']) require(path.join(ROOT, 'js/server', f + '.js'));
const Dag = globalThis.Dag;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Dag-Trace',
};

function sendJson(res, status, body, trace) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Dag-Trace': encodeURIComponent(JSON.stringify(trace || [])) }, CORS));
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch (e) {
        return sendJson(res, 400, { error: 'The request body must be JSON.' });
      }
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const out = Dag.server.handle(req.method, url.pathname, body, token);
      console.log(`${new Date().toISOString().slice(11, 19)}  ${req.method.padEnd(4)} ${url.pathname}  ${out.status}`);
      sendJson(res, out.status, out.body, out.trace);
    });
    return;
  }

  // static files; never serve dotfiles (.git, .data)
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const parts = path.relative(ROOT, file).split(path.sep);
  if (!file.startsWith(ROOT + path.sep) || parts.some((p) => p.startsWith('.')) || parts[0] === 'server') {
    res.writeHead(404);
    return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    let out = buf;
    if (rel === '/index.html') out = Buffer.from(buf.toString('utf8').replace('<meta name="dag-api" content="browser">', '<meta name="dag-api" content="http">'));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(out);
  });
});

const PORT = Number(process.env.PORT) || 8787;
server.listen(PORT, () => {
  console.log(`Dag is running at http://localhost:${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api   (state file: ${STORE})`);
});
