import { useEffect, useState } from 'react';
import { cloneHeights, dataToView, emptyHeights, ISO_RISE, totalBlocks, viewHeights, viewToData, wrongCells, type BlockAnswer, type BlockPuzzle } from '../../domain/games/blockBuilder';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import { Confirm } from '../../components/ui';
import { useRoom } from '../useRoom';
import type { GameViewProps } from '../types';

interface Cell {
  x: number;
  y: number;
}
interface Draft {
  heights: number[][];
  sel: Cell | null;
  rot: number;
  history: number[][][];
  /** うえから 見て いるか（v1.6.1 から。ない 下書きは 立体） */
  top?: boolean;
}

const HISTORY = 60;
/** だんごとの いろ（うえ・ひだり・みぎ の 面）。1だんめ あお → 4だんめ あか。かずは ふちと 線でも わかる */
const LEVEL_COLORS = [
  ['#9fd3ff', '#5aa9e6', '#3b82c4'],
  ['#a8e6b8', '#5cc27a', '#3a9a58'],
  ['#ffe28a', '#f2c230', '#c99a12'],
  ['#ffb3a1', '#f07a5f', '#c8553d'],
];
/** 方角の ラベルを おく データの 点（じめんの 辺の まんなかの すこし そと） */
const DIR = [
  { label: 'まえ', at: (n: number) => [n / 2, n + 0.5] },
  { label: 'うしろ', at: (n: number) => [n / 2, -0.5] },
  { label: 'ひだり', at: (n: number) => [-0.5, n / 2] },
  { label: 'みぎ', at: (n: number) => [n + 0.5, n / 2] },
] as const;
/** 等角図の 大きさ（タイルの よこ半分 = 1 の 単位） */
const isoUnits = (n: number, maxH: number) => ({ w: 2 * n + 1.6, h: n + maxH * ISO_RISE + 0.9 });

/** データの 点 (X,Y)（0〜n）を 見る 向きの 点 (u,v) に。viewToData の 逆 */
function dataPointToView(n: number, rot: number, X: number, Y: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 0:
      return [X, Y];
    case 1:
      return [n - Y, X];
    case 2:
      return [n - X, n - Y];
    default:
      return [Y, n - X];
  }
}
/** 見る 向きの 点 (u,v,z) を 画面へ（タイルの よこ半分 = 1） */
const iso = (u: number, v: number, z: number): [number, number] => [u - v, (u + v) / 2 - z * ISO_RISE];
const pts = (ps: [number, number][]) => ps.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(' ');

/** 立体（等角図）。見る 向き rot、同じ 大きさで お手本と じぶんの 形を えがく */
function IsoBlocks({
  heights,
  maxH,
  rot,
  width,
  height,
  label,
  showNumbers,
  sel,
  marks = [],
  onPick,
  testId,
}: {
  heights: number[][];
  maxH: number;
  rot: number;
  width: number;
  height: number;
  label: string;
  showNumbers?: boolean;
  sel?: Cell | null;
  marks?: Cell[];
  onPick?: (c: Cell) => void;
  testId: string;
}) {
  const n = heights.length;
  const g = viewHeights(heights, rot);
  const u = isoUnits(n, maxH);
  const vb = { x: -u.w / 2, y: -maxH * ISO_RISE - 0.3, w: u.w, h: u.h };
  // 方角の 文字は 画面で 10px くらいに
  const fs = Math.max(0.3, Math.min(0.5, (10 * vb.w) / Math.max(1, width)));
  const order: { i: number; j: number }[] = [];
  for (let s = 0; s <= 2 * (n - 1); s++) for (let i = 0; i < n; i++) if (s - i >= 0 && s - i < n) order.push({ i, j: s - i });
  const outline = (c: Cell, color: string, dash?: string, key?: string) => {
    const { i, j } = dataToView(n, rot, c.x, c.y);
    const z = g[j][i];
    return (
      <polygon
        key={key}
        points={pts([iso(i, j, z), iso(i + 1, j, z), iso(i + 1, j + 1, z), iso(i, j + 1, z)])}
        fill="none"
        stroke={color}
        strokeWidth={0.12}
        strokeDasharray={dash}
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  };
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      data-testid={testId}
      data-rot={rot}
      data-view="iso"
      style={{ display: 'block', maxWidth: '100%', touchAction: 'manipulation' }}
    >
      {/* 方角（さきに えがくので、おくの ラベルは 高い ブロックの うしろに なる） */}
      {DIR.map((dd) => {
        const [dx, dy] = dd.at(n);
        const [pu, pv] = dataPointToView(n, rot, dx, dy);
        const [lx, ly] = iso(pu, pv, 0);
        return (
          <g key={dd.label} pointerEvents="none">
            <rect x={lx - fs * 1.7} y={ly - fs * 0.75} width={fs * 3.4} height={fs * 1.4} rx={fs * 0.7} fill="#fff" opacity={0.92} stroke="#8aa1b6" strokeWidth={0.03} />
            <text x={lx} y={ly + fs * 0.3} textAnchor="middle" fontSize={fs} fontWeight={800} fill="#33475b">
              {dd.label}
            </text>
          </g>
        );
      })}
      {/* じめん */}
      {order.map(({ i, j }) => {
        const d = viewToData(n, rot, i, j);
        const on = sel && sel.x === d.x && sel.y === d.y;
        return (
          <polygon
            key={`f${i}${j}`}
            points={pts([iso(i, j, 0), iso(i + 1, j, 0), iso(i + 1, j + 1, 0), iso(i, j + 1, 0)])}
            fill={on ? '#ffe7c2' : (i + j) % 2 ? '#eef3f7' : '#e3eaf1'}
            stroke="#b8c7d6"
            strokeWidth={0.04}
            onClick={onPick ? () => onPick(d) : undefined}
            style={{ cursor: onPick ? 'pointer' : undefined }}
          />
        );
      })}
      {/* ブロック（おくから 手前へ、したから うえへ） */}
      {order.map(({ i, j }) => {
        const d = viewToData(n, rot, i, j);
        return Array.from({ length: g[j][i] }, (_, z) => {
          const [top, left, right] = LEVEL_COLORS[Math.min(z, LEVEL_COLORS.length - 1)];
          return (
            <g key={`b${i}${j}${z}`} onClick={onPick ? () => onPick(d) : undefined} style={{ cursor: onPick ? 'pointer' : undefined }} stroke="#1b2838" strokeWidth={0.045} strokeLinejoin="round">
              <polygon points={pts([iso(i, j + 1, z), iso(i + 1, j + 1, z), iso(i + 1, j + 1, z + 1), iso(i, j + 1, z + 1)])} fill={left} />
              <polygon points={pts([iso(i + 1, j, z), iso(i + 1, j + 1, z), iso(i + 1, j + 1, z + 1), iso(i + 1, j, z + 1)])} fill={right} />
              <polygon points={pts([iso(i, j, z + 1), iso(i + 1, j, z + 1), iso(i + 1, j + 1, z + 1), iso(i, j + 1, z + 1)])} fill={top} />
            </g>
          );
        });
      })}
      {marks.map((c, k) => outline(c, '#e8590c', '0.25 0.15', `m${k}`))}
      {sel && outline(sel, '#d97706', undefined, 'sel')}
      {showNumbers &&
        order.map(({ i, j }) => {
          const [cx, cy] = iso(i + 0.5, j + 0.5, g[j][i]);
          return (
            <g key={`n${i}${j}`} pointerEvents="none">
              <circle cx={cx} cy={cy} r={0.32} fill="#fff" stroke="#1b2838" strokeWidth={0.04} />
              <text x={cx} y={cy + 0.14} textAnchor="middle" fontSize={0.42} fontWeight={900} fill="#1b2838">
                {g[j][i]}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

export function BlockBuilderView({ puzzle: p, difficulty, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<BlockPuzzle, BlockAnswer, Draft>) {
  const n = p.size;
  const valid = (h: unknown): h is number[][] =>
    Array.isArray(h) && h.length === n && h.every((r) => Array.isArray(r) && r.length === n && r.every((v) => Number.isInteger(v) && v >= 0 && v <= p.maxH));
  const [heights, setHeights] = useState<number[][]>(() => (valid(draft?.heights) ? cloneHeights(draft.heights) : emptyHeights(n)));
  const [sel, setSel] = useState<Cell | null>(() => (draft?.sel && draft.sel.x >= 0 && draft.sel.y >= 0 && draft.sel.x < n && draft.sel.y < n ? draft.sel : { x: 0, y: n - 1 }));
  const [rot, setRot] = useState(() => (Number.isInteger(draft?.rot) ? ((draft!.rot % 4) + 4) % 4 : 0));
  const [history, setHistory] = useState<number[][][]>(() => (Array.isArray(draft?.history) ? draft.history.filter(valid).slice(-HISTORY) : []));
  const [asking, setAsking] = useState(false);
  const [topView, setTopView] = useState(() => draft?.top === true);
  const { ref, width: roomW, height: roomH } = useRoom<HTMLDivElement>();

  useEffect(() => reportProgress({ heights, sel }), [heights, sel, reportProgress]);

  const persist = (h: number[][], s: Cell | null, r: number, hist: number[][][], t = topView) => saveDraft({ heights: h, sel: s, rot: r, history: hist, top: t });
  // 見かたを かえるだけ（つんだ ブロック・向き・えらんだ マスは そのまま）
  const toggleTop = () => {
    play('tap');
    const t = !topView;
    setTopView(t);
    persist(heights, sel, rot, history, t);
  };

  const change = (delta: number) => {
    if (solved || !sel) return;
    const cur = heights[sel.y][sel.x];
    const next = Math.max(0, Math.min(p.maxH, cur + delta));
    if (next === cur) return;
    play('tap');
    const h = cloneHeights(heights);
    h[sel.y][sel.x] = next;
    const hist = [...history, heights].slice(-HISTORY);
    setHeights(h);
    setHistory(hist);
    persist(h, sel, rot, hist);
  };
  const pick = (c: Cell) => {
    if (solved) return;
    play('tap');
    setSel(c);
    persist(heights, c, rot, history);
  };
  const turn = (d: number) => {
    play('tap');
    const r = (rot + d + 4) % 4;
    setRot(r);
    persist(heights, sel, r, history);
  };
  const undo = () => {
    if (solved || history.length === 0) return;
    play('tap');
    const h = history[history.length - 1];
    const hist = history.slice(0, -1);
    setHeights(h);
    setHistory(hist);
    persist(h, sel, rot, hist);
  };
  const reset = () => {
    setAsking(false);
    const h = emptyHeights(n);
    const hist = [...history, heights].slice(-HISTORY);
    setHeights(h);
    setHistory(hist);
    persist(h, sel, rot, hist);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (asking || solved) return;
      if (e.key === '+' || e.key === '=') change(1);
      else if (e.key === '-' || e.key === '_') change(-1);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        // 矢印は 画面の 向きで うごく（地図と おなじ）
        const cur = dataToView(n, rot, sel?.x ?? 0, sel?.y ?? n - 1);
        const di = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dj = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const i = Math.max(0, Math.min(n - 1, cur.i + di));
        const j = Math.max(0, Math.min(n - 1, cur.j + dj));
        pick(viewToData(n, rot, i, j));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const marks = hintLevel >= 2 && !solved ? wrongCells(p, heights).slice(0, 1) : [];
  const selH = sel ? heights[sel.y][sel.x] : 0;

  // 大きさ：したに 地図と ＋・−。のこりに お手本と じぶんの 形を おなじ 大きさで。
  // 高さが あれば お手本が うえ・じぶんが した、たりない 画面や ひろい 画面では よこに ならべる
  const units = isoUnits(n, p.maxH);
  const cellSize = Math.floor(Math.max(36, Math.min(n === 4 ? 46 : n === 3 ? 54 : 70, (roomW - 90 - (n - 1) * 4 - 20) / n)));
  const mapH = n * cellSize + (n - 1) * 4 + 20;
  const isoRoom = Math.max(240, roomH - mapH - 8);
  const fitIso = (w: number, h: number) => {
    const a = Math.max(8, Math.min(w / units.w, h / units.h));
    return { w: Math.floor(a * units.w), h: Math.floor(a * units.h) };
  };
  const stacked = roomW < 640 && fitIso(roomW, isoRoom / 2 - 4).h >= 150;
  const box = stacked ? fitIso(roomW, isoRoom / 2 - 4) : fitIso((roomW - 8) / 2, Math.min(isoRoom, 380));

  const roundBtn = (labelText: string, glyph: string, onClick: () => void) => (
    <button type="button" className="btn" aria-label={labelText} title={labelText} onClick={onClick} style={{ minWidth: 44, minHeight: 44, padding: '0 8px', borderRadius: 999, fontSize: '1.2rem' }}>
      <span aria-hidden>{glyph}</span>
    </button>
  );

  const map = (
    <div
      role="grid"
      aria-label="じめんの ちず（えらぶ マス）"
      data-testid="block-map"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, ${cellSize}px)`, gap: 4, width: 'max-content', position: 'relative', padding: 10 }}
    >
      {Array.from({ length: n }, (_, j) =>
        Array.from({ length: n }, (__, i) => {
          const d = viewToData(n, rot, i, j);
          const on = sel?.x === d.x && sel?.y === d.y;
          const marked = marks.some((m) => m.x === d.x && m.y === d.y);
          const v = heights[d.y][d.x];
          return (
            <button
              key={`${i}${j}`}
              type="button"
              role="gridcell"
              aria-selected={on}
              aria-label={`${placeName(n, rot, i, j)}：${v}だん${on ? '（えらんでいる）' : ''}${marked ? '（ちがう ところ）' : ''}`}
              data-x={d.x}
              data-y={d.y}
              onClick={() => pick(d)}
              disabled={solved}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 8,
                border: on ? '3px solid #d97706' : marked ? '3px dashed #e8590c' : '2px solid #b8c7d6',
                background: v > 0 ? LEVEL_COLORS[Math.min(v, 4) - 1][0] : '#f3f7fb',
                fontWeight: 900,
                fontSize: cellSize > 44 ? '1.2rem' : '1rem',
                color: '#1b2838',
                padding: 0,
              }}
            >
              {v}
            </button>
          );
        }),
      )}
      {/* 方角（地図も 立体と おなじ 向きで まわる） */}
      {(['まえ', 'うしろ', 'ひだり', 'みぎ'] as const).map((w, k) => {
        const [dx, dy] = DIR[k].at(n);
        const [u, v] = dataPointToView(n, rot, dx, dy);
        const side = v > n ? 'bottom' : v < 0 ? 'top' : u < 0 ? 'left' : 'right';
        const pos: Record<string, string | number> =
          side === 'bottom'
            ? { bottom: -2, left: '50%', transform: 'translateX(-50%)' }
            : side === 'top'
              ? { top: -2, left: '50%', transform: 'translateX(-50%)' }
              : side === 'left'
                ? { left: -4, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl' }
                : { right: -4, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl' };
        return (
          <span key={w} aria-hidden className="small" style={{ position: 'absolute', fontSize: 10, fontWeight: 800, color: '#5b7086', lineHeight: 1, ...pos }}>
            {w}
          </span>
        );
      })}
    </div>
  );

  const controls = (
    <div className="stack" style={{ gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        className="btn primary"
        aria-label="1だん ふやす"
        onClick={() => change(1)}
        disabled={solved || !sel || selH === p.maxH}
        style={{ minWidth: 56, minHeight: 48, fontSize: '1.4rem', padding: 0 }}
      >
        ＋
      </button>
      <span aria-live="polite" data-testid="block-selected-height" style={{ minWidth: 44, textAlign: 'center', fontWeight: 900, fontSize: '1.2rem' }}>
        {selH}だん
      </span>
      <button
        type="button"
        className="btn"
        aria-label="1だん へらす"
        onClick={() => change(-1)}
        disabled={solved || !sel || selH === 0}
        style={{ minWidth: 56, minHeight: 48, fontSize: '1.4rem', padding: 0 }}
      >
        −
      </button>
      {/* うえから：お手本と じぶんを いっしょに きりかえる（どの むずかしさでも） */}
      <button
        type="button"
        className={`chip${topView ? ' active' : ''}`}
        aria-pressed={topView}
        aria-label="うえから みる（おてほんと じぶん）"
        data-testid="block-topview-toggle"
        onClick={toggleTop}
        style={{ minHeight: 44, minWidth: 56, fontSize: '0.8rem', padding: '2px 8px', fontWeight: 800, whiteSpace: 'nowrap' }}
      >
        {topView ? '✓ うえから' : 'うえから'}
      </button>
    </div>
  );

  const showNumbers = p.showNumbers;
  const viewWord = topView ? '（うえ）' : '';
  const model = (
    <figure style={{ margin: 0, position: 'relative' }}>
      <figcaption className="small" style={{ position: 'absolute', left: 0, top: 0, fontWeight: 800 }}>
        おてほん{viewWord}
      </figcaption>
      {topView ? (
        <TopView heights={p.heights} rot={rot} width={box.w} height={box.h} label="おてほんの つみき" showNumbers={showNumbers} sel={difficulty === 'challenge' ? null : sel} testId="block-model" />
      ) : (
        <IsoBlocks
          heights={p.heights}
          maxH={p.maxH}
          rot={rot}
          width={box.w}
          height={box.h}
          label="おてほんの つみき"
          showNumbers={showNumbers}
          sel={difficulty === 'challenge' ? null : sel}
          testId="block-model"
        />
      )}
      <div style={{ position: 'absolute', left: 0, bottom: 0 }}>{roundBtn('ひだりに まわす', '↺', () => turn(-1))}</div>
      <div style={{ position: 'absolute', right: 0, bottom: 0 }}>{roundBtn('みぎに まわす', '↻', () => turn(1))}</div>
    </figure>
  );
  const own = (
    <figure style={{ margin: 0, position: 'relative' }}>
      <figcaption className="small" style={{ position: 'absolute', left: 0, top: 0, fontWeight: 800 }}>
        じぶん{viewWord} {totalBlocks(heights)}こ
      </figcaption>
      {topView ? (
        <TopView heights={heights} rot={rot} width={box.w} height={box.h} label="じぶんの つみき" sel={sel} marks={marks} onPick={solved ? undefined : pick} testId="block-own" />
      ) : (
        <IsoBlocks heights={heights} maxH={p.maxH} rot={rot} width={box.w} height={box.h} label="じぶんの つみき" sel={sel} marks={marks} onPick={solved ? undefined : pick} testId="block-own" />
      )}
    </figure>
  );

  return (
    <section className="stack" style={{ gap: 6 }}>
      <div ref={ref} className="stack" style={{ gap: 6 }}>
        {stacked ? (
          <>
            <div className="row center">{model}</div>
            <div className="row center">{own}</div>
          </>
        ) : (
          <div className="row center" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            {model}
            {own}
          </div>
        )}
        <div className="row center" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'center' }}>
          {map}
          {controls}
        </div>
      </div>
      {solved && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }} data-testid="block-solved">
          おてほんと おなじ かたちが できたよ！
        </p>
      )}
      {status}
      {asking && <Confirm title="やりなおす？" message="つんだ ブロックを ぜんぶ かたづけるよ。" okLabel="やりなおす" onOk={reset} onCancel={() => setAsking(false)} />}
      <InDock>
        <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={solved || history.length === 0} style={{ flex: 1, minWidth: 0, padding: '0 6px' }}>
            ひとつ もどす
          </button>
          <button type="button" className="btn" onClick={() => setAsking(true)} disabled={solved || totalBlocks(heights) === 0} style={{ flex: 1, minWidth: 0, padding: '0 6px' }}>
            やりなおす
          </button>
          <button type="button" className="btn primary" onClick={() => submit({ heights })} disabled={solved} style={{ flex: 1.3, minWidth: 0, padding: '0 6px' }}>
            こたえあわせ
          </button>
        </div>
      </InDock>
    </section>
  );
}

/** 地図の マスの なまえ（画面の 向きでなく、まえ・ひだり の ことばで） */
function placeName(n: number, rot: number, i: number, j: number) {
  const d = viewToData(n, rot, i, j);
  return `まえから ${n - d.y}れつめ・ひだりから ${d.x + 1}ばんめ`;
}

/** 真上から 見た 点 (u,v)（見る 向きの 0〜n）を 画面へ。立体と おなじ 向きの ひしがた（つぶさない 正方形） */
const top2d = (u: number, v: number): [number, number] => [u - v, u + v];

/**
 * 真上から 見た 図。立体と おなじ 向き・おなじ 大きさで、お手本と じぶんの 両方に つかう。
 * 0だん は 点線の 空きマス、1だん 以上は いちばん うえの だんの いろ（立体の うえの 面と おなじ）。
 */
function TopView({
  heights,
  rot,
  width,
  height,
  label,
  showNumbers,
  sel,
  marks = [],
  onPick,
  testId,
}: {
  heights: number[][];
  rot: number;
  width: number;
  height: number;
  label: string;
  showNumbers?: boolean;
  sel?: Cell | null;
  marks?: Cell[];
  onPick?: (c: Cell) => void;
  testId: string;
}) {
  const n = heights.length;
  const g = viewHeights(heights, rot);
  const m = 1.15;
  // 立体の 図と おなじ 縦横比の 箱の まんなかに おく
  const side = 2 * n + 2 * m;
  const aspect = width / Math.max(1, height);
  const vbW = Math.max(side, side * aspect);
  const vbH = Math.max(side, side / aspect);
  const vb = { x: -vbW / 2, y: n - vbH / 2, w: vbW, h: vbH };
  const fs = Math.max(0.3, Math.min(0.55, (10 * vb.w) / Math.max(1, width)));
  const cellPts = (i: number, j: number, inset = 0) => pts([top2d(i + inset, j + inset), top2d(i + 1 - inset, j + inset), top2d(i + 1 - inset, j + 1 - inset), top2d(i + inset, j + 1 - inset)]);
  const outline = (c: Cell, color: string, dash?: string, key?: string) => {
    const { i, j } = dataToView(n, rot, c.x, c.y);
    return <polygon key={key} points={cellPts(i, j, 0.04)} fill="none" stroke={color} strokeWidth={0.14} strokeDasharray={dash} strokeLinejoin="round" pointerEvents="none" />;
  };
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${label}（うえから）`}
      data-testid={testId}
      data-rot={rot}
      data-view="top"
      style={{ display: 'block', maxWidth: '100%', touchAction: 'manipulation' }}
    >
      {g.map((row, j) =>
        row.map((v, i) => {
          const d = viewToData(n, rot, i, j);
          const pick = onPick ? () => onPick(d) : undefined;
          const common = { 'data-x': d.x, 'data-y': d.y, 'data-h': v, onClick: pick, style: { cursor: pick ? 'pointer' : undefined } };
          if (v === 0)
            return (
              <g key={`c${i}${j}`} data-testid="top-cell" data-empty="true" {...common}>
                <polygon points={cellPts(i, j)} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.06} strokeDasharray="0.18 0.12" />
                <circle cx={top2d(i + 0.5, j + 0.5)[0]} cy={top2d(i + 0.5, j + 0.5)[1]} r={0.09} fill="#b8c7d6" />
              </g>
            );
          const [light, mid, dark] = LEVEL_COLORS[Math.min(v, LEVEL_COLORS.length) - 1];
          return (
            <g key={`c${i}${j}`} data-testid="top-cell" data-empty="false" data-color={light} {...common}>
              <polygon points={cellPts(i, j)} fill={mid} stroke="#1b2838" strokeWidth={0.06} strokeLinejoin="round" />
              <polygon points={cellPts(i, j, 0.14)} fill={light} stroke={dark} strokeWidth={0.04} />
            </g>
          );
        }),
      )}
      {marks.map((c, k) => outline(c, '#e8590c', '0.25 0.15', `m${k}`))}
      {sel && outline(sel, '#d97706', undefined, 'sel')}
      {showNumbers &&
        g.map((row, j) =>
          row.map((v, i) => {
            const [cx, cy] = top2d(i + 0.5, j + 0.5);
            return (
              <g key={`n${i}${j}`} pointerEvents="none">
                <circle cx={cx} cy={cy} r={0.34} fill="#fff" stroke="#1b2838" strokeWidth={0.04} />
                <text x={cx} y={cy + 0.15} textAnchor="middle" fontSize={0.44} fontWeight={900} fill="#1b2838">
                  {v}
                </text>
              </g>
            );
          }),
        )}
      {DIR.map((dd) => {
        const [dx, dy] = dd.at(n);
        const [pu, pv] = dataPointToView(n, rot, dx, dy);
        const [lx, ly] = top2d(pu, pv);
        return (
          <g key={dd.label} pointerEvents="none">
            <rect x={lx - fs * 1.7} y={ly - fs * 0.75} width={fs * 3.4} height={fs * 1.4} rx={fs * 0.7} fill="#fff" opacity={0.92} stroke="#8aa1b6" strokeWidth={0.03} />
            <text x={lx} y={ly + fs * 0.3} textAnchor="middle" fontSize={fs} fontWeight={800} fill="#33475b">
              {dd.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
