// Servidor estatico de PRODUCAO para a SPA Angular.
//
// Substitui o `ng serve` (dev-server) em producao: serve os arquivos ja
// compilados em dist/frontend/browser, faz fallback de rota para index.html
// (Angular Router) e encaminha /api para o backend Node.
//
// Zero dependencias (usa apenas modulos nativos do Node).
//
// Uso:  node scripts/serve-static.mjs
// Env:  HOST (default 127.0.0.1), PORT (default 4201),
//       API_HOST (default 127.0.0.1), API_PORT (default 3001)

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'dist', 'frontend', 'browser');
const INDEX = join(ROOT, 'index.html');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 4201;
const API_HOST = process.env.API_HOST || '127.0.0.1';
const API_PORT = Number(process.env.API_PORT) || 3001;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

// Nomes gerados pelo build com hash (ex.: main-AB12CD34.js) -> cache imutavel.
const HASHED = /-[A-Za-z0-9_]{8,}\.\w+$/;

function resolvePath(urlPath) {
  const raw = urlPath.split('?')[0].split('#')[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  // normaliza e impede path traversal para fora do ROOT
  const rel = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(ROOT, rel);
}

function sendFile(res, filePath, statusCode) {
  const ext = extname(filePath).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  } else if (HASHED.test(filePath)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'public, max-age=3600';
  }
  res.writeHead(statusCode || 200, headers);
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal Server Error');
  });
  stream.pipe(res);
}

function proxyApi(req, res) {
  const upstream = http.request(
    {
      host: API_HOST,
      port: API_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/api' || url.startsWith('/api/')) {
    return proxyApi(req, res);
  }
  const filePath = resolvePath(url);
  try {
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return sendFile(res, filePath);
    }
  } catch {
    /* cai no fallback abaixo */
  }
  // Fallback SPA: qualquer rota desconhecida devolve o index.html
  return sendFile(res, INDEX);
});

// Encaminha upgrades (websocket) apenas de /api para o backend.
server.on('upgrade', (req, socket, head) => {
  if (!(req.url === '/api' || req.url?.startsWith('/api/'))) {
    socket.destroy();
    return;
  }
  const upstream = http.request({
    host: API_HOST,
    port: API_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
  });
  upstream.on('upgrade', (upRes, upSocket) => {
    const head =
      `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n` +
      Object.entries(upRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') +
      '\r\n\r\n';
    socket.write(head);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});

if (!existsSync(INDEX)) {
  console.error(`[serve-static] ERRO: build nao encontrado em ${ROOT}`);
  console.error('[serve-static] Rode "npm run build" antes de iniciar.');
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`[serve-static] Servindo ${ROOT}`);
  console.log(`[serve-static] Ouvindo http://${HOST}:${PORT}  (/api -> http://${API_HOST}:${API_PORT})`);
});
