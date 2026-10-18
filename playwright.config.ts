import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    // PWA の自動更新（古い版→新しい版の公開）を再現するテスト。専用サーバーで /kazu/ 配下に配信する
    { name: 'pwa-update', use: { ...devices['Pixel 5'], baseURL: 'http://localhost:4174/kazu/' }, testMatch: /pwa-update\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 5'], viewport: { width: 320, height: 640 }, acceptDownloads: true }, testIgnore: /pwa-update\.spec\.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], acceptDownloads: true }, testMatch: /flow\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'node e2e/support/pwa-server.mjs',
      url: 'http://localhost:4174/kazu/',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
