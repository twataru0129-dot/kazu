import { expect, test } from '@playwright/test';
import { createProfile } from './helpers';

test('works offline after the first visit and keeps records', async ({ page, context }) => {
  await page.goto('/');
  await createProfile(page, 'オフライン');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
  await page.goto('/#/play/sudoku');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('grid', { name: 'すうどく' })).toBeVisible();
  await context.setOffline(false);
});
