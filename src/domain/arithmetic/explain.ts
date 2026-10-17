import type { ArithProblem } from './problems';

/**
 * 「ほかのかんがえかた」：ルールに基づいて作る別の計算方法の例。
 * その子が頭の中でどう考えたかは推測しない（「こんな方法もあるよ」として提示）。
 * 各ステップの計算は組み立て時に検算し、間違っていれば例外にする。
 */
export interface Explanation {
  id: string;
  title: string;
  steps: string[];
}

class Steps {
  lines: string[] = [];
  text(s: string) {
    this.lines.push(s);
    return this;
  }
  /** 式を検算して追加 */
  eq(left: number[], ops: ('+' | '−' | '×' | '÷')[], right: number, note = '') {
    let v = left[0];
    ops.forEach((op, i) => {
      const x = left[i + 1];
      if (op === '+') v += x;
      else if (op === '−') v -= x;
      else if (op === '×') v *= x;
      else {
        if (x === 0 || v % x !== 0) throw new Error('bad division in explanation');
        v /= x;
      }
    });
    if (v !== right) throw new Error(`explanation arithmetic error: ${left.join(',')} ${ops.join(',')} = ${right} (actual ${v})`);
    const expr = left.map((n, i) => (i === 0 ? `${n}` : ` ${ops[i - 1]} ${n}`)).join('');
    this.lines.push(`${expr} = ${right}${note ? `　${note}` : ''}`);
    return this;
  }
}

/** 数を位ごとに分ける 148 → [100, 40, 8]（0の位は省く） */
export function placeParts(n: number): number[] {
  const parts: number[] = [];
  const s = String(n);
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    if (d > 0) parts.push(d * 10 ** (s.length - 1 - i));
  }
  return parts.length ? parts : [0];
}

/** x を少し足すと 100 や 10 の倍数になるなら、その数と足りない量（1〜3）を返す */
function nearRound(x: number): { target: number; need: number } | null {
  for (const unit of [100, 10]) {
    const target = Math.ceil((x + 1) / unit) * unit;
    const need = target - x;
    if (need >= 1 && need <= 3 && x % unit !== 0) return { target, need };
  }
  return null;
}

function explainAdd(p: ArithProblem): Explanation[] {
  const { a, b, answer } = p;
  const out: Explanation[] = [];
  if (a >= 10 || b >= 10) {
    const s = new Steps();
    const pa = placeParts(a);
    const pb = placeParts(b);
    if (pa.length > 1) s.eq(pa, pa.slice(1).map(() => '+'), a);
    if (pb.length > 1) s.eq(pb, pb.slice(1).map(() => '+'), b);
    const places = Math.max(String(a).length, String(b).length);
    const sums: number[] = [];
    for (let k = places - 1; k >= 0; k--) {
      const unit = 10 ** k;
      const da = Math.floor(a / unit) % 10;
      const db = Math.floor(b / unit) % 10;
      if (da === 0 && db === 0) continue;
      if (da > 0 && db > 0) s.eq([da * unit, db * unit], ['+'], (da + db) * unit);
      sums.push((da + db) * unit);
    }
    if (sums.length > 1) s.eq(sums, sums.slice(1).map(() => '+'), answer);
    out.push({ id: 'place', title: 'くらいごとに わけて たす', steps: s.lines });
  }
  // きりのよい数をつくる（片方を 10・100 にして、もう片方から もらう）
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const r = nearRound(x);
    if (r && y > r.need) {
      const { target, need } = r;
      const s = new Steps();
      s.text(`${x} に ${need} を たすと ${target}`);
      s.eq([need, y - need], ['+'], y, `（${y} を ${need} と ${y - need} に わける）`);
      s.eq([x, need], ['+'], target);
      s.eq([target, y - need], ['+'], answer);
      out.push({ id: 'make-round', title: `${target} を つくる`, steps: s.lines });
      break;
    }
  }
  if (a < 10 && b < 10 && answer > 10 && b > 10 - a && out.length === 0) {
    const need = 10 - a;
    const s = new Steps();
    s.eq([need, b - need], ['+'], b);
    s.eq([a, need], ['+'], 10);
    s.eq([10, b - need], ['+'], answer);
    out.push({ id: 'make-ten', title: '10 を つくる', steps: s.lines });
  }
  if (a < 10 && b < 10) {
    const big = Math.max(a, b);
    const small = Math.min(a, b);
    const s = new Steps();
    s.text(`おおきい ${big} から、${small} こ かぞえる`);
    s.text(Array.from({ length: small }, (_, i) => big + i + 1).join(' → '));
    s.eq([big, small], ['+'], answer);
    out.push({ id: 'count-on', title: 'おおきい かずから かぞえる', steps: s.lines });
  }
  return out;
}

function explainSub(p: ArithProblem): Explanation[] {
  const { a, b, answer } = p;
  const out: Explanation[] = [];
  if (a >= 11 && a <= 18 && b <= 9 && a % 10 < b) {
    const ones = a - 10;
    const s1 = new Steps();
    s1.eq([10, ones], ['+'], a);
    s1.eq([10, b], ['−'], 10 - b);
    s1.eq([10 - b, ones], ['+'], answer);
    out.push({ id: 'from-ten', title: '10 から ひく', steps: s1.lines });
    const s2 = new Steps();
    s2.eq([ones, b - ones], ['+'], b);
    s2.eq([a, ones], ['−'], 10);
    s2.eq([10, b - ones], ['−'], answer);
    out.push({ id: 'two-steps', title: '2かいに わけて ひく', steps: s2.lines });
  }
  if (b >= 7 && !(a <= 18 && b <= 9)) {
    const r = nearRound(b);
    if (r && a >= r.target) {
      const { target, need: extra } = r;
      const s = new Steps();
      s.text(`${b} の かわりに ${target} を ひいて、ひきすぎた ${extra} を もどす`);
      s.eq([a, target], ['−'], a - target);
      s.eq([a - target, extra], ['+'], answer);
      out.push({ id: 'round-sub', title: `${target} を ひいて もどす`, steps: s.lines });
    }
  }
  if (a >= 10 && !p.carry) {
    const s = new Steps();
    const places = String(a).length;
    const parts: number[] = [];
    for (let k = places - 1; k >= 0; k--) {
      const unit = 10 ** k;
      const da = Math.floor(a / unit) % 10;
      const db = Math.floor(b / unit) % 10;
      if (db > 0) s.eq([da * unit, db * unit], ['−'], (da - db) * unit);
      if (da - db > 0) parts.push((da - db) * unit);
    }
    if (parts.length > 1) s.eq(parts, parts.slice(1).map(() => '+'), answer);
    if (s.lines.length > 0) out.push({ id: 'place', title: 'くらいごとに ひく', steps: s.lines });
  }
  const check = new Steps();
  check.eq([b, answer], ['+'], a, 'になるので あっている');
  out.push({ id: 'check-add', title: 'たしざんで たしかめる', steps: check.lines });
  return out;
}

function explainMul(p: ArithProblem): Explanation[] {
  const { a, b, answer } = p;
  const out: Explanation[] = [];
  if (a < 10) {
    if (b >= 2 && b <= 9) {
      const s = new Steps();
      s.text(`${a} × ${b} は「${a} が ${b} つぶん」`);
      const terms = Array.from({ length: b }, () => a);
      s.eq(terms, terms.slice(1).map(() => '+'), answer);
      out.push({ id: 'repeat-add', title: 'おなじ かずを たしていく', steps: s.lines });
    }
    if (b >= 2) {
      const s = new Steps();
      s.text(`かける かずが 1 ふえると、こたえは ${a} ふえる`);
      s.eq([a, b - 1], ['×'], a * (b - 1));
      s.eq([a * (b - 1), a], ['+'], answer);
      out.push({ id: 'step-up', title: 'ひとつ まえの だんから', steps: s.lines });
    }
  } else {
    const tens = Math.floor(a / 10) * 10;
    const ones = a % 10;
    const s = new Steps();
    if (ones > 0) s.eq([tens, ones], ['+'], a);
    s.eq([tens, b], ['×'], tens * b);
    if (ones > 0) {
      s.eq([ones, b], ['×'], ones * b);
      s.eq([tens * b, ones * b], ['+'], answer);
    }
    out.push({ id: 'split', title: '10の くらいと 1の くらいに わける', steps: s.lines });
  }
  return out;
}

function explainDiv(p: ArithProblem): Explanation[] {
  const { a, b, answer } = p;
  const out: Explanation[] = [];
  const s = new Steps();
  s.text(`${b} × □ = ${a} の □ を さがす`);
  s.eq([b, answer], ['×'], a);
  out.push({ id: 'inverse', title: 'かけざんで かんがえる', steps: s.lines });
  if (answer <= 9) {
    const r = new Steps();
    let v = a;
    while (v > 0) {
      r.eq([v, b], ['−'], v - b);
      v -= b;
    }
    r.text(`${b} を ${answer} かい ひけたので ${answer}`);
    out.push({ id: 'repeat-sub', title: 'おなじ かずずつ ひいていく', steps: r.lines });
  } else {
    const tq = Math.floor(answer / 10) * 10;
    const tPart = tq * b;
    const rest = a - tPart;
    const r = new Steps();
    if (rest > 0) r.eq([tPart, rest], ['+'], a);
    r.eq([tPart, b], ['÷'], tq);
    if (rest > 0) {
      r.eq([rest, b], ['÷'], rest / b);
      r.eq([tq, rest / b], ['+'], answer);
    }
    out.push({ id: 'split', title: 'わけて わる', steps: r.lines });
  }
  return out;
}

export function explain(p: ArithProblem): Explanation[] {
  switch (p.op) {
    case 'add':
      return explainAdd(p);
    case 'subtract':
      return explainSub(p);
    case 'multiply':
      return explainMul(p);
    case 'divide':
      return explainDiv(p);
  }
}

/** 計算モードの3段階ヒント（答えそのものは出さない） */
export function arithHints(p: ArithProblem): [string, string, string] {
  const { a, b } = p;
  switch (p.op) {
    case 'add': {
      if (a < 10 && b < 10) {
        return a + b >= 10
          ? [`${a} は あと いくつで 10 に なるかな？`, `${a} + ${10 - a} = 10`, `${b} を ${10 - a} と ${b - (10 - a)} に わけてみよう`]
          : [`${a} から ${b} こ かぞえてみよう`, `ゆびを つかっても いいよ`, `${a} の つぎから ${b} かい すすもう`];
      }
      const pa = placeParts(a);
      return [`${a} を ${pa.join(' + ')} に わけてみよう`, `おなじ くらいどうしを たそう`, `${pa[0]} + ${placeParts(b)[0]} から はじめよう`];
    }
    case 'subtract': {
      if (a >= 11 && a <= 18 && b <= 9) {
        return [`${a} は 10 と ${a - 10}`, `10 − ${b} を さきに けいさんしよう`, `10 − ${b} = ${10 - b}。それに ${a - 10} を たそう`];
      }
      return [`${b} + □ = ${a} と かんがえても いいよ`, `おおきい くらいから ひいてみよう`, `${placeParts(a)[0]} − ${placeParts(b)[0]} から はじめよう`];
    }
    case 'multiply':
      return a < 10
        ? [`${a} が ${b} つぶん だよ`, `${a} を ${b} かい たしてみよう`, `${a} × ${Math.max(b - 1, 0)} = ${a * Math.max(b - 1, 0)}。そこに ${a} を たすと？`]
        : [`${a} を ${Math.floor(a / 10) * 10} と ${a % 10} に わけよう`, `${Math.floor(a / 10) * 10} × ${b} = ${Math.floor(a / 10) * 10 * b}`, `${a % 10} × ${b} も けいさんして たそう`];
    case 'divide':
      return [`${b} × □ = ${a} の □ は？`, `${b} の だんの くくを おもいだそう`, `${a} から ${b} ずつ ひいて、なんかい ひけるか かぞえよう`];
  }
}
