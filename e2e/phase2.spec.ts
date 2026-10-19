import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';

/** ゲーム 20〜22 を、iPhone 相当〜タブレットの画面で 実際の操作で さいごまで遊べること */

const SIZES = [
  { name: '320×568', width: 320, height: 568, mobile: true },
  { name: '375×667', width: 375, height: 667, mobile: true },
  { name: '390×844', width: 390, height: 844, mobile: true },
  { name: '430×932', width: 430, height: 932, mobile: true },
  { name: '768×1024', width: 768, height: 1024, mobile: true },
];
const SYMBOL_BY_NAME: Record<string, string> = { まる: 'まる', にじゅうまる: 'にじゅうまる', ばつ: 'ばつ', さんかく: 'さんかく', しかく: 'しかく', ひしがた: 'ひしがた', ほし: 'ほし' };
const LIGHT_NAMES = ['あかの まる', 'あおの さんかく', 'みどりの しかく', 'きいろの ほし', 'むらさきの ひしがた', 'オレンジの ハート', 'みずいろの じゅうじ', 'ピンクの つき', 'はいいろの ろっかく'];

async function startGame(page: Page, id: string, level: string) {
  await page.goto('/#/play');
  await page.goto(`/#/play/${id}`);
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'ヒント' })).toBeVisible();
}

/** 途中保存（IndexedDB）から いまの問題を読む（テストで 答えを知るため） */
async function readDraftPuzzle<T>(page: Page, gameId: string): Promise<T> {
  await page.waitForTimeout(450); // 途中保存は 少し待ってから書かれる
  return page.evaluate(
    (id) =>
      new Promise<T>((resolve, reject) => {
        const open = indexedDB.open('kazu-asobi');
        open.onsuccess = () => {
          const req = open.result.transaction('sessions').objectStore('sessions').getAll();
          req.onsuccess = () => {
            const s = (req.result as { gameId?: string; status: string; activeDraft?: { round: { puzzle: T } } }[]).find((x) => x.gameId === id && x.status === 'inProgress' && x.activeDraft);
            if (s) resolve(s.activeDraft!.round.puzzle);
            else reject(new Error('no draft'));
          };
        };
      }),
    gameId,
  );
}

async function noOverflow(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${where} overflow`).toBeLessThanOrEqual(0);
}

/** 上のバーの下端と、下の操作ドックの上端 */
async function band(page: Page) {
  const top = (await page.locator('.topbar').first().boundingBox())!;
  const dock = (await page.getByTestId('dock').boundingBox())!;
  return { top: top.y + top.height, bottom: dock.y };
}

async function finish(page: Page) {
  await expect(page.getByText('せいかい！')).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'おわり →' }).click();
  await expect(page.getByText('できたね！')).toBeVisible();
}

/** 見本の格子（aria-label）から、記号の名前を マスの順に読む */
async function readSample(page: Page): Promise<(string | null)[]> {
  const labels = await page.getByRole('grid', { name: 'みほん' }).getByRole('gridcell').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!));
  return labels.map((l) => {
    const v = l.split('：')[1];
    return v === 'から' ? null : v;
  });
}

async function placeAll(page: Page, sample: (string | null)[], size: number) {
  for (const name of new Set(sample.filter((x): x is string => !!x))) {
    await page.getByRole('radio', { name: SYMBOL_BY_NAME[name], exact: true }).click();
    for (let i = 0; i < sample.length; i++) if (sample[i] === name) await page.getByRole('gridcell', { name: new RegExp(`^こたえ うえから ${Math.floor(i / size) + 1}ばんめ ひだりから ${(i % size) + 1}ばんめ：`) }).click();
  }
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test('20 きごうを おぼえよう：ふつう（見本あり）と むずかしい（8びょう）を クリア。再開で 見本は出ない', async ({ page }) => {
      await page.clock.install();
      await page.goto('/');
      await createProfile(page, 'きごう');
      await expect(page.getByRole('heading', { name: 'きおく・しゅうちゅう' })).toHaveCount(0); // ホームには ない
      await page.goto('/#/play');
      await expect(page.getByRole('heading', { name: 'きおく・しゅうちゅう' })).toBeVisible();
      await expect(page.getByRole('button', { name: /20\s*きごうを おぼえよう/ })).toBeVisible();

      // ふつう：見本は いつも見える
      await startGame(page, 'symbol-memory', 'ふつう');
      const sample = await readSample(page);
      await placeAll(page, sample, 3);
      // よけいな記号を おくと まちがい → もどすで なおす
      const blank = sample.indexOf(null);
      await page.getByRole('gridcell', { name: new RegExp(`^こたえ うえから ${Math.floor(blank / 3) + 1}ばんめ ひだりから ${(blank % 3) + 1}ばんめ：`) }).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(/みほんと ちがう マスが 1こ/).first()).toBeVisible();
      await page.getByRole('button', { name: 'もどす' }).click();
      await noOverflow(page, 'symbol normal');
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await finish(page);

      // むずかしい：「みる」→ 8びょう → 答える。とちゅうで リロードしても 見本は 出ない
      await startGame(page, 'symbol-memory', 'むずかしい');
      await expect(page.getByRole('grid', { name: 'こたえ' })).toHaveCount(0);
      await page.getByRole('button', { name: 'みる', exact: true }).click();
      await expect(page.getByText('のこり 8')).toBeVisible();
      await expect(page.getByRole('grid', { name: 'こたえ' })).toHaveCount(0); // 見ている あいだは 答えられない
      const hard = await readSample(page);
      await page.clock.runFor(8500);
      await expect(page.getByRole('grid', { name: 'みほん' })).toHaveCount(0);
      const first = hard.findIndex((x) => x !== null);
      await page.getByRole('radio', { name: hard[first]!, exact: true }).click();
      await page.getByRole('gridcell', { name: new RegExp(`^こたえ うえから ${Math.floor(first / 4) + 1}ばんめ ひだりから ${(first % 4) + 1}ばんめ：`) }).click();
      await page.clock.runFor(500);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/symbol-memory');
      await page.getByRole('button', { name: 'つづきから' }).click();
      await expect(page.getByRole('grid', { name: 'みほん' })).toHaveCount(0);
      await expect(page.getByRole('gridcell', { name: new RegExp(`^こたえ うえから ${Math.floor(first / 4) + 1}ばんめ ひだりから ${(first % 4) + 1}ばんめ：${hard[first]}`) })).toBeVisible();
      // もういちど みる（ヒントとして 回数を 記録）
      await page.getByRole('button', { name: 'もういちど みる' }).click();
      await page.getByRole('button', { name: 'おぼえた！' }).click();
      await expect(page.getByText('（1かい みた）')).toBeVisible();
      await placeAll(page, hard, 4);
      const b = await band(page);
      const grid = (await page.getByRole('grid', { name: 'こたえ' }).boundingBox())!;
      expect(grid.height).toBeLessThanOrEqual(b.bottom - b.top);
      await noOverflow(page, 'symbol hard');
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await finish(page);
    });

    test('21 ピクロス：かんたんを クリアすると 絵の なまえ。チャレンジは 大きく表示して スクロールしても 数字が見える', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'ぴくろす');
      await startGame(page, 'nonogram', 'かんたん');
      const cell = (r: number, c: number) => page.getByRole('gridcell', { name: new RegExp(`^うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ：`) });
      await page.getByRole('radio', { name: '×' }).click();
      await cell(0, 0).click(); // まずは × を1つ（途中保存から問題を読む）
      const p = await readDraftPuzzle<{ solution: string[]; name: string }>(page, 'nonogram');
      await page.getByRole('radio', { name: 'けす' }).click();
      await cell(0, 0).click();
      await page.getByRole('radio', { name: /ぬる/ }).click();
      const blacks: [number, number][] = [];
      p.solution.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && blacks.push([r, c])));
      for (const [r, c] of blacks.slice(1)) await cell(r, c).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(/すうじと あわない/).first()).toBeVisible();
      await cell(...blacks[0]).click();
      await page.getByRole('button', { name: 'もどす' }).click();
      await page.getByRole('button', { name: 'やりなおし' }).click();
      await noOverflow(page, 'nonogram easy');
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(`「${p.name}」が できたよ！`)).toBeVisible();
      await finish(page);

      // チャレンジ（12×12）：押せる大きさ・数字との対応・ドックに かくれない
      await startGame(page, 'nonogram', 'チャレンジ');
      const box = (await cell(0, 0).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(size.width < 500 ? 39 : 30);
      const scroller = page.getByTestId('nonogram-scroll');
      const sb = (await scroller.boundingBox())!;
      const b = await band(page);
      expect(sb.y + sb.height, 'board hidden by dock').toBeLessThanOrEqual(b.bottom + 1);
      // いちばん右下まで スクロールしても、その列・行の 数字が 見えている
      await scroller.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight));
      const last = cell(11, 11);
      await expect(last).toBeInViewport();
      const colHead = page.getByRole('columnheader', { name: /ひだりから 12ばんめの れつ/ });
      const rowHead = page.getByRole('rowheader', { name: /うえから 12ばんめの ぎょう/ });
      const ch = (await colHead.boundingBox())!;
      const rh = (await rowHead.boundingBox())!;
      const sb2 = (await scroller.boundingBox())!;
      expect(ch.y).toBeGreaterThanOrEqual(sb2.y - 1); // 上に くっついている
      expect(rh.x).toBeGreaterThanOrEqual(sb2.x - 1); // 左に くっついている
      await last.click();
      await expect(last).toHaveAttribute('aria-label', /くろ$/);
      await noOverflow(page, 'nonogram challenge');
      // リロードしても 盤面が もどる
      await page.waitForTimeout(450);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/nonogram');
      await page.getByRole('button', { name: 'つづきから' }).click();
      await expect(cell(11, 11)).toHaveAttribute('aria-label', /くろ$/);
    });

    test('22 ひかる じゅんばん：音を けしても 5ラウンド できる。まちがえたら 同じ ラウンドを もういちど', async ({ page }) => {
      await page.clock.install();
      await page.goto('/');
      await createProfile(page, 'ひかる');
      await startGame(page, 'light-sequence', 'かんたん');
      await page.getByRole('button', { name: 'おとを けす' }).click();
      const buttons = page.getByRole('group', { name: 'ひかる ボタン' }).getByRole('button');
      await expect(buttons).toHaveCount(4);
      for (const bb of await buttons.all()) {
        const r = (await bb.boundingBox())!;
        expect(r.width).toBeGreaterThanOrEqual(48);
        expect(r.height).toBeGreaterThanOrEqual(48);
      }
      await page.getByRole('button', { name: 'みる', exact: true }).click();
      await expect(buttons.first()).toBeDisabled(); // みている あいだは おせない
      const p = await readDraftPuzzle<{ rounds: number[][]; startLen: number }>(page, 'light-sequence');
      // 5ラウンドぶん べつべつの 順番。まえの ラウンドに 1こ 足しただけ では ない
      expect(p.rounds.map((x) => x.length)).toEqual([2, 3, 4, 5, 6]);
      for (let k = 1; k < 5; k++) expect(p.rounds[k].slice(0, k + 1)).not.toEqual(p.rounds[k - 1]);
      await page.clock.runFor(6000);
      // まちがえる
      const wrong = (p.rounds[0][0] + 1) % 4;
      await page.getByRole('button', { name: LIGHT_NAMES[wrong], exact: true }).click();
      await expect(page.getByTestId('light-message')).toContainText('もういちど');
      await expect(page.getByText('ラウンド 1／5')).toBeVisible();
      for (let k = 0; k < 5; k++) {
        if (k === 2) {
          // とちゅうで 読みこみなおしても 同じ 順番の つづきから
          await page.waitForTimeout(450);
          await page.reload();
          await page.goto('/#/play');
          await page.goto('/#/play/light-sequence');
          await page.getByRole('button', { name: 'つづきから' }).click();
          await expect(page.getByText('ラウンド 3／5')).toBeVisible();
          expect((await readDraftPuzzle<{ rounds: number[][] }>(page, 'light-sequence')).rounds).toEqual(p.rounds);
        }
        await page.getByRole('button', { name: /みる$/ }).click();
        await page.clock.runFor(15000);
        await expect(page.getByTestId('light-message')).toHaveText('ひかった じゅんに おしてね');
        for (const b of p.rounds[k]) await page.getByRole('button', { name: LIGHT_NAMES[b], exact: true }).click();
        if (k < 4) await expect(page.getByTestId('light-message')).toHaveText(`できた！ つぎは ちがう じゅんばんで ${k + 3}こ だよ`);
      }
      const grid = (await page.getByRole('group', { name: 'ひかる ボタン' }).boundingBox())!;
      const b = await band(page);
      expect(grid.y + grid.height, 'buttons hidden by dock').toBeLessThanOrEqual(b.bottom + 1);
      await noOverflow(page, 'light');
      await finish(page);
    });
  });
}

test.describe('保護者の時間制限', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const PIN = '2580';
  const typePin = async (page: Page, pin: string) => {
    for (const d of pin) await page.keyboard.press(d);
    await page.keyboard.press('Enter');
  };

  test('きごうを おぼえよう の 見本を 見ている とちゅうで 時間切れ → ロック。解除して もどっても 見本は 出ない', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await createProfile(page, 'じかん');
    // 5ふんの 制限を つける（長押しで おとなのメニュー → 設定 → 遊ぶ時間）
    await page.goto('/#/parent');
    const hold = page.getByRole('button', { name: 'ボタンを ながおしして ひらく' });
    const hb = (await hold.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.clock.runFor(1500);
    await page.mouse.up();
    await page.getByRole('tab', { name: '設定' }).click();
    await page.getByRole('button', { name: '暗証番号を設定' }).click();
    await typePin(page, PIN);
    await typePin(page, PIN);
    await expect(page.getByText('暗証番号を保存しました')).toBeVisible();
    await page.getByRole('radio', { name: '制限する' }).click();
    await page.getByRole('radio', { name: '5分', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByTestId('time-limit-status')).toContainText('1回 5分');

    await startGame(page, 'symbol-memory', 'チャレンジ');
    await page.getByRole('button', { name: 'みる', exact: true }).click();
    await expect(page.getByRole('grid', { name: 'みほん' })).toBeVisible();
    for (let t = 0; t < 12 && (await page.getByTestId('lock-screen').count()) === 0; t++) {
      await page.clock.fastForward(30_000);
      await page.waitForTimeout(40);
    }
    await expect(page.getByTestId('lock-screen')).toBeVisible();
    await expect(page.getByRole('grid', { name: 'みほん' })).toHaveCount(0);
    await typePin(page, PIN);
    await expect(page.getByTestId('lock-screen')).toHaveCount(0);
    await page.goto('/#/play');
    await page.goto('/#/play/symbol-memory');
    // 見本は 見ている とちゅうだった → 再開しても 見本は 出さず「みる」から
    const resume = page.getByRole('button', { name: 'つづきから' });
    if (await resume.count()) await resume.click();
    else await page.getByRole('button', { name: 'はじめる' }).click();
    await expect(page.getByRole('grid', { name: 'みほん' })).toHaveCount(0);
  });
});
