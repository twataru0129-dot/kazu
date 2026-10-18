import { expect, test, type Page } from '@playwright/test';
import { createProfile, openParent } from './helpers';

/** ゲーム 17〜19 を、iPhone 相当の画面で、実際の画面操作で さいごまで遊べること */

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SIZES = [
  { name: 'iPhone SE（320×568）', width: 320, height: 568 },
  { name: 'iPhone SE 2/3（375×667）', width: 375, height: 667 },
  { name: 'iPhone 14（390×844）', width: 390, height: 844 },
  { name: 'iPhone Pro Max（430×932）', width: 430, height: 932 },
];
const LEVELS = ['かんたん', 'ふつう', 'むずかしい', 'チャレンジ'];

async function startGame(page: Page, id: string, level = 'かんたん') {
  await page.goto('/#/play');
  await page.goto(`/#/play/${id}`);
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'ヒント' })).toBeVisible();
}

/** 「4 + □ = 7」のような しき（かんたん：たしざん・□ は1つ）を解く */
function solveEasy(text: string): number {
  const t = text.replace(/\s/g, '');
  const m = t.match(/^(\d+|□)\+(\d+|□)=(\d+|□)$/);
  if (!m) throw new Error(`cannot parse ${t}`);
  const [a, b, c] = [m[1], m[2], m[3]];
  if (c === '□') return Number(a) + Number(b);
  return Number(c) - Number(a === '□' ? b : a);
}

const sampleStates = (page: Page) =>
  page.locator('[role="img"][aria-label^="みほん"] [data-state]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-state'))));

/** 上のバーの下端と、下の操作ドックの上端（いま見えている範囲） */
async function visibleBand(page: Page) {
  const top = (await page.locator('.topbar').first().boundingBox())!;
  const dock = (await page.getByTestId('dock').boundingBox())!;
  return { top: top.y + top.height, bottom: dock.y };
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: IPHONE_UA });

    test('17 むしくい算：5もん とおして遊べて、記録に残る', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'むし');
      await page.goto('/#/play');
      await expect(page.getByRole('button', { name: /17\s*むしくい算/ })).toBeVisible();
      await startGame(page, 'missing-number');
      for (let i = 0; i < 5; i++) {
        const text = (await page.getByLabel('しき').innerText()).replace(/\n/g, '');
        const ans = solveEasy(text);
        // しきと 数字キーが スクロールなしで見える
        const band = await visibleBand(page);
        const eq = (await page.getByLabel('しき').boundingBox())!;
        expect(eq.y).toBeGreaterThanOrEqual(band.top - 1);
        expect(eq.y + eq.height).toBeLessThanOrEqual(band.bottom + 1);
        // まちがえてから なおす（再挑戦は記録に残る）
        if (i === 0) {
          await page.getByRole('button', { name: String(ans > 1 ? ans - 1 : ans + 1), exact: true }).click();
          await page.getByRole('button', { name: 'こたえる' }).click();
          await expect(page.getByText(/ならないね|おしい/)).toBeVisible();
          await page.getByRole('button', { name: 'ぜんぶ けす' }).click();
          await page.waitForTimeout(350); // 二重送信ふせぎの間
        }
        for (const d of String(ans)) await page.getByRole('button', { name: d, exact: true }).click();
        await page.getByRole('button', { name: 'こたえる' }).click();
        await expect(page.getByText('せいかい！')).toBeVisible();
        await page.waitForTimeout(650); // 正解直後の連打ふせぎ
        await page.getByRole('button', { name: i === 4 ? 'おわり →' : 'つぎへ →' }).click();
      }
      await expect(page.getByText('5もん おわったよ！')).toBeVisible();
      await expect(page.getByText('せいかい 5もん')).toBeVisible();
      await openParent(page);
      const row = page.locator('tr').filter({ hasText: '17 むしくい算' });
      await expect(row).toBeVisible();
      await expect(row.locator('td').nth(1)).toHaveText('5');
    });

    test('18 さんかくもよう：みほんを まねて できる。アプリを切り替えても つづきから', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'さんかく');
      await startGame(page, 'triangle-pattern', 'ふつう');
      const states = await sampleStates(page);
      expect(states).toHaveLength(9);
      const cells = page.getByRole('gridcell');
      // 見本で ぬってある マスを1つ えらぶ（見本には必ず ぬったマスがある）。しろの マスでは操作が起きないため
      const first = states.findIndex((v) => v !== 0);
      expect(first).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < states[first]; k++) await cells.nth(first).click();
      await expect(cells.nth(first)).not.toHaveAttribute('aria-label', /：しろ$/);
      // アプリを切り替えた（画面が かくれた）ときは、待たずに すぐ保存する
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(150); // ふだんの保存（0.3秒後）より前に とじる
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/triangle-pattern');
      await page.getByRole('button', { name: 'つづきから' }).click();
      expect(await sampleStates(page)).toEqual(states); // 同じ もんだい
      await expect(cells.nth(first)).not.toHaveAttribute('aria-label', /：しろ$/); // 途中の盤面も もどる
      for (let i = 0; i < 9; i++) if (i !== first) for (let k = 0; k < states[i]; k++) await cells.nth(i).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText('せいかい！')).toBeVisible();
      await page.waitForTimeout(650);
      await page.getByRole('button', { name: 'おわり →' }).click();
      await expect(page.getByText('できたね！')).toBeVisible();
    });

    test('19 てんつなぎ：みほんの せんを ひいて できる（ひく順番は 自由）', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'てん');
      await startGame(page, 'dot-connect', 'チャレンジ');
      const segs = await page.locator('[data-testid="dots-sample"] [data-seg]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seg')!.split(',').map(Number)));
      expect(segs.length).toBeGreaterThan(0);
      const point = (x: number, y: number) => page.getByRole('button', { name: new RegExp(`^うえから ${y + 1}ばんめ ひだりから ${x + 1}ばんめの てん`) });
      for (const [x1, y1, x2, y2] of [...segs].reverse()) {
        await point(x2, y2).click();
        await point(x1, y1).click();
        await point(x1, y1).click(); // えらぶのを やめる
      }
      // よけいな せんを 1本 ひくと まちがい。「もどす」で けして もういちど
      const have = new Set(segs.map((s) => s.join(',')));
      const extra = [0, 1, 2, 3, 4].flatMap((x) => [0, 1, 2, 3, 4, 5].map((y) => [x, y, x + 1, y])).find((s) => !have.has(s.join(',')))!;
      await point(extra[0], extra[1]).click();
      await point(extra[2], extra[3]).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(/よけいな せんが 1ほん/).first()).toBeVisible();
      await page.getByRole('button', { name: 'もどす' }).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText('せいかい！')).toBeVisible();
      await page.waitForTimeout(650);
      await page.getByRole('button', { name: 'おわり →' }).click();
      await expect(page.getByText('できたね！')).toBeVisible();
    });

    test('盤面は 下のボタンに かくれず、押せる範囲は 48px 以上', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'ばん');
      for (const [id, target, board] of [
        ['triangle-pattern', page.getByRole('gridcell'), page.getByRole('grid', { name: 'きみの ばん' })],
        ['dot-connect', page.getByRole('button', { name: /の てん/ }), page.getByTestId('dots-board')],
      ] as const) {
        for (const level of LEVELS) {
          await startGame(page, id, level);
          // 押せる範囲
          for (const box of await target.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
            expect(box.w, `${id}/${level} width`).toBeGreaterThanOrEqual(47.5);
            expect(box.h, `${id}/${level} height`).toBeGreaterThanOrEqual(47.5);
          }
          const band = await visibleBand(page);
          const b = (await board.boundingBox())!;
          // 盤面が まるごと、上のバーと 下のボタンの あいだに おさまる大きさ
          expect(b.height, `${id}/${level} fits between bars`).toBeLessThanOrEqual(band.bottom - band.top);
          if (size.height >= 667) {
            // iPhone SE 2 以上は、スクロールしなくても 見本と盤面が ぜんぶ見える
            expect(b.y, `${id}/${level} top`).toBeGreaterThanOrEqual(band.top - 1);
            expect(b.y + b.height, `${id}/${level} bottom`).toBeLessThanOrEqual(band.bottom + 1);
          }
          // それより小さい画面では、盤面の高さが見える範囲に おさまるので スクロールすれば ぜんぶ見える
          const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(over, `${id}/${level} horizontal overflow`).toBeLessThanOrEqual(0);
          await page.getByRole('button', { name: 'もどる' }).click();
        }
      }
    });
  });
}
