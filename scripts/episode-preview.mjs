import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { onRequestGet, onRequestPost } from '../functions/api/content-os/episode-workflow/index.js';
import { saveEpisodeBundle } from './episode-bundle.mjs';

// Local development only. No Cloudflare credentials or remote bindings are loaded.
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.APC_EPISODE_PREVIEW_PORT || 4197);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const origin = `http://127.0.0.1:${port}`;
const stateDir = resolve(root, '.local-episode-preview');
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(stateDir, 'synthetic.sqlite'));
db.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY)');
for (const name of (await readdir(resolve(root, 'migrations'))).filter(name => /^00(?:0[1-9]|1[01])_.*\.sql$/.test(name)).sort()) {
  if (db.prepare('SELECT name FROM preview_migrations WHERE name = ?').get(name)) continue;
  db.exec('BEGIN');
  try {
    db.exec(await readFile(resolve(root, 'migrations', name), 'utf8'));
    db.prepare('INSERT INTO preview_migrations VALUES (?)').run(name);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return db.prepare(this.sql).get(...this.values) || null; }
  async all() { return { success: true, results: db.prepare(this.sql).all(...this.values) }; }
  execute() {
    if (/^\s*(SELECT|PRAGMA)\b/i.test(this.sql)) return { success: true, results: db.prepare(this.sql).all(...this.values) };
    return { success: true, meta: { changes: Number(db.prepare(this.sql).run(...this.values).changes) } };
  }
  async run() { return this.execute(); }
}
const binding = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    db.exec('BEGIN');
    try { const result = statements.map(statement => statement.execute()); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const assets = new Map([
  ['/content-os/episodes/', ['content-os/episodes/index.html', 'text/html']],
  ['/content-os/episodes/app.js', ['content-os/episodes/app.js', 'text/javascript']],
  ['/content-os/app.css', ['content-os/app.css', 'text/css']],
  ['/content-os/topic-bank.js', ['content-os/topic-bank.js', 'text/javascript']],
  ['/content-os/episode-learning.js', ['content-os/episode-learning.js', 'text/javascript']],
  ['/content-os/video-rules.js', ['content-os/video-rules.js', 'text/javascript']],
]);
let queue = Promise.resolve();
async function handle(req, res) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'", 'Referrer-Policy': 'no-referrer' };
  function send(status, body, type = 'text/plain') { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(body); }
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, 'Local preview requests only.');
  const url = new URL(req.url, origin);
  if (req.method === 'POST' && url.pathname === '/api/local/episode-bundle') {
    if(req.headers.origin !== origin || req.headers['x-apc-content-os'] !== '1') return send(403,'Same-origin action required.');
    let input=''; for await(const chunk of req) { input+=chunk.toString(); if(input.length>1024) return send(413,'Request too large.'); }
    let payload; try{payload=JSON.parse(input);}catch{return send(400,'Invalid request.');}
    if(Object.keys(payload || {}).length!==1 || !/^EP\d{2,4}$/.test(payload?.episodeId || '')) return send(400,'Episode identity required.');
    const response=await onRequestGet({env:{APC_CONTENT_OS_DB:binding}});
    if(!response.ok) return send(503,'Local records unavailable.');
    const data=await response.json();
    if(!data.episodes.some(e=>e.id===payload.episodeId)) return send(404,'Episode not found.');
    return send(200,JSON.stringify(await saveEpisodeBundle(resolve(stateDir,'bundles'),data,payload.episodeId)),'application/json');
  }
  if (req.method === 'GET' && url.pathname === '/') { res.writeHead(302, { Location: '/content-os/episodes/' }); return res.end(); }
  if (url.pathname === '/api/content-os/episode-workflow' && ['GET', 'POST'].includes(req.method)) {
    let body = '';
    if (req.method === 'POST') {
      if (req.headers.origin !== origin || req.headers['x-apc-content-os'] !== '1') return send(403, 'Same-origin preview action required.');
      let size = 0;
      const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) return send(413, 'Request too large.'); chunks.push(chunk); }
      body = Buffer.concat(chunks).toString('utf8');
    }
    const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body } : {}) });
    const response = await (req.method === 'GET' ? onRequestGet : onRequestPost)({ request, env: { APC_CONTENT_OS_DB: binding } });
    const responseText=await response.text();
    if(req.method==='POST' && response.ok) {
      const data=JSON.parse(responseText); const input=JSON.parse(body); const id=data.actionResult?.episodeId || input.episodeId || input.episode?.id;
      if(id) { try { await saveEpisodeBundle(resolve(stateDir,'bundles'),data,id); } catch(error) { console.error('Episode saved, local bundle failed:',error.message); data.localBundleError='Episode saved; local bundle failed. Use Save local bundle to retry.'; return send(response.status,JSON.stringify(data),'application/json'); } }
    }
    return send(response.status, responseText, 'application/json');
  }
  if (req.method === 'GET' && url.pathname === '/api/content-os/research') return send(200, '{"items":[]}', 'application/json');
  if (req.method === 'GET' && assets.has(url.pathname)) {
    const [file, type] = assets.get(url.pathname);
    const path = resolve(root, file);
    if (await realpath(path) !== path) return send(404, 'Not found');
    let body = await readFile(path);
    if (type === 'text/html') body = body.toString().replace('<body class="episode-studio">', '<body class="episode-studio"><aside class="local-preview-notice" role="note">Local preview · Episode records save on this Mac · Not deployed or cross-device synced</aside>');
    return send(200, body, type);
  }
  return send(404, 'Not part of the local Episode Studio preview.');
}
const server = createServer((req, res) => {
  queue = queue.then(() => handle(req, res)).catch(error => {
    console.error('Preview request failed:', error.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Local preview request failed.');
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Synthetic Episode Studio: ${origin}/content-os/episodes/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
