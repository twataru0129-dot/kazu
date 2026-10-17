import { useEffect, useState } from 'react';

/**
 * ハッシュ方式の小さなルーター。GitHub Pages のサブパスでもそのまま動き、
 * ブラウザの「戻る」と画面遷移が同期する。
 */
export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`;
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event('kazu:navigate'));
}

export function back(fallback = '/home') {
  if (window.history.length > 1 && (window.history.state as unknown) !== 'root') window.history.back();
  else navigate(fallback, { replace: true });
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    window.addEventListener('kazu:navigate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
      window.removeEventListener('kazu:navigate', on);
    };
  }, []);
  return path;
}

/** '/play/:id' のようなパターンに合えば params を返す */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
