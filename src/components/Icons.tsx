import type { ReactNode } from 'react';
import type { GameId } from '../domain/games/types';
import type { ModeKey } from '../config/theme';

/** 自作の SVG アイコン */
const S = ({ children, label, size }: { children: ReactNode; label?: string; size?: number }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {children}
  </svg>
);

const stroke = { stroke: 'currentColor', strokeWidth: 3.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

export const IconBack = () => (
  <S>
    <path d="M28 12 L16 24 L28 36" {...stroke} />
  </S>
);
/** 設定（歯車）。太陽・照明に 見えない よう、歯の ある 輪と まんなかの 穴で かく */
export const IconGear = () => (
  <S>
    <path d="M20.62 9.90 L21.47 5.17 L26.53 5.17 L27.38 9.90 L31.58 11.64 L35.53 8.90 L39.10 12.47 L36.36 16.42 L38.10 20.62 L42.83 21.47 L42.83 26.53 L38.10 27.38 L36.36 31.58 L39.10 35.53 L35.53 39.10 L31.58 36.36 L27.38 38.10 L26.53 42.83 L21.47 42.83 L20.62 38.10 L16.42 36.36 L12.47 39.10 L8.90 35.53 L11.64 31.58 L9.90 27.38 L5.17 26.53 L5.17 21.47 L9.90 20.62 L11.64 16.42 L8.90 12.47 L12.47 8.90 L16.42 11.64 Z" {...stroke} strokeWidth={3} />
    <circle cx="24" cy="24" r="5.5" {...stroke} strokeWidth={3} />
  </S>
);
export const IconSound = ({ on }: { on: boolean }) => (
  <S>
    <path d="M8 19h7l9-7v24l-9-7H8z" fill="currentColor" />
    {on ? <path d="M31 17q5 7 0 14M35 13q9 11 0 22" {...stroke} strokeWidth={3} /> : <path d="M31 18l10 12M41 18L31 30" {...stroke} strokeWidth={3} />}
  </S>
);
export const IconHint = () => (
  <S>
    <path d="M24 7a11 11 0 0 0-6 20v5h12v-5a11 11 0 0 0-6-20z" fill="#f6c94b" stroke="#c9961b" strokeWidth="2" />
    <path d="M19 37h10M20 41h8" {...stroke} stroke="#8a6a12" strokeWidth={3} />
  </S>
);
export const IconSwitch = () => (
  <S>
    <path d="M12 18h22l-6-6M36 30H14l6 6" {...stroke} />
  </S>
);
export const IconPlay = () => (
  <S>
    <path d="M16 11 L37 24 L16 37 Z" fill="currentColor" />
  </S>
);
export const IconPause = () => (
  <S>
    <rect x="13" y="11" width="8" height="26" rx="2" fill="currentColor" />
    <rect x="27" y="11" width="8" height="26" rx="2" fill="currentColor" />
  </S>
);
export const IconRestart = () => (
  <S>
    <path d="M14 18a12 12 0 1 1-1 11" {...stroke} />
    <path d="M12 9v10h10" {...stroke} />
  </S>
);
export const IconRotate = () => (
  <S>
    <path d="M34 18a12 12 0 1 0 2 9" {...stroke} />
    <path d="M36 9v10H26" {...stroke} />
  </S>
);
export const IconSpeak = () => (
  <S>
    <path d="M10 20h6l8-6v20l-8-6h-6z" fill="currentColor" />
    <path d="M30 18q4 6 0 12" {...stroke} strokeWidth={3} />
    <path d="M36 24h4" {...stroke} strokeWidth={3} />
  </S>
);

export function ModeIcon({ mode, size = 76 }: { mode: ModeKey; size?: number }) {
  switch (mode) {
    case 'calc':
      return (
        <svg className="mode-icon" viewBox="0 0 80 80" width={size} height={size} aria-hidden>
          <rect x="8" y="8" width="64" height="64" rx="18" fill="#f07a2a" />
          <path d="M22 28h14M29 21v14M44 28h14M22 52h14M44 48h14M44 56h14" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <path d="M24 46l10 10M34 46L24 56" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case 'play':
      return (
        <svg className="mode-icon" viewBox="0 0 80 80" width={size} height={size} aria-hidden>
          <rect x="8" y="8" width="64" height="64" rx="18" fill="#1f9d6a" />
          <rect x="18" y="20" width="20" height="20" rx="5" fill="#ffd34d" />
          <circle cx="54" cy="30" r="10" fill="#fff" />
          <path d="M18 62 L28 44 L38 62 Z" fill="#fff" />
          <rect x="44" y="44" width="20" height="18" rx="5" fill="#8fe0bd" />
          <text x="54" y="58" fontSize="13" fontWeight="800" textAnchor="middle" fill="#0d5a3a">7</text>
        </svg>
      );
    case 'learn':
      return (
        <svg className="mode-icon" viewBox="0 0 80 80" width={size} height={size} aria-hidden>
          <rect x="8" y="8" width="64" height="64" rx="18" fill="#7a55c8" />
          <ellipse cx="26" cy="54" rx="13" ry="5" fill="#cbb8ef" />
          <ellipse cx="54" cy="54" rx="13" ry="5" fill="#cbb8ef" />
          <circle cx="21" cy="47" r="6" fill="#ff6b6b" />
          <circle cx="31" cy="47" r="6" fill="#ff6b6b" />
          <circle cx="49" cy="47" r="6" fill="#ff6b6b" />
          <circle cx="59" cy="47" r="6" fill="#ff6b6b" />
          <text x="40" y="32" fontSize="18" fontWeight="800" textAnchor="middle" fill="#fff">2×2</text>
        </svg>
      );
    case 'test':
      return (
        <svg className="mode-icon" viewBox="0 0 80 80" width={size} height={size} aria-hidden>
          <rect x="8" y="8" width="64" height="64" rx="18" fill="#2a7fd0" />
          <rect x="20" y="16" width="40" height="50" rx="6" fill="#fff" />
          <path d="M26 30l4 4 8-8M26 46l4 4 8-8" stroke="#1f9d6a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M42 31h12M42 47h12" stroke="#9cc3e8" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
  }
}

/** 16ゲームそれぞれの識別アイコン */
export function GameIcon({ id }: { id: GameId }) {
  const t = (x: number, y: number, s: string, size = 12, fill = '#1b2838') => (
    <text x={x} y={y} fontSize={size} fontWeight="800" textAnchor="middle" fill={fill} fontFamily="ui-rounded, sans-serif">
      {s}
    </text>
  );
  const body = (() => {
    switch (id) {
      case 'decompose':
        return (
          <>
            <rect x="12" y="4" width="24" height="14" rx="4" fill="#ffd34d" />
            {t(24, 15, '148', 10)}
            <path d="M24 18v6M14 30l10-6 10 6" stroke="#5b6b7d" strokeWidth="2" fill="none" />
            <rect x="2" y="30" width="16" height="12" rx="3" fill="#8fd3ff" />
            <rect x="19" y="30" width="12" height="12" rx="3" fill="#a6e7c4" />
            <rect x="32" y="30" width="12" height="12" rx="3" fill="#ffc2a8" />
            {t(10, 39, '100', 7)}
            {t(25, 39, '40', 7)}
            {t(38, 39, '8', 7)}
          </>
        );
      case 'pittari':
        return (
          <>
            <circle cx="24" cy="24" r="20" fill="#e5f7ef" stroke="#1f9d6a" strokeWidth="2" />
            <circle cx="24" cy="24" r="12" fill="#fff" stroke="#1f9d6a" strokeWidth="2" />
            {t(24, 28, '20', 11, '#1f9d6a')}
          </>
        );
      case 'make10':
        return (
          <>
            <rect x="4" y="12" width="12" height="18" rx="3" fill="#fff" stroke="#f07a2a" strokeWidth="2" transform="rotate(-10 10 21)" />
            <rect x="18" y="10" width="12" height="18" rx="3" fill="#fff" stroke="#f07a2a" strokeWidth="2" />
            <rect x="32" y="12" width="12" height="18" rx="3" fill="#fff" stroke="#f07a2a" strokeWidth="2" transform="rotate(10 38 21)" />
            {t(10, 25, '3', 10)}
            {t(24, 23, '5', 10)}
            {t(38, 25, '2', 10)}
            {t(24, 44, '=10', 10, '#f07a2a')}
          </>
        );
      case 'kufuu':
        return (
          <>
            <rect x="4" y="8" width="18" height="14" rx="4" fill="#ffd34d" />
            <rect x="26" y="8" width="18" height="14" rx="4" fill="#8fd3ff" />
            {t(13, 19, '199', 8)}
            {t(35, 19, '48', 8)}
            <path d="M33 26 Q24 34 15 26" stroke="#f07a2a" strokeWidth="2.5" fill="none" />
            <path d="M15 26l1 5M15 26l5 1" stroke="#f07a2a" strokeWidth="2.5" />
            {t(24, 44, '200+47', 9)}
          </>
        );
      case 'balance':
        return (
          <>
            <path d="M24 8v30M14 42h20" stroke="#5b6b7d" strokeWidth="3" strokeLinecap="round" />
            <path d="M6 18 L42 14" stroke="#5b6b7d" strokeWidth="3" strokeLinecap="round" />
            <path d="M2 28 Q6 34 10 28 L6 18 Z" fill="#8fd3ff" />
            <path d="M38 24 Q42 30 46 24 L42 14 Z" fill="#ffc2a8" />
            <circle cx="24" cy="8" r="3" fill="#5b6b7d" />
          </>
        );
      case 'sequence':
        return (
          <>
            {[2, 4, 0, 8].map((n, i) => (
              <g key={i}>
                <rect x={2 + i * 11.5} y="16" width="10" height="14" rx="3" fill={n === 0 ? '#fff' : '#e6f1fc'} stroke="#2a7fd0" strokeWidth="1.5" strokeDasharray={n === 0 ? '2 2' : undefined} />
                {t(7 + i * 11.5, 27, n === 0 ? '?' : String(n), 9, '#2a7fd0')}
              </g>
            ))}
            <path d="M8 36 q4 4 10 0 M20 36 q4 4 10 0" stroke="#7a55c8" strokeWidth="2" fill="none" />
          </>
        );
      case 'machine':
        return (
          <>
            <rect x="10" y="12" width="28" height="24" rx="6" fill="#7a55c8" />
            <circle cx="19" cy="22" r="3" fill="#ffd34d" />
            <circle cx="29" cy="22" r="3" fill="#8fe0bd" />
            <rect x="16" y="28" width="16" height="4" rx="2" fill="#cbb8ef" />
            <path d="M2 24h8M38 24h8" stroke="#5b6b7d" strokeWidth="3" strokeLinecap="round" />
            {t(5, 18, '3', 8)}
            {t(43, 18, '8', 8)}
          </>
        );
      case 'flash':
        return (
          <>
            <rect x="8" y="8" width="32" height="28" rx="6" fill="#1b2838" />
            {t(24, 29, '7', 18, '#ffd34d')}
            <path d="M40 6l4-3M42 12l5 0M8 6L4 3" stroke="#f6c94b" strokeWidth="2.5" strokeLinecap="round" />
            {t(24, 46, '+ + +', 9, '#5b6b7d')}
          </>
        );
      case 'numberline':
        return (
          <>
            <path d="M4 30h40" stroke="#1b2838" strokeWidth="3" strokeLinecap="round" />
            {[6, 14, 22, 30, 38].map((x) => (
              <path key={x} d={`M${x} 26v8`} stroke="#1b2838" strokeWidth="2" />
            ))}
            <path d="M30 22 L26 14 h8 Z" fill="#f07a2a" />
            {t(6, 44, '0', 8)}
            {t(38, 44, '10', 8)}
          </>
        );
      case 'coins':
        return (
          <>
            <circle cx="16" cy="20" r="11" fill="#d9a441" stroke="#a87a22" strokeWidth="2" />
            <circle cx="16" cy="20" r="3" fill="#fff" />
            <circle cx="32" cy="28" r="12" fill="#c9cfd6" stroke="#8b95a1" strokeWidth="2" />
            {t(32, 32, '100', 8)}
            <circle cx="14" cy="38" r="8" fill="#c27a4a" stroke="#8c5430" strokeWidth="2" />
            {t(14, 41, '10', 7, '#fff')}
          </>
        );
      case 'shopping':
        return (
          <>
            <path d="M6 14h6l5 20h20l4-14H15" stroke="#1f9d6a" strokeWidth="3" fill="none" strokeLinejoin="round" />
            <circle cx="20" cy="40" r="3" fill="#1f9d6a" />
            <circle cx="34" cy="40" r="3" fill="#1f9d6a" />
            <circle cx="24" cy="14" r="6" fill="#ff6b6b" />
            <path d="M24 8 q2 -3 4 -2" stroke="#1f9d6a" strokeWidth="2" fill="none" />
          </>
        );
      case 'sudoku':
        return (
          <>
            <rect x="4" y="4" width="40" height="40" rx="4" fill="#fff" stroke="#1b2838" strokeWidth="2.5" />
            <path d="M24 4v40M4 24h40" stroke="#1b2838" strokeWidth="2.5" />
            <path d="M14 4v40M34 4v40M4 14h40M4 34h40" stroke="#9fb3c6" strokeWidth="1" />
            {t(9, 13, '1', 8)}
            {t(29, 13, '3', 8)}
            {t(19, 33, '4', 8)}
            {t(39, 43, '2', 8, '#2a7fd0')}
          </>
        );
      case 'maze':
        return (
          <>
            <rect x="4" y="4" width="40" height="40" rx="4" fill="#e5f7ef" />
            <path d="M10 10h14v14h14v14" stroke="#1f9d6a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="10" r="4" fill="#f07a2a" />
            <path d="M36 30v12M36 30l7 3-7 3" stroke="#c0392b" strokeWidth="2" fill="#ff6b6b" />
          </>
        );
      case 'shapes':
        return (
          <>
            <path d="M8 40 L8 20 L24 4 L40 20 L40 40 Z" fill="#dfe8f0" />
            <path d="M8 20 L24 4 L40 20 Z" fill="#ef7d57" />
            <rect x="8" y="20" width="32" height="20" fill="#4aa3df" />
            <path d="M24 20 L24 40" stroke="#fff" strokeWidth="2" />
          </>
        );
      case 'mirror':
        return (
          <>
            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2, 3].map((c) => {
                const on = [
                  [1, 0],
                  [0, 1],
                  [1, 1],
                  [0, 0],
                ][r][c < 2 ? c : 3 - c];
                return <rect key={`${r}-${c}`} x={4 + c * 10} y={4 + r * 10} width="9" height="9" rx="1.5" fill={on ? '#7a55c8' : '#eef1f6'} />;
              }),
            )}
            <path d="M24 2v44" stroke="#f07a2a" strokeWidth="2" strokeDasharray="3 2" />
          </>
        );
      case 'pattern':
        return (
          <>
            <path d="M6 30 L12 18 L18 30 Z" fill="#ef7d57" />
            <circle cx="24" cy="25" r="6" fill="#4aa3df" />
            <path d="M30 30 L36 18 L42 30 Z" fill="#ef7d57" />
            <rect x="14" y="34" width="20" height="12" rx="3" fill="#fff" stroke="#7a55c8" strokeWidth="2" strokeDasharray="3 2" />
            {t(24, 44, '?', 10, '#7a55c8')}
          </>
        );
      case 'missing-number':
        return (
          <>
            {t(9, 30, '4', 14)}
            {t(18, 30, '+', 12)}
            <rect x="22" y="18" width="12" height="16" rx="3" fill="#fff" stroke="#2a7fd0" strokeWidth="2" strokeDasharray="3 2" />
            {t(39, 30, '=', 12)}
            {t(24, 46, '7', 10, '#1f9d6a')}
            <path d="M28 8c-4 0-6 3-6 6M36 10c0 3-3 4-6 4" stroke="#7bbf5a" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        );
      case 'triangle-pattern':
        return (
          <>
            {[0, 1].map((r) =>
              [0, 1].map((c) => <rect key={`${r}${c}`} x={6 + c * 18} y={6 + r * 18} width="17" height="17" rx="2" fill="#fff" stroke="#9fb3c6" />),
            )}
            <path d="M6 6h17L6 23Z" fill="#4a7fd6" />
            <path d="M24 6h17v17Z" fill="#7a55c8" />
            <path d="M41 24v17H24Z" fill="#4a7fd6" />
            <rect x="6" y="24" width="17" height="17" fill="#ef7d57" />
          </>
        );
      case 'dot-connect':
        return (
          <>
            <path d="M10 38 L24 10 L38 38 Z M10 38 L38 24" stroke="#2a7fd0" strokeWidth="3" fill="none" strokeLinejoin="round" />
            {[10, 24, 38].map((y) => [10, 24, 38].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="3" fill="#1b2838" />))}
          </>
        );
      case 'symbol-memory':
        return (
          <>
            {[0, 1].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={5 + c * 20} y={5 + r * 20} width="18" height="18" rx="3" fill="#fdf6e3" stroke="#e2c98f" strokeWidth="1.5" />))}
            <circle cx="14" cy="14" r="6" fill="none" stroke="#e8504f" strokeWidth="2.5" />
            <path d="M28 8 L40 20 M40 8 L28 20" stroke="#1b2838" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M14 28 L21 41 H7 Z" fill="none" stroke="#2fa36b" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M34 26 L36.5 32 L43 32.3 L38 36.3 L39.7 42.5 L34 39 L28.3 42.5 L30 36.3 L25 32.3 L31.5 32 Z" fill="none" stroke="#c79a00" strokeWidth="2" strokeLinejoin="round" />
          </>
        );
      case 'nonogram':
        return (
          <>
            <rect x="4" y="4" width="40" height="40" rx="4" fill="#fff" stroke="#c6d6e4" />
            {['.#.#.', '#####', '#####', '.###.', '..#..'].flatMap((row, r) =>
              [...row].map((ch, c) => (ch === '#' ? <rect key={`${r}${c}`} x={9 + c * 6} y={13 + r * 6} width="5.4" height="5.4" fill="#1b2838" /> : null)),
            )}
            {t(20, 10, '1 1', 6, '#2a7fd0')}
            {t(6, 25, '5', 6, '#2a7fd0')}
          </>
        );
      case 'light-sequence':
        return (
          <>
            <rect x="4" y="4" width="19" height="19" rx="5" fill="#e8504f" stroke="#1b2838" strokeWidth="2" />
            <rect x="25" y="4" width="19" height="19" rx="5" fill="#d8e6f7" stroke="#3d7fd9" strokeWidth="2" />
            <rect x="4" y="25" width="19" height="19" rx="5" fill="#d7efe2" stroke="#2fa36b" strokeWidth="2" />
            <rect x="25" y="25" width="19" height="19" rx="5" fill="#fbefc4" stroke="#f2b705" strokeWidth="2" />
            {t(13.5, 18, '1', 11, '#fff')}
            <path d="M8 2 L4 -2 M13.5 1 V-3 M19 2 L23 -2" stroke="#f4b400" strokeWidth="2" transform="translate(0 4)" />
          </>
        );
      case 'net-quiz':
        return (
          <>
            {[
              [1, 0],
              [0, 1],
              [1, 1],
              [2, 1],
              [3, 1],
              [1, 2],
            ].map(([c, r]) => (
              <rect key={`${c}${r}`} x={4 + c * 10} y={9 + r * 10} width="10" height="10" fill={c === 1 && r === 1 ? '#ef7d57' : '#fdf6e3'} stroke="#1b2838" strokeWidth="1.5" />
            ))}
            <path d="M30 4 L40 4 L46 9 L36 9 Z" fill="#fdf6e3" stroke="#1b2838" strokeWidth="1.2" />
            <path d="M30 4 V14 L36 19 V9 Z" fill="#ef7d57" stroke="#1b2838" strokeWidth="1.2" />
            <path d="M36 9 H46 V19 H36 Z" fill="#e6eef6" stroke="#1b2838" strokeWidth="1.2" />
          </>
        );
      case 'shuffle-cups':
        return (
          <>
            <path d="M14 38 C14 30 22 30 22 38" fill="none" stroke="#2a7fd0" strokeWidth="2.5" strokeDasharray="3 3" />
            {[4, 18, 32].map((x, i) => (
              <path key={x} d={`M${x + 2} ${i === 1 ? 10 : 18} L${x + 10} ${i === 1 ? 10 : 18} L${x + 12} ${i === 1 ? 30 : 38} L${x} ${i === 1 ? 30 : 38} Z`} fill="#c0584c" stroke="#1b2838" strokeWidth="1.8" strokeLinejoin="round" />
            ))}
            <circle cx="24" cy="39" r="5" fill="#e8504f" stroke="#1b2838" strokeWidth="1.5" />
          </>
        );
      case 'clock-master':
        return (
          <>
            <circle cx="24" cy="24" r="19" fill="#fff" stroke="#1b2838" strokeWidth="3" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6;
              return <circle key={i} cx={24 + Math.sin(a) * 15} cy={24 - Math.cos(a) * 15} r={i % 3 === 0 ? 2 : 1.2} fill="#1b2838" />;
            })}
            <path d="M24 24 L24 13" stroke="#2a7fd0" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M24 24 L32 28" stroke="#c0392b" strokeWidth="4" strokeLinecap="round" />
            <circle cx="24" cy="24" r="2.5" fill="#1b2838" />
          </>
        );
      case 'number-hunt':
        return (
          <>
            {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={4 + c * 14} y={4 + r * 14} width="12" height="12" rx="3" fill={r === 1 && c === 2 ? '#ffe9a8' : '#f3f7fb'} stroke="#c6d6e4" />))}
            {t(10, 14, '7', 9)}
            {t(24, 14, '2', 9)}
            {t(38, 14, '9', 9)}
            {t(10, 28, '4', 9)}
            {t(24, 28, '1', 9)}
            {t(38, 28, '3', 9, '#d97706')}
            {t(10, 42, '6', 9)}
            {t(24, 42, '8', 9)}
            {t(38, 42, '5', 9)}
            <circle cx="37" cy="25" r="8" fill="none" stroke="#d97706" strokeWidth="2.2" />
          </>
        );
      case 'pizza-fractions':
        return (
          <>
            <circle cx="24" cy="24" r="20" fill="#d9a35b" stroke="#1b2838" strokeWidth="2" />
            <circle cx="24" cy="24" r="16" fill="#ffd66b" />
            <path d="M24 24 L24 8 A16 16 0 0 1 40 24 Z" fill="#ffb648" stroke="#e8504f" strokeWidth="2" transform="translate(2 -2)" />
            <path d="M24 8 V40 M8 24 H40" stroke="#b9772f" strokeWidth="1.6" />
            <circle cx="16" cy="17" r="3" fill="#d6463f" />
            <circle cx="17" cy="32" r="3" fill="#d6463f" />
            <circle cx="31" cy="32" r="3" fill="#d6463f" />
            <circle cx="33" cy="16" r="2.6" fill="#d6463f" />
          </>
        );
      case 'block-builder':
        return (
          <>
            <path d="M8 30 L20 24 L32 30 L20 36 Z" fill="#9fd3ff" stroke="#1b2838" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 30 V38 L20 44 V36 Z" fill="#5aa9e6" stroke="#1b2838" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M32 30 V38 L20 44 V36 Z" fill="#3b82c4" stroke="#1b2838" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M20 12 L32 6 L44 12 L32 18 Z" fill="#ffe28a" stroke="#1b2838" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M20 12 V30 L32 36 V18 Z" fill="#f2c230" stroke="#1b2838" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M44 12 V30 L32 36 V18 Z" fill="#c99a12" stroke="#1b2838" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M20 21 L32 27 L44 21" fill="none" stroke="#1b2838" strokeWidth="1" />
          </>
        );
      case 'number-detective':
        return (
          <>
            {[0, 1, 2].map((k) => (
              <rect key={k} x={4 + k * 12} y={8} width="10" height="13" rx="2.5" fill="#fff" stroke="#1b2838" strokeWidth="1.5" />
            ))}
            {t(9, 18, '?', 9, '#7c3aed')}
            {t(21, 18, '?', 9, '#7c3aed')}
            {t(33, 18, '?', 9, '#7c3aed')}
            <circle cx="22" cy="33" r="8" fill="#e0f2fe" stroke="#1b2838" strokeWidth="2.5" />
            <path d="M28 39 L37 46" stroke="#1b2838" strokeWidth="4" strokeLinecap="round" />
            <circle cx="40" cy="30" r="3.5" fill="#22c55e" stroke="#1b2838" strokeWidth="1.2" />
            <circle cx="40" cy="40" r="3.5" fill="#f59e0b" stroke="#1b2838" strokeWidth="1.2" />
          </>
        );
      case 'magic-square':
        return (
          <>
            {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={4 + c * 13} y={4 + r * 13} width="12" height="12" rx="2.5" fill={r === 1 && c === 1 ? '#ffe9a8' : '#f3f7fb'} stroke="#8fb3d9" />))}
            {t(10, 14, '2', 8)}
            {t(23, 14, '7', 8)}
            {t(36, 14, '6', 8)}
            {t(10, 27, '9', 8)}
            {t(23, 27, '5', 8, '#d97706')}
            {t(36, 27, '1', 8)}
            {t(10, 40, '4', 8)}
            {t(23, 40, '3', 8)}
            {t(36, 40, '8', 8)}
            <path d="M5 5 L42 42" stroke="#e8590c" strokeWidth="1.6" strokeDasharray="3 2" />
          </>
        );
      case 'vanishing-path':
        return (
          <>
            {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={5 + c * 13} y={5 + r * 13} width="12" height="12" rx="2" fill="#f3f7fb" stroke="#c6d6e4" />))}
            <path d="M11 11 H37 V24 H24 V37" fill="none" stroke="#2a7fd0" strokeWidth="3" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="11" cy="11" r="4" fill="#2fa36b" />
            <path d="M20 33 L28 33 L24 41 Z" fill="#f4b400" stroke="#1b2838" strokeWidth="1.2" />
          </>
        );
    }
  })();
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      {body}
    </svg>
  );
}
