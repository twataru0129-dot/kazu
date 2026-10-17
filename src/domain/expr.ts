/**
 * 安全な式の評価。eval は使わず、数と演算子の並びを左から順に整数で計算する。
 * （＋・− だけなので左から計算すれば正しい）
 */
export type AddSubOp = '+' | '-';

export interface LinearExpr {
  nums: number[];
  ops: AddSubOp[]; // nums.length - 1 個
}

export function evaluateLinear(e: LinearExpr): { value: number; minIntermediate: number } | null {
  if (e.nums.length === 0 || e.ops.length !== e.nums.length - 1) return null;
  if (!e.nums.every((n) => Number.isInteger(n))) return null;
  let v = e.nums[0];
  let min = v;
  for (let i = 0; i < e.ops.length; i++) {
    const op = e.ops[i];
    if (op === '+') v += e.nums[i + 1];
    else if (op === '-') v -= e.nums[i + 1];
    else return null;
    min = Math.min(min, v);
  }
  return { value: v, minIntermediate: min };
}

/** 足す項・引く項の多重集合を並べ替えたキー（順番違いを同じ式とみなす） */
export function canonicalLinearKey(e: LinearExpr): string {
  const plus: number[] = [e.nums[0]];
  const minus: number[] = [];
  e.ops.forEach((op, i) => (op === '+' ? plus : minus).push(e.nums[i + 1]));
  plus.sort((a, b) => a - b);
  minus.sort((a, b) => a - b);
  return `+${plus.join(',')}|-${minus.join(',')}`;
}

export function formatLinear(e: LinearExpr): string {
  return e.nums.map((n, i) => (i === 0 ? `${n}` : ` ${e.ops[i - 1] === '+' ? '+' : '−'} ${n}`)).join('');
}
