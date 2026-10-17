/** おかいもの用の架空の商品イラスト */
export function ItemIcon({ icon, size = 48 }: { icon: string; size?: number }) {
  const body = (() => {
    switch (icon) {
      case 'apple':
        return (
          <>
            <circle cx="24" cy="28" r="15" fill="#ef4f4f" />
            <path d="M24 14 q2 -6 6 -7" stroke="#6b4a2a" strokeWidth="3" fill="none" />
            <ellipse cx="31" cy="11" rx="5" ry="3" fill="#5cc28b" />
          </>
        );
      case 'bread':
        return (
          <>
            <path d="M8 26 q0 -12 16 -12 q16 0 16 12 v12 h-32z" fill="#e3a65c" />
            <path d="M16 22 l4 6 M24 20 l4 6 M32 22 l-2 6" stroke="#b97a33" strokeWidth="2.5" strokeLinecap="round" />
          </>
        );
      case 'milk':
        return (
          <>
            <path d="M14 14 l4 -6 h12 l4 6 v28 h-20z" fill="#fff" stroke="#4aa3df" strokeWidth="2.5" />
            <rect x="14" y="24" width="20" height="10" fill="#4aa3df" />
          </>
        );
      case 'pencil':
        return (
          <>
            <rect x="10" y="20" width="24" height="9" fill="#f4c542" transform="rotate(-30 24 24)" />
            <path d="M33 13 l8 -3 -3 8z" fill="#e3a65c" transform="rotate(0)" />
          </>
        );
      case 'note':
        return (
          <>
            <rect x="12" y="8" width="24" height="32" rx="3" fill="#8fd3ff" stroke="#2a7fd0" strokeWidth="2" />
            <path d="M17 18h14M17 24h14M17 30h10" stroke="#fff" strokeWidth="2.5" />
          </>
        );
      case 'banana':
        return <path d="M10 14 q4 22 28 20 q-2 6 -10 6 q-20 -2 -20 -24z" fill="#f4d03f" stroke="#c9a400" strokeWidth="2" />;
      case 'cookie':
        return (
          <>
            <circle cx="24" cy="24" r="16" fill="#d9a066" />
            <circle cx="18" cy="20" r="2.5" fill="#5a3418" />
            <circle cx="28" cy="18" r="2.5" fill="#5a3418" />
            <circle cx="26" cy="29" r="2.5" fill="#5a3418" />
          </>
        );
      case 'riceball':
        return (
          <>
            <path d="M24 8 L42 38 H6 Z" fill="#fff" stroke="#c9d3dc" strokeWidth="2" strokeLinejoin="round" />
            <rect x="15" y="28" width="18" height="10" fill="#2c3e57" />
          </>
        );
      case 'eraser':
        return (
          <>
            <rect x="8" y="16" width="32" height="16" rx="3" fill="#fff" stroke="#9fb3c6" strokeWidth="2" />
            <rect x="8" y="16" width="14" height="16" rx="3" fill="#5cc28b" />
          </>
        );
      case 'juice':
        return (
          <>
            <path d="M14 14 h20 l-3 28 h-14z" fill="#ffb84d" stroke="#e08a00" strokeWidth="2" />
            <path d="M28 14 l4 -8" stroke="#ef4f4f" strokeWidth="3" strokeLinecap="round" />
          </>
        );
      default:
        return <rect x="10" y="10" width="28" height="28" rx="6" fill="#ccc" />;
    }
  })();
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      {body}
    </svg>
  );
}
