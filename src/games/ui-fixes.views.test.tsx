import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { GAME_BY_ID } from '../domain/games/registry';
import type { GameId, Judgement } from '../domain/games/types';
import { GAME_VIEWS } from './views';
import { createRng } from '../domain/random';
import { DIFFICULTIES } from '../domain/types';
import { generatePuzzle } from '../domain/games/types';
import { solveMake10, type Make10Puzzle } from '../domain/games/make10';
import { TEMPLATES, type ShapesPuzzle } from '../domain/games/shapes';
import { sameToken, type PatternPuzzle } from '../domain/games/pattern';
import { patternColumns, patternQuestion } from './views/PatternView';

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
  const View = GAME_VIEWS[id] as ComponentType<Record<string, unknown>>;
  sessionStorage.setItem('kazu.tabProfileId', prof.id);
  const view = render(
    <AppProvider repo={repo}>
      <View puzzle={puzzle} difficulty="easy" submit={submit} solved={false} found={[]} hintLevel={0} saveDraft={() => undefined} reportProgress={() => undefined} status={null} {...extra} />
    </AppProvider>,
  );
  await screen.findAllByRole('button');
  return { results, submit, view };
}

describe('10をつくれ！：きごうを えらんでから カードを ならべる', () => {
  const p: Make10Puzzle = { target: 8, ops: ['+', '-'], cards: [3, 1, 6].map((value, i) => ({ id: `c${i}`, value })) };
  const card = (v: number) => screen.getByRole('button', { name: `${v} の カード` });
  const pick = (o: '+' | '-') => fireEvent.click(screen.getByRole('radio', { name: o === '+' ? 'たす（＋）' : 'ひく（−）' }));
  const signs = () => screen.queryAllByRole('button', { name: /^きごう/ }).map((b) => b.textContent);
  const now = () => screen.getByText(/^いま：/).textContent;

  it('3 → − → 1 → ＋ → 6 で「3 − 1 ＋ 6」。1まいめには きごうが つかない', async () => {
    const r = await renderView('make10', p);
    const plus = screen.getByRole('radio', { name: 'たす（＋）' });
    expect(plus).toHaveAttribute('aria-checked', 'true'); // はじめは ＋
    pick('-'); // 1まいめの まえに えらんでも、1まいめには つかない
    pick('+');
    fireEvent.click(card(3));
    expect(signs()).toEqual([]);
    expect(now()).toBe('いま：3');
    pick('-');
    expect(screen.getByRole('radio', { name: 'ひく（−）' })).toHaveAttribute('aria-checked', 'true');
    expect(plus).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(card(1));
    expect(signs()).toEqual(['−']);
    pick('+');
    expect(signs()).toEqual(['−']); // ならべた きごうは かわらない
    fireEvent.click(card(6));
    expect(signs()).toEqual(['−', '+']);
    expect(now()).toBe('いま：8');
    fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
    expect(r.submit).toHaveBeenLastCalledWith({ order: ['c0', 'c1', 'c2'], ops: ['-', '+'] });
    expect(r.results.at(-1)?.correct).toBe(true);
  });

  it('えらんだ きごうは つぎに かえるまで つづく。「やりなおす」で ＋ に もどる', async () => {
    await renderView('make10', { ...p, cards: [9, 1, 2].map((value, i) => ({ id: `c${i}`, value })) });
    pick('-');
    fireEvent.click(card(9));
    fireEvent.click(card(1));
    fireEvent.click(card(2));
    expect(signs()).toEqual(['−', '−']);
    expect(now()).toBe('いま：6');
    fireEvent.click(screen.getByRole('button', { name: 'やりなおす' }));
    expect(signs()).toEqual([]);
    expect(screen.getByRole('radio', { name: 'たす（＋）' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'ひく（−）' })).toHaveAttribute('aria-checked', 'false');
  });

  it('カードを もどしても のこりの しきは こわれない。しきの きごうは あとから かえても よい', async () => {
    await renderView('make10', p);
    fireEvent.click(card(3));
    pick('-');
    fireEvent.click(card(1));
    pick('+');
    fireEvent.click(card(6));
    fireEvent.click(screen.getByRole('button', { name: '3 の カードを もどす' })); // 先頭を もどす
    expect(signs()).toEqual(['+']); // 1 + 6
    expect(now()).toBe('いま：7');
    fireEvent.click(screen.getAllByRole('button', { name: /^きごう/ })[0]); // 編集手段として のこす
    expect(signs()).toEqual(['−']); // 1 − 6
  });

  it('全難易度の 予備問題を、きごうを えらぶ 操作だけで 解ける（ひきざんが いる問題も）', async () => {
    for (const d of DIFFICULTIES) {
      for (const q of GAME_BY_ID.make10.logic.fallback(d) as Make10Puzzle[]) {
        const sol = solveMake10(q, 1)[0];
        const r = await renderView('make10', q);
        sol.order.forEach((id, i) => {
          if (i > 0) fireEvent.click(screen.getByRole('radio', { name: sol.ops[i - 1] === '+' ? 'たす（＋）' : 'ひく（−）' }));
          const v = q.cards.find((c) => c.id === id)!.value;
          const hand = screen.getByLabelText('てもちの カード');
          fireEvent.click(within(hand).getAllByRole('button', { name: `${v} の カード` })[0]);
        });
        fireEvent.click(screen.getByRole('button', { name: 'こたえる' }));
        expect(r.results.at(-1)?.correct, `${d} ${JSON.stringify(q)}`).toBe(true);
        r.view.unmount();
      }
    }
  });
});

describe('かたちパズル：もんだいの なまえを 出さない', () => {
  it('全難易度で 名前（でんしゃ・き・おうち など）が 画面に出ず、操作の説明が出る', async () => {
    for (const d of DIFFICULTIES) {
      for (let s = 1; s <= 6; s++) {
        const q = generatePuzzle(GAME_BY_ID.shapes.logic, createRng(s * 31 + d.length), d).puzzle as ShapesPuzzle;
        const r = await renderView('shapes', q);
        expect(screen.getByText('かげと おなじ かたちを つくろう！')).toBeInTheDocument();
        const text = document.body.textContent ?? '';
        expect(text).not.toContain(`「${q.title}」`);
        expect(screen.queryByText(q.title, { exact: true })).toBeNull();
        r.view.unmount();
      }
    }
    // 名前の データ自体は のこす（記録・互換のため）
    expect(TEMPLATES.every((t) => t.title.length > 0)).toBe(true);
  });
});

describe('なにがはいる？：？も ならびの 1マス', () => {
  it('列の数：せまい画面は 4れつ前後で 行の マスを そろえ、ひろい画面は 1れつ', () => {
    expect(patternColumns(8, 260)).toBe(4); // 4＋4
    expect(patternColumns(6, 260)).toBe(3); // 3＋3
    expect(patternColumns(10, 260)).toBe(4); // 4＋4＋2
    expect(patternColumns(7, 260)).toBe(4); // 4＋3
    expect(patternColumns(10, 700)).toBe(10);
    expect(patternColumns(6, 400)).toBe(6);
    expect(patternColumns(10, 400)).toBe(5); // 5＋5
  });

  it('もんだい文は ？の位置で かわる', () => {
    const seq = Array.from({ length: 8 }, () => ({ shape: 'circle', color: 'red' }) as const);
    expect(patternQuestion({ sequence: [...seq], hidden: 7 })).toBe('つぎに くるのは どれ？');
    expect(patternQuestion({ sequence: [...seq], hidden: 3 })).toBe('？に はいるのは どれ？');
  });

  it('全難易度：ならびの じゅんばんの まま 1マスずつ、？は p.hidden の マス。正解の せんたくしで せいかい', async () => {
    for (const d of DIFFICULTIES) {
      for (let s = 1; s <= 25; s++) {
        const q = generatePuzzle(GAME_BY_ID.pattern.logic, createRng(s * 17 + d.length), d).puzzle as PatternPuzzle;
        const r = await renderView('pattern', q);
        const list = screen.getByRole('list', { name: 'ならび' });
        const items = within(list).getAllByRole('listitem');
        expect(items).toHaveLength(q.sequence.length);
        items.forEach((li, i) => {
          expect(li.getAttribute('data-index')).toBe(String(i));
          if (i === q.hidden) {
            expect(li.getAttribute('data-hidden')).toBe('true');
            expect(within(li).getByLabelText('はてな')).toBeInTheDocument();
          } else {
            expect(within(li).queryByLabelText('はてな')).toBeNull();
          }
        });
        expect(screen.getByText(patternQuestion(q))).toBeInTheDocument();
        const idx = q.options.findIndex((o) => sameToken(o, q.sequence[q.hidden]));
        fireEvent.click(within(screen.getByRole('group', { name: 'せんたくし' })).getAllByRole('button')[idx]);
        expect(r.results.at(-1)?.correct).toBe(true);
        r.view.unmount();
      }
    }
  });

  it('ヒント2だんめの まとまり表示は、行を またいでも まとまりごとに 交互', async () => {
    const q = GAME_BY_ID.pattern.logic.fallback('hard')[0] as PatternPuzzle;
    await renderView('pattern', q, { hintLevel: 2 });
    const unit = q.shapeUnit.length;
    const bgs = within(screen.getByRole('list', { name: 'ならび' }))
      .getAllByRole('listitem')
      .map((li) => (li as HTMLElement).style.background);
    bgs.forEach((bg, i) => expect(bg === bgs[0]).toBe(Math.floor(i / unit) % 2 === 0));
  });
});
