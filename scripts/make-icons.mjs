// アプリアイコンを public/icons/ へ配置する。
// 原画（採用デザインの PNG）は assets/icon/ に保存してあり、ここでは「コピーと大きさの確認」だけを行う。
// 絵を描き直したり、別の画像から書き出したりはしない（以前の SVG からの書き出しは廃止）。
//   使い方：node scripts/make-icons.mjs
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'app.config.json'), 'utf8'));

/** PNG のヘッダーから幅と高さを読む（追加のライブラリなし） */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} は PNG ではありません`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const wanted = new Set(config.icons.files.map((f) => f.public.split('/').pop()));
mkdirSync(join(root, 'public/icons'), { recursive: true });
// 古い名前のアイコン（旧デザイン）が残っていれば消す
for (const name of readdirSync(join(root, 'public/icons'))) {
  if (!wanted.has(name)) {
    rmSync(join(root, 'public/icons', name));
    console.log(`removed old public/icons/${name}`);
  }
}
for (const f of config.icons.files) {
  const src = join(root, f.source);
  const { w, h } = pngSize(src);
  if (w !== f.size || h !== f.size) throw new Error(`${f.source} は ${w}×${h}（${f.size}×${f.size} が必要）`);
  copyFileSync(src, join(root, 'public', f.public));
  console.log(`${f.source} -> public/${f.public} (${w}×${h})`);
}
