import type { AvatarId } from '../persistence/types';

/** プロフィール用のオリジナル動物アイコン（シンプルなフラットデザイン） */
export const AVATAR_LABEL: Record<AvatarId, string> = {
  fox: 'きつね',
  cat: 'ねこ',
  panda: 'パンダ',
  rabbit: 'うさぎ',
  lion: 'ライオン',
  penguin: 'ペンギン',
};

const BG: Record<AvatarId, string> = {
  fox: '#ffe7d1',
  cat: '#e6ecf5',
  panda: '#e3f3e6',
  rabbit: '#fde8f0',
  lion: '#fff1c9',
  penguin: '#dcefff',
};

function Face({ id }: { id: AvatarId }) {
  const eye = (cx: number, cy: number) => (
    <g>
      <circle cx={cx} cy={cy} r="4.2" fill="#1b2838" />
      <circle cx={cx + 1.4} cy={cy - 1.4} r="1.3" fill="#fff" />
    </g>
  );
  switch (id) {
    case 'fox':
      return (
        <g>
          <path d="M22 26 L36 48 L26 54 Z" fill="#e8742c" />
          <path d="M78 26 L64 48 L74 54 Z" fill="#e8742c" />
          <path d="M26 31 L33 46 L28 49 Z" fill="#4a2a1a" opacity=".35" />
          <path d="M74 31 L67 46 L72 49 Z" fill="#4a2a1a" opacity=".35" />
          <path d="M20 50 Q50 28 80 50 Q76 76 50 84 Q24 76 20 50 Z" fill="#f08a3c" />
          <path d="M30 60 Q40 62 50 74 Q60 62 70 60 Q66 78 50 84 Q34 78 30 60 Z" fill="#fff8f0" />
          {eye(38, 56)}
          {eye(62, 56)}
          <ellipse cx="50" cy="72" rx="4" ry="3" fill="#1b2838" />
        </g>
      );
    case 'cat':
      return (
        <g>
          <path d="M24 30 L40 42 L26 54 Z" fill="#8f9bb0" />
          <path d="M76 30 L60 42 L74 54 Z" fill="#8f9bb0" />
          <path d="M28 36 L36 43 L29 49 Z" fill="#f7b6c6" />
          <path d="M72 36 L64 43 L71 49 Z" fill="#f7b6c6" />
          <circle cx="50" cy="58" r="28" fill="#a7b3c6" />
          <path d="M44 34 Q50 40 56 34" stroke="#7f8ba0" strokeWidth="3" fill="none" />
          {eye(39, 56)}
          {eye(61, 56)}
          <path d="M47 66 L53 66 L50 70 Z" fill="#e97a92" />
          <path d="M50 70 Q46 75 42 72 M50 70 Q54 75 58 72" stroke="#1b2838" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M22 64 L36 66 M22 71 L36 69 M78 64 L64 66 M78 71 L64 69" stroke="#56627a" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'panda':
      return (
        <g>
          <circle cx="28" cy="34" r="10" fill="#26303b" />
          <circle cx="72" cy="34" r="10" fill="#26303b" />
          <circle cx="50" cy="57" r="29" fill="#ffffff" stroke="#d9e2ea" strokeWidth="2" />
          <ellipse cx="38" cy="55" rx="8" ry="10" transform="rotate(-25 38 55)" fill="#26303b" />
          <ellipse cx="62" cy="55" rx="8" ry="10" transform="rotate(25 62 55)" fill="#26303b" />
          <circle cx="39" cy="54" r="3" fill="#fff" />
          <circle cx="61" cy="54" r="3" fill="#fff" />
          <ellipse cx="50" cy="68" rx="5" ry="3.5" fill="#26303b" />
          <path d="M50 71 Q46 76 43 73 M50 71 Q54 76 57 73" stroke="#26303b" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'rabbit':
      return (
        <g>
          <ellipse cx="38" cy="26" rx="8" ry="20" fill="#ffffff" stroke="#ead6de" strokeWidth="2" />
          <ellipse cx="62" cy="26" rx="8" ry="20" fill="#ffffff" stroke="#ead6de" strokeWidth="2" />
          <ellipse cx="38" cy="27" rx="4" ry="14" fill="#f7b6c6" />
          <ellipse cx="62" cy="27" rx="4" ry="14" fill="#f7b6c6" />
          <circle cx="50" cy="60" r="27" fill="#ffffff" stroke="#ead6de" strokeWidth="2" />
          {eye(40, 58)}
          {eye(60, 58)}
          <circle cx="33" cy="68" r="5" fill="#fbd0dc" />
          <circle cx="67" cy="68" r="5" fill="#fbd0dc" />
          <path d="M47 67 L53 67 L50 70 Z" fill="#e97a92" />
          <path d="M50 70 L50 74 M50 74 Q46 77 44 75 M50 74 Q54 77 56 75" stroke="#1b2838" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'lion':
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={50 + Math.cos(a) * 28} cy={56 + Math.sin(a) * 28} r="12" fill="#d9822b" />;
          })}
          <circle cx="50" cy="56" r="28" fill="#c96f1d" />
          <circle cx="50" cy="58" r="22" fill="#f6c453" />
          <circle cx="32" cy="38" r="6" fill="#f6c453" />
          <circle cx="68" cy="38" r="6" fill="#f6c453" />
          {eye(42, 55)}
          {eye(58, 55)}
          <path d="M45 64 L55 64 L50 69 Z" fill="#6b3a12" />
          <path d="M50 69 Q46 74 42 71 M50 69 Q54 74 58 71" stroke="#6b3a12" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'penguin':
      return (
        <g>
          <ellipse cx="50" cy="58" rx="30" ry="30" fill="#2c3e57" />
          <path d="M28 60 Q30 38 44 40 Q50 46 56 40 Q70 38 72 60 Q70 82 50 84 Q30 82 28 60 Z" fill="#ffffff" />
          {eye(41, 55)}
          {eye(59, 55)}
          <path d="M43 64 L57 64 L50 72 Z" fill="#f6a723" />
          <circle cx="34" cy="68" r="4.5" fill="#ffd0d8" />
          <circle cx="66" cy="68" r="4.5" fill="#ffd0d8" />
        </g>
      );
  }
}

export function Avatar({ id, size = 56 }: { id: AvatarId; size?: number }) {
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={AVATAR_LABEL[id]}>
      <circle cx="50" cy="50" r="50" fill={BG[id]} />
      <Face id={id} />
    </svg>
  );
}
