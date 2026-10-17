#!/usr/bin/env node
/*
 * Runs the Dag backend as a real HTTP server and serves the front end.
 *   node server/http.js            -> http://localhost:8787
 *   PORT=3000 node server/http.js  -> another port
 *
 * No dependencies. The API files are the same ones the browser build and the
 * tests load.
 *
 * Environment:
 *   PORT              port to listen on (Render sets it)
 *   DAG_DATA_DIR      where workspaces and generated keys are kept (.data)
 *   DAG_GATE_SEED     secret seed for the clearance signing key
 *   DAG_ORACLE_SEED   secret seed for the bank oracle key
 * Without the two seeds the server generates random ones once and keeps them
 * in DAG_DATA_DIR/keys.json, so the keys are never the public demo keys.
 *
 * Each browser sends X-Dag-Workspace: <id> and gets its own copy of the
 * records, so judges using one server never see each other's actions.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DAG_DATA_DIR || path.join(ROOT, '.data');
const STORE_FILE = path.join(DATA_DIR, 'workspaces.json');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const MAX_WORKSPACES = 300;
const WORKSPACE_TTL_MS = 24 * 3600 * 1000;
const BODY_LIMIT = 100 * 1024;
const RATE = { windowMs: 60 * 1000, max: 240, loginMax: 30 };

globalThis.nacl = require(path.join(ROOT, 'js/vendor/nacl-fast.min.js'));
for (const f of ['js/shared/format', 'js/server/crypto', 'js/shared/qrtoken', 'js/server/seed', 'js/server/engine', 'js/server/oracle', 'js/server/server']) {
  require(path.join(ROOT, f + '.js'));
}
const Dag = globalThis.Dag;

// ---------- signing keys: secret, never the public demo seeds ----------
function loadSeeds() {
  if (process.env.DAG_GATE_SEED && process.env.DAG_ORACLE_SEED) return { gateSeed: process.env.DAG_GATE_SEED, oracleSeed: process.env.DAG_ORACLE_SEED, source: 'environment' };
  try {
    const k = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (k.gateSeed && k.oracleSeed) return Object.assign(k, { source: 'keys file' });
  } catch (e) {
    /* first run */
  }
  const k = { gateSeed: crypto.randomBytes(32).toString('hex'), oracleSeed: crypto.randomBytes(32).toString('hex') };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(k), { mode: 0o600 });
  } catch (e) {
    /* read-only disk: keys live for this process only */
  }
  return Object.assign(k, { source: 'generated' });
}
const seeds = loadSeeds();
Dag.crypto.configure({ gateSeed: seeds.gateSeed, oracleSeed: seeds.oracleSeed, mode: 'server' });

// ---------- workspace store: in memory, least recently used, saved to disk ----------
const workspaces = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  for (const [id, w] of Object.entries(saved)) if (Date.now() - w.touched < WORKSPACE_TTL_MS) workspaces.set(id, w);
} catch (e) {
  /* no saved state */
}
let dirty = false;
function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(workspaces)));
    fs.renameSync(tmp, STORE_FILE);
  } catch (e) {
    console.error('could not save workspaces:', e.message);
  }
}
setInterval(flush, 2000).unref();
setInterval(() => {
  const now = Date.now();
  for (const [id, w] of workspaces) if (now - w.touched > WORKSPACE_TTL_MS) workspaces.delete(id);
}, 10 * 60 * 1000).unref();

const store = {
  load(ws) {
    const w = workspaces.get(ws);
    if (!w) return null;
    workspaces.delete(ws); // re-insert = most recently used
    w.touched = Date.now();
    workspaces.set(ws, w);
    return w.state;
  },
  save(ws, state) {
    workspaces.set(ws, { state, touched: Date.now() });
    while (workspaces.size > MAX_WORKSPACES) workspaces.delete(workspaces.keys().next().value);
    dirty = true;
  },
};
const backend = Dag.createBackend(store);

// ---------- rate limit per IP ----------
const hits = new Map();
function limited(ip, isLogin) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.start > RATE.windowMs) h = { start: now, all: 0, login: 0 };
  h.all += 1;
  if (isLogin) h.login += 1;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.all > RATE.max || h.login > RATE.loginMax;
}

// ---------- responses ----------
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Dag-Workspace, X-Dag-Envelope',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;

function send(req, res, status, headers, body) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const h = Object.assign({}, SECURITY, headers);
  if (buf.length > 1024 && COMPRESSIBLE.test(h['Content-Type'] || '') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf);
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
function sendJson(req, res, status, body) {
  send(req, res, status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS), JSON.stringify(body));
}
const err = (en, bn) => ({ error: en, errorBn: bn });

// ---------- API ----------
function api(req, res, url) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip, url.pathname === '/api/auth/login')) {
    return sendJson(req, res, 429, err('Too many requests from this address. Wait a minute.', 'এই ঠিকানা থেকে অনেক বেশি অনুরোধ এসেছে। এক মিনিট অপেক্ষা করুন।'));
  }
  const chunks = [];
  let size = 0;
  let over = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > BODY_LIMIT) over = true;
    else chunks.push(c);
  });
  req.on('end', () => {
    if (over) return sendJson(req, res, 413, err('The request body is too large (limit 100 KB).', 'অনুরোধটি অনেক বড় (সীমা ১০০ কিলোবাইট)।'));
    let body;
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch (e) {
      return sendJson(req, res, 400, err('The request body must be JSON.', 'অনুরোধের বডি JSON হতে হবে।'));
    }
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const wsHeader = String(req.headers['x-dag-workspace'] || '');
    const workspace = /^[A-Za-z0-9_-]{6,48}$/.test(wsHeader) ? wsHeader : 'public';
    let out;
    try {
      out = backend.handle(req.method, url.pathname, body, { token, workspace });
    } catch (e) {
      out = { status: 500, body: err('The server hit an unexpected error.', 'সার্ভারে অপ্রত্যাশিত ত্রুটি হয়েছে।'), trace: [] };
    }
    console.log(`${new Date().toISOString().slice(11, 19)}  ${req.method.padEnd(4)} ${url.pathname}  ${out.status}  ws=${workspace.slice(0, 10)}`);
    // The demo page asks for an envelope so it can show the gate's internal
    // steps; curl and other clients get the plain JSON body.
    const envelope = req.headers['x-dag-envelope'] === '1';
    sendJson(req, res, out.status, envelope ? { data: out.body, trace: out.trace } : out.body);
  });
  req.on('error', () => {});
}

// ---------- static files ----------
const cache = new Map();
function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch (e) {
    return send(req, res, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const parts = path.relative(ROOT, file).split(path.sep);
  const blocked = !file.startsWith(ROOT + path.sep) || parts.some((p) => p.startsWith('.')) || ['server', 'tests', 'node_modules', 'scripts'].includes(parts[0]);
  if (blocked) return send(req, res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
  const hit = cache.get(file);
  const ok = (buf) => {
    const ext = path.extname(file);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || rel === '/js/config.js' ? 'no-cache' : 'public, max-age=3600' };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    send(req, res, 200, headers, buf);
  };
  if (hit) return ok(hit);
  fs.readFile(file, (e, buf) => {
    if (e) return send(req, res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    // Pages served by this server talk to this server.
    if (rel === '/index.html') buf = Buffer.from(buf.toString('utf8').replace('<meta name="dag-api" content="browser">', '<meta name="dag-api" content="http">'));
    if (cache.size < 200) cache.set(file, buf);
    ok(buf);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    return send(req, res, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, Object.assign({}, SECURITY, CORS));
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { 'Content-Type': 'text/plain' }, 'Method not allowed');
  return serveStatic(req, res, url);
});
server.requestTimeout = 30000;
server.headersTimeout = 20000;

function shutdown(sig) {
  console.log(`${sig}: saving workspaces and stopping`);
  flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = Number(process.env.PORT) || 8787;
server.listen(PORT, () => {
  const k = Dag.crypto.publicKeys();
  console.log(`Dag is running at http://localhost:${PORT}   (API: /api)`);
  console.log(`Signing keys from ${seeds.source}. Gate key ${k.gate.keyId}, oracle key ${k.oracle.keyId}. Workspaces in ${STORE_FILE}`);
});

module.exports = server;
