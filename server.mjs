import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fixParsedWebmDuration } = require('@fix-webm-duration/fix');
const requireDuration = createRequire(require.resolve('@fix-webm-duration/fix'));
const { WebmFile } = requireDuration('@fix-webm-duration/parser');
const loopDurationMs = 2 * Math.PI / 0.15 * 1000;

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.webm':'video/webm','.md':'text/markdown; charset=utf-8','.otf':'font/otf','.ttf':'font/ttf','.woff2':'font/woff2'};

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && /^\/api\/export\/(glb|png|webm)$/.test(url.pathname)) {
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
        res.writeHead(403); res.end(); return;
      }
      const format = url.pathname.split('/').pop();
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 60 * 1024 * 1024) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      let output = Buffer.concat(chunks);
      if (format === 'webm') {
        const webm = new WebmFile(Uint8Array.from(output));
        fixParsedWebmDuration(webm, loopDurationMs, {logger:false});
        output = Buffer.from(webm.source);
      }
      await mkdir(resolve(root,'exports'), {recursive:true});
      await writeFile(resolve(root,'exports',`zvezdach-metal-badge.${format}`),output);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({url:`/exports/zvezdach-metal-badge.${format}`,bytes:output.length}));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405);res.end();return; }
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const path = resolve(root, '.' + requested);
    if (!path.startsWith(root + sep) || requested.split('/').some(p => p.startsWith('.'))) { res.writeHead(403);res.end();return; }
    if (!(await stat(path)).isFile()) { res.writeHead(404);res.end();return; }
    const data = await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (err) { res.writeHead(err.code==='ENOENT'?404:500);res.end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Zvezdach 3D preview: http://127.0.0.1:${port}`));
