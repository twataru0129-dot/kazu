import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { GAME_BY_ID } from '../domain/games/registry';
import type { GameId, Judgement } from '../domain/games/types';
import { GAME_VIEWS } from './views';
import { missingSolution, type MissingPuzzle } from '../domain/games/missing';
import { tapsNeeded, TRI_LABEL, type TrianglePuzzle } from '../domain/games/triangle';
import type { DotsPuzzle, Seg } from '../domain/games/dots';

async function renderView(id: GameId, puzzle: unknown, extra: Record<string, unknown> = {}) {
  const repo = new Repo(memoryBackend());
  const p = await repo.createProfile('t', 'fox');
  const results: Judgement[] = [];
  const logic = GAME_BY_ID[id].logic;
  const submit = vi.fn((a: unknown) => {
    const j = logic.judge(puzzle, a);
    results.push(j);
    return j;
  });
  const saveDraft = vi.fn();
  const View = GAME_VIEWS[id] as ComponentType<Record<string, unknown>>;
  sessionStorage.setItem('kazu.tabProfileId', p.id);
  const props = { puzzle, difficulty: 'easy', submit, solved: false, found: [], hintLevel: 0, saveDraft, reportProgress: () => undefined, status: null, ...extra };
  const view = render(
    <AppProvider repo={repo}>
      <View {...props} />
    </AppProvider>,
  );
  await screen.findAllByRole('button', { name: /./ });
  return { results, submit, saveDraft, view, props, View, repo };
}

const pad = () => screen.getByRole('group', { name: 'すうじキー' });
const typeNumber = (n: number) => {
  for (const d of String(n)) fireEvent.click(within(pad()).getByRole('button', { name: d }));
};
const last = (r: Judgement[]) => r.at(-1)?.correct;

describe('17 missing-number view', () => {
  it('one blank: a wrong answer can be retried, then the right one is accepted', async () => {
    const p = GAME_BY_ID['missing-number'].logic.fallback('easy')[0] as MissingPuzzle;
    const r = await renderView('missing-number', p);
    const sol = missingSolution(p)[0];
    typeNumber(sol === 1 ? 2 : 1);
    fireEvent.click(within(pad()).getByRole('button', { name: 'こたえる' }));
    expect(last(r.results)).toBe(false);
    fireEvent.click(within(pad()).getByRole('button', { name: 'ぜんぶ けす' }));
    typeNumber(sol);
    fireEvent.click(within(pad()).getByRole('button', { name: 'こたえる' }));
    expect(last(r.results)).toBe(true);
  });

  it('two digit blanks: typing moves to the next box; a new digit replaces the old one', async () => {
    const p: MissingPuzzle = { a: 45, b: 36, c: 81, op: 'add', blanks: [{ term: 0, digit: 1 }, { term: 1, digit: 0 }] };
    const r = await renderView('missing-number', p);
    typeNumber(9); // 1つめ：9 → つぎの □ へ
    typeNumber(3); // 2つめ：3
    fireEvent.click(screen.getByRole('button', { name: '1つめの しかく' }));
    typeNumber(5); // 9 を 5 に いれかえ
    fireEvent.click(within(pad()).getByRole('button', { name: 'こたえる' }));
    expect(r.results.at(-1)).toEqual({ correct: true });
    expect(r.submit).toHaveBeenLastCalledWith([5, 3]);
  });

  it('an empty box is not judged as correct', async () => {
    const p: MissingPuzzle = { a: 45, b: 36, c: 81, op: 'add', blanks: [{ term: 0, digit: 1 }, { term: 1, digit: 0 }] };
    const r = await renderView('missing-number', p);
    typeNumber(5);
    fireEvent.click(within(pad()).getByRole('button', { name: 'こたえる' }));
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(r.results.at(-1)?.message).toContain('ぜんぶの □');
  });
});

describe('18 triangle-pattern view', () => {
  const cellName = (r: number, c: number) => new RegExp(`^うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ：`);

  it('copying the sample by tapping solves it; undo restores the previous state', async () => {
    const p = GAME_BY_ID['triangle-pattern'].logic.fallback('normal')[0] as TrianglePuzzle;
    const r = await renderView('triangle-pattern', p);
    const cell = (rr: number, c: number) => screen.getByRole('gridcell', { name: cellName(rr, c) });
    fireEvent.click(cell(0, 0));
    expect(cell(0, 0).getAttribute('aria-label')).toContain(TRI_LABEL[1]);
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cell(0, 0).getAttribute('aria-label')).toContain(TRI_LABEL[0]);
    p.target.forEach((row, rr) => row.forEach((v, c) => Array.from({ length: tapsNeeded(0, v) }, () => fireEvent.click(cell(rr, c)))));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(last(r.results)).toBe(true);
    expect(r.saveDraft).toHaveBeenCalled();
  });

  it('restores the saved board and highlights a wrong cell at hint level 3', async () => {
    const p: TrianglePuzzle = { size: 2, target: [[1, 0], [3, 5]] };
    await renderView('triangle-pattern', p, { draft: { board: [[1, 0], [3, 4]] }, hintLevel: 3 });
    expect(screen.getByRole('gridcell', { name: cellName(1, 1) }).getAttribute('aria-label')).toContain(TRI_LABEL[4]);
    expect(screen.getByRole('gridcell', { name: cellName(1, 1) }).className).toContain('pop');
    expect(screen.getByRole('gridcell', { name: cellName(0, 0) }).className).not.toContain('pop');
  });
});

describe('19 dot-connect view', () => {
  const point = (x: number, y: number) => screen.getByRole('button', { name: new RegExp(`^うえから ${y + 1}ばんめ ひだりから ${x + 1}ばんめの てん`) });

  it('tapping two points draws a line; drawing in any order solves it', async () => {
    const p = GAME_BY_ID['dot-connect'].logic.fallback('hard')[0] as DotsPuzzle;
    const r = await renderView('dot-connect', p);
    // 逆順・逆向きに ひく（1本ごとに えらびなおす）
    for (const s of [...p.segments].reverse()) {
      fireEvent.click(point(s[2], s[3]));
      fireEvent.click(point(s[0], s[1]));
      fireEvent.click(point(s[0], s[1])); // おなじ てん → えらぶのを やめる
    }
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(last(r.results)).toBe(true);
  });

  it('continues from the last point, redrawing a line erases it, undo works', async () => {
    const p: DotsPuzzle = { size: 3, segments: [[0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 1]] as Seg[] };
    const r = await renderView('dot-connect', p);
    fireEvent.click(point(0, 0));
    fireEvent.click(point(2, 0)); // 長い線（2本ぶん）
    fireEvent.click(point(0, 0)); // 同じ線を もういちど → けす
    expect(r.saveDraft).toHaveBeenLastCalledWith({ segments: [] });
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(r.saveDraft.mock.calls.at(-1)?.[0].segments).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶ けす' }));
    // しかくを 一筆で
    fireEvent.click(point(0, 0));
    fireEvent.click(point(1, 0));
    fireEvent.click(point(1, 1));
    fireEvent.click(point(0, 1));
    fireEvent.click(point(0, 0));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(last(r.results)).toBe(true);
  });
});
