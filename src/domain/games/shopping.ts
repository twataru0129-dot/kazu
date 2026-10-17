import type { Difficulty } from '../types';
import { sum, type GameLogic } from './types';

/** 11 おかいものゲーム（架空の商品と価格） */
export interface ShopItem {
  id: string;
  name: string;
  icon: string; // アイコンID
  price: number;
}

export interface ShoppingPuzzle {
  items: ShopItem[]; // 店に並ぶ商品
  order: { itemId: string; qty: number }[]; // 買うもの（メモ）
  mode: 'total' | 'change';
  pay?: number;
}

export interface ShoppingAnswer {
  basket: Record<string, number>;
  value: number | null;
}

export const CATALOG: { name: string; icon: string }[] = [
  { name: 'りんご', icon: 'apple' },
  { name: 'パン', icon: 'bread' },
  { name: 'ぎゅうにゅう', icon: 'milk' },
  { name: 'えんぴつ', icon: 'pencil' },
  { name: 'ノート', icon: 'note' },
  { name: 'バナナ', icon: 'banana' },
  { name: 'クッキー', icon: 'cookie' },
  { name: 'おにぎり', icon: 'riceball' },
  { name: 'けしゴム', icon: 'eraser' },
  { name: 'ジュース', icon: 'juice' },
];

const RULES: Record<Difficulty, { kinds: number; unit: number; pMax: number; qty: boolean; change: boolean; shelf: number }> = {
  easy: { kinds: 2, unit: 10, pMax: 100, qty: false, change: false, shelf: 4 },
  normal: { kinds: 3, unit: 10, pMax: 200, qty: false, change: false, shelf: 5 },
  hard: { kinds: 4, unit: 1, pMax: 300, qty: false, change: false, shelf: 6 },
  challenge: { kinds: 3, unit: 1, pMax: 250, qty: true, change: true, shelf: 6 },
};

export const orderTotal = (p: ShoppingPuzzle) => sum(p.order.map((o) => p.items.find((i) => i.id === o.itemId)!.price * o.qty));
export const expectedValue = (p: ShoppingPuzzle) => (p.mode === 'change' ? p.pay! - orderTotal(p) : orderTotal(p));

export function basketMatches(p: ShoppingPuzzle, basket: Record<string, number>): boolean {
  const want = new Map(p.order.map((o) => [o.itemId, o.qty]));
  const keys = Object.keys(basket).filter((k) => basket[k] > 0);
  return keys.length === want.size && keys.every((k) => want.get(k) === basket[k]);
}

export const shopping: GameLogic<ShoppingPuzzle, ShoppingAnswer> = {
  id: 'shopping',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const shelf = rng.shuffle(CATALOG).slice(0, r.shelf);
    const items = shelf.map((c, i) => {
      const price = r.unit === 10 ? rng.int(1, r.pMax / 10) * 10 : rng.int(11, r.pMax);
      return { id: `i${i}`, name: c.name, icon: c.icon, price };
    });
    const chosen = rng.shuffle(items).slice(0, r.kinds);
    const order = chosen.map((it) => ({ itemId: it.id, qty: r.qty ? rng.int(1, 3) : 1 }));
    const p: ShoppingPuzzle = { items, order, mode: r.change ? 'change' : 'total' };
    if (r.change) {
      const total = orderTotal(p);
      p.pay = total < 500 ? 500 : total < 1000 ? 1000 : undefined;
      if (!p.pay) return null;
    }
    return p;
  },
  validate(p, d) {
    const r = RULES[d];
    if (p.order.length !== r.kinds) return 'kinds';
    if (p.items.some((i) => !Number.isInteger(i.price) || i.price <= 0)) return 'price';
    if (new Set(p.items.map((i) => i.name)).size !== p.items.length) return 'duplicate name';
    if (p.order.some((o) => !p.items.some((i) => i.id === o.itemId) || o.qty < 1)) return 'order';
    if (new Set(p.order.map((o) => o.itemId)).size !== p.order.length) return 'duplicate order';
    if (p.mode === 'change' && (p.pay === undefined || p.pay < orderTotal(p))) return 'pay';
    if (r.unit === 10 && p.items.some((i) => i.price % 10 !== 0)) return 'unit';
    return null;
  },
  fallback(d) {
    const r = RULES[d];
    const prices = [120, 80, 50, 30, 150, 99];
    const items = CATALOG.slice(0, r.shelf).map((c, i) => ({ id: `i${i}`, name: c.name, icon: c.icon, price: prices[i] }));
    const order = items.slice(0, r.kinds).map((it, i) => ({ itemId: it.id, qty: r.qty ? (i % 2) + 1 : 1 }));
    const p: ShoppingPuzzle = { items, order, mode: r.change ? 'change' : 'total' };
    if (r.change) p.pay = orderTotal(p) <= 500 ? 500 : 1000;
    return [p];
  },
  judge(p, a) {
    if (!basketMatches(p, a.basket)) return { correct: false, message: 'メモと おなじ ものを かごに いれよう' };
    if (a.value === null) return { correct: false, message: 'きんがくを いれてね' };
    if (a.value === expectedValue(p)) return { correct: true };
    return { correct: false, message: p.mode === 'change' ? 'ごうけいを だしてから、はらう おかねから ひこう' : 'ひとつずつ たしてみよう' };
  },
  hints(p) {
    const lines = p.order.map((o) => {
      const it = p.items.find((i) => i.id === o.itemId)!;
      return { it, qty: o.qty, sub: it.price * o.qty };
    });
    const [x, y] = lines;
    const h1 = lines.some((l) => l.qty > 1) ? `${lines.find((l) => l.qty > 1)!.it.name}は ${lines.find((l) => l.qty > 1)!.qty}こ だから かけざんで` : `${x.it.name}と ${y.it.name}を さきに たそう`;
    const h2 = `${x.it.name}${x.qty > 1 ? `×${x.qty}` : ''} + ${y.it.name}${y.qty > 1 ? `×${y.qty}` : ''} = ${x.sub + y.sub}えん`;
    const h3 = p.mode === 'change' ? `${p.pay}えん − ごうけい = おつり` : lines.length > 2 ? `${x.sub + y.sub} に のこりの ねだんを たそう` : `${x.sub} + ${y.sub} を けいさんしよう`;
    return [h1, h2, h3];
  },
  key: (p) => p.order.map((o) => `${p.items.find((i) => i.id === o.itemId)!.price}x${o.qty}`).join('+') + `/${p.mode}`,
};
