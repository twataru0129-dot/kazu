import { expect, test, type Locator, type Page } from '@playwright/test';
import { createProfile } from './helpers';
import { netAnswers, type NetQuizAnswer, type NetQuizPuzzle } from '../src/domain/games/netQuiz';
import { arrangementAfter, positionOf, type ShuffleCupsPuzzle } from '../src/domain/games/shuffleCups';
import type { VanishingPathPuzzle } from '../src/domain/games/vanishingPath';

/** ゲーム 23〜25 を、iPhone 相当〜PC の画面で 実際の操作で さいごまで遊べること（答えは 保存された 問題から 計算する） */

const SIZES = [
  { name: '320×568', width: 320, height: 568, mobile: true },
  { name: '375×667', width: 375, height: 667, mobile: true },
  { name: '390×844', width: 390, height: 844, mobile: true },
  { name: '430×932', width: 430, height: 932, mobile: true },
  { name: '768×1024', width: 768, height: 1024, mobile: true },
  { name: '1280×800', width: 1280, height: 800, mobile: false },
];
const SIDE_NAME = ['みぎ', 'した', 'ひだり', 'うえ'];

async function startGame(page: Page, id: string, level: string) {
  await page.goto('/#/play');
  await page.goto(`/#/play/${id}`);
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'ヒント' })).toBeVisible();
}

/** IndexedDB の ストアを ぜんぶ 読む */
function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('kazu-asobi');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error);
        };
      }),
    store,
  );
}

/** 途中保存から いまの問題を読む */
async function readDraftPuzzle<T>(page: Page, gameId: string, match: (p: T) => boolean = () => true): Promise<T> {
  let found: T | undefined;
  await expect
    .poll(async () => {
      const all = await readStore<{ gameId?: string; status: string; createdAt: string; activeDraft?: { round: { puzzle: T } } }>(page, 'sessions');
      // いちばん あとに はじめた あそびの 途中保存（前の あそびが のこって いても まちがえない）
      found = all
        .filter((x) => x.gameId === gameId && x.status === 'inProgress' && x.activeDraft && match(x.activeDraft.round.puzzle))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1)?.activeDraft?.round.puzzle;
      return !!found;
    })
    .toBe(true);
  return found!;
}

async function noOverflow(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${where} overflow`).toBeLessThanOrEqual(0);
}

/** 要素が 下の 操作ドックに かくれて いない */
async function aboveDock(page: Page, el: Locator, where: string) {
  const box = (await el.boundingBox())!;
  const dock = (await page.getByTestId('dock').boundingBox())!;
  expect(box.y + box.height, `${where} hidden by dock`).toBeLessThanOrEqual(dock.y + 1);
}

async function finish(page: Page) {
  await expect(page.getByText('せいかい！')).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'おわり →' }).click();
  await expect(page.getByText('できたね！')).toBeVisible();
}

const answerLabel = (p: NetQuizPuzzle, a: NonNullable<NetQuizAnswer>) => {
  const [r, c] = p.cells[a.cell];
  const cell = `うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめの めん`;
  return new RegExp(`^${a.kind === 'face' ? cell : `${cell}の ${SIDE_NAME[a.side]}の へん`}`);
};

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test('23 てんかいずクイズ：5もん セット。まちがえた あと 正しい めん・へんを タップして すすむ', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'てんかい');
      for (const level of ['かんたん', 'チャレンジ']) {
        await startGame(page, 'net-quiz', level);
        for (let q = 0; q < 5; q++) {
          const net = page.getByRole('group', { name: 'てんかいず' });
          await aboveDock(page, net, `net ${level} ${q}`);
          await noOverflow(page, `net ${level} ${q}`);
          const before = (await readStore<{ gameId?: string }>(page, 'attempts')).filter((a) => a.gameId === 'net-quiz').length;
          // まず どれか 1つ えらんで こたえる（あたりでも はずれでも よい）
          await net.getByRole('button').first().click();
          await page.getByRole('button', { name: 'これに する' }).click();
          let snap: NetQuizPuzzle | undefined;
          await expect
            .poll(async () => {
              const list = (await readStore<{ gameId?: string; answeredAt: string; questionSnapshot: NetQuizPuzzle }>(page, 'attempts')).filter((a) => a.gameId === 'net-quiz');
              snap = list.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)).at(-1)?.questionSnapshot;
              return list.length > before;
            })
            .toBe(true);
          if (!(await page.getByText('せいかい！').isVisible())) {
            const answers = netAnswers(snap!);
            const a = answers[q % answers.length]!; // きりひらいた へんは 2か所の どちらでも
            await net.getByRole('button', { name: answerLabel(snap!, a) }).click();
            await page.getByRole('button', { name: 'これに する' }).click();
          }
          await expect(page.getByText('せいかい！')).toBeVisible();
          await page.waitForTimeout(650);
          await page.getByRole('button', { name: q < 4 ? 'つぎへ →' : 'おわり →' }).click();
        }
        await expect(page.getByText('5もん おわったよ！')).toBeVisible();
        await expect(page.getByText('せいかい 5もん')).toBeVisible();
      }
    });

    test('24 シャッフルカップ：見ている あいだは おせない。まちがえたら おなじ ラウンド。5ラウンド クリア、ボール 2この ラウンドも', async ({ page }) => {
      await page.clock.install();
      await page.goto('/');
      await createProfile(page, 'カップ');
      await startGame(page, 'shuffle-cups', 'かんたん');
      const group = page.getByRole('group', { name: 'カップ' });
      await expect(group.getByRole('button')).toHaveCount(3);
      await page.getByRole('button', { name: 'みる', exact: true }).click();
      await expect(group.getByRole('button').first()).toBeDisabled();
      const p = await readDraftPuzzle<ShuffleCupsPuzzle>(page, 'shuffle-cups');
      await page.clock.runFor(10000);
      const cupAt = (pos: number) => group.getByRole('button', { name: new RegExp(`^ひだりから ${pos + 1}ばんめの カップ`) });
      const posOf = (k: number, ball = 0) => positionOf(arrangementAfter(p.cups, p.rounds[k].swaps), p.rounds[k].balls[ball]);
      await cupAt((posOf(0) + 1) % 3).click();
      await expect(page.getByTestId('cups-message')).toContainText('ざんねん');
      await expect(page.getByText('ラウンド 1／5')).toBeVisible();
      for (let k = 0; k < 5; k++) {
        await page.getByRole('button', { name: /みる$/ }).click();
        await page.clock.runFor(10000);
        await expect(cupAt(0)).toBeEnabled();
        await aboveDock(page, group, `cups ${k}`);
        await cupAt(posOf(k)).click();
        if (k < 4) {
          await expect(page.getByTestId('cups-message')).toHaveText('あたり！');
          await page.getByRole('button', { name: 'つぎの ラウンド' }).click();
        }
      }
      await noOverflow(page, 'cups');
      await finish(page);

      // チャレンジ：6こ・ボール 2こ。あか → あお の じゅんに えらぶ
      await startGame(page, 'shuffle-cups', 'チャレンジ');
      await expect(group.getByRole('button')).toHaveCount(6);
      for (const b of await group.getByRole('button').all()) expect((await b.boundingBox())!.width).toBeGreaterThanOrEqual(38);
      await page.getByRole('button', { name: 'みる', exact: true }).click();
      const c = await readDraftPuzzle<ShuffleCupsPuzzle>(page, 'shuffle-cups');
      await page.clock.runFor(15000);
      const end = arrangementAfter(c.cups, c.rounds[0].swaps);
      await cupAt(positionOf(end, c.rounds[0].balls[0])).click();
      await cupAt(positionOf(end, c.rounds[0].balls[1])).click();
      await aboveDock(page, group, 'cups challenge');
      await noOverflow(page, 'cups challenge');
      await page.getByRole('button', { name: 'こたえる' }).click();
      await expect(page.getByTestId('cups-message')).toHaveText('あたり！');

      // むずかしい：1回 320ms。みせる 1.4びょう＋0.5びょう＋6回ぶんで こたえられる（まえの はやさでは まだ とちゅう）
      await startGame(page, 'shuffle-cups', 'むずかしい');
      await page.getByRole('button', { name: 'みる', exact: true }).click();
      await page.clock.runFor(1400 + 500 + 6 * (320 + 50) + 400);
      const h = await readDraftPuzzle<ShuffleCupsPuzzle>(page, 'shuffle-cups', (x) => x.cups === 4);
      expect(h.swapMs).toBe(320);
      await expect(group).toHaveAttribute('data-phase', 'answer');
      const hEnd = arrangementAfter(h.cups, h.rounds[0].swaps);
      await cupAt(positionOf(hEnd, h.rounds[0].balls[0])).click();
      await expect(page.getByTestId('cups-message')).toHaveText('あたり！');
    });

    test('25 きえる みち：道が きえたら となりを じゅんに。まちがえたら スタートから。リロードしても 同じ 道の つづき', async ({ page }) => {
      await page.clock.install();
      await page.goto('/');
      await createProfile(page, 'みち');
      await startGame(page, 'vanishing-path', 'チャレンジ');
      const board = page.getByRole('grid', { name: 'みちの ばん' });
      await page.getByRole('button', { name: 'みる', exact: true }).click();
      await expect(board).toHaveAttribute('data-phase', 'show');
      await aboveDock(page, page.getByTestId('path-scroll'), 'path show');
      const p = await readDraftPuzzle<VanishingPathPuzzle>(page, 'vanishing-path');
      await page.clock.runFor(p.showMs + 100);
      await expect(board).toHaveAttribute('data-phase', 'input');
      if (await page.getByRole('button', { name: 'おおきく する' }).isVisible()) await page.getByRole('button', { name: 'おおきく する' }).click();
      const cell = ([r, c]: [number, number]) => board.getByRole('gridcell', { name: new RegExp(`^うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ`) });
      // ゴールへ とびこしても すすまない
      await cell(p.rounds[0].at(-1)!).click();
      await expect(page.getByTestId('path-message')).toContainText('となり');
      // 2マス すすんでから まちがえる → スタートから
      await cell(p.rounds[0][1]).click();
      await cell(p.rounds[0][2]).click();
      const [r1, c1] = p.rounds[0][2];
      const wrong = ([
        [r1 + 1, c1],
        [r1 - 1, c1],
        [r1, c1 + 1],
        [r1, c1 - 1],
      ] as [number, number][]).find(([r, c]) => r >= 0 && c >= 0 && r < p.size && c < p.size && !p.rounds[0].slice(1, 4).some((x) => x[0] === r && x[1] === c))!;
      await cell(wrong).click();
      await expect(page.getByTestId('path-message')).toContainText('スタートから');
      await expect(cell(p.rounds[0][0])).toHaveAttribute('aria-label', /いま いる ところ/);
      for (let k = 0; k < 5; k++) {
        if (k === 2) {
          // とちゅうで 読みこみなおす → 「みる」待ちの つづき（道は 自動で 出ない）
          await page.clock.runFor(500); // 途中保存（少し待ってから 書く）を すませる
          await expect.poll(async () => (await readStore<{ gameId?: string; activeDraft?: { view?: { round: number } } }>(page, 'sessions')).find((x) => x.gameId === 'vanishing-path' && x.activeDraft)?.activeDraft?.view?.round).toBe(2);
          await page.reload();
          await page.goto('/#/play');
          await page.goto('/#/play/vanishing-path');
          await page.getByRole('button', { name: 'つづきから' }).click();
          await expect(page.getByText('ラウンド 3／5')).toBeVisible();
          await expect(board).toHaveAttribute('data-phase', 'ready');
          expect((await readDraftPuzzle<VanishingPathPuzzle>(page, 'vanishing-path')).rounds).toEqual(p.rounds);
        }
        if (k > 0) {
          await page.getByRole('button', { name: /みる$/ }).click();
          await page.getByRole('button', { name: 'おぼえた！' }).click();
        }
        for (const c of p.rounds[k].slice(1)) await cell(c).click();
        if (k < 4) await page.getByRole('button', { name: 'つぎの ラウンド' }).click();
      }
      await noOverflow(page, 'path');
      await finish(page);
    });
  });
}
