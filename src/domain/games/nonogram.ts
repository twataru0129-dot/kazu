import type { Difficulty } from '../types';
import type { GameLogic } from './types';
import { cluesOf, countSolutions, lineClue, lineSolvable, solveLine, type Clue } from './nonogramSolver';
import { NONOGRAM_TEMPLATES } from './nonogramTemplates';

/**
 * 21 ピクロス：行と列の数字（黒の かたまりの長さ）から、黒くぬるマスを決める。
 * - 図柄は 自作のドット絵（nonogramTemplates.ts）と その左右反転
 * - 出題前に「手がかりだけで 答えが1つに決まる」ことを ソルバーで確かめる（2つ見つかったら不採用）
 * - 正解は「黒のマスの集まり」が答えと同じこと。×と未確定は どちらも「黒でない」として扱う
 */
export type NonoCell = 0 | 1 | 2; // 0=まだ 1=黒 2=×（白と決めた）

export interface NonogramPuzzle {
  size: number;
  templateId: string;
  /** クリアしたあとに見せる なまえ */
  name: string;
  flipped: boolean;
  /** 答え：行ごとの '#'/'.' */
  solution: string[];
  rows: Clue[];
  cols: Clue[];
}

/** 盤面：行ごとの マスの状態 */
export type NonogramAnswer = NonoCell[][];

export const NONO_SIZE: Record<Difficulty, number> = { easy: 5, normal: 7, hard: 10, challenge: 12 };
const MAX_GROUPS: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 5, challenge: 5 };

const toGrid = (rows: readonly string[]) => rows.map((r) => [...r].map((ch) => (ch === '#' ? 1 : 0)));

export function buildNonogram(d: Difficulty, templateIndex: number, flipped: boolean): NonogramPuzzle {
  const t = NONOGRAM_TEMPLATES[d][templateIndex];
  const solution = flipped ? t.rows.map((r) => [...r].reverse().join('')) : [...t.rows];
  const { rows, cols } = cluesOf(toGrid(solution));
  return { size: solution.length, templateId: t.id, name: t.name, flipped, solution, rows, cols };
}

export const emptyNonogram = (size: number): NonogramAnswer => Array.from({ length: size }, () => Array<NonoCell>(size).fill(0));

/** 黒（1）だけを 1、それ以外を 0 にした盤面 */
export const blackOf = (a: NonogramAnswer): number[][] => a.map((r) => r.map((v) => (v === 1 ? 1 : 0)));

/** その行・列の黒が、手がかりと ちょうど同じか（画面で 数字を うすくする目安） */
export function lineMatches(clue: Clue, line: readonly NonoCell[]): boolean {
  return lineClue(line.map((v) => (v === 1 ? 1 : 0))).join() === clue.join();
}

export function nonogramMismatch(p: NonogramPuzzle, a: NonogramAnswer): { wrongBlack: [number, number][]; missing: [number, number][] } {
  const wrongBlack: [number, number][] = [];
  const missing: [number, number][] = [];
  p.solution.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const black = a[r]?.[c] === 1;
      if (black && ch !== '#') wrongBlack.push([r, c]);
      if (!black && ch === '#') missing.push([r, c]);
    }),
  );
  return { wrongBlack, missing };
}

/** いまの盤面から、推理で つぎに決められるマスを1つ探す（ヒント用。答えを まるごとは 出さない） */
export function nextDeduction(p: NonogramPuzzle, a: NonogramAnswer): { kind: 'row' | 'col'; index: number; cell: [number, number]; black: boolean } | null {
  const cur = a.map((r) => r.map((v) => (v === 1 ? 1 : v === 2 ? 0 : -1)));
  for (let r = 0; r < p.size; r++) {
    const next = solveLine(p.rows[r], cur[r]);
    if (!next) continue;
    for (let c = 0; c < p.size; c++) if (cur[r][c] === -1 && next[c] !== -1) return { kind: 'row', index: r, cell: [r, c], black: next[c] === 1 };
  }
  for (let c = 0; c < p.size; c++) {
    const col = cur.map((row) => row[c]);
    const next = solveLine(p.cols[c], col);
    if (!next) continue;
    for (let r = 0; r < p.size; r++) if (col[r] === -1 && next[r] !== -1) return { kind: 'col', index: c, cell: [r, c], black: next[r] === 1 };
  }
  return null;
}

export const nonogram: GameLogic<NonogramPuzzle, NonogramAnswer> = {
  id: 'nonogram',
  generatorVersion: 1,
  create(rng, d, recent) {
    const list = NONOGRAM_TEMPLATES[d];
    const used = new Set((recent ?? []).map((p) => p.templateId));
    const fresh = list.map((_, i) => i).filter((i) => !used.has(list[i].id));
    const idx = rng.pick(fresh.length ? fresh : list.map((_, i) => i));
    return buildNonogram(d, idx, rng.chance(0.5));
  },
  validate(p, d) {
    const n = NONO_SIZE[d];
    if (p.size !== n || p.solution.length !== n || p.solution.some((r) => r.length !== n || /[^#.]/.test(r))) return 'size';
    const { rows, cols } = cluesOf(toGrid(p.solution));
    if (rows.map((x) => x.join()).join('|') !== p.rows.map((x) => x.join()).join('|')) return 'row clues';
    if (cols.map((x) => x.join()).join('|') !== p.cols.map((x) => x.join()).join('|')) return 'col clues';
    if (Math.max(...rows.map((x) => x.length), ...cols.map((x) => x.length)) > MAX_GROUPS[d]) return 'too many groups';
    const black = p.solution.join('').split('').filter((ch) => ch === '#').length;
    if (black < n * n * 0.3 || black > n * n * 0.8) return 'density';
    const res = countSolutions(p.rows, p.cols, 2);
    if (res.exhausted) return 'solver gave up';
    if (res.count !== 1) return `not unique (${res.count})`;
    // かんたん・ふつうは 行と列を じゅんに見るだけで 解ける（あてずっぽうが いらない）
    if ((d === 'easy' || d === 'normal') && !lineSolvable(p.rows, p.cols)) return 'needs guessing';
    return null;
  },
  fallback(d) {
    return NONOGRAM_TEMPLATES[d].map((_, i) => buildNonogram(d, i, false));
  },
  judge(p, a) {
    if (!Array.isArray(a) || a.length !== p.size || a.some((r) => !Array.isArray(r) || r.length !== p.size)) return { correct: false, message: 'マスを ぬってね' };
    // 手がかりと 合っているかで 判定する（答えは1つなので、これは 答えと同じ）
    const { rows, cols } = cluesOf(blackOf(a));
    const rowsOk = rows.every((x, i) => x.join() === p.rows[i].join());
    const colsOk = cols.every((x, i) => x.join() === p.cols[i].join());
    if (rowsOk && colsOk) return { correct: true };
    const badRows = rows.filter((x, i) => x.join() !== p.rows[i].join()).length;
    const badCols = cols.filter((x, i) => x.join() !== p.cols[i].join()).length;
    return { correct: false, message: `すうじと あわない ぎょうが ${badRows}こ、れつが ${badCols}こ あるよ` };
  },
  hints(p, progress) {
    const a = Array.isArray(progress) ? (progress as NonogramAnswer) : emptyNonogram(p.size);
    const { wrongBlack } = nonogramMismatch(p, a);
    if (wrongBlack.length) {
      const [r] = wrongBlack[0];
      return ['ぬった マスを すうじと くらべてみよう', `うえから ${r + 1}ばんめの ぎょうに、ぬらない マスが まじっているよ`, 'ひかっている マスは しろだよ。「×」に しよう'];
    }
    const next = nextDeduction(p, a);
    if (!next) {
      const done = nonogram.judge(p, a).correct;
      return done ? ['できて いるよ！', 'こたえあわせ してみよう', 'こたえあわせ してみよう'] : ['おおきい すうじの ぎょう・れつから かんがえよう', 'すうじの あいだには かならず 1マス あきが あるよ', 'ためしに ぬって、すうじと あうか しらべてみよう'];
    }
    const where = next.kind === 'row' ? `うえから ${next.index + 1}ばんめの ぎょう` : `ひだりから ${next.index + 1}ばんめの れつ`;
    const clue = (next.kind === 'row' ? p.rows : p.cols)[next.index];
    return [
      `${where}を みてみよう（すうじは ${clue.length ? clue.join('・') : '0'}）`,
      next.black ? 'その ならびで、かならず くろに なる マスが あるよ' : 'その ならびで、かならず しろに なる マスが あるよ',
      `ひかっている マスは ${next.black ? 'くろ（ぬる）' : 'しろ（×）'}だよ`,
    ];
  },
  key: (p) => `${p.templateId}${p.flipped ? '/f' : ''}`,
};
