import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';

/** 10をつくれ！・かたちパズル・なにがはいる？ の 画面の見え方（iPhone 相当〜PC） */

const SIZES = [
  { name: '320×568', width: 320, height: 568, mobile: true },
  { name: '375×667', width: 375, height: 667, mobile: true },
  { name: '390×844', width: 390, height: 844, mobile: true },
  { name: '430×932', width: 430, height: 932, mobile: true },
  { name: 'iPad 820×1180', width: 820, height: 1180, mobile: true },
  { name: 'PC 1280×800', width: 1280, height: 800, mobile: false },
];
const LEVELS = ['かんたん', 'ふつう', 'むずかしい', 'チャレンジ'];

async function startGame(page: Page, id: string, level: string) {
  await page.goto('/#/play');
  await page.goto(`/#/play/${id}`);
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'ヒント' })).toBeVisible();
}

const noOverflow = async (page: Page, where: string) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${where} overflow`).toBeLessThanOrEqual(0);

/** 上のバーの下端と、下の操作ドックの上端 */
async function band(page: Page) {
  const top = (await page.locator('.topbar').first().boundingBox())!;
  const dock = (await page.getByTestId('dock').boundingBox())!;
  return { top: top.y + top.height, bottom: dock.y };
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test('なにがはいる？：？も ならびの 1マス。左から右・上から下の じゅんで、マスの大きさが そろう', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'ならび');
      for (const level of LEVELS) {
        for (let round = 0; round < 3; round++) {
          await startGame(page, 'pattern', level);
          const items = page.getByRole('list', { name: 'ならび' }).getByRole('listitem');
          const cells = await items.evaluateAll((els) =>
            els.map((e) => {
              const r = e.getBoundingClientRect();
              return { i: Number(e.getAttribute('data-index')), hidden: e.getAttribute('data-hidden') === 'true', x: r.x, y: r.y, w: r.width, h: r.height };
            }),
          );
          const n = cells.length;
          expect(n, level).toBeGreaterThanOrEqual(6);
          expect(n, level).toBeLessThanOrEqual(10);
          // マスの大きさは そろっていて、小さすぎない
          for (const c of cells) {
            expect(Math.abs(c.w - cells[0].w)).toBeLessThan(1);
            expect(c.w).toBeGreaterThanOrEqual(52);
          }
          // 読む じゅん（上の行から、左から）が ならびの じゅんと 同じ
          const read = [...cells].sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x)).map((c) => c.i);
          expect(read).toEqual(cells.map((_, i) => i));
          // 行ごとの マスの数：上の行ほど 多いか同じ（最後の行は 左づめ）、どの行も 左はしが そろう
          const rows = [...new Set(cells.map((c) => Math.round(c.y)))];
          const perRow = rows.map((y) => cells.filter((c) => Math.round(c.y) === y));
          perRow.forEach((r, k) => {
            if (k > 0) expect(r.length).toBeLessThanOrEqual(perRow[k - 1].length);
            expect(Math.abs(r[0].x - perRow[0][0].x)).toBeLessThan(1);
          });
          if (size.width <= 430 && n === 8) expect(perRow.map((r) => r.length)).toEqual([4, 4]);
          // ？は ならびの中の 1マス（はてなの 枠は そのマスの中）
          const hidden = cells.filter((c) => c.hidden);
          expect(hidden).toHaveLength(1);
          const q = (await page.getByLabel('はてな').boundingBox())!;
          expect(q.x).toBeGreaterThanOrEqual(hidden[0].x - 1);
          expect(q.x + q.width).toBeLessThanOrEqual(hidden[0].x + hidden[0].w + 1);
          expect(q.y).toBeGreaterThanOrEqual(hidden[0].y - 1);
          // もんだい文
          await expect(page.getByText(hidden[0].i === n - 1 ? 'つぎに くるのは どれ？' : '？に はいるのは どれ？')).toBeVisible();
          // ならびは 下の せんたくしに かくれない
          const b = await band(page);
          const last = cells.at(-1)!;
          expect(last.y + last.h, `${level} hidden by dock`).toBeLessThanOrEqual(b.bottom + 1);
          for (const btn of await page.getByRole('group', { name: 'せんたくし' }).getByRole('button').all()) {
            const bb = (await btn.boundingBox())!;
            expect(bb.width).toBeGreaterThanOrEqual(48);
            expect(bb.height).toBeGreaterThanOrEqual(48);
          }
          await noOverflow(page, `pattern/${level}`);
          await page.getByRole('button', { name: 'もどる' }).click();
        }
      }
    });

    test('かたちパズル：なまえは出さず、盤面は 下のボタンに かくれない', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'かげ');
      for (const level of LEVELS) {
        await startGame(page, 'shapes', level);
        await expect(page.getByText('かげと おなじ かたちを つくろう！')).toBeVisible();
        await expect(page.getByText(/^「.+」$/)).toHaveCount(0);
        const board = (await page.locator('svg[aria-label^="かげの かたち"]').boundingBox())!;
        const b = await band(page);
        // 盤面は 見える範囲に おさまる大きさ（小さい画面では スクロールで ぜんぶ見える）
        expect(board.height, level).toBeLessThanOrEqual(b.bottom - b.top);
        if (size.height >= 667) expect(board.y + board.height, `${level} hidden by dock`).toBeLessThanOrEqual(b.bottom + 1);
        await noOverflow(page, `shapes/${level}`);
        await page.getByRole('button', { name: 'もどる' }).click();
      }
    });

    test('10をつくれ！：きごうの ボタンと しきが 見える', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'じゅう');
      for (const level of LEVELS) {
        await startGame(page, 'make10', level);
        const hand = page.getByLabel('てもちの カード').getByRole('button');
        await hand.first().click();
        await page.getByRole('radio', { name: 'ひく（−）' }).click();
        await hand.first().click();
        await expect(page.getByRole('button', { name: /^きごう/ })).toHaveText(['−']);
        const expr = (await page.getByLabel('しき').boundingBox())!;
        const b = await band(page);
        expect(expr.y, level).toBeGreaterThanOrEqual(b.top - 1);
        expect(expr.y + expr.height, `${level} hidden by dock`).toBeLessThanOrEqual(b.bottom + 1);
        for (const r of await page.getByRole('radiogroup', { name: 'つぎに つかう きごう' }).getByRole('radio').all()) await expect(r).toBeInViewport({ ratio: 1 });
        await noOverflow(page, `make10/${level}`);
        await page.getByRole('button', { name: 'もどる' }).click();
      }
    });
  });
}
