/**
 * アプリの 版の 文字（ビルドの ときに vite.config.ts から つかう）。
 * package.json の version と、ビルドごとの ID をつなぐ：1.7.0+a1b2c3d
 * ID は BUILD_ID → GitHub Actions の commit（GITHUB_SHA の 先頭7桁）→ ビルドした 時刻 の じゅんで きめる。
 */
export function buildAppVersion(version: string, env: { BUILD_ID?: string; GITHUB_SHA?: string }, now: Date = new Date()): string {
  const id = env.BUILD_ID || (env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 7) : now.toISOString().replace(/[-:T]/g, '').slice(0, 12));
  return `${version}+${id}`;
}
