import { useEffect, useState, type KeyboardEvent } from 'react';
import { dotsDiff, toggleLine, type DotsAnswer, type DotsPuzzle, type Pt, type Seg } from '../../domain/games/dots';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';
import { useFitCell } from '../useFitCell';

const pos = ([x, y]: Pt) => `うえから ${y + 1}ばんめ ひだりから ${x + 1}ばんめ`;

function Lines({ segs, color, width, dash, data }: { segs: readonly Seg[]; color: string; width: number; dash?: string; data?: boolean }) {
  return (
    <>
      {segs.map((s) => (
        <line key={s.join()} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} data-seg={data ? s.join(',') : undefined} />
      ))}
    </>
  );
}

function Dots({ n, r, fill }: { n: number; r: number; fill: string }) {
  return (
    <>
      {Array.from({ length: n * n }, (_, i) => (
        <circle key={i} cx={i % n} cy={Math.floor(i / n)} r={r} fill={fill} />
      ))}
    </>
  );
}

export function DotsView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<DotsPuzzle, DotsAnswer, { segments: Seg[] }>) {
  const n = p.size;
  const [segs, setSegs] = useState<Seg[]>(() => draft?.segments ?? []);
  const [history, setHistory] = useState<Seg[][]>([]);
  const [sel, setSel] = useState<Pt | null>(null);
  const diff = hintLevel >= 3 ? dotsDiff(p, segs) : null;

  useEffect(() => reportProgress(segs), [segs, reportProgress]);

  const update = (next: Seg[], pushHistory = true) => {
    if (pushHistory) setHistory((h) => [...h.slice(-49), segs]);
    setSegs(next);
    saveDraft({ segments: next });
  };

  const tapPoint = (pt: Pt) => {
    if (solved) return;
    play('tap');
    if (!sel) return setSel(pt);
    if (sel[0] === pt[0] && sel[1] === pt[1]) return setSel(null);
    update(toggleLine(segs, [sel[0], sel[1], pt[0], pt[1]]));
    // つづけて ひけるように、いま タップした てんから はじめる
    setSel(pt);
  };

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setSel(null);
    update(prev, false);
  };

  const view = `-0.5 -0.5 ${n} ${n}`;
  // 点を押せる範囲は、その点の まわりの 1マスぶん ぜんぶ（320px 幅の 6×6 でも 48px）
  const { ref: boardRef, cell } = useFitCell<SVGSVGElement>(n, { min: 48, max: 80 });
  const onKey = (e: KeyboardEvent, pt: Pt) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tapPoint(pt);
    }
  };

  return (
    <section className="stack">
      <div className="card row" style={{ gap: 10, padding: 10, flexWrap: 'nowrap', alignItems: 'center' }}>
        <div className="stack" style={{ gap: 2, alignItems: 'center', flex: '0 0 auto' }}>
          <strong className="small">みほん</strong>
          <svg viewBox={view} role="img" aria-label={`みほんの かたち（みじかい せんで ${p.segments.length}ほん）`} style={{ width: 104, height: 104, display: 'block' }} data-testid="dots-sample">
            <Dots n={n} r={0.08} fill="#9fb3c6" />
            <Lines segs={p.segments} color="#7a55c8" width={0.14} data />
          </svg>
        </div>
        <p className="small" style={{ margin: 0, minHeight: '4.5em' }} aria-live="polite">
          {sel ? 'つぎの てんを タップしてね。おなじ てんを おすと やめるよ。' : 'てんを 2つ じゅんに タップすると せんが ひけるよ。おなじ せんを もういちど ひくと きえるよ。'}
        </p>
      </div>
      <svg
        ref={boardRef}
        viewBox={view}
        width={cell * n}
        height={cell * n}
        style={{ display: 'block', margin: '0 auto', touchAction: 'manipulation', background: '#fff', borderRadius: 12, boxShadow: 'inset 0 0 0 2px #c6d6e4' }}
        aria-label="きみの ばん"
        role="group"
        data-testid="dots-board"
      >
        <Lines segs={segs} color="#2a7fd0" width={0.12} />
        {diff && <Lines segs={diff.missing.slice(0, 1)} color="#f4b400" width={0.14} dash="0.15 0.12" />}
        {diff && !diff.missing.length && <Lines segs={diff.extra.slice(0, 1)} color="#e0533d" width={0.2} dash="0.15 0.12" />}
        <Dots n={n} r={0.1} fill="#1b2838" />
        {sel && <circle cx={sel[0]} cy={sel[1]} r={0.26} fill="none" stroke="#f07a2a" strokeWidth={0.07} />}
        {Array.from({ length: n * n }, (_, i) => {
          const pt: Pt = [i % n, Math.floor(i / n)];
          const isSel = !!sel && sel[0] === pt[0] && sel[1] === pt[1];
          return (
            <rect
              key={i}
              x={pt[0] - 0.5}
              y={pt[1] - 0.5}
              width={1}
              height={1}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={`${pos(pt)}の てん${isSel ? '（えらんでいる）' : ''}`}
              aria-pressed={isSel}
              onClick={() => tapPoint(pt)}
              onKeyDown={(e) => onKey(e, pt)}
              style={{ cursor: 'pointer', outline: 'none' }}
            />
          );
        })}
      </svg>
      {status}
      <InDock>
        <div className="row center" style={{ flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={solved || history.length === 0}>
            もどす
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSel(null);
              update([]);
            }}
            disabled={solved || segs.length === 0}
          >
            ぜんぶ けす
          </button>
          <button type="button" className="btn primary big" onClick={() => submit(segs)} disabled={solved}>
            こたえあわせ
          </button>
        </div>
      </InDock>
    </section>
  );
}
