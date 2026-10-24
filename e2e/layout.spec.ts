import { expect, test } from '@playwright/test';
import { createProfile } from './helpers';

const GAMES = ['decompose', 'pittari', 'make10', 'kufuu', 'balance', 'sequence', 'machine', 'flash', 'numberline', 'coins', 'shopping', 'sudoku', 'maze', 'shapes', 'mirror', 'pattern', 'missing-number', 'triangle-pattern', 'dot-connect', 'symbol-memory', 'nonogram', 'light-sequence', 'net-quiz', 'shuffle-cups', 'vanishing-path', 'clock-master', 'number-hunt', 'pizza-fractions', 'block-builder', 'magic-square'];

for (const width of [320, 375, 390, 430, 820, 1280]) {
  test(`no horizontal page overflow and every game opens at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await createProfile(page, 'レイアウト');
    const check = async (where: string) => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `overflow on ${where}`).toBeLessThanOrEqual(0);
    };
    for (const r of ['/home', '/calc', '/play', '/learn', '/learn/mul', '/learn/div', '/test']) {
      await page.goto(`/#${r}`);
      await check(r);
    }
    for (const g of GAMES) {
      await page.goto(`/#/play/${g}`);
      for (const d of ['かんたん', 'チャレンジ']) {
        await page.getByRole('radio', { name: new RegExp(d) }).click();
        await page.getByRole('button', { name: 'はじめる' }).click();
        // 魔法陣の むずかしい・チャレンジは ヒントなし（v1.7.1）。ほかは ヒントあり
        if (g === 'magic-square' && d === 'チャレンジ') {
          await expect(page.getByRole('button', { name: 'ちがう もんだいに する' })).toBeVisible();
          await expect(page.getByRole('button', { name: /ヒント/ })).toHaveCount(0);
        } else await expect(page.getByRole('button', { name: 'ヒント' })).toBeVisible();
        await check(`${g}/${d}`);
        await page.getByRole('button', { name: 'もどる' }).click();
      }
    }
    expect(errors).toEqual([]);
  });
}

test('reduced motion and mute settings are applied', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await createProfile(page, 'しずか');
  await page.getByRole('button', { name: 'おとを けす' }).click();
  await expect(page.getByRole('button', { name: 'おとを だす' })).toBeVisible();
  await page.goto('/#/learn/mul');
  await page.getByRole('button', { name: 'さいせい' }).click();
  await expect(page.getByText('りんごが 2こ のった おさらが あるよ。').first()).toBeVisible();
});
