import { useState } from 'react';
import {
  FACE_NAME,
  hintCells,
  netAnswers,
  netSides,
  netSize,
  solveNet,
  VIEW_NORMAL,
  VISIBLE_FACES,
  type NetQuizAnswer,
  type NetQuizPuzzle,
  type Side,
  type Vec,
  type ViewFace,
} from '../../domain/games/netQuiz';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';
import { useFitCell } from '../useFitCell';

/** しるし：色だけで なく かたちも ちがう（100×100 の 中に かく） */
const MARKS = [
  { name: 'ほし', color: '#f2b705', d: 'M50 12 L60 38 L88 39 L66 56 L74 84 L50 68 L26 84 L34 56 L12 39 L40 38 Z' },
  { name: 'まる', color: '#3d7fd9', d: 'M50 18a32 32 0 1 0 0.01 0Z M50 36a14 14 0 1 1 -0.01 0Z' },
  { name: 'ハート', color: '#d94f9b', d: 'M50 84 C20 64 14 42 26 30 C36 20 47 26 50 35 C53 26 64 20 74 30 C86 42 80 64 50 84 Z' },
];
const TARGET = '#ff8a3d';
const SIDE_NAME = ['みぎ', 'した', 'ひだり', 'うえ'];
const EDGE_PAD = 16;

/** 立方体（表示座標 x みぎ・y おく・z うえ）を ななめ上から 見た 図に うつす */
const S3 = Math.sqrt(2);
const S6 = Math.sqrt(6);
const proj = (p: readonly number[]) => [(p[0] + p[1]) / S3, -(-p[0] + p[1] + 2 * p[2]) / S6];
const FACE_POLY: Record<'top' | 'front' | 'right', number[][]> = {
  top: [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  front: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
  right: [
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
    [1, 0, 1],
  ],
};
/** 見える へん（めんの くみ → はしの 点） */
const EDGE_ENDS: Record<string, [number[], number[]]> = {
  'front|top': [[0, 0, 1], [1, 0, 1]],
  'right|top': [[1, 0, 1], [1, 1, 1]],
  'front|right': [[1, 0, 0], [1, 0, 1]],
  'back|top': [[0, 1, 1], [1, 1, 1]],
  'left|top': [[0, 0, 1], [0, 1, 1]],
  'front|left': [[0, 0, 0], [0, 0, 1]],
  'bottom|front': [[0, 0, 0], [1, 0, 0]],
  'bottom|right': [[1, 0, 0], [1, 1, 0]],
  'back|right': [[1, 1, 0], [1, 1, 1]],
};
const ekey = (a: string, b: string) => [a, b].sort().join('|');

function Stripes({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill={color} />
      <rect width="3" height="8" fill="#fff" opacity="0.45" />
    </pattern>
  );
}

function Cube({ p }: { p: NetQuizPuzzle }) {
  const s = solveNet(p)!;
  const scale = 70;
  const pt = (v: readonly number[]) => proj(v).map((x) => x * scale);
  const markOn = (face: ViewFace) => p.marks.find((m) => m.face === face);
  const markTransform = (face: ViewFace) => {
    const f = s.frames[s.cellOfFace[face]];
    const n = VIEW_NORMAL[face];
    const center = pt([0.5 + n[0] / 2, 0.5 + n[1] / 2, 0.5 + n[2] / 2]);
    const lin = (v: Vec) => proj(s.toView(v)).map((x) => x * scale);
    const [ux, uy] = lin(f.r);
    const [vx, vy] = lin(f.d);
    const k = 0.62 / 100;
    const a = ux * k;
    const b = uy * k;
    const c = vx * k;
    const d = vy * k;
    return `matrix(${a} ${b} ${c} ${d} ${center[0] - 50 * (a + c)} ${center[1] - 50 * (b + d)})`;
  };
  const targetEdge = p.target.kind === 'edge' ? EDGE_ENDS[ekey(...p.target.faces)] : null;
  const faceLabel =
    p.target.kind === 'face'
      ? `はこの ${FACE_NAME[p.target.face]}の めんが オレンジ`
      : `はこの ${FACE_NAME[p.target.faces[0]]}と ${FACE_NAME[p.target.faces[1]]}の めんの あいだの へんが オレンジ`;
  return (
    <svg viewBox="-12 -98 124 128" width="96" height="100" role="img" aria-label={`${faceLabel}。${p.marks.map((m) => `${FACE_NAME[m.face]}の めんに ${MARKS[m.mark].name}`).join('、')}`} style={{ flex: '0 0 auto' }}>
      <defs>
        <Stripes id="nq-target" color={TARGET} />
      </defs>
      {VISIBLE_FACES.map((face) => {
        const poly = FACE_POLY[face as 'top' | 'front' | 'right'].map(pt);
        const isTarget = p.target.kind === 'face' && p.target.face === face;
        const fill = isTarget ? 'url(#nq-target)' : face === 'top' ? '#fdf9ee' : face === 'front' ? '#f1ece0' : '#e6e1d4';
        const mark = markOn(face);
        return (
          <g key={face}>
            <polygon points={poly.map((x) => x.join(',')).join(' ')} fill={fill} stroke="#1b2838" strokeWidth="2" strokeLinejoin="round" />
            {mark && (
              <path d={MARKS[mark.mark].d} transform={markTransform(face)} fill={MARKS[mark.mark].color} fillRule="evenodd" stroke="#1b2838" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            )}
          </g>
        );
      })}
      {targetEdge && (
        <g>
          <line x1={pt(targetEdge[0])[0]} y1={pt(targetEdge[0])[1]} x2={pt(targetEdge[1])[0]} y2={pt(targetEdge[1])[1]} stroke="#1b2838" strokeWidth="10" strokeLinecap="round" />
          <line x1={pt(targetEdge[0])[0]} y1={pt(targetEdge[0])[1]} x2={pt(targetEdge[1])[0]} y2={pt(targetEdge[1])[1]} stroke={TARGET} strokeWidth="6" strokeLinecap="round" strokeDasharray="7 4" />
        </g>
      )}
    </svg>
  );
}

function MarkIcon({ mark, size = '62%' }: { mark: number; size?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ display: 'block', margin: 'auto' }}>
      <path d={MARKS[mark].d} fill={MARKS[mark].color} fillRule="evenodd" stroke="#1b2838" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

const sameAnswer = (a: NetQuizAnswer, b: NetQuizAnswer) =>
  !!a && !!b && a.kind === b.kind && a.cell === b.cell && (a.kind === 'face' || (b.kind === 'edge' && a.side === b.side));

export function NetQuizView({ puzzle: p, submit, solved, status, hintLevel }: GameViewProps<NetQuizPuzzle, NetQuizAnswer>) {
  const [pick, setPick] = useState<NetQuizAnswer>(null);
  const s = solveNet(p)!;
  const { rows, cols } = netSize(p.cells);
  const pad = p.target.kind === 'edge' ? EDGE_PAD : 6;
  const { ref, cell } = useFitCell<HTMLDivElement>(cols, { min: 48, max: 84, rows, pad });
  const isEdge = p.target.kind === 'edge';
  const answers = solved ? netAnswers(p) : [];
  const glow = hintLevel >= 3 && !solved ? hintCells(p) : [];
  const markOfCell = (i: number) => p.marks.find((m) => s.cellOfFace[m.face] === i);
  const sides = netSides(p.cells);
  const W = cols * cell + pad * 2;
  const H = rows * cell + pad * 2;

  const choose = (a: NetQuizAnswer) => {
    if (solved) return;
    play('tap');
    setPick(sameAnswer(a, pick) ? null : a);
  };
  const answer = () => {
    if (solved || !pick) return;
    const j = submit(pick);
    if (!j.correct) setPick(null);
  };

  const sideLine = (cellIdx: number, side: Side) => {
    const [r, c] = p.cells[cellIdx];
    const x0 = pad + c * cell;
    const y0 = pad + r * cell;
    if (side === 0) return { x1: x0 + cell, y1: y0, x2: x0 + cell, y2: y0 + cell };
    if (side === 1) return { x1: x0, y1: y0 + cell, x2: x0 + cell, y2: y0 + cell };
    if (side === 2) return { x1: x0, y1: y0, x2: x0, y2: y0 + cell };
    return { x1: x0, y1: y0, x2: x0 + cell, y2: y0 };
  };
  const cellName = (i: number) => `うえから ${p.cells[i][0] + 1}ばんめ ひだりから ${p.cells[i][1] + 1}ばんめの めん`;

  const question = (
    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
      <strong style={{ fontSize: '1.05rem' }} data-testid="net-question">
        {isEdge ? 'オレンジの へんは、てんかいずの どこ？' : 'オレンジの めんは、てんかいずの どれ？'}
      </strong>
      {p.guide && <span className="small" style={{ color: '#2a7fd0' }}>てんせんで おると はこに なるよ</span>}
    </div>
  );
  return (
    <section className="stack">
      <div className="card row" style={{ gap: 8, padding: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
        <Cube p={p} />
        {question}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div ref={ref} role="group" aria-label="てんかいず" style={{ position: 'relative', width: W, height: H, margin: '0 auto' }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }} aria-hidden>
            <defs>
              <Stripes id="nq-pick" color="#ffd27a" />
            </defs>
            {p.cells.map(([r, c], i) => {
              const picked = pick?.kind === 'face' && pick.cell === i;
              const right = answers.some((a) => a?.kind === 'face' && a.cell === i);
              return (
                <rect
                  key={i}
                  x={pad + c * cell}
                  y={pad + r * cell}
                  width={cell}
                  height={cell}
                  fill={right ? '#c9efd9' : picked ? 'url(#nq-pick)' : '#fdf9ee'}
                  stroke={glow.includes(i) ? '#f4b400' : 'none'}
                  strokeWidth={glow.includes(i) ? 5 : 0}
                  strokeDasharray={glow.includes(i) ? '6 4' : undefined}
                />
              );
            })}
            {sides.map((l) => {
              const ln = sideLine(l.cell, l.side);
              const picked = pick?.kind === 'edge' && sameAnswer(pick, { kind: 'edge', cell: l.cell, side: l.side });
              const right = answers.some((a) => sameAnswer(a, { kind: 'edge', cell: l.cell, side: l.side }));
              return (
                <g key={`${l.cell}-${l.side}`}>
                  <line {...ln} stroke={l.fold ? (p.guide ? '#2a7fd0' : '#8a98a8') : '#1b2838'} strokeWidth={l.fold ? 2 : 3} strokeDasharray={l.fold ? '6 5' : undefined} strokeLinecap="round" />
                  {(picked || right) && <line {...ln} stroke={right ? '#1f9d6a' : TARGET} strokeWidth="8" strokeLinecap="round" />}
                </g>
              );
            })}
          </svg>
          {p.cells.map(([r, c], i) => {
            const mark = markOfCell(i);
            const style = { position: 'absolute', left: pad + c * cell, top: pad + r * cell, width: cell, height: cell, padding: 0, border: 'none', background: 'transparent', display: 'flex' } as const;
            const label = `${cellName(i)}${mark ? `（${MARKS[mark.mark].name}の しるし）` : ''}`;
            return isEdge ? (
              <div key={i} aria-label={label} style={{ ...style, pointerEvents: 'none' }}>
                {mark && <MarkIcon mark={mark.mark} size="52%" />}
              </div>
            ) : (
              <button key={i} type="button" aria-label={label} aria-pressed={pick?.kind === 'face' && pick.cell === i} disabled={solved} onClick={() => choose({ kind: 'face', cell: i })} style={style}>
                {mark && <MarkIcon mark={mark.mark} />}
              </button>
            );
          })}
          {isEdge &&
            sides.map((l) => {
              const [r, c] = p.cells[l.cell];
              const horiz = l.side === 1 || l.side === 3;
              const inset = Math.min(10, cell * 0.15);
              const x = pad + c * cell + (l.side === 0 ? cell : 0);
              const y = pad + r * cell + (l.side === 1 ? cell : 0);
              const style = horiz
                ? { left: x + inset, top: y - EDGE_PAD, width: cell - inset * 2, height: EDGE_PAD * 2 }
                : { left: x - EDGE_PAD, top: y + inset, width: EDGE_PAD * 2, height: cell - inset * 2 };
              const a = { kind: 'edge' as const, cell: l.cell, side: l.side };
              return (
                <button
                  key={`e${l.cell}-${l.side}`}
                  type="button"
                  aria-label={`${cellName(l.cell)}の ${SIDE_NAME[l.side]}の へん${l.fold ? '（おりめ）' : ''}`}
                  aria-pressed={sameAnswer(pick, a)}
                  disabled={solved}
                  onClick={() => choose(a)}
                  style={{ position: 'absolute', ...style, padding: 0, border: 'none', background: 'transparent', borderRadius: 8 }}
                />
              );
            })}
        </div>
      </div>
      {solved && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 700 }}>
          {isEdge && answers.length > 1 ? 'みどりの 2つの へんは、おると くっついて 1つの へんに なるよ' : 'みどりの ところが こたえだよ'}
        </p>
      )}
      {status}
      <InDock>
        <div className="row center">
          <button type="button" className="btn primary big" onClick={answer} disabled={solved || !pick}>
            これに する
          </button>
        </div>
      </InDock>
    </section>
  );
}
