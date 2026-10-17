/**
 * 式（2 × 3 = 6 など）の中の空白を「改行しない空白」にして、式の途中で改行されないようにする。
 * わかち書きの語の区切り（ふつうの空白）はそのまま。
 */
const MATH = '0-9０-９×÷+＋−\\-=＝□?？';
const RE = new RegExp(`([${MATH}]) (?=[${MATH}])`, 'g');

export function keepMath(text: string): string {
  let prev = '';
  let cur = text;
  // 「2 × 3 = 6」のように続く場合は くりかえし置きかえる
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(RE, '$1 ');
  }
  return cur;
}
