import { expect, test } from '@playwright/test';
import { createProfile } from './helpers';

for (const vp of [
  { width: 320, height: 568, mobile: true },
  { width: 375, height: 667, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 1280, height: 800, mobile: false },
]) {
  test(`10をつくれ！ かんたん：＋／− を えらんでから カードを ならべて解ける（${vp.width}px）`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.mobile, isMobile: vp.mobile });
    const page = await ctx.newPage();
    await page.goto('/');
    await createProfile(page, 'カード');
    await page.goto('/#/play/make10');
    await page.getByRole('radio', { name: /かんたん/ }).click();
    await page.getByRole('button', { name: 'はじめる' }).click();
    await expect(page.getByText('＋か −を えらんでから')).toBeVisible();
    const plus = page.getByRole('radio', { name: 'たす（＋）' });
    const minus = page.getByRole('radio', { name: 'ひく（−）' });
    const signs = page.getByRole('button', { name: /^きごう/ });

    for (let round = 0; round < 3; round++) {
      const hand = page.getByLabel('てもちの カード').getByRole('button');
      const values: number[] = [];
      for (let i = 0; i < (await hand.count()); i++) values.push(Number(await hand.nth(i).innerText()));
      // きごうの ボタンは 大きく、下のドックの中で 見えている
      await expect(plus).toHaveAttribute('aria-checked', 'true');
      for (const b of [plus, minus]) {
        const box = (await b.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
        await expect(b).toBeInViewport({ ratio: 1 });
      }

      /** a ○ b ○ c を、きごうを えらんでから カードを タップして つくる */
      const build = async (order: number[], o1: '+' | '-', o2: '+' | '-') => {
        if ((await page.getByRole('button', { name: /の カードを もどす$/ }).count()) > 0) await page.getByRole('button', { name: 'やりなおす' }).click();
        await expect(plus).toHaveAttribute('aria-checked', 'true'); // やりなおすと ＋ に もどる
        const tap = (v: number) => page.getByLabel('てもちの カード').getByRole('button', { name: `${v} の カード` }).first().click();
        await tap(order[0]);
        await expect(signs).toHaveCount(0); // 1まいめには きごうが つかない
        await (o1 === '+' ? plus : minus).click();
        await tap(order[1]);
        await (o2 === '+' ? plus : minus).click();
        await expect(signs.nth(0)).toHaveText(o1 === '+' ? '+' : '−'); // えらびなおしても ならべた きごうは かわらない
        await tap(order[2]);
        await expect(signs).toHaveCount(2);
        await expect(signs.nth(1)).toHaveText(o2 === '+' ? '+' : '−');
        const v1 = o1 === '+' ? order[0] + order[1] : order[0] - order[1];
        const v = o2 === '+' ? v1 + order[2] : v1 - order[2];
        await expect(page.getByText(/^いま：/)).toHaveText(`いま：${v}`);
        return v === 10 && v1 >= 0;
      };

      let found = false;
      for (const order of [values, [...values].sort((x, y) => y - x)]) {
        for (const [o1, o2] of [['+', '+'], ['+', '-'], ['-', '+'], ['-', '-']] as const) {
          if (await build(order, o1, o2)) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      expect(found).toBe(true);
      // 3まいと きごう2つが 1れつに ならび、しきは 下のボタンに かくれない
      const tops = await page.getByRole('button', { name: /の カードを もどす$/ }).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
      const expr = (await page.getByLabel('しき').boundingBox())!;
      const dock = (await page.getByTestId('dock').boundingBox())!;
      expect(expr.y + expr.height).toBeLessThanOrEqual(dock.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const answer = page.getByRole('button', { name: 'こたえる' });
      await expect(answer).toBeInViewport({ ratio: 1 });
      await answer.click();
      await expect(page.getByText('せいかい！')).toBeVisible();
      await page.waitForTimeout(650);
      await page.getByRole('button', { name: /つぎへ/ }).click();
    }
    await ctx.close();
  });
}
