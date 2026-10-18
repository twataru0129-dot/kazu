import { expect, test, type Page } from '@playwright/test';
import { calc, createProfile } from './helpers';

/**
 * PWA の自動更新。古い版で起動 → 新しい版を公開 → 安全なときだけ自動で切り替わることを確かめる。
 * サーバーは e2e/support/pwa-server.mjs（GitHub Pages と同じ /kazu/ 配下・10分キャッシュ）。
 */
const SERVER = 'http://localhost:4174';
const APP = `${SERVER}/kazu/`;

async function publish(page: Page, v: 'old' | 'new') {
  await page.request.get(`${SERVER}/__switch?to=${v}`);
}

async function version(page: Page): Promise<string> {
  try {
    return (await page.evaluate(() => document.documentElement.dataset.appVersion ?? '')) || '';
  } catch {
    return ''; // 再読み込みの途中
  }
}

async function waitControlled(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false), { timeout: 20_000 }).toBe(true);
}

/** アプリに戻ってきたとき（visibilitychange）と同じきっかけで更新を確かめさせる */
async function simulateResume(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => undefined);
}

async function readStore(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ profiles: string[]; attempts: number; sessions: number }>((resolve, reject) => {
        const open = indexedDB.open('kazu-asobi');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['profiles', 'attempts', 'sessions']);
          const out = { profiles: [] as string[], attempts: 0, sessions: 0 };
          tx.objectStore('profiles').getAll().onsuccess = (e) => (out.profiles = ((e.target as IDBRequest).result as { nickname: string }[]).map((p) => p.nickname));
          tx.objectStore('attempts').count().onsuccess = (e) => (out.attempts = (e.target as IDBRequest).result as number);
          tx.objectStore('sessions').count().onsuccess = (e) => (out.sessions = (e.target as IDBRequest).result as number);
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
}

/** 古い版でプロフィールを作り、計算を1問とく（記録を作る） */
async function setupOld(page: Page) {
  await publish(page, 'old');
  await page.goto(APP);
  await createProfile(page, 'こうしん');
  await waitControlled(page);
  expect(await version(page)).toContain('e2e-old');
  await page.goto(`${APP}#/calc`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  const expr = (await page.locator('.big-expr').innerText()).replace('=', '');
  await page.keyboard.type(String(calc(expr)));
  await page.keyboard.press('Enter');
  await expect(page.getByText('せいかい！')).toBeVisible();
  await page.goto(`${APP}#/home`);
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
  return readStore(page);
}

function countLoads(page: Page) {
  let n = 0;
  page.on('load', () => n++);
  return () => n;
}

test.beforeEach(async ({ page }) => {
  await publish(page, 'old');
});

test('ホームを開いたまま、新しい版を検知して1回だけ自動で切り替わる（記録は残る）', async ({ page }) => {
  const before = await setupOld(page);
  const loads = countLoads(page);
  await publish(page, 'new');
  await simulateResume(page);
  await expect.poll(() => version(page), { timeout: 30_000 }).toContain('e2e-new');
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
  // 無限リロードしない：切り替え後しばらく待っても再読み込みは1回だけ
  await page.waitForTimeout(4000);
  await simulateResume(page);
  await page.waitForTimeout(2000);
  expect(loads()).toBe(1);
  expect(await readStore(page)).toEqual(before);
  // プロフィールもそのまま
  await expect(page.getByRole('heading', { name: /こうしん/ })).toBeVisible();
});

test('プレイ中は再読み込みせず、安全な画面に戻ったときに切り替わる（途中の盤面も残る）', async ({ page }) => {
  await setupOld(page);
  await page.goto(`${APP}#/play/sudoku`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  const empty = page.locator('[role=gridcell][aria-label$="れつめ から"]').first();
  await empty.click();
  await page.getByRole('group', { name: 'すうじ' }).getByRole('button', { name: '3' }).click();
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
  const loads = countLoads(page);

  await publish(page, 'new');
  await simulateResume(page);
  await page.waitForTimeout(8000);
  // 突然 再読み込みされない
  expect(loads()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
  expect(await version(page)).toContain('e2e-old');
  await expect(page.locator('[role=gridcell][aria-label$="れつめ 3"]')).toHaveCount(1);

  // ゲームを終えて一覧（安全な画面）へ → 切り替わる
  await page.getByRole('button', { name: 'もどる' }).click(); // むずかしさ選択へ
  await page.getByRole('button', { name: 'もどる' }).click(); // ゲーム一覧へ
  await expect.poll(() => version(page), { timeout: 30_000 }).toContain('e2e-new');
  await page.waitForTimeout(3000);
  expect(loads()).toBe(1);
  // 途中の盤面は 新しい版でも 続きから できる
  await page.goto(`${APP}#/play/sudoku`);
  await expect(page.getByRole('button', { name: 'つづきから' })).toBeVisible();
});

test('アプリを閉じて開き直すと最新版になる', async ({ page, context }) => {
  const before = await setupOld(page);
  await page.close();
  await publish(page, 'new');
  const again = await context.newPage();
  const loads = countLoads(again);
  await again.goto(APP);
  await expect.poll(() => version(again), { timeout: 30_000 }).toContain('e2e-new');
  await again.waitForTimeout(4000);
  expect(loads()).toBeLessThanOrEqual(2); // 開いたとき ＋ 切り替えの1回まで
  expect(await version(again)).toContain('e2e-new');
  expect(await readStore(again)).toEqual(before);
});

test('オフラインでは今の版で遊べて、オンラインに戻ると新しい版を取得する', async ({ page, context }) => {
  const before = await setupOld(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /けいさん/ }).or(page.getByRole('button', { name: 'この こで あそぶ' }))).toBeVisible();
  expect(await version(page)).toContain('e2e-old');
  // オフラインのまま ゲームを始められる
  await page.goto(`${APP}#/play/balance`).catch(() => undefined);
  await expect(page.getByRole('button', { name: 'はじめる' })).toBeVisible();
  await page.goto(`${APP}#/home`).catch(() => undefined);

  await publish(page, 'new');
  await context.setOffline(false); // online イベントで更新を確かめる
  await expect.poll(() => version(page), { timeout: 30_000 }).toContain('e2e-new');
  expect(await readStore(page)).toEqual(before);
});
