/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import appConfig from './app.config.json';
import { buildAppVersion } from './src/app/buildVersion';

// base は既定で相対パス（'./'）。ハッシュルーティングなので GitHub Pages の
// どのリポジトリ配下でもそのまま動く。絶対パスにしたい場合は BASE_PATH を指定。
const base = process.env.BASE_PATH || './';
// アプリの版：package.json の version と、ビルドごとのID（GitHub Actions では commit の先頭7桁）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const APP_VERSION = buildAppVersion(pkg.version, { BUILD_ID: process.env.BUILD_ID, GITHUB_SHA: process.env.GITHUB_SHA });

/** index.html と manifest にアプリ名などを差し込む */
function appMeta(): Plugin {
  return {
    name: 'kazu-app-meta',
    transformIndexHtml(html) {
      return html
        .replaceAll('%APP_NAME%', appConfig.appName)
        .replaceAll('%APP_DESCRIPTION%', appConfig.description)
        .replaceAll('%THEME_COLOR%', appConfig.themeColor);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(
          {
            name: appConfig.appName,
            short_name: appConfig.shortName,
            description: appConfig.description,
            start_url: './',
            scope: './',
            display: 'standalone',
            orientation: 'portrait',
            background_color: appConfig.backgroundColor,
            theme_color: appConfig.themeColor,
            lang: 'ja',
            // 採用デザインの PNG（角の外側が白いので maskable には使わない）
            icons: appConfig.icons.files
              .filter((f) => f.size !== 180)
              .map((f) => ({ src: f.public, sizes: `${f.size}x${f.size}`, type: 'image/png', purpose: 'any' })),
          },
          null,
          2,
        ),
      });
    },
  };
}

/** ビルド成果物の一覧を埋め込んだ Service Worker を出力する */
function serviceWorker(): Plugin {
  return {
    name: 'kazu-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = appConfig.icons.files.map((f) => f.public);
      const precache = ['./', ...[...files, ...publicFiles].map((f) => `./${f}`)];
      // アイコンの中身が変わったときも版が変わるように、ファイルの内容もハッシュに含める
      const hash = createHash('sha256').update(precache.join('|'));
      for (const f of publicFiles) hash.update(readFileSync(new URL(`./public/${f}`, import.meta.url)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./scripts/sw.template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__CACHE_VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(precache, null, 2)),
      });
    },
  };
}

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react(), appMeta(), serviceWorker()],
  build: { sourcemap: false, target: 'es2020' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 60000,
  },
});
