import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 19 てんつなぎ：格子の点を2つ順にタップして線をひき、見本と同じ図形を作る。
 * 判定は「ひいた順番」ではなく「無向の線分の集まり」で行う。
 * 長い線は、途中の格子点で区切った みじかい線（単位線分）に分けてから比べるので、
 * 「A→C を1本」と「A→B, B→C の2本」は同じ図形として扱う。
 */
export type Pt = [number, number]; // [x, y]（左上が 0,0）
/** [x1, y1, x2, y2]。正規化すると (x1,y1) < (x2,y2) の順 */
export type Seg = [number, number, number, number];

export interface DotsPuzzle {
  size: number; // 1辺の点の数
  /** 見本：正規化した単位線分（並びも整列ずみ） */
  segments: Seg[];
}

/** ひいた線（順番・長さは自由） */
export type DotsAnswer = Seg[];

const RULES: Record<Difficulty, { size: number; min: number; max: number; diagonal: boolean }> = {
  easy: { size: 3, min: 3, max: 8, diagonal: true },
  normal: { size: 4, min: 5, max: 9, diagonal: true },
  hard: { size: 5, min: 7, max: 12, diagonal: true },
  challenge: { size: 6, min: 10, max: 16, diagonal: true },
};

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

const ptLess = (ax: number, ay: number, bx: number, by: number) => ay < by || (ay === by && ax < bx);

export function normSeg(s: Seg): Seg {
  const [x1, y1, x2, y2] = s;
  return ptLess(x1, y1, x2, y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
}

export const segKey = (s: Seg) => normSeg(s).join(',');

/** 線分を、間にある格子点で区切った みじかい線分に分ける（長さ0は空） */
export function splitSeg(s: Seg): Seg[] {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const g = gcd(dx, dy);
  if (g === 0) return [];
  const sx = dx / g;
  const sy = dy / g;
  return Array.from({ length: g }, (_, i) => normSeg([x1 + sx * i, y1 + sy * i, x1 + sx * (i + 1), y1 + sy * (i + 1)]));
}

/** ひいた線の集まり → 単位線分のキーの集合（重なり・順番・向きを無視） */
export function segSet(segs: readonly Seg[]): Set<string> {
  const out = new Set<string>();
  for (const s of segs) for (const u of splitSeg(s)) out.add(u.join(','));
  return out;
}

export function sortSegs(segs: readonly Seg[]): Seg[] {
  return [...segSet(segs)].sort().map((k) => k.split(',').map(Number) as Seg);
}

export function dotsDiff(p: DotsPuzzle, drawn: readonly Seg[]): { missing: Seg[]; extra: Seg[] } {
  const want = segSet(p.segments);
  const have = segSet(drawn);
  const toSeg = (k: string) => k.split(',').map(Number) as Seg;
  return {
    missing: [...want].filter((k) => !have.has(k)).sort().map(toSeg),
    extra: [...have].filter((k) => !want.has(k)).sort().map(toSeg),
  };
}

const inside = (n: number, x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n;

/**
 * 盤面に1本ひいたときの次の状態。
 * - その線が もう全部ひいてあれば けす（同じ線を2回ひくと消える。重ねてひかない）
 * - 一部だけ ひいてあれば、足りない部分だけ たす
 */
export function toggleLine(cur: readonly Seg[], s: Seg): Seg[] {
  const pieces = splitSeg(s);
  if (pieces.length === 0) return [...cur];
  const have = segSet(cur);
  const keys = pieces.map((u) => u.join(','));
  if (keys.every((k) => have.has(k))) {
    const remove = new Set(keys);
    return sortSegs(cur).filter((u) => !remove.has(u.join(',')));
  }
  return sortSegs([...cur, ...pieces]);
}

/** 図形の「頂点の次数」がすべて偶数＝一筆で閉じた形の集まり */
function isClosed(segs: readonly Seg[]): boolean {
  const deg = new Map<string, number>();
  for (const [x1, y1, x2, y2] of segs) {
    for (const k of [`${x1},${y1}`, `${x2},${y2}`]) deg.set(k, (deg.get(k) ?? 0) + 1);
  }
  return [...deg.values()].every((v) => v % 2 === 0);
}

/** 線分どうしが（端点以外で）交わっているか：単位の斜め線が X の形になっている */
function hasCrossing(segs: readonly Seg[]): boolean {
  const set = new Set(segs.map((s) => s.join(',')));
  for (const [x1, y1, x2, y2] of segs) {
    if (Math.abs(x2 - x1) === 1 && Math.abs(y2 - y1) === 1) {
      const other = normSeg([x1, y2, x2, y1]);
      if (set.has(other.join(','))) return true;
    }
  }
  return false;
}

/** かんたん用：小さな閉じた形（三角・四角・ひし形）。点の列（最後は最初に戻る） */
const EASY_SHAPES: Pt[][] = [
  [[0, 0], [2, 0], [2, 2], [0, 2]], // 大きな しかく
  [[0, 0], [1, 0], [1, 1], [0, 1]], // 小さな しかく
  [[0, 0], [2, 0], [0, 2]], // 直角三角形
  [[0, 0], [2, 0], [1, 1]], // 山の三角
  [[1, 0], [2, 1], [1, 2], [0, 1]], // ひし形
  [[0, 0], [2, 0], [2, 1], [0, 1]], // よこながの しかく
  [[0, 0], [2, 2], [0, 2]],
];

function transform(pts: Pt[], n: number, rng: Rng): Pt[] {
  let out = pts.map(([x, y]) => [x, y] as Pt);
  const rot = rng.int(0, 3);
  for (let k = 0; k < rot; k++) out = out.map(([x, y]) => [-y, x] as Pt);
  if (rng.chance(0.5)) out = out.map(([x, y]) => [-x, y] as Pt);
  const minX = Math.min(...out.map((p) => p[0]));
  const minY = Math.min(...out.map((p) => p[1]));
  out = out.map(([x, y]) => [x - minX, y - minY] as Pt);
  const w = Math.max(...out.map((p) => p[0]));
  const h = Math.max(...out.map((p) => p[1]));
  const ox = rng.int(0, n - 1 - w);
  const oy = rng.int(0, n - 1 - h);
  return out.map(([x, y]) => [x + ox, y + oy] as Pt);
}

function closedPolyline(pts: Pt[]): Seg[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return [p[0], p[1], q[0], q[1]] as Seg;
  });
}

/** 単位の一歩（たて・よこ・ななめ）で歩いて折れ線を作る。同じ線は通らない */
function walk(rng: Rng, n: number, steps: number, used: Set<string>, diagonal: boolean): Seg[] {
  const dirs: Pt[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    ...(diagonal ? ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as Pt[]) : []),
  ];
  let x = rng.int(0, n - 1);
  let y = rng.int(0, n - 1);
  const out: Seg[] = [];
  for (let i = 0; i < steps; i++) {
    const options = rng.shuffle(dirs).filter(([dx, dy]) => inside(n, x + dx, y + dy) && !used.has(normSeg([x, y, x + dx, y + dy]).join(',')));
    if (!options.length) break;
    // まっすぐ・たてよこ を少し多めに（形として読みやすく）
    const [dx, dy] = options.find(([a, b]) => a === 0 || b === 0) && rng.chance(0.55) ? options.find(([a, b]) => a === 0 || b === 0)! : options[0];
    const s = normSeg([x, y, x + dx, y + dy]);
    used.add(s.join(','));
    out.push(s);
    x += dx;
    y += dy;
  }
  return out;
}

export const dots: GameLogic<DotsPuzzle, DotsAnswer> = {
  id: 'dot-connect',
  generatorVersion: 1,
  create(rng, d) {
    const { size, diagonal } = RULES[d];
    if (d === 'easy') {
      return { size, segments: sortSegs(closedPolyline(transform(rng.pick(EASY_SHAPES), size, rng))) };
    }
    const used = new Set<string>();
    const lines: Seg[] = [];
    const count = d === 'normal' ? 2 : d === 'hard' ? rng.int(2, 3) : 3;
    const steps = d === 'normal' ? [3, 4] : d === 'hard' ? [3, 5] : [4, 6];
    for (let i = 0; i < count; i++) lines.push(...walk(rng, size, rng.int(steps[0], steps[1]), used, diagonal));
    // むずかしい以上は、閉じた形を1つ まぜて「ふくごう図形」に
    if (d === 'hard' || d === 'challenge') {
      for (const s of closedPolyline(transform(rng.pick(EASY_SHAPES), size, rng))) for (const u of splitSeg(s)) lines.push(u);
    }
    return { size, segments: sortSegs(lines) };
  },
  validate(p, d) {
    const rule = RULES[d];
    if (p.size !== rule.size) return 'size';
    if (!Array.isArray(p.segments) || p.segments.length === 0) return 'empty';
    for (const s of p.segments) {
      if (s.length !== 4 || s.some((v) => !Number.isInteger(v))) return 'format';
      const [x1, y1, x2, y2] = s;
      if (!inside(p.size, x1, y1) || !inside(p.size, x2, y2)) return 'outside';
      if (Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) !== 1) return 'not unit';
      if (!rule.diagonal && x1 !== x2 && y1 !== y2) return 'diagonal';
    }
    const sorted = sortSegs(p.segments);
    if (sorted.length !== p.segments.length || sorted.some((s, i) => s.join() !== p.segments[i].join())) return 'not normalized';
    if (p.segments.length < rule.min || p.segments.length > rule.max) return 'count';
    if (d === 'easy' && !isClosed(p.segments)) return 'easy must be closed';
    if (d === 'challenge' && !hasCrossing(p.segments) && p.segments.length < 13) return 'challenge too plain';
    return null;
  },
  fallback(d) {
    const out: DotsPuzzle[] = [];
    for (let seed = 1; seed < 800 && out.length < 3; seed++) {
      const p = dots.create(createRng(seed), d);
      if (p && dots.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!Array.isArray(a) || a.length === 0) return { correct: false, message: 'てんを 2つ タップして せんを ひいてね' };
    const { missing, extra } = dotsDiff(p, a);
    if (!missing.length && !extra.length) return { correct: true };
    const parts = [missing.length ? `たりない せんが ${missing.length}ほん` : '', extra.length ? `よけいな せんが ${extra.length}ほん` : ''].filter(Boolean);
    return { correct: false, message: `${parts.join('、')} あるよ` };
  },
  hints(p, progress) {
    const drawn = Array.isArray(progress) ? (progress as Seg[]) : [];
    const { missing, extra } = dotsDiff(p, drawn);
    if (!missing.length && !extra.length) return ['ぴったり だね！', 'こたえあわせ してみよう', 'こたえあわせ してみよう'];
    const total = segSet(p.segments).size;
    const where = (s: Seg) => `うえから ${s[1] + 1}ばんめ・ひだりから ${s[0] + 1}ばんめの てん`;
    if (extra.length) {
      return [`みほんの せんは みじかい せんで ${total}ほん だよ`, `${where(extra[0])}の まわりに よけいな せんが あるよ`, 'ひかっている せんを もういちど ひくと きえるよ'];
    }
    return [`みほんの せんは みじかい せんで ${total}ほん だよ`, `${where(missing[0])}から でる せんが たりないよ`, 'ひかっている せんを ひいてみよう'];
  },
  key: (p) => p.segments.map((s) => s.join('')).join('/'),
};
