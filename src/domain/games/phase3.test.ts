import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES } from '../types';
import { generatePuzzle } from './types';
import { CATEGORY_LABEL, GAMES, GAME_BY_ID } from './registry';
import {
  canonicalShape,
  consistentViews,
  edgeKey,
  edgeLocations,
  FACE_NAME,
  foldNet,
  isLandscape,
  hintCells,
  NET_RULES,
  NET_SHAPES,
  netAnswers,
  netCells,
  netQuiz,
  netSides,
  sideEdge,
  solveNet,
  VIEW_NORMAL,
  VISIBLE_FACES,
  type NetQuizPuzzle,
  type Side,
  type Vec,
} from './netQuiz';
import { arrangementAfter, CUP_ROUNDS, CUP_RULES, CUP_SWAP_MS_V1, movesOf, positionOf, shuffleCups, type ShuffleCupsPuzzle } from './shuffleCups';
import { cellId, checkStep, isNeighbor, PATH_ROUNDS, PATH_RULES, pathProblem, vanishingPath, type VanishingPathPuzzle } from './vanishingPath';

const gen = <P,>(logic: Parameters<typeof generatePuzzle>[0], seed: number, d: (typeof DIFFICULTIES)[number]) => generatePuzzle(logic, createRng(seed), d).puzzle as P;

// ---- 展開図を 3D で ほんとうに おりたたむ（ドメインの 整数ルールとは べつの 計算で たしかめる） ----
type M4 = number[][];
const mul = (a: M4, b: M4): M4 => a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
const apply = (m: M4, p: number[], w = 1) => [0, 1, 2].map((i) => m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] * w);
const I4: M4 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
/** となりの マスを、つなぎめの 線を じくに 90° 奥（+z）へ おる 変換（展開図の 座標：x=列, y=行） */
function hinge(r: number, c: number, side: Side): M4 {
  // 右：(x,y,z) → (h, y, x-h) / 下：(x, h, y-h) / 左：(h, y, h-x) / 上：(x, h, h-y)  ※ z=0 の 平面上の 点に つかう
  if (side === 0) return [[0, 0, -1, c + 1], [0, 1, 0, 0], [1, 0, 0, -(c + 1)], [0, 0, 0, 1]];
  if (side === 1) return [[1, 0, 0, 0], [0, 0, -1, r + 1], [0, 1, 0, -(r + 1)], [0, 0, 0, 1]];
  if (side === 2) return [[0, 0, 1, c], [0, 1, 0, 0], [-1, 0, 0, c], [0, 0, 0, 1]];
  return [[1, 0, 0, 0], [0, 0, 1, r], [0, -1, 0, r], [0, 0, 0, 1]];
}
const STEP: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
function simulateFold(cells: [number, number][]) {
  const m: (M4 | undefined)[] = [I4];
  const q = [0];
  while (q.length) {
    const i = q.shift()!;
    for (let s = 0 as Side; s < 4; s = (s + 1) as Side) {
      const j = cells.findIndex((x) => x[0] === cells[i][0] + STEP[s][0] && x[1] === cells[i][1] + STEP[s][1]);
      if (j < 0 || m[j]) continue;
      m[j] = mul(m[i]!, hinge(cells[i][0], cells[i][1], s));
      q.push(j);
    }
  }
  return cells.map(([r, c], i) => {
    const mm = m[i]!;
    const center = apply(mm, [c + 0.5, r + 0.5, 0]);
    const n = apply(mm, [0, 0, -1], 0).map(Math.round);
    const rr = apply(mm, [1, 0, 0], 0).map(Math.round);
    const dd = apply(mm, [0, 1, 0], 0).map(Math.round);
    return { center, n, r: rr, d: dd };
  });
}
const z = (v: readonly number[]) => v.map((x) => x + 0);
const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

describe('23 net-quiz：展開図の 数学', () => {
  it('ヘキソミノ 216種のうち 立方体に おれるのは ちょうど 11種で、NET_SHAPES と 一致する', () => {
    let shapes = new Set(['0,0']);
    for (let n = 1; n < 6; n++) {
      const next = new Set<string>();
      for (const s of shapes) {
        const cells = s.split(';').map((x) => x.split(',').map(Number) as [number, number]);
        for (const [r, c] of cells)
          for (const [dr, dc] of STEP) {
            const nc: [number, number] = [r + dr, c + dc];
            if (cells.some((x) => x[0] === nc[0] && x[1] === nc[1])) continue;
            const all = [...cells, nc];
            const mr = Math.min(...all.map((x) => x[0]));
            const mc = Math.min(...all.map((x) => x[1]));
            next.add(all.map(([a, b]) => [a - mr, b - mc]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).join(';'));
          }
      }
      shapes = next;
    }
    expect(shapes.size).toBe(216); // 向きを区別した ヘキソミノの 数
    const nets = new Set<string>();
    for (const s of shapes) {
      const cells = s.split(';').map((x) => x.split(',').map(Number) as [number, number]);
      if (foldNet(cells)) nets.add(canonicalShape(cells));
    }
    expect(nets.size).toBe(11);
    expect(new Set(NET_SHAPES.map((sh) => canonicalShape(netCells(sh, 0))))).toEqual(nets);
  });

  it('11種 × 8向きの どれも、3Dで おると 6つの めんが 重ならず 立方体に なり、整数の ルールと 一致する', () => {
    for (let net = 0; net < NET_SHAPES.length; net++)
      for (let sym = 0; sym < 8; sym++) {
        const cells = netCells(NET_SHAPES[net], sym);
        const frames = foldNet(cells)!;
        expect(frames, `${net}/${sym}`).not.toBeNull();
        const sim = simulateFold(cells);
        const mean = [0, 1, 2].map((k) => sim.reduce((s, x) => s + x.center[k], 0) / 6);
        sim.forEach((f, i) => {
          expect(z(f.n)).toEqual(z(frames[i].n));
          expect(z(f.r)).toEqual(z(frames[i].r));
          expect(z(f.d)).toEqual(z(frames[i].d));
          // 外向き：めんの 中心は 立方体の 中心から 法線の 向きに 0.5
          expect(near(f.center, mean.map((m, k) => m + 0.5 * f.n[k]))).toBe(true);
        });
        expect(new Set(sim.map((f) => f.n.join())).size).toBe(6);
        // 物理的な へんは 12本：おりめ 5本＋ 外まわりで 2回ずつ あらわれる 7本
        const s = solveNet({ cells, view: { right: 0, top: frames.findIndex((f) => f.n[2] === 0 && f.n[0] === 0) } })!;
        const sides = netSides(cells);
        const byEdge = new Map<string, number>();
        for (const loc of sides) {
          const e = sideEdge(s, loc.cell, loc.side);
          expect(e[0]).not.toBe(e[1]);
          byEdge.set(edgeKey(...e), (byEdge.get(edgeKey(...e)) ?? 0) + 1);
        }
        expect(byEdge.size).toBe(12);
        expect(sides.filter((l) => l.fold)).toHaveLength(5);
        for (const [k, n] of byEdge) {
          const fold = sides.some((l) => l.fold && edgeKey(...sideEdge(s, l.cell, l.side)) === k);
          expect(n, k).toBe(fold ? 1 : 2);
        }
      }
  });

  it('2x2 の かたまりや 重なる 形は 立方体に ならない', () => {
    expect(foldNet([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0]])).toBeNull();
    expect(foldNet([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0]])).toBeNull();
    expect(foldNet([[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [3, 3]])).toBeNull(); // つながっていない
  });
});

describe('23 net-quiz：出題', () => {
  it('4段階 × 500シード：検証ずみ・しるしで 向きが 1とおりに きまり・答えは 判定と 一致', () => {
    const kinds = { face: 0, edge: 0 };
    for (const d of DIFFICULTIES) {
      const used = new Set<number>();
      const syms = new Set<number>();
      for (let seed = 1; seed <= 500; seed++) {
        const res = generatePuzzle(netQuiz, createRng(seed), d);
        expect(res.fromFallback).toBe(false);
        const p = res.puzzle as NetQuizPuzzle;
        expect(netQuiz.validate(p, d)).toBeNull();
        used.add(p.net);
        kinds[p.target.kind]++;
        expect(consistentViews(p)).toBe(1);
        // しるしを 1つ へらすと 向きが きまらない（しるしが ちゃんと 役に たっている）
        expect(consistentViews({ ...p, marks: p.marks.slice(0, 1) })).toBeGreaterThan(1);
        const s = solveNet(p)!;
        // 3D の 見え方と 展開図の めんの 対応を、べつの 計算（実際に おる）で たしかめる
        const sim = simulateFold(p.cells);
        const a = sim[p.view.right].n;
        const b = sim[p.view.top].n;
        const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const toView = (v: number[]) => [v[0] * a[0] + v[1] * a[1] + v[2] * a[2], -(v[0] * c[0] + v[1] * c[1] + v[2] * c[2]), v[0] * b[0] + v[1] * b[1] + v[2] * b[2]];
        sim.forEach((f, i) => expect(z(toView(f.n))).toEqual(z(VIEW_NORMAL[s.faceOfCell[i]])));
        for (const m of p.marks) expect(VISIBLE_FACES).toContain(m.face);
        const answers = netAnswers(p);
        for (const ans of answers) expect(netQuiz.judge(p, ans).correct).toBe(true);
        if (p.target.kind === 'face') {
          expect(VISIBLE_FACES).toContain(p.target.face);
          expect(answers).toHaveLength(1);
          for (let cell = 0; cell < 6; cell++) expect(netQuiz.judge(p, { kind: 'face', cell }).correct).toBe(cell === s.cellOfFace[p.target.face]);
          expect(netQuiz.judge(p, { kind: 'edge', cell: 0, side: 0 }).correct).toBe(false);
        } else {
          const locs = edgeLocations(p, s, p.target.faces);
          expect(answers).toHaveLength(locs[0].fold ? 1 : 2);
          // おりめは 1か所、きりひらいた へんは 2か所。それいがいの 辺は ぜんぶ まちがい
          for (let cell = 0; cell < 6; cell++)
            for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
              const e = sideEdge(s, cell, side);
              expect(netQuiz.judge(p, { kind: 'edge', cell, side }).correct).toBe(edgeKey(...e) === edgeKey(...p.target.faces));
            }
          expect(netQuiz.judge(p, { kind: 'face', cell: 0 }).correct).toBe(false);
        }
        // おなじ シードなら おなじ 問題
        expect(gen<NetQuizPuzzle>(netQuiz, seed, d)).toEqual(p);
        // スマホに 入る 横長の 向き（5×2 または 4×3 まで）
        expect(isLandscape(p.cells)).toBe(true);
        syms.add(p.sym);
      }
      expect([...used].sort((x, y) => x - y)).toEqual(NET_RULES[d].nets);
      // 回転（180°）・裏返しも 出る
      expect(syms.size).toBeGreaterThanOrEqual(d === 'easy' ? 2 : 4);
    }
    expect(kinds.edge).toBeGreaterThan(500);
    expect(kinds.face).toBeGreaterThan(500);
  });

  it('かんたん・ふつうは めんだけ、チャレンジは おもに へん。かんたんは ガイドつき', () => {
    const count = (d: (typeof DIFFICULTIES)[number]) => {
      let edge = 0;
      for (let s = 1; s <= 200; s++) if (gen<NetQuizPuzzle>(netQuiz, s, d).target.kind === 'edge') edge++;
      return edge;
    };
    expect(count('easy')).toBe(0);
    expect(count('normal')).toBe(0);
    expect(count('hard')).toBeGreaterThan(60);
    expect(count('challenge')).toBeGreaterThan(130);
    expect(gen<NetQuizPuzzle>(netQuiz, 1, 'easy').guide).toBe(true);
    expect(gen<NetQuizPuzzle>(netQuiz, 1, 'hard').guide).toBe(false);
  });

  it('あいまいな 問題・こわれた 問題は 検証で はじく', () => {
    const p = gen<NetQuizPuzzle>(netQuiz, 5, 'normal');
    expect(netQuiz.validate({ ...p, marks: p.marks.slice(0, 1) }, 'normal')).toBe('marks');
    const target = p.target.kind === 'face' ? p.target.face : 'top';
    expect(netQuiz.validate({ ...p, marks: [{ face: target, mark: 0 }, ...p.marks.filter((m) => m.face !== target).slice(0, 1).map((m) => ({ ...m, mark: 1 }))] }, 'normal')).toMatch(/mark on target|ambiguous/);
    expect(netQuiz.validate({ ...p, cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0]] }, 'normal')).toBe('cells');
    expect(netQuiz.validate({ ...p, target: { kind: 'face', face: 'bottom' } }, 'normal')).toBe('hidden target');
    expect(netQuiz.validate({ ...p, target: { kind: 'edge', faces: ['top', 'front'] } }, 'normal')).toBe('kind'); // ふつうは めんだけ
    expect(netQuiz.validate({ ...p, net: 9 }, 'normal')).toBe('net not allowed');
  });

  it('十字の 展開図：まんなかの れつは 1つおきに はんたい、まちがいの メッセージは 立方体での 場所を いう', () => {
    const cells = netCells(NET_SHAPES[0], 0); // .#.. / #### / .#..
    const p: NetQuizPuzzle = { net: 0, sym: 0, cells, view: { right: 3, top: 0 }, marks: [{ face: 'right', mark: 0 }, { face: 'top', mark: 1 }], target: { kind: 'face', face: 'front' }, guide: true };
    expect(netQuiz.validate(p, 'easy')).toBeNull();
    const s = solveNet(p)!;
    const opp = (a: Vec, b: Vec) => a.every((x, i) => x === -b[i]);
    const f = s.frames;
    // マスの ならび：0=(0,1) 1=(1,0) 2=(1,1) 3=(1,2) 4=(1,3) 5=(2,1)
    expect(opp(f[1].n, f[3].n)).toBe(true);
    expect(opp(f[2].n, f[4].n)).toBe(true);
    expect(opp(f[0].n, f[5].n)).toBe(true);
    const ans = netAnswers(p)[0]!;
    expect(ans.kind).toBe('face');
    const wrong = [0, 1, 2, 3, 4, 5].find((c) => ans.kind === 'face' && c !== ans.cell && !p.marks.some((m) => s.cellOfFace[m.face] === c))!;
    expect(netQuiz.judge(p, { kind: 'face', cell: wrong }).message).toContain(`「${FACE_NAME[s.faceOfCell[wrong]]}」`);
    expect(netQuiz.judge(p, { kind: 'face', cell: s.cellOfFace.top }).message).toBe('そこは しるしの ついた めんだよ');
    expect(netQuiz.judge(p, null).correct).toBe(false);
    // ヒント3：答えと その はんたいがわの 2つ
    expect(hintCells(p)).toContain(s.cellOfFace.front);
    expect(hintCells(p)).toContain(s.cellOfFace.back);
    expect(netQuiz.hints(p)).toHaveLength(3);
  });
});

describe('24 shuffle-cups', () => {
  it('4段階 × 500シード：きまりどおり・ボールの カップを 1回ずつ おいかけると 判定と 一致', () => {
    for (const d of DIFFICULTIES)
      for (let seed = 1; seed <= 500; seed++) {
        const res = generatePuzzle(shuffleCups, createRng(seed), d);
        expect(res.fromFallback).toBe(false);
        const p = res.puzzle as ShuffleCupsPuzzle;
        const rule = CUP_RULES[d];
        expect(shuffleCups.validate(p, d)).toBeNull();
        expect(p.rounds).toHaveLength(CUP_ROUNDS);
        for (const r of p.rounds) {
          expect(r.swaps).toHaveLength(rule.swaps);
          expect(r.balls).toHaveLength(rule.balls);
          // 場所で 1回ずつ おいかける（カップ ID の 計算とは べつに）
          const slotOfBall = [...r.balls];
          const at = Array.from({ length: p.cups }, (_, i) => i);
          for (const [a, b] of r.swaps) {
            const pa = at.indexOf(a);
            const pb = at.indexOf(b);
            [at[pa], at[pb]] = [at[pb], at[pa]];
            for (let k = 0; k < slotOfBall.length; k++) {
              if (slotOfBall[k] === pa) slotOfBall[k] = pb;
              else if (slotOfBall[k] === pb) slotOfBall[k] = pa;
            }
          }
          const end = arrangementAfter(p.cups, r.swaps);
          expect(end).toEqual(at);
          r.balls.forEach((cup, k) => {
            expect(positionOf(end, cup)).toBe(slotOfBall[k]);
            expect(slotOfBall[k]).not.toBe(cup); // はじめの 場所に もどるだけ ではない
            expect(movesOf(r, k)).toBeGreaterThanOrEqual(rule.minMoves);
          });
          for (let i = 1; i < r.swaps.length; i++) expect(new Set([...r.swaps[i], ...r.swaps[i - 1]]).size).toBeGreaterThan(2);
        }
        const picks = p.rounds.map((r) => [...r.balls]);
        expect(shuffleCups.judge(p, { picks, rounds: [] }).correct).toBe(true);
        expect(gen<ShuffleCupsPuzzle>(shuffleCups, seed, d)).toEqual(p);
      }
  });

  it('はやさ：かんたん 650ms → ふつう 450 → むずかしい 320 → チャレンジ 220。数・回数・ボールは そのまま', () => {
    expect(Object.fromEntries(DIFFICULTIES.map((d) => [d, CUP_RULES[d].swapMs]))).toEqual({ easy: 650, normal: 450, hard: 320, challenge: 220 });
    expect(Object.fromEntries(DIFFICULTIES.map((d) => [d, [CUP_RULES[d].cups, CUP_RULES[d].swaps, CUP_RULES[d].balls]]))).toEqual({ easy: [3, 2, 1], normal: [3, 4, 1], hard: [4, 6, 1], challenge: [6, 9, 2] });
    for (const d of DIFFICULTIES) {
      expect(CUP_RULES[d].swapMs).toBeLessThan(CUP_SWAP_MS_V1[d] * 0.6); // まえより じゅうぶん はやい
      for (let s = 1; s <= 20; s++) expect(gen<ShuffleCupsPuzzle>(shuffleCups, s, d).swapMs).toBe(CUP_RULES[d].swapMs);
    }
    for (let i = 1; i < DIFFICULTIES.length; i++) expect(CUP_RULES[DIFFICULTIES[i]].swapMs).toBeLessThan(CUP_RULES[DIFFICULTIES[i - 1]].swapMs);
    // 前の版の 問題（保存された swapMs）は 判定も そのまま
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 3, 'hard');
    const v1 = { ...p, swapMs: CUP_SWAP_MS_V1.hard };
    expect(shuffleCups.judge(v1, { picks: v1.rounds.map((r) => [...r.balls]), rounds: [] }).correct).toBe(true);
  });

  it('2この ボールは かたほうだけ あっても まちがい。4ラウンドだけでも まちがい', () => {
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 7, 'challenge');
    expect(p.cups).toBe(6);
    const picks = p.rounds.map((r) => [...r.balls]);
    for (const r of p.rounds) expect(r.balls[0]).not.toBe(r.balls[1]);
    const one = picks.map((x) => [...x]);
    one[2] = [one[2][0], (one[2][1] + 1) % 6 === one[2][0] ? (one[2][1] + 2) % 6 : (one[2][1] + 1) % 6];
    const j = shuffleCups.judge(p, { picks: one, rounds: [] });
    expect(j.correct).toBe(false);
    expect(j.message).toContain('かたほう');
    const swapped = picks.map((x) => [x[1], x[0]]); // あかと あおを ぎゃくに
    expect(shuffleCups.judge(p, { picks: swapped, rounds: [] }).correct).toBe(false);
    expect(shuffleCups.judge(p, { picks: picks.slice(0, 4), rounds: [] }).correct).toBe(false);
    expect(shuffleCups.judge(p, { picks: picks.slice(0, 4), rounds: [] }).message).toBe('4ラウンド まで できたよ');
  });

  it('検証：すぐ もどる いれかえ・うごかない ボール・同じ ラウンドは はじく', () => {
    const p = gen<ShuffleCupsPuzzle>(shuffleCups, 3, 'normal');
    const r0 = p.rounds[0];
    const undo = { ...p, rounds: [{ ...r0, swaps: [r0.swaps[0], r0.swaps[0], ...r0.swaps.slice(2)] }, ...p.rounds.slice(1)] };
    expect(shuffleCups.validate(undo, 'normal')).toMatch(/undo swap|ball/);
    const other = [0, 1, 2].filter((c) => c !== r0.balls[0]);
    const still = { ...p, rounds: [{ balls: r0.balls, swaps: [[other[0], other[1]], [other[1], other[0]], [other[0], other[1]], [other[1], other[0]]] as [number, number][] }, ...p.rounds.slice(1)] };
    expect(shuffleCups.validate(still, 'normal')).toMatch(/round 1/);
    expect(shuffleCups.validate({ ...p, rounds: [p.rounds[0], p.rounds[0], ...p.rounds.slice(2)] }, 'normal')).toBe('same round twice');
    expect(shuffleCups.validate({ ...p, swapMs: 100 }, 'normal')).toBe('rules');
  });

  it('arrangementAfter：とちゅうの ならびも 計算できる', () => {
    expect(arrangementAfter(3, [[0, 2], [2, 1]], 0)).toEqual([0, 1, 2]);
    expect(arrangementAfter(3, [[0, 2], [2, 1]], 1)).toEqual([2, 1, 0]);
    expect(arrangementAfter(3, [[0, 2], [2, 1]])).toEqual([1, 2, 0]);
  });
});

describe('25 vanishing-path', () => {
  it('4段階 × 500シード：盤の中・長さ・となりどうし・自分に くっつかない・ちがう 道が 5本', () => {
    for (const d of DIFFICULTIES) {
      const starts = new Set<number>();
      for (let seed = 1; seed <= 500; seed++) {
        const res = generatePuzzle(vanishingPath, createRng(seed), d);
        expect(res.fromFallback).toBe(false);
        const p = res.puzzle as VanishingPathPuzzle;
        const r = PATH_RULES[d];
        expect(vanishingPath.validate(p, d)).toBeNull();
        expect(p.rounds).toHaveLength(PATH_ROUNDS);
        for (const path of p.rounds) {
          const steps = path.length - 1;
          expect(steps).toBeGreaterThanOrEqual(r.minSteps);
          expect(steps).toBeLessThanOrEqual(r.maxSteps);
          expect(path.every(([y, x]) => y >= 0 && x >= 0 && y < p.size && x < p.size)).toBe(true);
          expect(new Set(path.map((c) => cellId(p.size, c))).size).toBe(path.length);
          for (let i = 1; i < path.length; i++) expect(isNeighbor(path[i - 1], path[i])).toBe(true);
          for (let i = 0; i < path.length; i++) for (let j = i + 2; j < path.length; j++) expect(isNeighbor(path[i], path[j])).toBe(false);
          starts.add(cellId(p.size, path[0]));
          // じゅんに すすむと ゴール。ゴールへ とびこしは できない
          for (let i = 0; i < path.length - 1; i++) expect(checkStep(p, p.rounds.indexOf(path), i, path[i + 1])).toBe(i + 1 === path.length - 1 ? 'goal' : 'next');
          if (path.length > 2 && !isNeighbor(path[0], path.at(-1)!)) expect(checkStep(p, p.rounds.indexOf(path), 0, path.at(-1)!)).toBe('notNeighbor');
        }
        expect(new Set(p.rounds.map((x) => x.map((c) => cellId(p.size, c)).join('.'))).size).toBe(PATH_ROUNDS);
        const routes = p.rounds.map((x) => x.map((c) => cellId(p.size, c)));
        expect(vanishingPath.judge(p, { routes, rounds: [] }).correct).toBe(true);
        expect(gen<VanishingPathPuzzle>(vanishingPath, seed, d)).toEqual(p);
      }
      // スタートは かどに かぎらない
      expect(starts.size).toBeGreaterThan(4);
    }
  });

  it('判定：ゴールだけ・とちゅうまで・ちがう 道は まちがい', () => {
    const p = gen<VanishingPathPuzzle>(vanishingPath, 11, 'hard');
    const routes = p.rounds.map((x) => x.map((c) => cellId(p.size, c)));
    const goalOnly = routes.map((r) => [r[0], r.at(-1)!]);
    expect(vanishingPath.judge(p, { routes: goalOnly, rounds: [] }).correct).toBe(false);
    expect(vanishingPath.judge(p, { routes: routes.slice(0, 3), rounds: [] }).message).toBe('3ラウンド まで できたよ');
    const bent = routes.map((r) => [...r]);
    bent[1][2] = bent[1][2] + 1;
    expect(vanishingPath.judge(p, { routes: bent, rounds: [] }).correct).toBe(false);
    const path = p.rounds[0];
    const wrongNeighbor = ([
      [path[0][0] + 1, path[0][1]],
      [path[0][0] - 1, path[0][1]],
      [path[0][0], path[0][1] + 1],
      [path[0][0], path[0][1] - 1],
    ] as [number, number][]).find((c) => c[0] >= 0 && c[1] >= 0 && c[0] < p.size && c[1] < p.size && !(c[0] === path[1][0] && c[1] === path[1][1]))!;
    expect(checkStep(p, 0, 0, wrongNeighbor)).toBe('wrong');
    expect(checkStep(p, 0, 0, [path[0][0] + 1, path[0][1] + 1])).toBe('notNeighbor'); // ななめ
  });

  it('pathProblem：自分に くっつく 道・とぶ 道・はみでる 道は だめ', () => {
    expect(pathProblem([[0, 0], [0, 1], [1, 1], [1, 0]], 3, 3, 4)).toBe('touches itself');
    expect(pathProblem([[0, 0], [0, 1], [0, 2], [2, 2]], 3, 3, 4)).toBe('jump');
    expect(pathProblem([[0, 0], [0, 1], [0, 2], [0, 3]], 3, 3, 4)).toBe('outside');
    expect(pathProblem([[0, 0], [0, 1], [0, 2], [1, 2]], 3, 3, 4)).toBeNull();
    expect(pathProblem([[0, 0], [0, 1]], 3, 3, 4)).toBe('length');
  });
});

describe('registry: 25 games', () => {
  it('23〜25 を つづきの 番号で 登録。きおく・パズルの カテゴリを つかう', () => {
    expect(GAMES).toHaveLength(25);
    expect(GAMES.map((g) => g.id).slice(22)).toEqual(['net-quiz', 'shuffle-cups', 'vanishing-path']);
    expect(GAMES.map((g) => g.no).slice(22)).toEqual(['23', '24', '25']);
    expect(GAME_BY_ID['net-quiz']).toMatchObject({ category: 'puzzle', kind: 'set', resumable: false });
    expect(GAME_BY_ID['shuffle-cups']).toMatchObject({ category: 'memory', kind: 'board', resumable: true });
    expect(GAME_BY_ID['vanishing-path']).toMatchObject({ category: 'memory', kind: 'board', resumable: true });
    expect(Object.keys(CATEGORY_LABEL)).toHaveLength(5);
    for (const id of ['net-quiz', 'vanishing-path'] as const) expect(GAME_BY_ID[id].logic.generatorVersion).toBe(1);
    expect(GAME_BY_ID['shuffle-cups'].logic.generatorVersion).toBe(2); // はやさを かえた
    // 既存の 22 ゲームは そのまま
    expect(GAMES.slice(0, 22).map((g) => g.id)).toEqual(['decompose', 'pittari', 'make10', 'kufuu', 'balance', 'sequence', 'machine', 'flash', 'numberline', 'coins', 'shopping', 'sudoku', 'maze', 'shapes', 'mirror', 'pattern', 'missing-number', 'triangle-pattern', 'dot-connect', 'symbol-memory', 'nonogram', 'light-sequence']);
    expect(GAME_BY_ID['light-sequence'].logic.generatorVersion).toBe(2);
  });
});
