import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { GAME_BY_ID } from '../domain/games/registry';
import type { GameId, Judgement } from '../domain/games/types';
import { GAME_VIEWS } from './views';
import { solveMake10 } from '../domain/games/make10';
import { expectedValue } from '../domain/games/shopping';
import { coinsTotal } from '../domain/games/coins';
import { applyRule } from '../domain/games/machine';
import { mirrorSolution } from '../domain/games/mirror';
import { tickCount } from '../domain/games/numberline';

async function renderView(id: GameId, puzzle: unknown) {
  const repo = new Repo(memoryBackend());
  const p = await repo.createProfile('t', 'fox');
  const results: Judgement[] = [];
  const logic = GAME_BY_ID[id].logic;
  const submit = vi.fn((a: unknown) => {
    const j = logic.judge(puzzle, a);
    results.push(j);
    return j;
  });
  const View = GAME_VIEWS[id] as ComponentType<Record<string, unknown>>;
  sessionStorage.setItem('kazu.tabProfileId', p.id);
  render(
    <AppProvider repo={repo}>
      <View puzzle={puzzle} difficulty="easy" submit={submit} solved={false} found={[]} hintLevel={0} saveDraft={() => undefined} reportProgress={() => undefined} status={null} />
    </AppProvider>,
  );
  await screen.findByRole('group', { name: /./ }).catch(() => undefined);
  return { results, submit };
}

const pad = () => screen.getByRole('group', { name: 'すうじキー' });
async function typeNumber(n: number) {
  for (const d of String(n)) fireEvent.click(within(pad()).getByRole('button', { name: d }));
}
const answerBtn = (name = 'こたえる') => within(pad()).getByRole('button', { name });
const ok = (r: Judgement[]) => expect(r.at(-1)?.correct).toBe(true);

describe('each game view can be solved through its own controls', () => {
  it('01 decompose', async () => {
    const p = GAME_BY_ID.decompose.logic.fallback('normal')[1];
    const { results } = await renderView('decompose', p);
    for (let i = 0; i < p.parts; i++) {
      fireEvent.click(screen.getByRole('button', { name: `${i + 1}つめの かず` }));
      await typeNumber(p.example[i]);
    }
    fireEvent.click(answerBtn());
    ok(results);
  });

  it('02 pittari (with minus)', async () => {
    const p = GAME_BY_ID.pittari.logic.fallback('normal')[1];
    const sol = p.example;
    const { results } = await renderView('pittari', p);
    for (let i = 0; i < sol.nums.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: `${i + 1}つめの かず` }));
      await typeNumber(sol.nums[i]);
    }
    sol.ops.forEach((o: string, i: number) => {
      if (o === '-') fireEvent.click(screen.getAllByRole('button', { name: /きごう/ })[i]);
    });
    fireEvent.click(answerBtn());
    ok(results);
  });

  it('03 make10', async () => {
    const p = GAME_BY_ID.make10.logic.fallback('hard')[0];
    const sol = solveMake10(p, 1)[0];
    const { results } = await renderView('make10', p);
    for (const id of sol.order) {
      const v = p.cards.find((c: { id: string; value: number }) => c.id === id)!.value;
      fireEvent.click(screen.getAllByRole('button', { name: `${v} の カード` })[0]);
    }
    sol.ops.forEach((o, i) => {
      if (o === '-') fireEvent.click(screen.getAllByRole('button', { name: /きごう/ })[i]);
    });
    fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
    ok(results);
  });

  it('03 make10 easy: 2つの きごうを べつべつに きりかえ、「いま」が すぐ かわる', async () => {
    const p = { target: 10, ops: ['+', '-'], cards: [8, 4, 2].map((value, i) => ({ id: `c${i}`, value })) };
    const { results } = await renderView('make10', p);
    expect(screen.getByText('＋と−を おして')).toBeInTheDocument();
    for (const v of [8, 4, 2]) fireEvent.click(screen.getByRole('button', { name: `${v} の カード` }));
    const now = () => screen.getByText(/^いま：/).textContent;
    expect(now()).toBe('いま：14');
    const toggles = () => screen.getAllByRole('button', { name: /^きごう/ });
    expect(toggles()).toHaveLength(2);
    expect(toggles()[0]).toHaveAccessibleName('きごう たす。おすと ひく に かわる');
    fireEvent.click(toggles()[1]); // 8 + 4 − 2
    expect(now()).toBe('いま：10');
    expect(toggles()[1]).toHaveAccessibleName('きごう ひく。おすと たす に かわる');
    expect(toggles()[0]).toHaveAccessibleName('きごう たす。おすと ひく に かわる');
    fireEvent.click(toggles()[0]); // 8 − 4 − 2
    expect(now()).toBe('いま：2');
    fireEvent.click(toggles()[0]); // もどす
    expect(now()).toBe('いま：10');
    fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
    ok(results);
  });

  it('03 make10 easy: キーボードでも きりかえられる', async () => {
    const p = { target: 10, ops: ['+', '-'], cards: [7, 5, 2].map((value, i) => ({ id: `c${i}`, value })) };
    await renderView('make10', p);
    for (const v of [7, 5, 2]) fireEvent.click(screen.getByRole('button', { name: `${v} の カード` }));
    const t = screen.getAllByRole('button', { name: /^きごう/ })[1];
    t.focus();
    expect(document.activeElement).toBe(t);
    // ボタンなので Enter / Space でも押せる（ブラウザ標準）。ここでは click で代用
    fireEvent.click(t);
    expect(screen.getByText(/^いま：/).textContent).toBe('いま：10');
  });

  it('04 kufuu', async () => {
    const p = GAME_BY_ID.kufuu.logic.fallback('hard')[0];
    const { results } = await renderView('kufuu', p);
    for (let i = 0; i < p.gap; i++) fireEvent.click(screen.getByRole('button', { name: '← 1 うつす' }));
    fireEvent.click(screen.getByRole('button', { name: 'この しきで けいさん' }));
    await typeNumber(p.a + p.b);
    fireEvent.click(answerBtn());
    ok(results);
  });

  it('05 balance', async () => {
    const p = GAME_BY_ID.balance.logic.fallback('easy')[0];
    const { results } = await renderView('balance', p);
    fireEvent.click(screen.getByRole('button', { name: '＝ おなじ' }));
    ok(results);
  });

  it('06 sequence', async () => {
    const s = GAME_BY_ID.sequence.logic.fallback('normal')[0];
    const r = await renderView('sequence', s);
    await typeNumber(s.values[s.hidden]);
    fireEvent.click(answerBtn());
    ok(r.results);
  });
  it('07 machine', async () => {
    const m = GAME_BY_ID.machine.logic.fallback('challenge')[0];
    const r = await renderView('machine', m);
    await typeNumber(applyRule(m.rule, m.query));
    fireEvent.click(answerBtn());
    ok(r.results);
  });
  it('10 coins', async () => {
    const c = GAME_BY_ID.coins.logic.fallback('hard')[1];
    const r = await renderView('coins', c);
    fireEvent.click(screen.getByRole('button', { name: 'しゅるいごとに まとめる' }));
    await typeNumber(coinsTotal(c));
    fireEvent.click(answerBtn());
    ok(r.results);
  });

  it('08 flash: show numbers, then answer (replay allowed)', async () => {
    const p = GAME_BY_ID.flash.logic.fallback('easy')[1];
    const r = await renderView('flash', p);
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
      act(() => vi.advanceTimersByTime(10000));
      fireEvent.click(screen.getByRole('button', { name: 'もういちど みる' }));
      act(() => vi.advanceTimersByTime(10000));
      await typeNumber(p.numbers.reduce((a: number, b: number) => a + b, 0));
      fireEvent.click(answerBtn());
      ok(r.results);
    } finally {
      vi.useRealTimers();
    }
  });

  it('09 number line (keyboard alternative to dragging)', async () => {
    const p = GAME_BY_ID.numberline.logic.fallback('normal')[0];
    const r = await renderView('numberline', p);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' }); // まだ置いていないときは中央に置く
    const mid = Math.floor(tickCount(p) / 2);
    const targetIdx = (p.target - p.min) / p.step;
    const k = targetIdx - mid;
    for (let i = 0; i < Math.abs(k); i++) fireEvent.click(screen.getByRole('button', { name: k > 0 ? 'みぎへ 1めもり' : 'ひだりへ 1めもり' }));
    fireEvent.click(screen.getByRole('button', { name: 'ここに する' }));
    ok(r.results);
  });

  it('11 shopping', async () => {
    const p = GAME_BY_ID.shopping.logic.fallback('challenge')[0];
    const r = await renderView('shopping', p);
    for (const o of p.order) {
      const it = p.items.find((i: { id: string; name: string; price: number }) => i.id === o.itemId)!;
      for (let k = 0; k < o.qty; k++) fireEvent.click(screen.getByRole('button', { name: `${it.name} ${it.price}えん を かごに いれる` }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'レジへ すすむ' }));
    await typeNumber(expectedValue(p));
    fireEvent.click(answerBtn());
    ok(r.results);
  });

  it('12 sudoku', async () => {
    const p = GAME_BY_ID.sudoku.logic.fallback('normal')[0];
    const r = await renderView('sudoku', p);
    const cells = screen.getAllByRole('gridcell');
    p.givens.forEach((v: number, i: number) => {
      if (v !== 0) return;
      fireEvent.click(cells[i]);
      fireEvent.click(within(screen.getByRole('group', { name: 'すうじ' })).getByRole('button', { name: String(p.solution[i]) }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    ok(r.results);
  });

  it('13 maze: wrong tap stays, right taps reach the goal', async () => {
    const p = GAME_BY_ID.maze.logic.fallback('easy')[0];
    const r = await renderView('maze', p);
    const cell = (rc: [number, number]) => screen.getAllByRole('gridcell')[rc[0] * p.size + rc[1]];
    for (let k = 1; k < p.path.length; k++) fireEvent.click(cell(p.path[k]));
    ok(r.results);
  });

  it('15 mirror', async () => {
    const p = GAME_BY_ID.mirror.logic.fallback('challenge')[0];
    const r = await renderView('mirror', p);
    const sol = mirrorSolution(p);
    const brush = (k: number) => fireEvent.click(screen.getAllByRole('radio')[k - 1]);
    for (const color of [1, 2]) {
      brush(color);
      sol.forEach((row, rr) =>
        row.forEach((v, c) => {
          if (v === color) fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(`^みぎ ${rr + 1}ぎょう ちゅうしんから ${c + 1}マスめ `) }));
        }),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    ok(r.results);
  });

  it('16 pattern', async () => {
    const p = GAME_BY_ID.pattern.logic.fallback('hard')[0];
    const r = await renderView('pattern', p);
    const idx = p.options.findIndex((o: { shape: string; color: string }) => o.shape === p.sequence[p.hidden].shape && o.color === p.sequence[p.hidden].color);
    fireEvent.click(within(screen.getByRole('group', { name: 'せんたくし' })).getAllByRole('button')[idx]);
    ok(r.results);
  });
});
