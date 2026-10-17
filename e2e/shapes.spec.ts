import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';

type Tri = [number, number, number];
interface Puzzle {
  width: number;
  height: number;
  pieces: { tris: Tri[] }[];
  initialRot: number[];
  solution: { x: number; y: number }[];
}

async function readPuzzle(page: Page): Promise<Puzzle> {
  return page.evaluate(
    () =>
      new Promise<Puzzle>((resolve, reject) => {
        const open = indexedDB.open('kazu-asobi');
        open.onsuccess = () => {
          const req = open.result.transaction('sessions').objectStore('sessions').getAll();
          req.onsuccess = () => {
            const s = (req.result as { gameId?: string; status: string; activeDraft?: { round: { puzzle: Puzzle } } }[]).find((x) => x.gameId === 'shapes' && x.status === 'inProgress' && x.activeDraft);
            if (s) resolve(s.activeDraft!.round.puzzle);
            else reject(new Error('no draft'));
          };
        };
      }),
  );
}

async function solve(page: Page, useDrag: boolean) {
  const tray = page.getByLabel('ピース', { exact: true }).getByRole('button');
  // まず1つ置いて、途中保存から問題を読む
  await tray.first().click();
  const board = page.locator('svg[aria-label^="かげの かたち"]');
  await board.click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(600);
  const p = await readPuzzle(page);
  const toClient = async (cx: number, cy: number) => {
    // ボタン操作でページがスクロールするので、毎回 盤面の位置を取り直す
    await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = (await board.boundingBox())!;
    return { x: box.x + ((cx + 0.15) / (p.width + 0.3)) * box.width, y: box.y + ((cy + 0.15) / (p.height + 0.3)) * box.height };
  };
  for (let i = 0; i < p.pieces.length; i++) {
    // ピースの重心（アプリと同じ定義）を正解の位置に合わせてタップ・ドロップする
    const t = p.pieces[i].tris;
    const off = [[0.5, 1 / 6], [5 / 6, 0.5], [0.5, 5 / 6], [1 / 6, 0.5]];
    const w = (2 * t.reduce((s, [x, , q]) => s + x + off[q][0], 0)) / t.length;
    const h = (2 * t.reduce((s, [, y, q]) => s + y + off[q][1], 0)) / t.length;
    if ((await tray.nth(i).getAttribute('aria-pressed')) !== 'true') await tray.nth(i).click(); // えらぶ
    const rotations = (4 - (p.initialRot[i] % 4)) % 4;
    for (let k = 0; k < rotations; k++) await page.getByRole('button', { name: 'まわす' }).click();
    if (useDrag && i > 0) {
      await tray.nth(i).scrollIntoViewIfNeeded();
      const tb = (await tray.nth(i).boundingBox())!;
      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
      await page.mouse.down();
      await page.mouse.move(tb.x + tb.width / 2 + 20, tb.y + 10, { steps: 3 });
      const target = await toClient(p.solution[i].x + w / 2, p.solution[i].y + h / 2);
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await page.mouse.up();
    } else {
      const target = await toClient(p.solution[i].x + w / 2, p.solution[i].y + h / 2);
      await page.mouse.click(target.x, target.y);
    }
  }
}

for (const [label, drag] of [
  ['かんたん', false],
  ['ふつう', true],
  ['むずかしい', true],
  ['チャレンジ', false],
] as const) {
  test(`shape puzzle ${label} can be completed by ${drag ? 'dragging' : 'tapping'}`, async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'かたち');
    await page.goto('/#/play/shapes');
    await page.getByRole('radio', { name: new RegExp(label) }).click();
    await page.getByRole('button', { name: 'はじめる' }).click();
    await solve(page, drag);
    await expect(page.getByText('せいかい！')).toBeVisible();
  });
}
