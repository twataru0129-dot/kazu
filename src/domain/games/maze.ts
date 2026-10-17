import type { Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 13 かずの迷路：式の答えが書かれた となりのマスへ進む */
export type Cell = [number, number]; // [row, col]

export interface MazeQuestion {
  text: string;
  answer: number;
}

export interface MazePuzzle {
  size: number;
  path: Cell[]; // スタート→ゴール
  values: (number | null)[][]; // スタートは null
  questions: MazeQuestion[]; // path.length - 1 個
}

export interface MazeAnswer {
  moves: Cell[];
}

const RULES: Record<Difficulty, { size: number; minLen: number; maxLen: number }> = {
  easy: { size: 3, minLen: 5, maxLen: 7 },
  normal: { size: 4, minLen: 7, maxLen: 10 },
  hard: { size: 5, minLen: 11, maxLen: 17 },
  challenge: { size: 6, minLen: 15, maxLen: 24 },
};

const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
export const isAdjacent = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

export function neighbors(c: Cell, n: number): Cell[] {
  const out: Cell[] = [];
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const r = c[0] + dr;
    const cc = c[1] + dc;
    if (r >= 0 && r < n && cc >= 0 && cc < n) out.push([r, cc]);
  }
  return out;
}

function randomPath(rng: Rng, n: number, minLen: number, maxLen: number): Cell[] | null {
  const goal: Cell = [n - 1, n - 1];
  const visited = new Set<string>(['0,0']);
  const path: Cell[] = [[0, 0]];
  let budget = 4000;
  const rec = (): boolean => {
    if (--budget < 0) return false;
    const cur = path[path.length - 1];
    if (same(cur, goal)) return path.length >= minLen && path.length <= maxLen;
    if (path.length >= maxLen) return false;
    for (const nb of rng.shuffle(neighbors(cur, n))) {
      const k = `${nb[0]},${nb[1]}`;
      if (visited.has(k)) continue;
      visited.add(k);
      path.push(nb);
      if (rec()) return true;
      path.pop();
      visited.delete(k);
    }
    return false;
  };
  return rec() ? path : null;
}

function question(rng: Rng, d: Difficulty): MazeQuestion {
  switch (d) {
    case 'easy': {
      const a = rng.int(1, 9);
      const b = rng.int(1, 9);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    case 'normal':
    case 'hard': {
      if (rng.chance(0.5)) {
        const a = rng.int(10, 60);
        const b = rng.int(2, 39);
        return { text: `${a} + ${b}`, answer: a + b };
      }
      const a = rng.int(20, 99);
      const b = rng.int(2, a - 5);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    case 'challenge': {
      const a = rng.int(5, 40);
      const b = rng.int(2, 30);
      const c = rng.int(1, a + b - 3);
      return { text: `${a} + ${b} − ${c}`, answer: a + b - c };
    }
  }
}

/** 正解ルートをたどれるか・各地点で正解の移動先がちょうど1つか */
export function verifyMaze(p: MazePuzzle): string | null {
  const n = p.size;
  if (p.questions.length !== p.path.length - 1) return 'question count';
  if (!same(p.path[0], [0, 0]) || !same(p.path[p.path.length - 1], [n - 1, n - 1])) return 'endpoints';
  const keys = new Set(p.path.map((c) => `${c[0]},${c[1]}`));
  if (keys.size !== p.path.length) return 'path repeats';
  for (let k = 0; k < p.questions.length; k++) {
    const cur = p.path[k];
    if (!isAdjacent(cur, p.path[k + 1])) return 'path not adjacent';
    const ans = p.questions[k].answer;
    if (!Number.isInteger(ans) || ans < 0) return 'answer';
    const hits = neighbors(cur, n).filter(([r, c]) => p.values[r][c] === ans);
    if (hits.length !== 1 || !same(hits[0], p.path[k + 1])) return `step ${k}: ${hits.length} matching cells`;
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!(r === 0 && c === 0) && p.values[r][c] === null) return 'empty cell';
  return null;
}

export function judgeMove(p: MazePuzzle, step: number, cell: Cell): boolean {
  const cur = p.path[step];
  return step < p.questions.length && isAdjacent(cur, cell) && p.values[cell[0]][cell[1]] === p.questions[step].answer;
}

export const maze: GameLogic<MazePuzzle, MazeAnswer> = {
  id: 'maze',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const path = randomPath(rng, r.size, r.minLen, r.maxLen);
    if (!path) return null;
    const qs: MazeQuestion[] = path.slice(1).map(() => question(rng, d));
    const idx = new Map(path.map((c, i) => [`${c[0]},${c[1]}`, i]));
    // 隣り合う道どうしで、まちがった移動先が正解と同じ数にならないよう調整
    for (let pass = 0; pass < 60; pass++) {
      let ok = true;
      for (let k = 0; k < qs.length; k++) {
        for (const nb of neighbors(path[k], r.size)) {
          const j = idx.get(`${nb[0]},${nb[1]}`);
          if (j === undefined || j === k + 1 || j === 0) continue;
          if (qs[j - 1].answer === qs[k].answer) {
            qs[k] = question(rng, d);
            ok = false;
          }
        }
      }
      if (ok) break;
    }
    const values: (number | null)[][] = Array.from({ length: r.size }, () => Array(r.size).fill(null));
    path.forEach((c, i) => {
      if (i > 0) values[c[0]][c[1]] = qs[i - 1].answer;
    });
    for (let row = 0; row < r.size; row++) {
      for (let col = 0; col < r.size; col++) {
        if (idx.has(`${row},${col}`)) continue;
        // この空きマスのとなりにある道のマスで出る問題の答えは使わない
        const banned = new Set<number>();
        for (const nb of neighbors([row, col], r.size)) {
          const j = idx.get(`${nb[0]},${nb[1]}`);
          if (j !== undefined && j < qs.length) banned.add(qs[j].answer);
        }
        const near = [...banned];
        let v = -1;
        for (let t = 0; t < 30; t++) {
          const base = near.length ? rng.pick(near) : rng.pick(qs).answer;
          const cand = base + rng.pick([-10, -2, -1, 1, 2, 10]);
          if (cand >= 0 && !banned.has(cand)) {
            v = cand;
            break;
          }
        }
        if (v < 0) return null;
        values[row][col] = v;
      }
    }
    return { size: r.size, path, values, questions: qs };
  },
  validate(p, d) {
    if (p.size !== RULES[d].size) return 'size';
    if (p.path.length < RULES[d].minLen || p.path.length > RULES[d].maxLen) return 'length';
    return verifyMaze(p);
  },
  fallback(d) {
    // 検証済みの決まった形のルート：小さい盤は L 字、大きい盤は1行おきのジグザグ
    const n = RULES[d].size;
    const path: Cell[] = [];
    if (n <= 4) {
      for (let c = 0; c < n; c++) path.push([0, c]);
      for (let r = 1; r < n; r++) path.push([r, n - 1]);
    } else {
      for (let r = 0; r < n; r += 2) {
        const cols = (r / 2) % 2 === 0 ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
        for (const c of cols) path.push([r, c]);
        if (r + 1 < n) path.push([r + 1, (r / 2) % 2 === 0 ? n - 1 : 0]);
      }
      if (!same(path[path.length - 1], [n - 1, n - 1])) path.push([n - 1, n - 1]);
    }
    const qs = path.slice(1).map((_, i) => ({ text: `${i + 1} + ${i + 2}`, answer: 2 * i + 3 }));
    const values: (number | null)[][] = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => ((r + c) % 2 === 0 ? 1 : 2)));
    path.forEach((c, i) => (values[c[0]][c[1]] = i === 0 ? null : qs[i - 1].answer));
    return [{ size: n, path, values, questions: qs }];
  },
  judge(p, a) {
    if (a.moves.length !== p.questions.length) return { correct: false };
    return a.moves.every((m, k) => judgeMove(p, k, m)) ? { correct: true } : { correct: false };
  },
  hints(p, progress) {
    const step = Math.min(typeof progress === 'number' ? progress : 0, p.questions.length - 1);
    const q = p.questions[step];
    return [`まず ${q.text} を けいさんしよう`, 'となりの マス（うえ・した・ひだり・みぎ）から えらぶよ', `こたえは ${q.answer}。${q.answer} が かいてある となりの マスは どれ？`];
  },
  key: (p) => p.questions.map((q) => q.text).join('|'),
};
