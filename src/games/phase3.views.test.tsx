import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { createRng } from '../domain/random';
import { GAME_BY_ID } from '../domain/games/registry';
import { generatePuzzle, type GameId, type Judgement } from '../domain/games/types';
import type { Difficulty } from '../domain/types';
import { GAME_VIEWS } from './views';
import { netAnswers, netQuiz, solveNet, type NetQuizPuzzle } from '../domain/games/netQuiz';
import { arrangementAfter, CUP_ROUNDS, positionOf, shuffleCups, type ShuffleCupsAnswer, type ShuffleCupsPuzzle } from '../domain/games/shuffleCups';
import { PATH_ROUNDS, vanishingPath, type VanishingPathAnswer, type VanishingPathPuzzle } from '../domain/games/vanishingPath';

async function renderView(id: GameId, puzzle: unknown, extra: Record<string, unknown> = {}) {
  const repo = new Repo(memoryBackend());
  const prof = await repo.createProfile('t', 'fox');
  const results: Judgement[] = [];
  const logic = GAME_BY_ID[id].logic;
  const submit = vi.fn((a: unknown) => {
    const j = logic.judge(puzzle, a);
    results.push(j);
    return j;
  });
  const saveDraft = vi.fn();
  const View = GAME_VIEWS[id] as ComponentType<Record<string, unknown>>;
  sessionStorage.setItem('kazu.tabProfileId', prof.id);
  const view = render(
    <AppProvider repo={repo}>
      <View puzzle={puzzle} difficulty="easy" submit={submit} solved={false} found={[]} hintLevel={0} saveDraft={saveDraft} reportProgress={() => undefined} status={null} {...extra} />
    </AppProvider>,
  );
  await screen.findAllByRole('button', {}, { timeout: 3000 });
  return { results, submit, saveDraft, view };
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const run = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
const gen = <P,>(logic: Parameters<typeof generatePuzzle>[0], seed: number, d: Difficulty) => generatePuzzle(logic, createRng(seed), d).puzzle as P;

afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
  document.documentElement.dataset.motion = 'normal';
});

describe('23 てんかいずクイズ', () => {
  const cellBtn = (p: NetQuizPuzzle, i: number) => screen.getByRole('button', { name: new RegExp(`^うえから ${p.cells[i][0] + 1}ばんめ ひだりから ${p.cells[i][1] + 1}ばんめの めん`) });
  const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'これに する' }));

  it('めん：しるしは 正しい マスに 出る。ちがう めんは まちがい、こたえの めんで 正解', async () => {
    const p = gen<NetQuizPuzzle>(netQuiz, 4, 'easy');
    const s = solveNet(p)!;
    const r = await renderView('net-quiz', p);
    expect(screen.getByTestId('net-question').textContent).toContain('めん');
    for (const m of p.marks) expect(cellBtn(p, s.cellOfFace[m.face]).getAttribute('aria-label')).toMatch(/しるし/);
    expect(screen.getByRole('button', { name: 'これに する' })).toBeDisabled();
    const ans = netAnswers(p)[0]!;
    if (ans.kind !== 'face') throw new Error('face');
    const wrong = [0, 1, 2, 3, 4, 5].find((c) => c !== ans.cell)!;
    fireEvent.click(cellBtn(p, wrong));
    expect(cellBtn(p, wrong)).toHaveAttribute('aria-pressed', 'true');
    confirm();
    expect(r.results.at(-1)?.correct).toBe(false);
    fireEvent.click(cellBtn(p, ans.cell));
    confirm();
    expect(r.results.at(-1)?.correct).toBe(true);
  });

  it('へん：きりひらいた へんは 2か所の どちらでも 正解。おりめの へんは 1か所', async () => {
    let cut: NetQuizPuzzle | null = null;
    let fold: NetQuizPuzzle | null = null;
    for (let seed = 1; seed < 300 && !(cut && fold); seed++) {
      const p = gen<NetQuizPuzzle>(netQuiz, seed, 'challenge');
      if (p.target.kind !== 'edge') continue;
      const n = netAnswers(p).length;
      if (n === 2) cut ??= p;
      if (n === 1) fold ??= p;
    }
    const edgeName = (p: NetQuizPuzzle, a: { cell: number; side: number }) => new RegExp(`^うえから ${p.cells[a.cell][0] + 1}ばんめ ひだりから ${p.cells[a.cell][1] + 1}ばんめの めんの ${['みぎ', 'した', 'ひだり', 'うえ'][a.side]}の へん`);
    for (const which of [0, 1]) {
      const r = await renderView('net-quiz', cut!);
      const a = netAnswers(cut!)[which]!;
      if (a.kind !== 'edge') throw new Error('edge');
      fireEvent.click(screen.getByRole('button', { name: edgeName(cut!, a) }));
      confirm();
      expect(r.results.at(-1)?.correct).toBe(true);
      r.view.unmount();
    }
    const r = await renderView('net-quiz', fold!);
    const a = netAnswers(fold!)[0]!;
    if (a.kind !== 'edge') throw new Error('edge');
    const btn = screen.getByRole('button', { name: edgeName(fold!, a) });
    expect(btn.getAttribute('aria-label')).toContain('おりめ');
    // へんの おせる はんいは ひろい（32px）
    expect(parseFloat(btn.style.width) >= 32 || parseFloat(btn.style.height) >= 32).toBe(true);
    // めんは ボタンでは ない（へんを えらぶ もんだい）
    expect(screen.queryByRole('button', { name: /の めん$/ })).toBeNull();
    fireEvent.click(btn);
    confirm();
    expect(r.results.at(-1)?.correct).toBe(true);
  });
});

describe('24 シャッフルカップ', () => {
  const cupAt = (pos: number) => screen.getByRole('button', { name: new RegExp(`^ひだりから ${pos + 1}ばんめの カップ`) });
  const cups = () => within(screen.getByRole('group', { name: 'カップ' })).getAllByRole('button');
  const watchAll = async (p: ShuffleCupsPuzzle, k: number) => {
    fireEvent.click(screen.getByRole('button', { name: /みる$/ }));
    for (let i = 0; i < p.rounds[k].swaps.length + 10; i++) await run(400);
    await run(4000);
  };

  for (const motion of ['normal', 'reduced'] as const)
    it(`みている あいだは おせない。まちがえても はじめの 記録は のこり、5ラウンドで 正解（うごき：${motion}）`, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
      const p = gen<ShuffleCupsPuzzle>(shuffleCups, 21, 'easy');
      const r = await renderView('shuffle-cups', p);
      document.documentElement.dataset.motion = motion; // 設定の 反映の あとに きりかえる
      expect(cups()).toHaveLength(3);
      expect(cups().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'みる' }));
      await run(600);
      expect(screen.getAllByRole('img', { name: 'あかい ボール' })).toHaveLength(1); // はじめは ボールが 見える
      expect(cups().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
      await run(1600);
      expect(screen.queryByRole('img', { name: 'あかい ボール' })).toBeNull();
      expect(cups().every((b) => (b as HTMLButtonElement).disabled)).toBe(true); // いれかえ中も おせない
      for (let i = 0; i < 30; i++) await run(400);
      const end = arrangementAfter(p.cups, p.rounds[0].swaps);
      const right = positionOf(end, p.rounds[0].balls[0]);
      fireEvent.click(cupAt((right + 1) % 3));
      expect(r.results.at(-1)?.correct).toBe(false);
      expect(screen.getByTestId('cups-message').textContent).toContain('ざんねん');
      for (let k = 0; k < CUP_ROUNDS; k++) {
        await watchAll(p, k);
        const pos = positionOf(arrangementAfter(p.cups, p.rounds[k].swaps), p.rounds[k].balls[0]);
        fireEvent.click(cupAt(pos));
        if (k < CUP_ROUNDS - 1) {
          expect(screen.getByTestId('cups-message').textContent).toBe('あたり！');
          fireEvent.click(screen.getByRole('button', { name: 'つぎの ラウンド' }));
          expect(screen.getByText(`ラウンド ${k + 2}／5`)).toBeInTheDocument();
        }
      }
      expect(r.results.at(-1)?.correct).toBe(true);
      expect(r.results.filter((x) => x.correct)).toHaveLength(1);
      const ans = r.submit.mock.calls.at(-1)![0] as ShuffleCupsAnswer;
      expect(ans.rounds[0]).toEqual({ firstTry: false, views: 2, wrong: 1, balls: 1, cleared: true });
      expect(ans.rounds.slice(1).every((x) => x.firstTry === true && x.views === 1 && x.wrong === 0)).toBe(true);
    });

  it('ボール 2こ：あか → あお の じゅんに えらぶ。えらびなおせる。かたほう だけでは まちがい', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 5, 'challenge');
    const r = await renderView('shuffle-cups', p, { difficulty: 'challenge' });
    await watchAll(p, 0);
    const end = arrangementAfter(p.cups, p.rounds[0].swaps);
    const red = positionOf(end, p.rounds[0].balls[0]);
    const blue = positionOf(end, p.rounds[0].balls[1]);
    const other = [0, 1, 2, 3, 4, 5].find((x) => x !== red && x !== blue)!;
    expect(screen.getByTestId('cups-message').textContent).toBe('あかの ボールは どこ？');
    fireEvent.click(cupAt(other));
    fireEvent.click(cupAt(other)); // もういちど おすと とりけし
    expect(screen.getByRole('button', { name: 'こたえる' })).toBeDisabled();
    fireEvent.click(cupAt(red));
    expect(cupAt(red).getAttribute('aria-label')).toContain('あか');
    fireEvent.click(cupAt(other));
    fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(r.results.at(-1)?.message).toContain('かたほう');
    await watchAll(p, 0);
    fireEvent.click(cupAt(red));
    fireEvent.click(cupAt(red)); // おなじ カップを 2回 えらぶ ことは できない（とりけしに なる）
    fireEvent.click(cupAt(red));
    fireEvent.click(cupAt(blue));
    expect(cupAt(blue).getAttribute('aria-label')).toContain('あお');
    fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
    expect(screen.getByTestId('cups-message').textContent).toBe('あたり！');
  });

  it('いれかえ中に 画面が かくれたら とめて、はじめの ならびで「みる」待ちに。再開も「みる」待ち', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 8, 'normal');
    const r = await renderView('shuffle-cups', p);
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    await run(2600);
    await act(async () => setHidden(true));
    await run(20000);
    expect(screen.getByRole('group', { name: 'カップ' }).getAttribute('data-phase')).toBe('ready');
    expect(cups().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: 'もういちど みる' })).toBeEnabled();
    expect(r.submit).not.toHaveBeenCalled();
    r.view.unmount();
    const records = p.rounds.map((_, k) => ({ views: k < 2 ? 1 : 0, wrong: 0, balls: 1, cleared: k < 2, firstTry: k < 2 ? true : undefined }));
    await renderView('shuffle-cups', p, { draft: { round: 2, records, picks: p.rounds.slice(0, 2).map((x) => x.balls) } });
    expect(screen.getByText('ラウンド 3／5')).toBeInTheDocument();
    await run(5000);
    expect(screen.getByRole('group', { name: 'カップ' }).getAttribute('data-phase')).toBe('ready');
    expect(screen.queryByRole('img', { name: 'あかい ボール' })).toBeNull();
  });
});

describe('25 きえる みち', () => {
  const cellAt = (r: number, c: number) => screen.getByRole('gridcell', { name: new RegExp(`^うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ`) });
  const board = () => screen.getByRole('grid', { name: 'みちの ばん' });
  const neighbors = (p: VanishingPathPuzzle, [r, c]: [number, number]) =>
    ([
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ] as [number, number][]).filter(([y, x]) => y >= 0 && x >= 0 && y < p.size && x < p.size);

  it('みせる → きえる → となりを じゅんに。ななめ・はなれた マスは 数えない。まちがいは その場から（かんたん）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = gen<VanishingPathPuzzle>(vanishingPath, 3, 'easy');
    const r = await renderView('vanishing-path', p);
    const path = p.rounds[0];
    expect(cellAt(...path[0]).getAttribute('aria-label')).toContain('スタート');
    expect(cellAt(...path.at(-1)!).getAttribute('aria-label')).toContain('ゴール');
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    expect(board().getAttribute('data-phase')).toBe('show');
    expect(within(board()).getAllByRole('gridcell').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await run(p.showMs + 50);
    expect(board().getAttribute('data-phase')).toBe('input');
    // ゴールへ とびこす
    fireEvent.click(cellAt(...path.at(-1)!));
    expect(r.submit).not.toHaveBeenCalled();
    expect(screen.getByTestId('path-message').textContent).toContain('となり');
    const wrong = neighbors(p, path[0]).find((c) => !(c[0] === path[1][0] && c[1] === path[1][1]))!;
    fireEvent.click(cellAt(...wrong));
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(screen.getByTestId('path-message').textContent).toContain('いまの ばしょから');
    for (let k = 0; k < PATH_ROUNDS; k++) {
      if (k > 0) {
        fireEvent.click(screen.getByRole('button', { name: 'みる' }));
        fireEvent.click(screen.getByRole('button', { name: 'おぼえた！' }));
      }
      for (const c of p.rounds[k].slice(1)) fireEvent.click(cellAt(...c));
      if (k < PATH_ROUNDS - 1) fireEvent.click(screen.getByRole('button', { name: 'つぎの ラウンド' }));
    }
    expect(r.results.at(-1)?.correct).toBe(true);
    expect(r.results.filter((x) => x.correct)).toHaveLength(1);
    const ans = r.submit.mock.calls.at(-1)![0] as VanishingPathAnswer;
    expect(ans.rounds[0]).toMatchObject({ firstTry: false, wrong: 1, restarts: 0, views: 1, cleared: true });
    expect(ans.rounds[1]).toMatchObject({ firstTry: true, wrong: 0 });
  });

  it('むずかしい：まちがえたら スタートから。もどす・もういちど みる・つぎの 1マス（ヒント3）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrongOf = (q: VanishingPathPuzzle) => neighbors(q, q.rounds[0][1]).find((c) => !(c[0] === q.rounds[0][2][0] && c[1] === q.rounds[0][2][1]) && !(c[0] === q.rounds[0][0][0] && c[1] === q.rounds[0][0][1]));
    let seed = 6;
    while (!wrongOf(gen<VanishingPathPuzzle>(vanishingPath, seed, 'hard'))) seed++;
    const p = gen<VanishingPathPuzzle>(vanishingPath, seed, 'hard');
    const r = await renderView('vanishing-path', p, { difficulty: 'hard', hintLevel: 3 });
    const path = p.rounds[0];
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    fireEvent.click(screen.getByRole('button', { name: 'おぼえた！' }));
    fireEvent.click(cellAt(...path[1]));
    fireEvent.click(cellAt(...path[2]));
    expect(cellAt(...path[2]).getAttribute('aria-label')).toContain('いま いる ところ');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cellAt(...path[1]).getAttribute('aria-label')).toContain('いま いる ところ');
    fireEvent.click(cellAt(...wrongOf(p)!));
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(screen.getByTestId('path-message').textContent).toContain('スタートから');
    expect(cellAt(...path[0]).getAttribute('aria-label')).toContain('いま いる ところ');
    fireEvent.click(screen.getByRole('button', { name: 'つぎの 1マス' }));
    expect(cellAt(...path[1]).style.border).toContain('dashed');
    await run(1000);
    expect(cellAt(...path[1]).style.border).not.toContain('dashed');
    fireEvent.click(screen.getByRole('button', { name: 'もういちど みる' }));
    expect(board().getAttribute('data-phase')).toBe('show');
    const last = r.saveDraft.mock.calls.at(-1)![0] as { records: { views: number; peeks: number; restarts: number }[] };
    expect(last.records[0]).toMatchObject({ views: 2, peeks: 1, restarts: 1 });
  });

  it('みている とちゅうで 画面が かくれたら 道を けして「みる」待ち。再開は すすんだ ところから', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = gen<VanishingPathPuzzle>(vanishingPath, 9, 'normal');
    const r = await renderView('vanishing-path', p);
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    await run(1000);
    await act(async () => setHidden(true));
    expect(board().getAttribute('data-phase')).toBe('ready');
    await act(async () => setHidden(false));
    await run(20000);
    expect(board().getAttribute('data-phase')).toBe('ready');
    r.view.unmount();
    const records = Array.from({ length: 5 }, (_, k) => ({ views: k === 1 ? 1 : k < 1 ? 1 : 0, wrong: 0, restarts: 0, peeks: 0, cleared: k < 1, firstTry: k < 1 ? true : undefined }));
    await renderView('vanishing-path', p, { draft: { round: 1, records, index: 2 } });
    expect(screen.getByText('ラウンド 2／5')).toBeInTheDocument();
    const path = p.rounds[1];
    expect(cellAt(...path[1]).getAttribute('aria-label')).toContain('とおった');
    expect(board().getAttribute('data-phase')).toBe('ready');
    fireEvent.click(screen.getByRole('button', { name: 'もういちど みる' }));
    fireEvent.click(screen.getByRole('button', { name: 'おぼえた！' }));
    expect(cellAt(...path[2]).getAttribute('aria-label')).toContain('いま いる ところ');
    fireEvent.click(cellAt(...path[3]));
    expect(cellAt(...path[3]).getAttribute('aria-label')).toContain('いま いる ところ');
  });
});

describe('24 シャッフルカップ：はやさ（generatorVersion 2）', () => {
  const FAKE: Parameters<typeof vi.useFakeTimers>[0] = { shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] };
  const STEP = 8;
  const group = () => screen.getByRole('group', { name: 'カップ' });
  /** DOM の カップは ID の じゅん。ラベルの「ひだりから N ばんめ」から いまの ならび（場所 → ID）を よむ */
  const arrangement = () => {
    const pos = within(group())
      .getAllByRole('button')
      .map((b) => Number(b.getAttribute('aria-label')!.match(/ひだりから (\d+)ばんめ/)![1]) - 1);
    const at: number[] = [];
    pos.forEach((p, id) => (at[p] = id));
    return at;
  };
  /** 「みる」から さいごまで 見て、いれかえ ごとの うごいた 時間・おわった あとの ならびを あつめる */
  const watchAndMeasure = async () => {
    fireEvent.click(screen.getByRole('button', { name: /みる$/ }));
    const spans: { i: number; ms: number }[] = [];
    const after: number[][] = [];
    const order: number[] = [];
    let prev: string | null = null;
    for (let t = 0; t < 40000 && group().getAttribute('data-phase') !== 'answer'; t += STEP) {
      await act(async () => {
        vi.advanceTimersByTime(STEP);
      });
      const cur = group().getAttribute('data-swap');
      if (cur !== null) {
        const i = Number(cur);
        if (prev !== cur) {
          order.push(i);
          spans.push({ i, ms: 0 });
        }
        spans.at(-1)!.ms += STEP;
      } else if (prev !== null) after.push(arrangement());
      prev = cur;
    }
    return { spans, after, order };
  };

  for (const d of ['easy', 'normal', 'hard', 'challenge'] as const)
    it(`${d}：1回の いれかえは swapMs ぐらい。つぎの いれかえと かさならず、ならびは 計算どおり`, async () => {
      const p = gen<ShuffleCupsPuzzle>(shuffleCups, 31, d);
      expect(p.swapMs).toBe({ easy: 650, normal: 450, hard: 320, challenge: 220 }[d]);
      await renderView('shuffle-cups', p, { difficulty: d });
      vi.useFakeTimers(FAKE);
      const { spans, after, order } = await watchAndMeasure();
      const swaps = p.rounds[0].swaps;
      // 0, 1, 2 … と 1つずつ。もどったり 2つ同時に うごいたり しない
      expect(order).toEqual(swaps.map((_, i) => i));
      for (const s of spans) {
        expect(s.ms).toBeGreaterThanOrEqual(p.swapMs);
        expect(s.ms).toBeLessThanOrEqual(p.swapMs + 40);
      }
      after.forEach((a, i) => expect(a).toEqual(arrangementAfter(p.cups, swaps, i + 1)));
      // さいごの ならびで ボールの カップを えらぶと あたり
      const end = arrangementAfter(p.cups, swaps);
      for (const b of p.rounds[0].balls) fireEvent.click(screen.getByRole('button', { name: new RegExp(`^ひだりから ${positionOf(end, b) + 1}ばんめの カップ`) }));
      if (p.rounds[0].balls.length > 1) fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
      expect(screen.getByTestId('cups-message').textContent).toBe('あたり！');
    });

  it('「もういちど みる」は 同じ じゅんばん・同じ はやさ。ヒント3は ゆっくり（1.7ばい）', async () => {
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 12, 'hard');
    const r = await renderView('shuffle-cups', p, { difficulty: 'hard' });
    vi.useFakeTimers(FAKE);
    const a = await watchAndMeasure();
    const b = await watchAndMeasure();
    expect(b.order).toEqual(a.order);
    expect(b.after).toEqual(a.after);
    expect(b.spans.map((s) => s.ms)).toEqual(a.spans.map((s) => s.ms));
    r.view.unmount();
    vi.useRealTimers();
    await renderView('shuffle-cups', p, { difficulty: 'hard', hintLevel: 3 });
    vi.useFakeTimers(FAKE);
    const slow = await watchAndMeasure();
    expect(slow.after).toEqual(a.after);
    for (const s of slow.spans) {
      expect(s.ms).toBeGreaterThanOrEqual(p.swapMs * 1.7);
      expect(s.ms).toBeLessThanOrEqual(p.swapMs * 1.7 + 40);
    }
  });

  it('うごきを へらす：速い 難易度でも 1つずつ 0.8びょう 以上 しめして から ならべかえる', async () => {
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 4, 'challenge');
    await renderView('shuffle-cups', p, { difficulty: 'challenge' });
    // 設定の 反映（AppProvider）の あとに「動きを減らす」に する
    document.documentElement.dataset.motion = 'reduced';
    vi.useFakeTimers(FAKE);
    const { spans, after, order } = await watchAndMeasure();
    expect(order).toEqual(p.rounds[0].swaps.map((_, i) => i));
    for (const s of spans) {
      expect(s.ms).toBeGreaterThanOrEqual(800);
      expect(s.ms).toBeLessThanOrEqual(800 + STEP * 2);
    }
    after.forEach((a, i) => expect(a).toEqual(arrangementAfter(p.cups, p.rounds[0].swaps, i + 1)));
  });

  it('コマが とんでも（iPhone の 間引きなど）1コマで ぜんぶ うごかず、とちゅうを 通る', async () => {
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 2, 'challenge');
    await renderView('shuffle-cups', p, { difficulty: 'challenge' });
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    // 画面の 更新が 0.5びょうに 1回しか こない 端末の まね
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 500) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    for (let t = 0; t < 10000 && group().getAttribute('data-swap') !== '0'; t += 100)
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    expect(group().getAttribute('data-swap')).toBe('0');
    // 1コマ 500ms（大きく とんだ）でも、1コマで 1/4 しか すすまない
    let frames = 0;
    while (group().getAttribute('data-swap') === '0' && frames < 20) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(4);
    vi.unstubAllGlobals();
  });

  it('前の版（generatorVersion 1）の 問題は 保存された swapMs の まま 再開・再生できる', async () => {
    const v2 = gen<ShuffleCupsPuzzle>(shuffleCups, 9, 'normal');
    const v1: ShuffleCupsPuzzle = { ...v2, swapMs: 1000 }; // 前の版の ふつう
    expect(shuffleCups.validate(v1, 'normal')).toBe('rules'); // あたらしく 出す 問題には しない
    const records = v1.rounds.map((_, k) => ({ views: k < 1 ? 1 : 0, wrong: 0, balls: 1, cleared: k < 1, firstTry: k < 1 ? true : undefined }));
    const r = await renderView('shuffle-cups', v1, { difficulty: 'normal', draft: { round: 1, records, picks: [v1.rounds[0].balls] } });
    expect(screen.getByText('ラウンド 2／5')).toBeInTheDocument();
    vi.useFakeTimers(FAKE);
    const { spans, after } = await watchAndMeasure();
    for (const s of spans) {
      expect(s.ms).toBeGreaterThanOrEqual(1000);
      expect(s.ms).toBeLessThanOrEqual(1040);
    }
    after.forEach((a, i) => expect(a).toEqual(arrangementAfter(v1.cups, v1.rounds[1].swaps, i + 1)));
    const end = arrangementAfter(v1.cups, v1.rounds[1].swaps);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^ひだりから ${positionOf(end, v1.rounds[1].balls[0]) + 1}ばんめの カップ`) }));
    expect(screen.getByTestId('cups-message').textContent).toBe('あたり！');
    expect(r.saveDraft.mock.calls.at(-1)![0]).toMatchObject({ round: 2 });
  });
});
