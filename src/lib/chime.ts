"use client";

import type { ChimeTheme } from "@/stores/prefs-store";

/** Tiny completion chime (WebAudio, no assets). Frequency profile per theme. */
export function playChime(theme: ChimeTheme = "chime"): boolean {
  try {
    if (typeof window === "undefined" || theme === "muted") return false;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    const notes: Record<Exclude<ChimeTheme, "muted">, number[]> = {
      chime: [880, 1318.5],
      marimba: [523.25, 783.99, 1046.5],
      bell: [1567.98, 1174.66],
    };
    const seq = notes[theme];
    seq.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
    setTimeout(() => void ctx.close().catch(() => {}), seq.length * 160 + 700);
    return true;
  } catch {
    return false;
  }
}
