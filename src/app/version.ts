/** ビルド時に 入る 版（package.json の version ＋ ビルドID）。例 1.5.0+a1b2c3d */
export const APP_VERSION: string = __APP_VERSION__;

/** 画面に 出す 形：v1.5.0 + a1b2c3d */
export function formatVersion(v: string): string {
  const [ver, build] = v.split('+');
  return build ? `v${ver} + ${build}` : `v${ver}`;
}
