import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 25 きえる みち：スタートから ゴールまでの 1本道を すこしの あいだ 見せて、道だけ けす。
 * スタートと ゴールは のこる。となりの マスを じゅんに タップして、おぼえた 道を すすむ（ななめは だめ）。
 *
 * - 1回の あそびは 5ラウンド。5本の 道は 問題を 作るときに それぞれ べつに 作って 持つ（見なおし・再開で かわらない）。
 * - 道は 盤の 中・マスの かさなりなし・となりどうしが 上下左右に 1マス・スタートと ゴールが ちがう。
 *   さらに「道の 中で となりあって いない マスどうしが 上下左右で くっつかない」ことで、見た道の じゅんばんが 1とおりに きまる
 *   （近道・分かれ道に 見えない）。
 * - ゴールまで じゅんばんどおりに すすんだ ときだけ、その ラウンドが できた ことに なる。
 */
export const PATH_ROUNDS = 5;

export type Cell = [number, number];

export interface VanishingPathPuzzle {
  size: number;
  /** 道を 見せる 時間（ミリ秒） */
  showMs: number;
  /** ラウンドごとの 道（スタート → ゴール） */
  rounds: Cell[][];
}

export interface PathRoundRecord {
  /** さいしょに まちがえずに ゴール できたか（まだなら undefined） */
  firstTry?: boolean;
  /** 道を 見た 回数（さいしょの「みる」も 1回） */
  views: number;
  /** まちがえた マスを おした 回数 */
  wrong: number;
  /** スタートから やりなおした 回数 */
  restarts: number;
  /** 「つぎの 1マス」を 見た 回数（ヒント3） */
  peeks: number;
  cleared: boolean;
}

export interface VanishingPathAnswer {
  /** ラウンドごとに すすんだ マス（スタートを ふくむ。r*size+c） */
  routes: number[][];
  rounds: PathRoundRecord[];
}

export const PATH_RULES: Record<Difficulty, { size: number; minSteps: number; maxSteps: number; showMs: number; restartOnMiss: boolean }> = {
  easy: { size: 3, minSteps: 3, maxSteps: 4, showMs: 6000, restartOnMiss: false },
  normal: { size: 4, minSteps: 5, maxSteps: 6, showMs: 7000, restartOnMiss: false },
  hard: { size: 5, minSteps: 7, maxSteps: 8, showMs: 8000, restartOnMiss: true },
  challenge: { size: 7, minSteps: 13, maxSteps: 16, showMs: 9000, restartOnMiss: true },
};

export const cellId = (size: number, [r, c]: readonly [number, number]) => r * size + c;
export const isNeighbor = (a: readonly [number, number], b: readonly [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** 道の きまり。合っていれば null */
export function pathProblem(path: readonly (readonly [number, number])[], size: number, minSteps: number, maxSteps: number): string | null {
  if (!Array.isArray(path)) return 'path';
  const steps = path.length - 1;
  if (steps < minSteps || steps > maxSteps) return 'length';
  if (path.some(([r, c]) => !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= size || c >= size)) return 'outside';
  if (new Set(path.map((x) => cellId(size, x))).size !== path.length) return 'repeat';
  for (let i = 1; i < path.length; i++) if (!isNeighbor(path[i - 1], path[i])) return 'jump';
  // となりあって いない マスどうしが くっつくと、近道や 分かれ道に 見えてしまう
  for (let i = 0; i < path.length; i++) for (let j = i + 2; j < path.length; j++) if (isNeighbor(path[i], path[j])) return 'touches itself';
  return null;
}

/** ランダムな 深さ優先探索（行きどまりで もどる）。上限を こえたら あきらめる */
function makePath(rng: Rng, size: number, steps: number): Cell[] | null {
  let budget = 4000;
  const path: Cell[] = [[rng.int(0, size - 1), rng.int(0, size - 1)]];
  const used = new Set([cellId(size, path[0])]);
  const ok = (next: Cell) => {
    if (next[0] < 0 || next[1] < 0 || next[0] >= size || next[1] >= size) return false;
    if (used.has(cellId(size, next))) return false;
    // いまの マス いがいの 道の マスと くっつかない
    for (let i = 0; i < path.length - 1; i++) if (isNeighbor(path[i], next)) return false;
    return true;
  };
  const dfs = (): boolean => {
    if (path.length === steps + 1) return true;
    if (--budget <= 0) return false;
    const [r, c] = path[path.length - 1];
    const dirs = rng.shuffle<Cell>([
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ]);
    for (const n of dirs) {
      if (!ok(n)) continue;
      path.push(n);
      used.add(cellId(size, n));
      if (dfs()) return true;
      path.pop();
      used.delete(cellId(size, n));
    }
    return false;
  };
  return dfs() ? path : null;
}

const pathKey = (size: number, p: readonly (readonly [number, number])[]) => p.map((x) => cellId(size, x)).join('.');

export const vanishingPath: GameLogic<VanishingPathPuzzle, VanishingPathAnswer> = {
  id: 'vanishing-path',
  generatorVersion: 1,
  create(rng, d) {
    const r = PATH_RULES[d];
    const rounds: Cell[][] = [];
    for (let k = 0; k < PATH_ROUNDS; k++) {
      let pick: Cell[] | null = null;
      for (let t = 0; t < 20 && !pick; t++) {
        const p = makePath(rng, r.size, rng.int(r.minSteps, r.maxSteps));
        if (!p) continue;
        const key = pathKey(r.size, p);
        const rev = pathKey(r.size, [...p].reverse());
        // 同じ道（さかさまも）は 1回の あそびで 2回 出さない
        if (rounds.some((x) => pathKey(r.size, x) === key || pathKey(r.size, x) === rev)) continue;
        pick = p;
      }
      if (!pick) return null;
      rounds.push(pick);
    }
    return { size: r.size, showMs: r.showMs, rounds };
  },
  validate(p, d) {
    const r = PATH_RULES[d];
    if (p.size !== r.size || p.showMs !== r.showMs) return 'rules';
    if (!Array.isArray(p.rounds) || p.rounds.length !== PATH_ROUNDS) return 'rounds';
    for (let k = 0; k < PATH_ROUNDS; k++) {
      const why = pathProblem(p.rounds[k], p.size, r.minSteps, r.maxSteps);
      if (why) return `round ${k + 1}: ${why}`;
    }
    if (new Set(p.rounds.map((x) => pathKey(p.size, x))).size !== PATH_ROUNDS) return 'same path twice';
    return null;
  },
  fallback(d) {
    const out: VanishingPathPuzzle[] = [];
    for (let seed = 1; seed < 300 && out.length < 3; seed++) {
      const p = vanishingPath.create(createRng(seed), d);
      if (p && vanishingPath.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!a || !Array.isArray(a.routes)) return { correct: false, message: 'スタートから となりの マスを じゅんに おしてね' };
    for (let k = 0; k < PATH_ROUNDS; k++) {
      const want = p.rounds[k].map((x) => cellId(p.size, x));
      const got = a.routes[k];
      if (!Array.isArray(got) || got.length !== want.length || got.some((v, i) => v !== want[i])) {
        // とちゅうまで（または まだ）なら どこまで できたかを、ちがう マスを おしていたら そう つたえる
        const unfinished = !Array.isArray(got) || got.every((v, i) => v === want[i]);
        if (!unfinished) return { correct: false, message: 'おしい！ みちが ちがったよ' };
        return { correct: false, message: k > 0 ? `${k}ラウンド まで できたよ` : 'スタートから となりの マスを じゅんに おしてね' };
      }
    }
    return { correct: true };
  },
  hints: () => ['スタートから どこで まがったか おもいだそう', 'みた みちを ゆびで たどるように おもいだそう', '「つぎの 1マス」を おすと、すすむ マスが すこしだけ ひかるよ'],
  key: (p) => `${p.size}:${p.rounds.map((x) => pathKey(p.size, x)).join('/')}`,
};

/** ラウンド k で、いま index 番目まで すすんだ ときに 押した マスを しらべる */
export function checkStep(p: VanishingPathPuzzle, round: number, index: number, cell: readonly [number, number]): 'next' | 'goal' | 'wrong' | 'notNeighbor' {
  const path = p.rounds[round];
  const cur = path[index];
  if (!isNeighbor(cur, cell)) return 'notNeighbor';
  const want = path[index + 1];
  if (!want || want[0] !== cell[0] || want[1] !== cell[1]) return 'wrong';
  return index + 1 === path.length - 1 ? 'goal' : 'next';
}
