// Web Audio API utility for beep sounds
// AudioContext is lazily created on first use to avoid browser warnings

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(frequency: number, type: OscillatorType, duration: number, volume: number = 0.1) {
  const ctx = getAudioContext();

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  // Envelope to avoid clicking
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
  gainNode.gain.setValueAtTime(volume, ctx.currentTime + duration - 0.05);
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

export function playSuccessSound() {
  // A pleasant short beep (high pitch, sine wave)
  playTone(880, 'sine', 0.15, 0.2); // A5
  setTimeout(() => playTone(1108.73, 'sine', 0.2, 0.2), 150); // C#6
}

export function playErrorSound() {
  // A harsh low beep (sawtooth or square)
  playTone(300, 'square', 0.4, 0.1);
  setTimeout(() => playTone(250, 'square', 0.4, 0.1), 200);
}
