// Tiny zero-dependency static file server for the test suite (and ad-hoc local
// previewing). Serves the repo root so Playwright can load gym-tracker.html over
// http://127.0.0.1 -- a "secure context", which the File System Access API and
// other Chromium features the app probes require (file:// is flakier for those).
//   node test/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2]) || 4321;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname === '/') pathname = '/gym-tracker.html';
    const file = normalize(join(root, pathname));
    // Contain to repo root (block path-traversal).
    if (file !== root.replace(/[\\/]$/, '') && !file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`gymtracker test server: ${root} -> http://127.0.0.1:${port}/gym-tracker.html`);
});
