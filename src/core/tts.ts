export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function wpmToSpeechRate(wpm: number): number {
  return Math.max(0.5, Math.min(2.2, wpm / 220));
}

export function speakWord(text: string, wpm: number): void {
  if (!isTtsSupported()) return;

  const cleaned = text.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  if (!cleaned) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = wpmToSpeechRate(wpm);
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}
