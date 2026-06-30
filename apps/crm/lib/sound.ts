"use client";

/**
 * Campanita de notificación sintetizada con Web Audio API.
 * Sin archivos externos ni licencias: dos notas suaves tipo "ding-dong",
 * con envolvente cálida y volumen bajo para que no canse.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(
  audio: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peak: number,
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  // Envolvente suave: ataque corto, decay largo (campanita).
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration);
}

/**
 * Reproduce la campanita. Debe llamarse tras alguna interacción del usuario
 * (políticas de autoplay); si el contexto está suspendido intenta reanudarlo.
 */
export function playAttentionChime() {
  const audio = getCtx();
  if (!audio) return;

  const run = () => {
    const now = audio.currentTime + 0.01;
    // "Ding-dong" tierno: dos notas (C6 -> G5) suaves y separadas.
    tone(audio, 1046.5, now, 0.5, 0.14); // C6
    tone(audio, 783.99, now + 0.18, 0.7, 0.12); // G5
  };

  if (audio.state === "suspended") {
    audio.resume().then(run).catch(() => {});
  } else {
    run();
  }
}
