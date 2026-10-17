import { useEffect, useState } from 'react';
import { isAdjacent, judgeMove, type Cell, type MazeAnswer, type MazePuzzle } from '../../domain/games/maze';
import { play } from '../../audio/sfx';
import type { GameViewProps } from '../types';

export function MazeView({ puzzle: p, submit, solved, status, reportProgress, hintLevel }: GameViewProps<MazePuzzle, MazeAnswer>) {
  const [moves, setMoves] = useState<Cell[]>([]);
  const step = moves.length;
  const pos = step === 0 ? p.path[0] : moves[step - 1];
  const q = p.questions[Math.min(step, p.questions.length - 1)];
  const visited = new Set([p.path[0], ...moves].map((c) => `${c[0]},${c[1]}`));
  const goal = p.path[p.path.length - 1];

  useEffect(() => reportProgress(step), [step, reportProgress]);

  const tap = (cell: Cell) => {
    if (solved) return;
    if (!isAdjacent(pos, cell)) return;
    if (judgeMove(p, step, cell)) {
      const next = [...moves, cell];
      setMoves(next);
      play('move');
      if (next.length === p.questions.length) submit({ moves: next });
    } else {
      // まちがえても その場に とどまって もういちど えらべる
      submit({ moves: [...moves, cell] });
    }
  };

  const size = `min(${Math.floor(100 / p.size)}%, ${Math.floor(420 / p.size)}px)`;
  return (
    <section className="stack">
      <div className="card center-text">
        {solved ? (
          <div className="big-expr">ゴール！</div>
        ) : (
          <>
            <div className="muted">こたえが かいてある となりの マスへ すすもう</div>
            <div className="big-expr">{q.text} = ?</div>
          </>
        )}
      </div>
      <div role="grid" aria-label="めいろ" style={{ display: 'grid', gridTemplateColumns: `repeat(${p.size}, ${size})`, justifyContent: 'center', gap: 6 }}>
        {p.values.map((row, r) =>
          row.map((v, c) => {
            const k = `${r},${c}`;
            const here = pos[0] === r && pos[1] === c;
            const adj = isAdjacent(pos, [r, c]) && !solved;
            const isGoal = goal[0] === r && goal[1] === c;
            const highlight = hintLevel >= 2 && adj;
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                onClick={() => tap([r, c])}
                aria-label={`${r === 0 && c === 0 ? 'スタート' : v}${here ? '（いま ここ）' : ''}${isGoal ? '（ゴール）' : ''}`}
                className="num"
                disabled={!adj && !here}
                style={{
                  aspectRatio: '1',
                  minHeight: 48,
                  borderRadius: 14,
                  fontSize: p.size >= 6 ? '1.05rem' : '1.4rem',
                  border: `3px solid ${here ? '#f07a2a' : highlight ? '#f4c542' : adj ? '#7fc4a5' : '#d6e3ee'}`,
                  background: here ? '#fff1e6' : visited.has(k) ? '#d9f2e5' : adj ? '#ffffff' : '#f2f6fa',
                  color: '#1b2838',
                  opacity: !adj && !here && !visited.has(k) ? 0.75 : 1,
                  position: 'relative',
                  padding: 0,
                }}
              >
                {here ? (
                  <svg viewBox="0 0 40 40" width="70%" height="70%" aria-hidden>
                    <circle cx="20" cy="20" r="16" fill="#f07a2a" />
                    <circle cx="14" cy="17" r="3" fill="#fff" />
                    <circle cx="26" cy="17" r="3" fill="#fff" />
                    <path d="M13 25 q7 6 14 0" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  </svg>
                ) : r === 0 && c === 0 ? (
                  <span style={{ fontSize: '0.8rem' }}>スタート</span>
                ) : (
                  v
                )}
                {isGoal && !here && (
                  <span aria-hidden style={{ position: 'absolute', top: 2, right: 4, fontSize: '0.8rem' }}>
                    🏁
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
      {status}
    </section>
  );
}
