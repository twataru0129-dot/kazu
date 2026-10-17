import { expect, type Page } from '@playwright/test';

export function calc(expr: string): number {
  const m = expr.replace(/\s/g, '').match(/^(\d+)([+−×÷-])(\d+)/);
  if (!m) throw new Error(`cannot parse ${expr}`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  switch (m[2]) {
    case '+':
      return a + b;
    case '−':
    case '-':
      return a - b;
    case '×':
      return a * b;
    default:
      return a / b;
  }
}

export async function createProfile(page: Page, name: string, avatar = 'きつね') {
  await page.getByLabel('なまえ（ニックネーム・12もじ まで）').fill(name);
  await page.getByRole('button', { name: avatar }).click();
  await page.getByRole('button', { name: 'これで はじめる' }).click();
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
}

export async function openParent(page: Page) {
  await page.goto('/#/parent');
  const hold = page.getByRole('button', { name: 'ボタンを ながおしして ひらく' });
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'きろく' })).toBeVisible();
}
