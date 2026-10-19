import { expect, test, type Page } from '@playwright/test';
import { calc, createProfile } from './helpers';

/**
 * iPhone Safari でツールバーが出ているときの「見えている高さ」に近い画面で、
 * こたえる・つぎへ などの主な操作が 下にはみ出さず、スクロールなしで押せることを確かめる。
 */
const SIZES = [
  { w: 320, h: 480 }, // 小さい端末
  { w: 375, h: 548 }, // iPhone SE（Safari のツールバー表示中）
  { w: 390, h: 664 }, // iPhone 13/14（ツールバー表示中）
  { w: 430, h: 740 }, // Pro Max（ツールバー表示中）
];

const GAMES = ['decompose', 'pittari', 'make10', 'kufuu', 'balance', 'sequence', 'machine', 'flash', 'numberline', 'coins', 'shopping', 'sudoku', 'maze', 'shapes', 'mirror', 'pattern', 'missing-number', 'triangle-pattern', 'dot-connect', 'symbol-memory', 'nonogram', 'light-sequence'];

async function expectDockVisible(page: Page, where: string) {
  await expect(page.locator('.dock'), `dock on ${where}`).toBeVisible();
  const r = await page.evaluate(() => {
    const dock = document.querySelector('.dock') as HTMLElement | null;
    const header = document.querySelector('.topbar') as HTMLElement | null;
    if (!dock || getComputedStyle(dock).display === 'none') return null;
    const d = dock.getBoundingClientRect();
    const buttons = [...dock.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0);
    return {
      top: d.top,
      bottom: d.bottom,
      vh: window.innerHeight,
      headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      minBtnH: Math.min(...buttons.map((b) => b.height)),
      lowestBtn: Math.max(...buttons.map((b) => b.bottom)),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(r, `dock on ${where}`).not.toBeNull();
  expect(r!.bottom, `dock bottom on ${where}`).toBeLessThanOrEqual(r!.vh + 0.5);
  expect(r!.lowestBtn, `buttons above the bottom edge on ${where}`).toBeLessThanOrEqual(r!.vh - 8);
  expect(r!.top, `dock below header on ${where}`).toBeGreaterThan(r!.headerBottom);
  expect(r!.minBtnH, `tap size on ${where}`).toBeGreaterThanOrEqual(44);
  expect(r!.overflowX, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0);
}

for (const { w, h } of SIZES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('primary actions stay on screen in every game, calc, test and learn practice', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'スマホ');
      for (const g of GAMES) {
        await page.goto(`/#/play/${g}`);
        await page.getByRole('button', { name: 'はじめる' }).click();
        await expect(page.locator('.dock')).toBeVisible();
        await expectDockVisible(page, g);
        await page.getByRole('button', { name: 'もどる' }).click();
      }
      // 計算：正解したあと「つぎへ」が見える
      await page.goto('/#/calc');
      await page.getByRole('button', { name: 'はじめる' }).click();
      await expectDockVisible(page, 'calc');
      const expr = (await page.locator('.big-expr').innerText()).replace('=', '');
      await page.keyboard.type(String(calc(expr)));
      await page.locator('.pad-submit').click();
      const next = page.getByRole('button', { name: 'つぎへ →' });
      await expect(next).toBeInViewport({ ratio: 1 });
      await expectDockVisible(page, 'calc solved');
      // ゲーム：正解したあと「つぎへ」が見える（天秤）
      await page.goto('/#/play/balance');
      await page.getByRole('button', { name: 'はじめる' }).click();
      const label = (await page.locator('svg[aria-label^="ひだり"]').getAttribute('aria-label'))!;
      const m = label.match(/ひだり (.+)、みぎ (.+)/)!;
      const l = calc(m[1]);
      const r = calc(m[2]);
      await page.getByRole('button', { name: l > r ? '◀ ひだり' : l < r ? 'みぎ ▶' : '＝ おなじ' }).click();
      await expect(page.getByRole('button', { name: /つぎへ/ })).toBeInViewport({ ratio: 1 });
      await expectDockVisible(page, 'balance solved');
      // テスト
      await page.goto('/#/test');
      await page.getByRole('button', { name: 'この テストを はじめる' }).click();
      await expectDockVisible(page, 'test');
      await expect(page.getByRole('button', { name: 'けってい' })).toBeInViewport({ ratio: 1 });
      // まなび（れんしゅう）
      for (const path of ['/learn/mul', '/learn/div']) {
        await page.goto(`/#${path}`);
        await page.getByRole('tab', { name: 'れんしゅう' }).click();
        await expectDockVisible(page, `${path} practice`);
      }
    });

    test('learn tabs are all visible without horizontal scrolling', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'タブ');
      for (const [path, n] of [
        ['/learn/mul', 5],
        ['/learn/div', 4],
      ] as const) {
        await page.goto(`/#${path}`);
        const tabs = page.getByRole('tab');
        await expect(tabs).toHaveCount(n);
        for (let i = 0; i < n; i++) {
          const t = tabs.nth(i);
          await expect(t).toBeInViewport({ ratio: 1 });
          const b = (await t.boundingBox())!;
          expect(b.height).toBeGreaterThanOrEqual(44);
          expect(b.x + b.width).toBeLessThanOrEqual(w);
          // ラベルが欠けていない
          expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
      }
    });
  });
}

test('multiplication video explains 2, 3 and 6 in large text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await createProfile(page, 'どうが');
  await page.goto('/#/learn/mul');
  await page.getByRole('button', { name: /^ばめん 5/ }).click();
  const legend = page.getByRole('list', { name: 'しきの かずの いみ' });
  await expect(legend).toBeVisible();
  for (const text of ['1さらに ある りんごの かず', 'おさらの かず', 'ぜんぶの りんごの かず']) {
    const item = legend.getByText(text, { exact: true });
    await expect(item).toBeVisible();
    const size = await item.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  }
});

test('maze instruction breaks between phrases, not inside a word', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await createProfile(page, 'めいろ');
  await page.goto('/#/play/maze');
  await page.getByRole('button', { name: 'はじめる' }).click();
  const phrases = page.locator('.phrase');
  await expect(phrases).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    // それぞれのまとまりは 1行に おさまる
    const lines = await phrases.nth(i).evaluate((el) => el.getClientRects().length);
    expect(lines).toBe(1);
  }
});
