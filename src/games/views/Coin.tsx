import type { CoinValue } from '../../domain/games/coins';

/**
 * 教育用に簡略化した硬貨のイラスト（実物の図柄は使わない）。
 * 大きさ・色・穴の有無で区別し、額面の数字を大きく表示する。
 */
const SPEC: Record<CoinValue, { r: number; fill: string; edge: string; text: string; hole: boolean }> = {
  1: { r: 30, fill: '#eef1f4', edge: '#aab4bf', text: '#56606b', hole: false },
  5: { r: 32, fill: '#e9c45a', edge: '#b38b22', text: '#5f4706', hole: true },
  10: { r: 34, fill: '#c98652', edge: '#8c5430', text: '#ffffff', hole: false },
  50: { r: 31, fill: '#d6dbe0', edge: '#8b95a1', text: '#36404a', hole: true },
  100: { r: 33, fill: '#cfd5db', edge: '#7f8a96', text: '#2c3640', hole: false },
  500: { r: 38, fill: '#e2bf5b', edge: '#a07c1c', text: '#4d3a04', hole: false },
};

export function Coin({ value, size = 64 }: { value: CoinValue; size?: number }) {
  const s = SPEC[value];
  const scale = s.r / 38;
  return (
    <svg viewBox="0 0 80 80" width={size * scale} height={size * scale} role="img" aria-label={`${value}えんだま`} style={{ overflow: 'visible' }}>
      <circle cx="40" cy="40" r="38" fill={s.fill} stroke={s.edge} strokeWidth="4" />
      <circle cx="40" cy="40" r="31" fill="none" stroke={s.edge} strokeWidth="1.5" opacity=".5" />
      {s.hole ? (
        <>
          <circle cx="40" cy="40" r="9" fill="#ffffff" stroke={s.edge} strokeWidth="2" />
          <text x="40" y="24" textAnchor="middle" fontSize="17" fontWeight="900" fill={s.text}>
            {value}
          </text>
        </>
      ) : (
        <text x="40" y={value >= 100 ? 49 : 51} textAnchor="middle" fontSize={value >= 100 ? 26 : 30} fontWeight="900" fill={s.text}>
          {value}
        </text>
      )}
    </svg>
  );
}
