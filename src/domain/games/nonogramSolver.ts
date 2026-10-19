/**
 * ピクロス（ノノグラム）の手がかり計算と、解の数を数えるソルバー。
 * セルの値：1＝黒、0＝白、-1＝まだ分からない。
 * 手がかりは 黒の連続の長さの並び。黒が1つもない行・列は 空の配列 [] で表す（画面では「0」と表示）。
 */
export type Clue = number[];
export type Line = number[];

export function lineClue(line: readonly number[]): Clue {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out;
}

export function cluesOf(grid: readonly (readonly number[])[]): { rows: Clue[]; cols: Clue[] } {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  return {
    rows: grid.map((r) => lineClue(r)),
    cols: Array.from({ length: w }, (_, c) => lineClue(Array.from({ length: h }, (_, r) => grid[r][c]))),
  };
}

/**
 * 1本の線について、手がかりと今わかっているマスに合う置き方を すべて考え、
 * どの置き方でも同じになるマスを決める。置き方が1つもなければ null（矛盾）。
 * 動的計画法で「この位置から先を置けるか」を前もって求めるので、12マスでも速い。
 */
export function solveLine(clue: Clue, cur: readonly number[]): Line | null {
  const n = cur.length;
  const k = clue.length;
  // canWhite[i]：i..n-1 をすべて白にできるか
  const canWhite = Array<boolean>(n + 1).fill(true);
  for (let i = n - 1; i >= 0; i--) canWhite[i] = canWhite[i + 1] && cur[i] !== 1;
  // fits[b][i]：b番目のかたまりを i から置けて、そのあとに b+1.. を置けるか（メモ化）
  const memo = new Map<number, boolean>();
  const blockFits = (b: number, i: number) => {
    const len = clue[b];
    if (i + len > n) return false;
    for (let j = i; j < i + len; j++) if (cur[j] === 0) return false;
    if (i + len < n && cur[i + len] === 1) return false;
    return true;
  };
  const ok = (b: number, i: number): boolean => {
    // b番目以降のかたまりを、位置 i 以降に置けるか（i より前は もう決めた）
    if (b === k) return i >= n || canWhite[i];
    const key = b * (n + 2) + i;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let res = false;
    for (let s = i; s + clue[b] <= n; s++) {
      if (blockFits(b, s) && ok(b + 1, Math.min(n, s + clue[b] + 1))) {
        res = true;
        break;
      }
      if (cur[s] === 1) break; // ここを白にはできない
    }
    memo.set(key, res);
    return res;
  };
  if (!ok(0, 0)) return null;
  const canBeBlack = Array<boolean>(n).fill(false);
  const canBeWhite = Array<boolean>(n).fill(false);
  // 置ける場所を前から たどって、黒になりうる・白になりうるマスを集める
  const reach = new Set<number>();
  const walk = (b: number, i: number) => {
    const key = b * (n + 2) + i;
    if (reach.has(key)) return;
    reach.add(key);
    if (b === k) {
      for (let j = i; j < n; j++) canBeWhite[j] = true;
      return;
    }
    for (let s = i; s + clue[b] <= n; s++) {
      if (blockFits(b, s) && ok(b + 1, Math.min(n, s + clue[b] + 1))) {
        for (let j = i; j < s; j++) canBeWhite[j] = true;
        for (let j = s; j < s + clue[b]; j++) canBeBlack[j] = true;
        if (s + clue[b] < n) canBeWhite[s + clue[b]] = true;
        walk(b + 1, Math.min(n, s + clue[b] + 1));
      }
      if (cur[s] === 1) break;
    }
  };
  walk(0, 0);
  return cur.map((v, j) => (v !== -1 ? v : canBeBlack[j] && !canBeWhite[j] ? 1 : !canBeBlack[j] && canBeWhite[j] ? 0 : -1));
}

/** 行と列を交互に 解けるところまで解く。矛盾したら null */
export function propagate(rows: Clue[], cols: Clue[], start: number[][]): number[][] | null {
  const h = rows.length;
  const w = cols.length;
  const g = start.map((r) => [...r]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < h; r++) {
      const next = solveLine(rows[r], g[r]);
      if (!next) return null;
      for (let c = 0; c < w; c++)
        if (next[c] !== g[r][c]) {
          g[r][c] = next[c];
          changed = true;
        }
    }
    for (let c = 0; c < w; c++) {
      const col = g.map((row) => row[c]);
      const next = solveLine(cols[c], col);
      if (!next) return null;
      for (let r = 0; r < h; r++)
        if (next[r] !== g[r][c]) {
          g[r][c] = next[r];
          changed = true;
        }
    }
  }
  return g;
}

/**
 * 手がかりに合う盤面を 最大 limit 個まで さがす（2個見つかったら「1つに決まらない」）。
 * 試す回数（steps）に上限をつけ、こえたら exhausted を返す（重い問題で止まらないように）。
 */
export function countSolutions(rows: Clue[], cols: Clue[], limit = 2, maxSteps = 20000): { count: number; solutions: number[][][]; exhausted: boolean } {
  const solutions: number[][][] = [];
  let steps = 0;
  let exhausted = false;
  const rec = (g: number[][]) => {
    if (solutions.length >= limit || exhausted) return;
    if (++steps > maxSteps) {
      exhausted = true;
      return;
    }
    const p = propagate(rows, cols, g);
    if (!p) return;
    let pick: [number, number] | null = null;
    for (let r = 0; r < p.length && !pick; r++) for (let c = 0; c < p[r].length; c++) if (p[r][c] === -1) {
      pick = [r, c];
      break;
    }
    if (!pick) {
      solutions.push(p);
      return;
    }
    for (const v of [1, 0]) {
      const next = p.map((row) => [...row]);
      next[pick[0]][pick[1]] = v;
      rec(next);
    }
  };
  rec(rows.map(() => Array(cols.length).fill(-1)));
  return { count: solutions.length, solutions, exhausted };
}

/** 行の手がかりだけで（推理だけで）全部決まるか：やさしさの目安 */
export function lineSolvable(rows: Clue[], cols: Clue[]): boolean {
  const g = propagate(
    rows,
    cols,
    rows.map(() => Array(cols.length).fill(-1)),
  );
  return !!g && g.every((r) => r.every((v) => v !== -1));
}
