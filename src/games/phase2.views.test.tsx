import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { GAME_BY_ID } from '../domain/games/registry';
import type { GameId, Judgement } from '../domain/games/types';
import { GAME_VIEWS } from './views';
import { SYMBOL_NAME, type SymbolMemoryPuzzle } from '../domain/games/symbolMemory';
import { buildNonogram } from '../domain/games/nonogram';
import { LIGHT_ROUNDS, roundSequence, type LightSequenceAnswer, type LightSequencePuzzle } from '../domain/games/lightSequence';

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

afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('20 きごうを おぼえよう', () => {
  const easy: SymbolMemoryPuzzle = { size: 2, symbols: ['circle', 'cross'], cells: ['circle', null, null, 'cross'], showMs: null };
  const cell = (label: string, r: number, c: number) => screen.getByRole('gridcell', { name: new RegExp(`^${label} うえから ${r}ばんめ ひだりから ${c}ばんめ`) });
  const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

  it('easy：みほんは いつも見える。よけいな記号は まちがい → けしごむ・もどすで 直して 正解', async () => {
    const r = await renderView('symbol-memory', easy);
    expect(cell('みほん', 1, 1).getAttribute('aria-label')).toContain('まる');
    pick(SYMBOL_NAME.circle);
    fireEvent.click(cell('こたえ', 1, 1));
    fireEvent.click(cell('こたえ', 1, 2)); // よけいな まる
    pick(SYMBOL_NAME.cross);
    fireEvent.click(cell('こたえ', 2, 2));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(r.results.at(-1)?.correct).toBe(false);
    pick('けしごむ');
    fireEvent.click(cell('こたえ', 1, 2));
    expect(cell('こたえ', 1, 2).getAttribute('aria-label')).toContain('から');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cell('こたえ', 1, 2).getAttribute('aria-label')).toContain('まる');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' })); // ばつ も もどる
    pick(SYMBOL_NAME.cross);
    fireEvent.click(cell('こたえ', 2, 2));
    pick('けしごむ');
    fireEvent.click(cell('こたえ', 1, 2));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(r.results.at(-1)?.correct).toBe(true);
    expect(r.submit).toHaveBeenLastCalledWith({ cells: easy.cells, reshows: 0 });
  });

  const hard: SymbolMemoryPuzzle = { size: 4, symbols: ['circle', 'cross', 'triangle', 'square', 'star'], cells: ['circle', 'cross', 'triangle', 'square', 'star', null, null, null, null, null, null, null, null, null, null, 'circle'], showMs: 8000 };

  it('hard：「みる」→ 8びょうで みほんが きえて 答える。みている あいだは 答えの マスが ない', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const r = await renderView('symbol-memory', hard);
    expect(screen.queryByRole('grid', { name: 'みほん' })).toBeNull();
    expect(screen.queryByRole('grid', { name: 'こたえ' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    expect(screen.getByRole('grid', { name: 'みほん' })).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: 'こたえ' })).toBeNull(); // のぞき見・誤タップを させない
    await act(async () => {
      vi.advanceTimersByTime(8200);
    });
    expect(screen.queryByRole('grid', { name: 'みほん' })).toBeNull();
    expect(screen.getByRole('grid', { name: 'こたえ' })).toBeInTheDocument();
    // もういちど みる（回数を 記録）→「おぼえた！」で すぐ とじる
    fireEvent.click(screen.getByRole('button', { name: 'もういちど みる' }));
    expect(screen.getByRole('grid', { name: 'みほん' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'おぼえた！' }));
    hard.cells.forEach((s, i) => {
      if (!s) return;
      pick(SYMBOL_NAME[s]);
      fireEvent.click(cell('こたえ', Math.floor(i / 4) + 1, (i % 4) + 1));
    });
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(r.results.at(-1)?.correct).toBe(true);
    expect(r.submit).toHaveBeenLastCalledWith({ cells: hard.cells, reshows: 1 });
  });

  it('みている とちゅうで 画面が かくれたら とじる（時間は へらない・もどっても 見本は 出ない）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderView('symbol-memory', hard);
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    await act(async () => {
      vi.advanceTimersByTime(2000);
      setHidden(true);
    });
    expect(screen.queryByRole('grid', { name: 'みほん' })).toBeNull();
    await act(async () => {
      setHidden(false);
      vi.advanceTimersByTime(10000);
    });
    // さいごまで 見ていないので「みる」から（回数には 数えない）
    expect(screen.queryByRole('grid', { name: 'みほん' })).toBeNull();
    expect(screen.getByRole('button', { name: 'みる' })).toBeInTheDocument();
  });

  it('再開：途中の答えと 見た回数が もどり、見本は 勝手に 出ない', async () => {
    const cells = [...hard.cells];
    cells[15] = null;
    await renderView('symbol-memory', hard, { draft: { cells, reshows: 2, seen: true } });
    expect(screen.queryByRole('grid', { name: 'みほん' })).toBeNull();
    expect(cell('こたえ', 1, 1).getAttribute('aria-label')).toContain('まる');
    expect(screen.getByText('（2かい みた）')).toBeInTheDocument();
  });
});

describe('21 ピクロス', () => {
  const p = buildNonogram('easy', 0, false); // ハート
  const cell = (r: number, c: number) => screen.getByRole('gridcell', { name: new RegExp(`^うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ：`) });

  it('「ぬる」で 黒、「×」は 白の しるし。×を つけなくても 正解。もどす／やりなおし', async () => {
    const r = await renderView('nonogram', p);
    // 行・列の 数字（空の行は 0）
    expect(screen.getByRole('rowheader', { name: 'うえから 1ばんめの ぎょう：1、1' })).toBeInTheDocument();
    fireEvent.click(cell(0, 0)); // まちがって ぬる
    expect(cell(0, 0).getAttribute('aria-label')).toContain('くろ');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cell(0, 0).getAttribute('aria-label')).toContain('まだ');
    fireEvent.click(screen.getByRole('button', { name: 'やりなおし' }));
    expect(cell(0, 0).getAttribute('aria-label')).toContain('くろ');
    fireEvent.click(screen.getByRole('radio', { name: 'けす' }));
    fireEvent.click(cell(0, 0));
    fireEvent.click(screen.getByRole('radio', { name: '×' }));
    fireEvent.click(cell(0, 0));
    expect(cell(0, 0).getAttribute('aria-label')).toContain('ばつ');
    fireEvent.click(screen.getByRole('radio', { name: /ぬる/ }));
    p.solution.forEach((row, rr) => [...row].forEach((ch, c) => ch === '#' && fireEvent.click(cell(rr, c))));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(r.results.at(-1)?.correct).toBe(true);
  });

  it('まちがいは すうじと 合わない 行・列の数を 伝える。ヒント3は 1マスだけ 光らせる', async () => {
    const r = await renderView('nonogram', p, { hintLevel: 3 });
    expect(document.querySelectorAll('[role="gridcell"].pop')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(r.results.at(-1)?.message).toMatch(/すうじと あわない ぎょうが \d+こ/);
  });

  it('再開：盤面・もどす の れきし・モードが もどる', async () => {
    const cells = p.solution.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)));
    cells[4][2] = 0;
    const undo = [cells.map((row) => row.map(() => 0))];
    await renderView('nonogram', p, { draft: { cells, undo, redo: [], mode: 'cross' } });
    expect(screen.getByRole('radio', { name: '×' })).toHaveAttribute('aria-checked', 'true');
    expect(cell(0, 1).getAttribute('aria-label')).toContain('くろ');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cell(0, 1).getAttribute('aria-label')).toContain('まだ');
  });
});

describe('22 ひかる じゅんばん', () => {
  const p: LightSequencePuzzle = { buttons: 4, startLen: 2, rounds: [[0, 2], [3, 1, 0], [1, 3, 2, 0], [2, 0, 3, 1, 2], [3, 0, 1, 2, 3, 1]], onMs: 1000, gapMs: 300 };
  const V1: LightSequencePuzzle = { buttons: 4, startLen: 2, sequence: [0, 2, 1, 3, 0, 2], onMs: 1000, gapMs: 300 };
  const NAMES = ['あかの まる', 'あおの さんかく', 'みどりの しかく', 'きいろの ほし'];
  const btn = (b: number) => screen.getByRole('button', { name: NAMES[b] });
  const watchAll = async () => {
    fireEvent.click(screen.getByRole('button', { name: /みる$/ }));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
  };
  /** 「みる」を おして、光った ボタンを 順に あつめる */
  const watchLit = async (n: number) => {
    fireEvent.click(screen.getByRole('button', { name: /みる$/ }));
    const seen: number[] = [];
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    for (let i = 0; i < n; i++) {
      seen.push(NAMES.indexOf(document.querySelector('[data-lit="true"]')?.getAttribute('aria-label') ?? ''));
      await act(async () => {
        vi.advanceTimersByTime(p.onMs + p.gapMs);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    return seen;
  };

  it('みている あいだは おせない。5ラウンド、まちがえたら 同じラウンドを もういちど。さいごに 1回だけ 正解', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const r = await renderView('light-sequence', p);
    expect(btn(0)).toBeDisabled(); // 「みる」の まえは おせない
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(document.querySelector('[data-lit="true"]')?.getAttribute('aria-label')).toBe(NAMES[0]);
    expect(btn(0)).toBeDisabled(); // ひかっている あいだも おせない
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(document.querySelector('[data-lit="true"]')).toBeNull();
    // まちがえる → 同じラウンド（2こ）を もういちど
    fireEvent.click(btn(1));
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(screen.getByTestId('light-message').textContent).toContain('もういちど');
    expect(screen.getByText('ラウンド 1／5')).toBeInTheDocument();
    for (let k = 0; k < LIGHT_ROUNDS; k++) {
      await watchAll();
      expect(screen.getByText(`ラウンド ${k + 1}／5`)).toBeInTheDocument();
      for (const b of roundSequence(p, k)) fireEvent.click(btn(b));
    }
    expect(r.results.at(-1)?.correct).toBe(true);
    expect(r.results.filter((x) => x.correct)).toHaveLength(1); // とちゅうで 正解あつかいに しない
    const ans = r.submit.mock.calls.at(-1)![0] as LightSequenceAnswer;
    expect(ans.best).toBe(6);
    expect(ans.rounds[0]).toEqual({ length: 2, views: 2, retries: 1, cleared: true });
    expect(ans.rounds.slice(1).every((x) => x.views === 1 && x.retries === 0 && x.cleared)).toBe(true);
  });

  it('ラウンドごとに その ラウンドの 順番で 光る。見なおし・まちがいの あとも 同じ 順番', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const r = await renderView('light-sequence', p);
    for (let k = 0; k < LIGHT_ROUNDS; k++) {
      const seq = p.rounds![k];
      expect(await watchLit(seq.length)).toEqual(seq);
      // もういちど みても かわらない
      expect(await watchLit(seq.length)).toEqual(seq);
      // まちがえて やりなおしても かわらない
      fireEvent.click(btn((seq[0] + 1) % 4));
      expect(screen.getByText(`ラウンド ${k + 1}／5`)).toBeInTheDocument();
      expect(await watchLit(seq.length)).toEqual(seq);
      for (const b of seq) fireEvent.click(btn(b));
      if (k < LIGHT_ROUNDS - 1) expect(screen.getByTestId('light-message').textContent).toBe(`できた！ つぎは ちがう じゅんばんで ${seq.length + 1}こ だよ`);
    }
    expect(r.results.at(-1)?.correct).toBe(true);
    const ans = r.submit.mock.calls.at(-1)![0] as LightSequenceAnswer;
    expect(ans.inputs).toEqual(p.rounds);
    expect(ans.rounds.every((x) => x.views === 3 && x.retries === 1 && x.cleared)).toBe(true);
  });

  it('むかしの 形（1本の 順番）の 途中保存も そのまま つづきから 遊べる', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rounds = [2, 3, 4, 5, 6].map((length, k) => ({ length, views: k < 3 ? 1 : 0, retries: 0, cleared: k < 3 }));
    const r = await renderView('light-sequence', V1, { draft: { round: 3, rounds, inputs: [0, 1, 2].map((k) => roundSequence(V1, k)), best: 4 } });
    expect(screen.getByText('ラウンド 4／5')).toBeInTheDocument();
    for (const k of [3, 4]) {
      expect(await watchLit(k + 2)).toEqual(V1.sequence!.slice(0, k + 2));
      for (const b of roundSequence(V1, k)) fireEvent.click(btn(b));
    }
    expect(r.results.at(-1)?.correct).toBe(true);
    expect((r.submit.mock.calls.at(-1)![0] as LightSequenceAnswer).best).toBe(6);
  });

  it('みている とちゅうで 画面が かくれたら とめて「みる」待ちに（もどっても 自動で 光らない）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderView('light-sequence', p);
    fireEvent.click(screen.getByRole('button', { name: 'みる' }));
    await act(async () => {
      vi.advanceTimersByTime(600);
      setHidden(true);
    });
    expect(document.querySelector('[data-lit="true"]')).toBeNull();
    await act(async () => {
      setHidden(false);
      vi.advanceTimersByTime(20000);
    });
    expect(document.querySelector('[data-lit="true"]')).toBeNull();
    expect(btn(0)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'もういちど みる' })).toBeEnabled();
  });

  it('再開：ラウンドと 記録が もどり、「みる」を おすまで 光らない', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rounds = [2, 3, 4, 5, 6].map((length, k) => ({ length, views: k < 2 ? 1 : 0, retries: 0, cleared: k < 2 }));
    await renderView('light-sequence', p, { draft: { round: 2, rounds, inputs: [roundSequence(p, 0), roundSequence(p, 1)], best: 3 } });
    expect(screen.getByText('ラウンド 3／5')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelector('[data-lit="true"]')).toBeNull();
    expect(within(screen.getByRole('group', { name: 'ひかる ボタン' })).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
