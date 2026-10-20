import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 23 てんかいずクイズ：うえの 立方体で 色の ついた めん（または へん）が、したの 展開図の どこに なるかを タップする。
 *
 * 数学的な しくみ（見た目の SVG に 正解を 書きこまない）：
 * - 展開図は マス (row, col) の あつまり。紙を 外がわから 見ていて、まわりの めんを 奥へ おりまげて 箱にする。
 * - 各マスに「外向きの 法線 n・展開図の 右 (+col) に あたる 向き r・下 (+row) に あたる 向き d」を 整数ベクトルで わりあてる。
 *   はじめの マスは n=(0,0,-1), r=(1,0,0), d=(0,1,0)。となりへ おると
 *   右：(n,r,d)→(r,-n,d) / 左：(-r,n,d) / 下：(d,r,-n) / 上：(-d,r,n)
 * - 6マスが つながり、おりたたんだ 法線が 6つとも ちがえば 立方体に なる（＝正しい展開図）。
 * - 立方体の 見え方は「右の めん」「上の めん」に なる マスで きめる（24とおりの 回転）。まえの めん = 右 × 上。
 * - 物理的な へん = となりあう 2つの めんの くみ。マスの 4つの 辺は それぞれ (n と r・-r・d・-d の めん) の へん。
 *   展開図の 外まわりでは 1本の へんが 2か所に あらわれ、おりめは 1か所。どちらを えらんでも 同じ へんとして 判定する。
 */

export type Vec = readonly [number, number, number];
/** 展開図の マスの 辺：0 みぎ 1 した 2 ひだり 3 うえ */
export type Side = 0 | 1 | 2 | 3;
/** 立方体を 見たときの めんの 名前（見えるのは top・front・right） */
export type ViewFace = 'top' | 'front' | 'right' | 'bottom' | 'back' | 'left';
export const VISIBLE_FACES: readonly ViewFace[] = ['top', 'front', 'right'];
export const FACE_NAME: Record<ViewFace, string> = { top: 'うえ', front: 'まえ', right: 'みぎ', bottom: 'した', back: 'うしろ', left: 'ひだり' };
/** 表示の 座標（x みぎ・y おく・z うえ）での 各めんの 外向き法線 */
export const VIEW_NORMAL: Record<ViewFace, Vec> = { right: [1, 0, 0], left: [-1, 0, 0], back: [0, 1, 0], front: [0, -1, 0], top: [0, 0, 1], bottom: [0, 0, -1] };

/** 正しい 立方体の展開図 11種類（回転・裏返しで 同じものは 1つに まとめた 代表） */
export const NET_SHAPES: readonly (readonly string[])[] = [
  ['.#..', '####', '.#..'], // 0 十字
  ['.#..', '####', '..#.'],
  ['#...', '####', '.#..'],
  ['#...', '####', '#...'],
  ['#...', '####', '..#.'],
  ['#...', '####', '...#'],
  ['..#.', '###.', '..##'], // 6〜8 2-3-1
  ['..#.', '.###', '##..'],
  ['...#', '.###', '##..'],
  ['..##', '.##.', '##..'], // 9 かいだん
  ['..###', '###..'], // 10 3-3
];

export interface NetMark {
  face: ViewFace;
  /** しるしの 種類（MARKS の 番号） */
  mark: number;
}
export type NetTarget = { kind: 'face'; face: ViewFace } | { kind: 'edge'; faces: [ViewFace, ViewFace] };

export interface NetQuizPuzzle {
  /** NET_SHAPES の 番号 */
  net: number;
  /** 回転・裏返しの 番号（0..7） */
  sym: number;
  /** 展開図の マス (row, col)。0 が はじめの マス */
  cells: [number, number][];
  /** 立方体で「右」「上」に 見える マスの 番号 */
  view: { right: number; top: number };
  /** 基準の しるし（見える めんに 2つ。めあての めんには つけない） */
  marks: NetMark[];
  target: NetTarget;
  /** かんたん：おりめの ガイドを 出す */
  guide: boolean;
}

export type NetQuizAnswer = { kind: 'face'; cell: number } | { kind: 'edge'; cell: number; side: Side } | null;

export const MARK_COUNT = 3;

const neg = (a: Vec): Vec => [-a[0], -a[1], -a[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const same = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const vkey = (a: Vec) => a.join(',');

export interface Frame {
  n: Vec;
  r: Vec;
  d: Vec;
}
export const SIDE_STEP: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
/** マスの 辺の むこうに ある めんの 法線 */
export const sideNormal = (f: Frame, s: Side): Vec => (s === 0 ? f.r : s === 1 ? f.d : s === 2 ? neg(f.r) : neg(f.d));

/** 展開図を おりたたむ。立方体に ならなければ null */
export function foldNet(cells: readonly (readonly [number, number])[]): Frame[] | null {
  if (cells.length !== 6) return null;
  const idx = new Map(cells.map(([r, c], i) => [`${r},${c}`, i]));
  if (idx.size !== 6) return null;
  const frames: (Frame | undefined)[] = [];
  frames[0] = { n: [0, 0, -1], r: [1, 0, 0], d: [0, 1, 0] };
  const queue = [0];
  while (queue.length) {
    const i = queue.shift()!;
    const { n, r, d } = frames[i]!;
    const next: Frame[] = [
      { n: r, r: neg(n), d },
      { n: d, r, d: neg(n) },
      { n: neg(r), r: n, d },
      { n: neg(d), r, d: n },
    ];
    for (let s = 0; s < 4; s++) {
      const j = idx.get(`${cells[i][0] + SIDE_STEP[s][0]},${cells[i][1] + SIDE_STEP[s][1]}`);
      if (j === undefined) continue;
      if (frames[j]) {
        // 2x2 の かたまりなど、2とおりに おれる ときは まちがい
        if (!same(frames[j]!.n, next[s].n)) return null;
        continue;
      }
      frames[j] = next[s];
      queue.push(j);
    }
  }
  if (frames.filter(Boolean).length !== 6) return null;
  if (new Set(frames.map((f) => vkey(f!.n))).size !== 6) return null;
  return frames as Frame[];
}

/** 文字の 図 → マス。sym で 回転（下位2ビット×90°）と 左右反転（4）を する */
export function netCells(shape: readonly string[], sym: number): [number, number][] {
  const raw: [number, number][] = [];
  shape.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && raw.push([r, c])));
  const t = raw.map(([r0, c0]) => {
    let r = r0;
    let c = sym & 4 ? -c0 : c0;
    for (let k = 0; k < (sym & 3); k++) [r, c] = [c, -r];
    return [r, c] as [number, number];
  });
  const mr = Math.min(...t.map((x) => x[0]));
  const mc = Math.min(...t.map((x) => x[1]));
  return t.map(([r, c]) => [r - mr, c - mc] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** 正規化した かたち（回転・反転で 同じなら 同じ 文字列） */
export function canonicalShape(cells: readonly (readonly [number, number])[]): string {
  const shape = (() => {
    const R = Math.max(...cells.map((x) => x[0])) + 1;
    const C = Math.max(...cells.map((x) => x[1])) + 1;
    return Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => (cells.some((x) => x[0] === r && x[1] === c) ? '#' : '.')).join(''));
  })();
  return Array.from({ length: 8 }, (_, s) => netCells(shape, s).join(';')).sort()[0];
}

/** 回転：右・上の めんの 法線 (a, b) から、おりたたんだ 法線 → 表示の 法線 */
const viewOf = (a: Vec, b: Vec) => {
  const c = cross(a, b); // まえの めん
  return (v: Vec): Vec => [dot(v, a), -dot(v, c), dot(v, b)];
};
const faceOfNormal = (v: Vec): ViewFace => (Object.keys(VIEW_NORMAL) as ViewFace[]).find((f) => same(VIEW_NORMAL[f], v))!;

export interface Solved {
  frames: Frame[];
  /** マス → 表示の めん */
  faceOfCell: ViewFace[];
  cellOfFace: Record<ViewFace, number>;
  /** 表示座標での マスの 向き（しるしを 立方体に かくため） */
  toView(v: Vec): Vec;
}

export function solveNet(p: Pick<NetQuizPuzzle, 'cells' | 'view'>): Solved | null {
  const frames = foldNet(p.cells);
  if (!frames) return null;
  const a = frames[p.view.right]?.n;
  const b = frames[p.view.top]?.n;
  if (!a || !b || dot(a, b) !== 0) return null;
  const toView = viewOf(a, b);
  const faceOfCell = frames.map((f) => faceOfNormal(toView(f.n)));
  const cellOfFace = Object.fromEntries(faceOfCell.map((f, i) => [f, i])) as Record<ViewFace, number>;
  return { frames, faceOfCell, cellOfFace, toView };
}

/** へんの キー（めんの くみ。順番は 問わない） */
export const edgeKey = (a: ViewFace, b: ViewFace) => [a, b].sort().join('|');

/** マスの 辺が 立方体の どの へんに なるか */
export function sideEdge(s: Solved, cell: number, side: Side): [ViewFace, ViewFace] {
  const f = s.frames[cell];
  return [s.faceOfCell[cell], faceOfNormal(s.toView(sideNormal(f, side)))];
}

export interface SideLoc {
  cell: number;
  side: Side;
  /** おりめ（2つの マスの あいだ）なら true */
  fold: boolean;
}

/** 画面に かく 辺の いちらん（おりめは 1本に まとめる：右・下 がわで 代表） */
export function netSides(cells: readonly (readonly [number, number])[]): SideLoc[] {
  const has = (r: number, c: number) => cells.some((x) => x[0] === r && x[1] === c);
  const out: SideLoc[] = [];
  cells.forEach(([r, c], cell) => {
    for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
      const nb = has(r + SIDE_STEP[side][0], c + SIDE_STEP[side][1]);
      if (nb && side >= 2) continue; // おりめは 右・下の がわだけ
      out.push({ cell, side, fold: nb });
    }
  });
  return out;
}

/** めあての へんが あらわれる 場所（外まわりなら 2か所、おりめなら 1か所） */
export function edgeLocations(p: NetQuizPuzzle, s: Solved, faces: readonly [ViewFace, ViewFace]): SideLoc[] {
  const k = edgeKey(faces[0], faces[1]);
  return netSides(p.cells).filter((loc) => {
    const e = sideEdge(s, loc.cell, loc.side);
    return edgeKey(e[0], e[1]) === k;
  });
}

/** 見えている へん（9本）：上・まえ・右の どれかに ふくまれる */
export const VISIBLE_EDGES: readonly [ViewFace, ViewFace][] = [
  ['top', 'front'],
  ['top', 'right'],
  ['front', 'right'],
  ['top', 'back'],
  ['top', 'left'],
  ['front', 'left'],
  ['front', 'bottom'],
  ['right', 'bottom'],
  ['right', 'back'],
];

/** 24とおりの 回転の うち、しるしの 位置と あう ものの 数（1 なら 答えが 1つに きまる） */
export function consistentViews(p: NetQuizPuzzle): number {
  const s = solveNet(p);
  if (!s) return 0;
  const want = p.marks.map((m) => [s.cellOfFace[m.face], m.face] as const);
  let count = 0;
  for (let right = 0; right < 6; right++)
    for (let top = 0; top < 6; top++) {
      const t = solveNet({ cells: p.cells, view: { right, top } });
      if (t && want.every(([cell, face]) => t.faceOfCell[cell] === face)) count++;
    }
  return count;
}

const RULES: Record<Difficulty, { nets: number[]; syms: number[]; edgeRate: number; guide: boolean }> = {
  easy: { nets: [0, 1], syms: [0, 2], edgeRate: 0, guide: true },
  normal: { nets: [0, 1, 2, 3, 4], syms: [0, 1, 2, 3, 4, 5, 6, 7], edgeRate: 0, guide: false },
  hard: { nets: [0, 1, 2, 3, 4, 5, 6, 7], syms: [0, 1, 2, 3, 4, 5, 6, 7], edgeRate: 0.5, guide: false },
  challenge: { nets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], syms: [0, 1, 2, 3, 4, 5, 6, 7], edgeRate: 0.8, guide: false },
};
export const NET_RULES = RULES;

/** マスの ならびの はば・たかさ */
export const netSize = (cells: readonly (readonly [number, number])[]) => ({ rows: Math.max(...cells.map((x) => x[0])) + 1, cols: Math.max(...cells.map((x) => x[1])) + 1 });

/** 横長（はば ≧ たかさ） */
export const isLandscape = (cells: readonly (readonly [number, number])[]) => {
  const { rows, cols } = netSize(cells);
  return cols >= rows;
};

function build(rng: Rng, d: Difficulty, recent: readonly NetQuizPuzzle[]): NetQuizPuzzle | null {
  const r = RULES[d];
  // すぐ前と 同じ かたちは なるべく さける
  const last = recent.at(-1);
  const nets = r.nets.length > 1 && last ? r.nets.filter((n) => n !== last.net) : r.nets;
  const net = rng.pick(nets);
  // スマホの 画面に 入るよう、横長の 向きだけを つかう（180°回転と 裏返しで 4とおり）
  const sym = rng.pick(r.syms.filter((x) => isLandscape(netCells(NET_SHAPES[net], x))));
  const cells = netCells(NET_SHAPES[net], sym);
  const frames = foldNet(cells);
  if (!frames) return null;
  // 立方体の むき：右・上の めんを えらぶ（たがいに となりの めん）
  const right = rng.int(0, 5);
  const tops = frames.map((_, i) => i).filter((i) => dot(frames[i].n, frames[right].n) === 0);
  const top = rng.pick(tops);
  const view = { right, top };
  const wantEdge = rng.chance(r.edgeRate) && !(last?.target.kind === 'edge' && rng.chance(0.3));
  const markIds = rng.shuffle([0, 1, 2]).slice(0, 2);
  if (wantEdge) {
    const faces = rng.pick(VISIBLE_EDGES);
    const markFaces = rng.shuffle(VISIBLE_FACES).slice(0, 2);
    return { net, sym, cells, view, marks: markFaces.map((face, i) => ({ face, mark: markIds[i] })), target: { kind: 'edge', faces: [...faces] as [ViewFace, ViewFace] }, guide: r.guide };
  }
  const face = rng.pick(VISIBLE_FACES);
  const markFaces = VISIBLE_FACES.filter((f) => f !== face);
  return { net, sym, cells, view, marks: markFaces.map((f, i) => ({ face: f, mark: markIds[i] })), target: { kind: 'face', face }, guide: r.guide };
}

export const netQuiz: GameLogic<NetQuizPuzzle, NetQuizAnswer> = {
  id: 'net-quiz',
  generatorVersion: 1,
  create: (rng, d, recent = []) => build(rng, d, recent),
  validate(p, d) {
    const r = RULES[d];
    if (!r.nets.includes(p.net) || !r.syms.includes(p.sym)) return 'net not allowed';
    const expect = netCells(NET_SHAPES[p.net], p.sym);
    if (expect.join(';') !== p.cells.join(';')) return 'cells';
    if (!isLandscape(p.cells)) return 'portrait';
    const s = solveNet(p);
    if (!s) return 'does not fold';
    if (p.marks.length < 2 || new Set(p.marks.map((m) => m.face)).size !== p.marks.length || new Set(p.marks.map((m) => m.mark)).size !== p.marks.length) return 'marks';
    // しるしは 見える めんだけ。立方体の 見た目と 展開図で 2つ以上の めんが きまる
    if (p.marks.some((m) => !VISIBLE_FACES.includes(m.face) || m.mark < 0 || m.mark >= MARK_COUNT)) return 'mark face';
    if (consistentViews(p) !== 1) return 'ambiguous';
    const t = p.target;
    if (t.kind === 'face') {
      if (!VISIBLE_FACES.includes(t.face)) return 'hidden target';
      if (p.marks.some((m) => m.face === t.face)) return 'mark on target';
    } else {
      const [a, b] = t.faces;
      if (!VISIBLE_EDGES.some((e) => edgeKey(e[0], e[1]) === edgeKey(a, b))) return 'hidden edge';
      if (r.edgeRate <= 0) return 'kind';
      const locs = edgeLocations(p, s, t.faces);
      if (locs.length !== (locs[0]?.fold ? 1 : 2)) return 'edge locations';
    }
    if (p.guide !== r.guide) return 'guide';
    return null;
  },
  fallback(d) {
    const out: NetQuizPuzzle[] = [];
    for (let seed = 1; seed < 400 && out.length < 6; seed++) {
      const p = build(createRng(seed), d, out);
      if (p && netQuiz.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    const s = solveNet(p);
    if (!s || !a) return { correct: false, message: p.target.kind === 'face' ? 'てんかいずの めんを タップしてね' : 'てんかいずの へんを タップしてね' };
    if (p.target.kind === 'face') {
      if (a.kind !== 'face' || !(a.cell >= 0 && a.cell < 6)) return { correct: false, message: 'てんかいずの めんを タップしてね' };
      const got = s.faceOfCell[a.cell];
      if (got === p.target.face) return { correct: true };
      const mark = p.marks.find((m) => m.face === got);
      if (mark) return { correct: false, message: 'そこは しるしの ついた めんだよ' };
      return { correct: false, message: `おしい！ そこは はこに すると「${FACE_NAME[got]}」の めんに なるよ` };
    }
    if (a.kind !== 'edge' || !(a.cell >= 0 && a.cell < 6) || ![0, 1, 2, 3].includes(a.side)) return { correct: false, message: 'てんかいずの へんを タップしてね' };
    const [x, y] = sideEdge(s, a.cell, a.side);
    if (edgeKey(x, y) === edgeKey(...p.target.faces)) return { correct: true };
    return { correct: false, message: `おしい！ そこは「${FACE_NAME[x]}」と「${FACE_NAME[y]}」の めんの あいだの へんだよ` };
  },
  hints(p) {
    const third = p.target.kind === 'face' ? 'ひかって いる 2つの めんの どちらかだよ。おりたたむ ところを そうぞう しよう' : 'ひかって いる めんの まわりの へんの どれかだよ';
    return [
      'しるしの ついた めんを、はこと てんかいずの りょうほうで さがそう',
      p.target.kind === 'face' ? 'しるしの 2つの めんの どちらとも となりあう めんは どれかな？' : 'その へんは どの 2つの めんの あいだに あるかな？',
      third,
    ];
  },
  key: (p) => `${p.net}/${p.sym}/${p.view.right}${p.view.top}/${p.marks.map((m) => `${m.face}${m.mark}`).join(',')}/${p.target.kind === 'face' ? p.target.face : edgeKey(...p.target.faces)}`,
};

/** ヒント3で ひからせる マス：めんの ときは 答えと その はんたいがわ、へんの ときは へんの 片がわの めん */
export function hintCells(p: NetQuizPuzzle): number[] {
  const s = solveNet(p);
  if (!s) return [];
  if (p.target.kind === 'face') {
    const opposite: Record<ViewFace, ViewFace> = { top: 'bottom', bottom: 'top', front: 'back', back: 'front', right: 'left', left: 'right' };
    return [s.cellOfFace[p.target.face], s.cellOfFace[opposite[p.target.face]]].sort((a, b) => a - b);
  }
  return [s.cellOfFace[p.target.faces[0]]];
}

/** 正しい 答え（テストと 正解の 表示に つかう） */
export function netAnswers(p: NetQuizPuzzle): NetQuizAnswer[] {
  const s = solveNet(p);
  if (!s) return [];
  if (p.target.kind === 'face') return [{ kind: 'face', cell: s.cellOfFace[p.target.face] }];
  return edgeLocations(p, s, p.target.faces).map((l) => ({ kind: 'edge', cell: l.cell, side: l.side }));
}
