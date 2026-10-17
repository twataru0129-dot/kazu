/**
 * 効果音はファイルを使わず Web Audio で短く合成する（権利の問題がない・オフラインで鳴る）。
 * 音が出ない端末でも操作には影響しない。
 */
export type Sfx = 'tap' | 'correct' | 'complete' | 'soft' | 'move';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + start);
  o.stop(ac.currentTime + start + dur + 0.02);
}

export function play(s: Sfx) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  try {
    switch (s) {
      case 'tap':
        tone(ac, 660, 0, 0.06, 'triangle', 0.08);
        break;
      case 'move':
        tone(ac, 520, 0, 0.08, 'triangle', 0.1);
        break;
      case 'correct':
        tone(ac, 784, 0, 0.12);
        tone(ac, 1175, 0.09, 0.22);
        break;
      case 'complete':
        tone(ac, 659, 0, 0.12);
        tone(ac, 784, 0.1, 0.12);
        tone(ac, 1047, 0.2, 0.3);
        break;
      case 'soft':
        // まちがいでも責めない、やわらかい音
        tone(ac, 392, 0, 0.12, 'sine', 0.06);
        break;
    }
  } catch {
    /* 音が出なくても続ける */
  }
}
