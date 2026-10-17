/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import appConfig from './app.config.json';

// base は既定で相対パス（'./'）。ハッシュルーティングなので GitHub Pages の
// どのリポジトリ配下でもそのまま動く。絶対パスにしたい場合は BASE_PATH を指定。
const base = process.env.BASE_PATH || './';

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
            icons: [
              { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
            ],
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
      const publicFiles = ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
      const precache = ['./', ...[...files, ...publicFiles].map((f) => `./${f}`)];
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);
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
