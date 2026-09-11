"use client";

/**
 * Tiny ambient player (WebAudio, no assets).
 * Created lazily on user gesture to satisfy autoplay policies.
 * Kinds: brown noise (focus) and filtered rain texture (break).
 */
let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let playing = false;
let currentKind: AmbientKind = "brown";

export type AmbientKind = "brown" | "rain";

function makeBrownNoiseBuffer(context: AudioContext, seconds = 4): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, rate * seconds, rate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export function isAmbientPlaying(): boolean {
  return playing;
}

export function currentAmbientKind(): AmbientKind {
  return currentKind;
}

function connectRain(context: AudioContext, src: AudioBufferSourceNode): void {
  // Rain-ish wash: looped white noise through a lowpass + slow swell LFO.
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const gain = context.createGain();
  gain.gain.value = 0.35;
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 0.12;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  src.start();
  lfo.start();
  src.onended = () => {
    try {
      lfo.stop();
    } catch {
      // Already stopped.
    }
  };
}

function whiteBuffer(context: AudioContext, seconds = 4): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Toggle playback. Returns the new state. No-op (false) outside the browser. */
export function toggleAmbient(kind: AmbientKind = "brown"): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (playing && currentKind !== kind) stopAmbient();
    if (playing) {
      stopAmbient();
      return false;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    source = ctx.createBufferSource();
    source.loop = true;
    if (kind === "rain") {
      source.buffer = whiteBuffer(ctx);
      connectRain(ctx, source);
    } else {
      source.buffer = makeBrownNoiseBuffer(ctx);
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    }
    currentKind = kind;
    playing = true;
    return true;
  } catch {
    return false;
  }
}

export function stopAmbient(): void {
  try {
    source?.stop();
  } catch {
    // Already stopped.
  }
  source = null;
  playing = false;
}
