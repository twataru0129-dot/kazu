/** 入力の正規化。全角数字・全角マイナスなどを半角へ。 */
export const MAX_INPUT_DIGITS = 6;

export function normalizeDigits(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s　,，]/g, '');
}

/** 数字だけからなる非負整数の文字列を整数にする。空・不正・桁あふれは null。 */
export function parseAnswer(raw: string): number | null {
  const s = normalizeDigits(raw);
  if (!/^\d+$/.test(s)) return null;
  if (s.length > MAX_INPUT_DIGITS) return null;
  return Number.parseInt(s, 10);
}

/** キー入力（物理キーボード・テンキー・全角含む）を 0〜9 の数字に変換。対象外は null。 */
export function keyToDigit(key: string): string | null {
  const k = normalizeDigits(key);
  return /^\d$/.test(k) ? k : null;
}

/** 入力欄へ1文字追加（先頭の不要な0を除き、最大桁で止める） */
export function appendDigit(current: string, digit: string, maxDigits = MAX_INPUT_DIGITS): string {
  if (!/^\d$/.test(digit)) return current;
  if (current === '0') return digit;
  if (current.length >= maxDigits) return current;
  return current + digit;
}
