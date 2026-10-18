// PWA 自動更新の E2E 用サーバー。
// 「古い版」と「新しい版」をビルドし、GitHub Pages と同じように /kazu/ 配下・Cache-Control: max-age=600 で配信する。
// GET /__switch?to=old|new で、公開している版を切り替える（新しい版を公開した状態を再現）。
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PWA_PORT || 4174);
const root = new URL('../..', import.meta.url).pathname;
const out = join(root, 'node_modules/.pwa-e2e');
for (const v of ['old', 'new']) {
  execSync(`npx vite build --outDir ${join(out, v)} --emptyOutDir`, { cwd: root, stdio: 'ignore', env: { ...process.env, BUILD_ID: `e2e-${v}` } });
}

let current = 'old';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__switch') {
    current = url.searchParams.get('to') === 'new' ? 'new' : 'old';
    res.end(current);
    return;
  }
  if (!url.pathname.startsWith('/kazu/')) {
    res.writeHead(404).end();
    return;
  }
  let rel = normalize(url.pathname.slice('/kazu/'.length)) || 'index.html';
  if (rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
  const file = join(out, current, rel);
  if (!file.startsWith(join(out, current)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    // GitHub Pages と同じ（10分のキャッシュ）。それでも新しい版が届くことを確かめる
    'Cache-Control': 'max-age=600',
  });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`pwa test server on ${PORT}`));
