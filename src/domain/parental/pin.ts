/**
 * 保護者の暗証番号（4桁）。
 * PIN そのものは保存しない。ランダムな salt と PBKDF2-SHA256 で作った検証用データだけを保存する。
 * 家庭内の簡易的な保護であり、端末の OS を守るものではない。
 */
export interface PinRecord {
  algo: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // base64
  hash: string; // base64
}

export const PIN_LENGTH = 4;
export const PIN_ITERATIONS = 100_000;

/** 4桁の半角数字だけ（0000 も含めて 10000 通りすべて使える） */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/** 推測されやすい番号（注意を出すだけで、使うことはできる） */
export function isWeakPin(pin: string): boolean {
  if (!isValidPin(pin)) return false;
  if (/^(\d)\1{3}$/.test(pin)) return true; // 0000, 1111 …
  const d = pin.split('').map(Number);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  if (up || down) return true; // 1234, 4321 …
  return ['1212', '0101', '1122', '2580', '0852'].includes(pin);
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return b64(bits);
}

export async function createPinRecord(pin: string, iterations = PIN_ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error('invalid pin');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { algo: 'PBKDF2-SHA256', iterations, salt: b64(salt), hash: await derive(pin, salt, iterations) };
}

/** 長さを一定にして比べる（途中で抜けない） */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  if (!isValidPin(pin) || rec.algo !== 'PBKDF2-SHA256') return false;
  return sameString(await derive(pin, unb64(rec.salt), rec.iterations), rec.hash);
}

/** 連続でまちがえたときの待ち時間：5回目から 30秒・1分・2分…（最大10分） */
export const FREE_ATTEMPTS = 5;
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(10 * 60_000, 30_000 * 2 ** (failures - FREE_ATTEMPTS));
}
