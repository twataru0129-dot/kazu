import { expect, test } from '@playwright/test';
import { createProfile } from './helpers';

for (const vp of [
  { width: 375, height: 667, mobile: true },
  { width: 1280, height: 800, mobile: false },
]) {
  test(`10をつくれ！ かんたん：＋／− を きりかえて解ける（${vp.width}px）`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.mobile, isMobile: vp.mobile });
    const page = await ctx.newPage();
    await page.goto('/');
    await createProfile(page, 'カード');
    await page.goto('/#/play/make10');
    await page.getByRole('radio', { name: /かんたん/ }).click();
    await page.getByRole('button', { name: 'はじめる' }).click();
    await expect(page.getByText('＋と−を おして')).toBeVisible();

    for (let round = 0; round < 3; round++) {
      // てもちの カードを ぜんぶ ならべる
      const hand = page.getByLabel('てもちの カード').getByRole('button');
      const values: number[] = [];
      while ((await hand.count()) > 0) {
        values.push(Number(await hand.first().innerText()));
        await hand.first().click();
      }
      const toggles = page.getByRole('button', { name: /^きごう/ });
      await expect(toggles).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        const b = (await toggles.nth(i).boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        await expect(toggles.nth(i)).toBeInViewport({ ratio: 1 });
      }
      // 3まいと きごう2つが 1れつに ならぶ（はみ出さない）
      const tops = await page.getByRole('button', { name: /の カードを もどす$/ }).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

      // ＋ − の 4とおりを ためして、10 に なる組み合わせを さがす（「いま」が すぐ変わることも確認）
      const [a, b, c] = values;
      const combos: ['+' | '-', '+' | '-'][] = [
        ['+', '+'],
        ['+', '-'],
        ['-', '+'],
        ['-', '-'],
      ];
      let found = false;
      for (const [o1, o2] of combos) {
        const cur = async (i: number) => ((await toggles.nth(i).getAttribute('aria-label'))!.startsWith('きごう たす') ? '+' : '-');
        if ((await cur(0)) !== o1) await toggles.nth(0).click();
        if ((await cur(1)) !== o2) await toggles.nth(1).click();
        const v1 = o1 === '+' ? a + b : a - b;
        const v = o2 === '+' ? v1 + c : v1 - c;
        await expect(page.getByText(/^いま：/)).toHaveText(`いま：${v}`);
        if (v === 10 && v1 >= 0) {
          found = true;
          break;
        }
      }
      if (!found) {
        // この並びでは できないとき（例：2・8・4 は 8 + 4 − 2 の順が必要）は、ならべかえて ためす
        await page.getByRole('button', { name: 'やりなおす' }).click();
        const order = [...values].sort((x, y) => y - x); // 大きい順にすると たしてから ひける
        for (const v of order) await page.getByLabel('てもちの カード').getByRole('button', { name: `${v} の カード` }).first().click();
        const [x, y, z] = order;
        if (x + y + z !== 10) await toggles.nth(1).click(); // x + y − z
        await expect(page.getByText(/^いま：/)).toHaveText('いま：10');
      }
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
