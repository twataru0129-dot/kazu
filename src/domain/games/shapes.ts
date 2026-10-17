import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 14 かたちパズル
 * 形は「正方形のマスを対角線で4つに分けた三角形（N/E/S/W）」の集まりで表す。
 * 位置はマス単位で吸着し、回転は90度ずつ。判定は三角形の占有で行う（ピクセル誤差なし）。
 */
export type Quad = 0 | 1 | 2 | 3; // 0:N(上) 1:E(右) 2:S(下) 3:W(左)
export type Tri = [number, number, Quad]; // [x, y, q]

export interface PieceDef {
  id: string;
  name: string;
  tris: Tri[]; // 回転0の形（正規化済み）
  color: string;
}

export interface Placement {
  rot: number; // 0〜3（90度ずつ時計回り）
  x: number;
  y: number;
}

export interface ShapesPuzzle {
  templateId: string;
  title: string;
  width: number;
  height: number;
  silhouette: string[]; // 三角形のキー "x,y,q"
  pieces: PieceDef[];
  /** 最初の向き（かんたんは正解の向きのまま） */
  initialRot: number[];
  allowRotate: boolean;
  /** 検証済みの正解例（ガイド表示・検証用） */
  solution: Placement[];
  showGuide: boolean;
}

/** 各ピースの置き方（未配置は null） */
export type ShapesAnswer = (Placement | null)[];

const FULL = (x: number, y: number): Tri[] => [
  [x, y, 0],
  [x, y, 1],
  [x, y, 2],
  [x, y, 3],
];

export const triKey = (t: Tri) => `${t[0]},${t[1]},${t[2]}`;

export function normalize(tris: Tri[]): Tri[] {
  const minX = Math.min(...tris.map((t) => t[0]));
  const minY = Math.min(...tris.map((t) => t[1]));
  return tris.map(([x, y, q]) => [x - minX, y - minY, q] as Tri).sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
}

/** 時計回りに90度（画面座標：yは下向き） */
export function rotate90(tris: Tri[]): Tri[] {
  return normalize(tris.map(([x, y, q]) => [-y - 1, x, ((q + 1) % 4) as Quad]));
}

export function flipH(tris: Tri[]): Tri[] {
  const flipQ: Record<Quad, Quad> = { 0: 0, 1: 3, 2: 2, 3: 1 };
  return normalize(tris.map(([x, y, q]) => [-x - 1, y, flipQ[q]]));
}

export function rotated(tris: Tri[], rot: number): Tri[] {
  let t = normalize(tris);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) t = rotate90(t);
  return t;
}

export function placedTris(piece: Pick<PieceDef, 'tris'>, pl: Placement): Tri[] {
  return rotated(piece.tris, pl.rot).map(([x, y, q]) => [x + pl.x, y + pl.y, q] as Tri);
}

/** 三角形の集まりの重心（マス単位）。タップした場所にピースの重心を合わせるのに使う */
export function centroid(tris: Tri[]): { x: number; y: number } {
  const off: Record<Quad, [number, number]> = { 0: [0.5, 1 / 6], 1: [5 / 6, 0.5], 2: [0.5, 5 / 6], 3: [1 / 6, 0.5] };
  const sx = tris.reduce((s, [x, , q]) => s + x + off[q][0], 0);
  const sy = tris.reduce((s, [, y, q]) => s + y + off[q][1], 0);
  return { x: sx / tris.length, y: sy / tris.length };
}

export function bounds(tris: Tri[]): { w: number; h: number } {
  return { w: Math.max(...tris.map((t) => t[0])) + 1, h: Math.max(...tris.map((t) => t[1])) + 1 };
}

// ---- ピースの形（回転0） ----
const SHAPES: Record<string, { name: string; tris: Tri[] }> = {
  sq1: { name: 'しかく', tris: FULL(0, 0) },
  sq2: { name: 'おおきい しかく', tris: [...FULL(0, 0), ...FULL(1, 0), ...FULL(0, 1), ...FULL(1, 1)] },
  dom: { name: 'ながしかく', tris: [...FULL(0, 0), ...FULL(1, 0)] },
  bar3: { name: 'ながい ぼう', tris: [...FULL(0, 0), ...FULL(1, 0), ...FULL(2, 0)] },
  ltri: { name: 'L', tris: [...FULL(0, 0), ...FULL(0, 1), ...FULL(1, 1)] },
  // 直角が左下の小さい三角（マスの半分）
  tri1: { name: 'ちいさい さんかく', tris: [[0, 0, 2], [0, 0, 3]] },
  // 直角が左下の大きい三角（たてよこ2マス）
  tri2: { name: 'おおきい さんかく', tris: [[0, 0, 2], [0, 0, 3], ...FULL(0, 1), [1, 1, 2], [1, 1, 3]] },
  // 上向きのやね（はば2・たかさ1）
  roof: { name: 'やね', tris: [[0, 0, 1], [0, 0, 2], [1, 0, 2], [1, 0, 3]] },
  // へいこうしへんけい
  para: { name: 'ななめ', tris: [[0, 0, 1], [0, 0, 2], [1, 0, 0], [1, 0, 3]] },
  // だいけい（下が はば3、上が はば1）
  trap: { name: 'だいけい', tris: [[0, 0, 1], [0, 0, 2], ...FULL(1, 0), [2, 0, 2], [2, 0, 3]] },
};

const COLORS = ['#ef7d57', '#4aa3df', '#f4c542', '#5cc28b', '#a678de'];

interface Template {
  id: string;
  title: string;
  difficulty: Difficulty;
  parts: { shape: keyof typeof SHAPES; rot: number; x: number; y: number }[];
}

/** 検証済みの配置テンプレート（各難易度6題、合計24題） */
export const TEMPLATES: Template[] = [
  // かんたん：2ピース・回転なし
  { id: 'e-house', title: 'おうち', difficulty: 'easy', parts: [{ shape: 'roof', rot: 0, x: 0, y: 0 }, { shape: 'sq2', rot: 0, x: 0, y: 1 }] },
  { id: 'e-tall', title: 'ドア', difficulty: 'easy', parts: [{ shape: 'sq2', rot: 0, x: 0, y: 0 }, { shape: 'dom', rot: 0, x: 0, y: 2 }] },
  { id: 'e-boat', title: 'ヨット', difficulty: 'easy', parts: [{ shape: 'trap', rot: 2, x: 0, y: 1 }, { shape: 'tri1', rot: 0, x: 1, y: 0 }] },
  { id: 'e-shop', title: 'おみせ', difficulty: 'easy', parts: [{ shape: 'trap', rot: 0, x: 0, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 1 }] },
  { id: 'e-mountain', title: 'やま', difficulty: 'easy', parts: [{ shape: 'tri2', rot: 1, x: 0, y: 0 }, { shape: 'tri2', rot: 0, x: 2, y: 0 }] },
  { id: 'e-tower', title: 'とう', difficulty: 'easy', parts: [{ shape: 'sq1', rot: 0, x: 1, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 1 }] },
  // ふつう：3ピース・回転あり
  { id: 'n-house', title: 'ひろい おうち', difficulty: 'normal', parts: [{ shape: 'trap', rot: 0, x: 0, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 1 }, { shape: 'bar3', rot: 0, x: 0, y: 2 }] },
  { id: 'n-yacht', title: 'おおきい ヨット', difficulty: 'normal', parts: [{ shape: 'trap', rot: 2, x: 0, y: 2 }, { shape: 'tri2', rot: 0, x: 1, y: 0 }, { shape: 'tri1', rot: 3, x: 0, y: 1 }] },
  { id: 'n-fish', title: 'さかな', difficulty: 'normal', parts: [{ shape: 'roof', rot: 1, x: 0, y: 0 }, { shape: 'sq2', rot: 0, x: 1, y: 0 }, { shape: 'roof', rot: 1, x: 3, y: 0 }] },
  { id: 'n-stairs', title: 'かいだん', difficulty: 'normal', parts: [{ shape: 'sq1', rot: 0, x: 0, y: 0 }, { shape: 'ltri', rot: 0, x: 0, y: 1 }, { shape: 'bar3', rot: 0, x: 0, y: 3 }] },
  { id: 'n-rocket', title: 'ロケット', difficulty: 'normal', parts: [{ shape: 'roof', rot: 0, x: 0, y: 0 }, { shape: 'sq2', rot: 0, x: 0, y: 1 }, { shape: 'dom', rot: 0, x: 0, y: 3 }] },
  { id: 'n-diamond', title: 'ダイヤ', difficulty: 'normal', parts: [{ shape: 'roof', rot: 0, x: 0, y: 0 }, { shape: 'roof', rot: 2, x: 0, y: 1 }, { shape: 'sq2', rot: 0, x: 2, y: 0 }] },
  // むずかしい：4ピース
  { id: 'h-castle', title: 'おしろ', difficulty: 'hard', parts: [{ shape: 'roof', rot: 0, x: 0, y: 0 }, { shape: 'roof', rot: 0, x: 2, y: 0 }, { shape: 'sq2', rot: 0, x: 0, y: 1 }, { shape: 'sq2', rot: 0, x: 2, y: 1 }] },
  { id: 'h-tree', title: 'き', difficulty: 'hard', parts: [{ shape: 'tri2', rot: 1, x: 0, y: 0 }, { shape: 'tri2', rot: 0, x: 2, y: 0 }, { shape: 'dom', rot: 1, x: 1, y: 2 }, { shape: 'dom', rot: 1, x: 2, y: 2 }] },
  { id: 'h-train', title: 'でんしゃ', difficulty: 'hard', parts: [{ shape: 'sq2', rot: 0, x: 0, y: 0 }, { shape: 'sq2', rot: 0, x: 2, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 2 }, { shape: 'tri1', rot: 3, x: 3, y: 2 }] },
  { id: 'h-arrow', title: 'やじるし', difficulty: 'hard', parts: [{ shape: 'dom', rot: 0, x: 0, y: 1 }, { shape: 'tri2', rot: 1, x: 2, y: 0 }, { shape: 'tri2', rot: 2, x: 2, y: 2 }, { shape: 'sq1', rot: 0, x: 4, y: 1 }] },
  { id: 'h-bigsq', title: 'おおきい しかく', difficulty: 'hard', parts: [{ shape: 'tri2', rot: 0, x: 0, y: 0 }, { shape: 'tri2', rot: 2, x: 0, y: 0 }, { shape: 'dom', rot: 0, x: 0, y: 2 }, { shape: 'ltri', rot: 1, x: 2, y: 0 }] },
  { id: 'h-boat', title: 'ふね', difficulty: 'hard', parts: [{ shape: 'trap', rot: 2, x: 0, y: 2 }, { shape: 'para', rot: 0, x: 0, y: 1 }, { shape: 'sq1', rot: 0, x: 2, y: 1 }, { shape: 'tri1', rot: 0, x: 2, y: 0 }] },
  // チャレンジ：5ピース・似た形を混ぜる
  { id: 'c-cat', title: 'ねこ', difficulty: 'challenge', parts: [{ shape: 'tri1', rot: 0, x: 0, y: 0 }, { shape: 'tri1', rot: 1, x: 2, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 1 }, { shape: 'sq2', rot: 0, x: 0, y: 2 }, { shape: 'sq1', rot: 0, x: 2, y: 2 }] },
  { id: 'c-ship', title: 'おおきい ふね', difficulty: 'challenge', parts: [{ shape: 'trap', rot: 2, x: 0, y: 3 }, { shape: 'tri2', rot: 0, x: 1, y: 1 }, { shape: 'tri1', rot: 3, x: 0, y: 2 }, { shape: 'tri1', rot: 0, x: 1, y: 0 }, { shape: 'tri1', rot: 2, x: 2, y: 2 }] },
  { id: 'c-house', title: 'えんとつの いえ', difficulty: 'challenge', parts: [{ shape: 'trap', rot: 0, x: 0, y: 1 }, { shape: 'sq1', rot: 0, x: 2, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 2 }, { shape: 'dom', rot: 0, x: 0, y: 3 }, { shape: 'sq1', rot: 0, x: 2, y: 3 }] },
  { id: 'c-robot', title: 'ロボット', difficulty: 'challenge', parts: [{ shape: 'sq1', rot: 0, x: 1, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 1 }, { shape: 'roof', rot: 2, x: 0, y: 2 }, { shape: 'tri1', rot: 0, x: 2, y: 2 }, { shape: 'tri1', rot: 2, x: 2, y: 2 }] },
  { id: 'c-star', title: 'ほし', difficulty: 'challenge', parts: [{ shape: 'roof', rot: 0, x: 1, y: 0 }, { shape: 'bar3', rot: 0, x: 0, y: 1 }, { shape: 'sq1', rot: 0, x: 3, y: 1 }, { shape: 'roof', rot: 2, x: 0, y: 2 }, { shape: 'roof', rot: 2, x: 2, y: 2 }] },
  { id: 'c-tower', title: 'たかい とう', difficulty: 'challenge', parts: [{ shape: 'roof', rot: 0, x: 0, y: 0 }, { shape: 'sq2', rot: 0, x: 0, y: 1 }, { shape: 'tri2', rot: 0, x: 0, y: 3 }, { shape: 'tri2', rot: 2, x: 0, y: 3 }, { shape: 'dom', rot: 0, x: 0, y: 5 }] },
];

const PIECE_COUNT: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4, challenge: 5 };

/** テンプレートから問題を作る（全体の回転・左右反転・ピースの初期向きをランダム化） */
export function buildFromTemplate(t: Template, globalRot: number, flip: boolean, pieceRots: number[], d: Difficulty): ShapesPuzzle {
  // 各ピースの盤上の三角形を求め、全体変換をかける
  const all: Tri[][] = t.parts.map((part) => rotated(SHAPES[part.shape].tris, part.rot).map(([x, y, q]) => [x + part.x, y + part.y, q] as Tri));
  const flatIdx: number[] = [];
  let flat: Tri[] = [];
  all.forEach((ts, i) => {
    flat = flat.concat(ts);
    ts.forEach(() => flatIdx.push(i));
  });
  // 全体変換（形の位置関係を保つため、まとめて変換してから分ける）
  const transform = (tris: Tri[]): Tri[] => {
    let out = tris.map((x) => [...x] as Tri);
    if (flip) {
      const flipQ: Record<Quad, Quad> = { 0: 0, 1: 3, 2: 2, 3: 1 };
      out = out.map(([x, y, q]) => [-x - 1, y, flipQ[q]]);
    }
    for (let i = 0; i < globalRot; i++) out = out.map(([x, y, q]) => [-y - 1, x, ((q + 1) % 4) as Quad]);
    return out;
  };
  const moved = transform(flat);
  const minX = Math.min(...moved.map((m) => m[0]));
  const minY = Math.min(...moved.map((m) => m[1]));
  const shifted = moved.map(([x, y, q]) => [x - minX, y - minY, q] as Tri);
  const perPiece: Tri[][] = t.parts.map(() => []);
  shifted.forEach((tri, k) => perPiece[flatIdx[k]].push(tri));
  const pieces: PieceDef[] = [];
  const solution: Placement[] = [];
  perPiece.forEach((tris, i) => {
    const base = normalize(tris);
    const minPX = Math.min(...tris.map((m) => m[0]));
    const minPY = Math.min(...tris.map((m) => m[1]));
    pieces.push({ id: `p${i}`, name: SHAPES[t.parts[i].shape].name, tris: base, color: COLORS[i % COLORS.length] });
    solution.push({ rot: 0, x: minPX, y: minPY });
  });
  const { w, h } = bounds(shifted);
  const allowRotate = d !== 'easy';
  return {
    templateId: t.id,
    title: t.title,
    width: w,
    height: h,
    silhouette: shifted.map(triKey).sort(),
    pieces,
    initialRot: allowRotate ? pieceRots.slice(0, pieces.length) : pieces.map(() => 0),
    allowRotate,
    solution,
    showGuide: d === 'easy',
  };
}

export interface CoverResult {
  complete: boolean;
  overlap: boolean;
  outside: boolean;
  covered: number;
  total: number;
}

/** 置いたピースがシルエットをぴったり埋めているか（重なり・はみ出し・すきまなし） */
export function coverage(p: ShapesPuzzle, ans: ShapesAnswer): CoverResult {
  const sil = new Set(p.silhouette);
  const seen = new Set<string>();
  let overlap = false;
  let outside = false;
  ans.forEach((pl, i) => {
    if (!pl) return;
    for (const t of placedTris(p.pieces[i], pl)) {
      const k = triKey(t);
      if (seen.has(k)) overlap = true;
      seen.add(k);
      if (!sil.has(k)) outside = true;
    }
  });
  const covered = [...seen].filter((k) => sil.has(k)).length;
  const allPlaced = ans.length === p.pieces.length && ans.every((x) => x !== null);
  return { complete: allPlaced && !overlap && !outside && covered === sil.size, overlap, outside, covered, total: sil.size };
}

/** 全探索で解を数える（テスト・検証用）。rotations=false なら初期の向きのみ */
export function solveShapes(p: ShapesPuzzle, limit = 50, rotations = p.allowRotate): ShapesAnswer[] {
  const sil = new Set(p.silhouette);
  const silList = [...p.silhouette].sort();
  const used = new Set<string>();
  const ans: ShapesAnswer = p.pieces.map(() => null);
  const out: ShapesAnswer[] = [];
  const orient = p.pieces.map((pc, i) => {
    const rots = rotations ? [0, 1, 2, 3] : [p.initialRot[i]];
    const seenShapes = new Set<string>();
    return rots.flatMap((rot) => {
      const tris = rotated(pc.tris, rot);
      const sig = tris.map(triKey).join(';');
      if (seenShapes.has(sig)) return [];
      seenShapes.add(sig);
      return [{ rot, tris }];
    });
  });
  const rec = () => {
    if (out.length >= limit) return;
    const first = silList.find((k) => !used.has(k));
    if (!first) {
      if (ans.every((a) => a !== null)) out.push(ans.map((a) => ({ ...a! })));
      return;
    }
    const [fx, fy, fq] = first.split(',').map(Number);
    for (let i = 0; i < p.pieces.length; i++) {
      if (ans[i]) continue;
      for (const { rot, tris } of orient[i]) {
        for (const anchor of tris) {
          if (anchor[2] !== fq) continue;
          const dx = fx - anchor[0];
          const dy = fy - anchor[1];
          const keys = tris.map(([x, y, q]) => `${x + dx},${y + dy},${q}`);
          if (keys.some((k) => !sil.has(k) || used.has(k))) continue;
          keys.forEach((k) => used.add(k));
          ans[i] = { rot, x: dx, y: dy };
          rec();
          ans[i] = null;
          keys.forEach((k) => used.delete(k));
        }
      }
    }
  };
  rec();
  return out;
}

export const shapes: GameLogic<ShapesPuzzle, ShapesAnswer> = {
  id: 'shapes',
  generatorVersion: 1,
  create(rng, d) {
    const pool = TEMPLATES.filter((t) => t.difficulty === d);
    const t = rng.pick(pool);
    const globalRot = d === 'easy' ? 0 : rng.int(0, 3);
    const flip = d !== 'easy' && rng.chance(0.5);
    const rots = t.parts.map(() => rng.int(0, 3));
    return buildFromTemplate(t, globalRot, flip, rots, d);
  },
  validate(p, d) {
    if (p.pieces.length !== PIECE_COUNT[d]) return 'piece count';
    if (!coverage(p, p.solution).complete) return 'solution does not tile';
    const area = p.pieces.reduce((s, pc) => s + pc.tris.length, 0);
    if (area !== p.silhouette.length) return 'area';
    if (p.solution.some((pl, i) => placedTris(p.pieces[i], pl).some(([x, y]) => x < 0 || y < 0 || x >= p.width || y >= p.height))) return 'out of board';
    return null;
  },
  fallback(d) {
    return TEMPLATES.filter((t) => t.difficulty === d).map((t) => buildFromTemplate(t, 0, false, t.parts.map(() => 0), d));
  },
  judge(p, a) {
    const c = coverage(p, a);
    if (c.complete) return { correct: true };
    if (a.some((x) => x === null)) return { correct: false, message: 'ピースを ぜんぶ おいてね' };
    if (c.overlap) return { correct: false, message: 'かさなっている ピースが あるよ' };
    if (c.outside) return { correct: false, message: 'かげから はみだしている ピースが あるよ' };
    return { correct: false, message: 'すきまが あるよ' };
  },
  hints(p) {
    const big = p.pieces.reduce((bi, pc, i) => (pc.tris.length > p.pieces[bi].tris.length ? i : bi), 0);
    const pl = p.solution[big];
    const tris = placedTris(p.pieces[big], pl);
    const cx = tris.reduce((s, t) => s + t[0], 0) / tris.length;
    const cy = tris.reduce((s, t) => s + t[1], 0) / tris.length;
    const h = cx < p.width / 3 ? 'ひだり' : cx > (p.width * 2) / 3 ? 'みぎ' : 'まんなか';
    const v = cy < p.height / 3 ? 'うえ' : cy > (p.height * 2) / 3 ? 'した' : 'まんなか';
    const where = h === v ? 'まんなか' : `${v === 'まんなか' ? '' : v}${h === 'まんなか' ? '' : h}`.replace(/^$/, 'まんなか');
    return [
      'おおきい ピースから おいてみよう',
      `「${p.pieces[big].name}」は ${where} の ほうかな？`,
      p.allowRotate ? 'かどの かたちに あわせて、ピースを まわしてみよう' : 'かげの とがった ところに あわせてみよう',
    ];
  },
  key: (p) => p.templateId,
};
