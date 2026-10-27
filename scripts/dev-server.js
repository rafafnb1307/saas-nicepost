/**
 * Servidor de desenvolvimento local (zero dependências).
 *
 * Emula a Vercel: serve /public como estático e roteia /api/* para os
 * handlers em /api (mesma assinatura (req, res)). Carrega o .env sozinho.
 *
 *   npm run dev  →  http://localhost:3000
 *
 * Alternativa oficial: `npx vercel dev` (exige login na Vercel).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const API_DIR = path.join(ROOT, 'api');

// --- .env loader minimalista ------------------------------------------------
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const PORT = Number(process.env.PORT) || 3000;
const REWRITES = { '/api/generate-post': '/api/generate' }; // espelha vercel.json

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolve /api/foo/bar → api/foo/bar.js ou api/foo/bar/index.js (ignora arquivos "_"). */
function resolveApi(pathname) {
  const rel = (REWRITES[pathname] || pathname).replace(/^\/api\/?/, '');
  if (!rel || rel.split('/').some((seg) => seg.startsWith('_') || seg.startsWith('.') || seg === '..')) return null;
  for (const candidate of [`${rel}.js`, `${rel}/index.js`]) {
    const file = path.join(API_DIR, candidate);
    if (file.startsWith(API_DIR) && fs.existsSync(file)) return file;
  }
  return null;
}

function serveStatic(pathname, res) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) return notFound(res);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return notFound(res);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 — Não encontrado');
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const started = Date.now();
  res.on('finish', () => {
    if (pathname.startsWith('/api')) console.log(`${req.method} ${pathname} → ${res.statusCode} (${Date.now() - started}ms)`);
  });

  if (!pathname.startsWith('/api')) return serveStatic(pathname, res);

  const file = resolveApi(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: { code: 'not_found', message: 'Endpoint não encontrado.' } }));
  }
  try {
    const mod = await import(pathToFileURL(file).href);
    await mod.default(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'internal', message: 'Erro interno.' } }));
  }
});

server.listen(PORT, () => {
  const ai = process.env.GEMINI_API_KEY ? `Gemini (${process.env.GEMINI_MODEL || 'gemini-2.5-flash'})` : 'MOCK (sem GEMINI_API_KEY)';
  console.log(`\n  ✦ NicePost dev server → http://localhost:${PORT}`);
  console.log(`  ✦ IA: ${ai}`);
  console.log(`  ✦ Storage: ${process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? 'Redis' : 'memória (volátil)'}\n`);
});
