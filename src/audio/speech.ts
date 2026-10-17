/** 読み上げ（ブラウザに日本語音声がある場合のみ）。字幕は常に画面に出す。 */
let enabled = false;
export function setSpeechEnabled(on: boolean) {
  enabled = on;
  if (!on) stopSpeech();
}
export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text: string) {
  if (!enabled || !speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[□？]/g, 'なに'));
    u.lang = 'ja-JP';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* 読み上げできなくても続ける */
  }
}

export function stopSpeech() {
  if (speechAvailable()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}
