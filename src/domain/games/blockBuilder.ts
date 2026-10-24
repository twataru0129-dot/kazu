import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 29 ブロック建築パズル：お手本の 立体（つみき）を 見て、同じ 形を つくる。
 *
 * 形は heights[y][x]（その マスに つんだ ブロックの 数）の 整数の 表で もつ。宙に 浮く ブロックは ない。
 * y は おく（0）→ まえ（size-1）、x は ひだり（0）→ みぎ（size-1）。見る 向きを まわしても データは かわらない。
 * 判定は 表が ぴったり 同じか だけ（見た目では きめない）。
 */
export interface BlockPuzzle {
  size: number;
  maxH: number;
  heights: number[][];
  /** easy：お手本に だんの 数を 出す */
  showNumbers: boolean;
}

export interface BlockAnswer {
  heights: number[][];
}

/** ヒント用の 進行状況（いまの 形と えらんで いる マス） */
export interface BlockProgress {
  heights: number[][];
  sel: { x: number; y: number } | null;
}

interface LevelConf {
  size: number;
  maxH: number;
  showNumbers: boolean;
}
export const BLOCK_LEVELS: Record<Difficulty, LevelConf> = {
  easy: { size: 2, maxH: 2, showNumbers: true },
  normal: { size: 3, maxH: 3, showNumbers: false },
  hard: { size: 3, maxH: 4, showNumbers: false },
  challenge: { size: 4, maxH: 4, showNumbers: false },
};

export const emptyHeights = (size: number) => Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
export const cloneHeights = (h: readonly (readonly number[])[]) => h.map((r) => [...r]);
export const totalBlocks = (h: readonly (readonly number[])[]) => h.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
export const sameHeights = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) =>
  a.length === b.length && a.every((r, y) => r.length === b[y].length && r.every((v, x) => v === b[y][x]));

/**
 * 見る 向き rot（0〜3、みぎに 90° ずつ）で、画面の (列 i, 行 j) に くる データの マス。
 * rot 0 は データの まま（まえ が 手前）。どの 向きでも 1対1 で、データは かえない。
 */
export function viewToData(size: number, rot: number, i: number, j: number): { x: number; y: number } {
  const n = size - 1;
  switch (((rot % 4) + 4) % 4) {
    case 0:
      return { x: i, y: j };
    case 1:
      return { x: j, y: n - i };
    case 2:
      return { x: n - i, y: n - j };
    default:
      return { x: n - j, y: i };
  }
}
export function dataToView(size: number, rot: number, x: number, y: number): { i: number; j: number } {
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      const d = viewToData(size, rot, i, j);
      if (d.x === x && d.y === y) return { i, j };
    }
  throw new Error('out of range');
}

/** 8つの 対称（回転・裏がえし）。 */
function transforms(h: number[][]): number[][][] {
  const n = h.length;
  const rot = (g: number[][]) => g.map((_, y) => g.map((__, x) => g[n - 1 - x][y]));
  const flip = (g: number[][]) => g.map((r) => [...r].reverse());
  const out: number[][][] = [];
  let g = h;
  for (let k = 0; k < 4; k++) {
    out.push(g, flip(g));
    g = rot(g);
  }
  return out;
}
/** 回転・裏がえしで 自分と かさなるか（向きを かえても 同じに 見える 形） */
export function isSymmetric(h: number[][]): boolean {
  return transforms(h)
    .slice(1)
    .some((g) => sameHeights(g, h));
}

/**
 * 画面の かたち：タイルの よこ半分を 1 として、たて半分 0.5、ブロック 1だんの 高さ ISO_RISE。
 * 画面は これと 同じ 比で えがく（見え方の チェックと 絵を そろえる）。
 */
export const ISO_RISE = 1.2;

/** 見る 向き rot の ときの 表（画面の 列 i・行 j に くる 高さ）。手前は j が 大きい ほう */
export function viewHeights(h: readonly (readonly number[])[], rot: number): number[][] {
  const n = h.length;
  return Array.from({ length: n }, (_, j) =>
    Array.from({ length: n }, (__, i) => {
      const d = viewToData(n, rot, i, j);
      return h[d.y][d.x];
    }),
  );
}

/**
 * 点 (px,py,pz) から 見る人の ほうへ 進んで、どこかの ブロックに さえぎられるか。
 * 見る人への 向きは (1, 1, 1/ISO_RISE)（画面上で 同じ 位置に かさなる 向き）。
 */
function blocked(g: number[][], px: number, py: number, pz: number): boolean {
  const n = g.length;
  for (let t = 0.02; ; t += 0.02) {
    const x = px + t;
    const y = py + t;
    const z = pz + t / ISO_RISE;
    if (x >= n || y >= n) return false;
    const h = g[Math.floor(y)][Math.floor(x)];
    if (z < h) return true;
  }
}

/** rot の 向きで、データの マス (x,y) の 上の 面（0だんなら 地面）が 少しでも 見えるか */
export function topVisible(h: readonly (readonly number[])[], rot: number, x: number, y: number): boolean {
  const n = h.length;
  const g = viewHeights(h, rot);
  const { i, j } = dataToView(n, rot, x, y);
  const z = g[j][i];
  return [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.2],
    [0.2, 0.8],
    [0.8, 0.8],
  ].some(([u, v]) => !blocked(g, i + u, j + v, z + 1e-6));
}

/** どの マスも、4つの 向きの どれかで 上の 面が 見えるか（まわせば かならず たしかめられる） */
export function allTopsVisible(h: readonly (readonly number[])[]): boolean {
  const n = h.length;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (![0, 1, 2, 3].some((r) => topVisible(h, r, x, y))) return false;
  return true;
}

/** まわりより ひくい マス（くぼみ）の 数 */
function dips(h: number[][]): number {
  const n = h.length;
  let c = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const nb = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n);
      if (nb.every(([a, b]) => h[b][a] > h[y][x])) c++;
    }
  return c;
}

function build(rng: Rng, d: Difficulty): BlockPuzzle {
  const { size, maxH, showNumbers } = BLOCK_LEVELS[d];
  const heights = emptyHeights(size).map((r) =>
    r.map(() => {
      if (d === 'easy') return rng.int(0, maxH);
      // 高い 塔を 少し 出やすく、0 も ときどき
      const roll = rng.int(0, 9);
      if (roll < 2) return 0;
      if (roll >= 8) return maxH;
      return rng.int(1, maxH);
    }),
  );
  return { size, maxH, heights, showNumbers };
}

const isHeights = (h: unknown, size: number, maxH: number): h is number[][] =>
  Array.isArray(h) && h.length === size && h.every((r) => Array.isArray(r) && r.length === size && r.every((v) => Number.isInteger(v) && v >= 0 && v <= maxH));

export const blockBuilder: GameLogic<BlockPuzzle, BlockAnswer> = {
  id: 'block-builder',
  generatorVersion: 1,
  create: (rng, d) => build(rng, d),
  validate(p, d) {
    const c = BLOCK_LEVELS[d];
    if (p.size !== c.size || p.maxH !== c.maxH || p.showNumbers !== c.showNumbers) return 'level';
    if (!isHeights(p.heights, p.size, p.maxH)) return 'heights';
    const flat = p.heights.flat();
    const filled = flat.filter((v) => v > 0).length;
    if (filled < 2) return 'too few columns';
    if (new Set(flat).size < 2) return 'all same';
    if (!allTopsVisible(p.heights)) return 'hidden column';
    const distinct = new Set(flat).size;
    if (d === 'easy') {
      if (totalBlocks(p.heights) < 3) return 'too easy';
      return null;
    }
    if (distinct < 3) return 'too flat';
    if (filled < 4) return 'too few columns';
    if (d === 'normal') return null;
    // hard・challenge：向きで 見わけが つく 形（対称は さける）
    if (isSymmetric(p.heights)) return 'symmetric';
    if (Math.max(...flat) < 3) return 'too low';
    if (d === 'hard') return null;
    const towers = flat.filter((v) => v >= 3).length;
    if (towers < 2) return 'towers';
    if (dips(p.heights) < 1) return 'dips';
    if (distinct < 4) return 'too flat';
    return null;
  },
  fallback(d) {
    const out: BlockPuzzle[] = [];
    for (let seed = 1; seed < 5000 && out.length < 6; seed++) {
      const p = build(createRng(seed), d);
      if (blockBuilder.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!a || !isHeights(a.heights, p.size, p.maxH)) return { correct: false, message: 'ブロックを つんでね' };
    if (sameHeights(a.heights, p.heights)) return { correct: true };
    const wrong = wrongCells(p, a.heights).length;
    return { correct: false, message: `もうすこし！ ちがう ところが ${wrong}か所 あるよ。まわして みてみよう` };
  },
  hints(p, progress) {
    const pr = readProgress(p, progress);
    const wrong = wrongCells(p, pr.heights);
    const top = Math.max(...p.heights.flat());
    const first = [`ひだり・みぎに まわしたり、うえから みたりして、ブロックの かたちを たしかめよう。いちばん たかい ところは ${top}だん`, '', ''] as [string, string, string];
    first[1] = wrong.length === 0 ? 'ぜんぶ あって いるよ。「こたえあわせ」を おしてみよう' : `ひかって いる ところの たかさが ちがうよ（${place(p.size, wrong[0])}）`;
    if (pr.sel) {
      const want = p.heights[pr.sel.y][pr.sel.x];
      first[2] = `えらんで いる ところ（${place(p.size, pr.sel)}）は ${want}だん だよ`;
    } else first[2] = 'マスを えらぶと、その ところの ただしい だんを おしえるよ';
    return first;
  },
  key: (p) => `${p.size}:${p.heights.map((r) => r.join('')).join('/')}`,
};

/** ヒント2で 光らせる マス（ちがう ところ）。ならびは おく→まえ・ひだり→みぎ */
export function wrongCells(p: BlockPuzzle, heights: readonly (readonly number[])[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < p.size; y++) for (let x = 0; x < p.size; x++) if ((heights[y]?.[x] ?? 0) !== p.heights[y][x]) out.push({ x, y });
  return out;
}

function readProgress(p: BlockPuzzle, progress: unknown): BlockProgress {
  const pr = progress as Partial<BlockProgress> | undefined;
  const heights = pr && isHeights(pr.heights, p.size, p.maxH) ? pr.heights : emptyHeights(p.size);
  const s = pr?.sel;
  const sel = s && Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.y >= 0 && s.x < p.size && s.y < p.size ? s : null;
  return { heights, sel };
}

/** 「まえから 2れつめ・ひだりから 1ばんめ」（データの 向きで。画面には 方角の ラベルを 出す） */
export function place(size: number, c: { x: number; y: number }): string {
  return `まえから ${size - c.y}れつめ・ひだりから ${c.x + 1}ばんめ`;
}
