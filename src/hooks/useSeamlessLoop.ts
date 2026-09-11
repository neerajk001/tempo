"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Gapless-feeling video loop. The native `loop` attribute performs a hard
 * cut back to 0 (visible stall + timeline jump), so instead we watch
 * playback position and, just before the end, dip opacity, seek to 0, and
 * fade back in. For ambient content this reads as continuous.
 *
 * Returns a ref + timeupdate handler to attach to the <video>, plus a
 * `fading` flag to drive an opacity transition (consumer owns classes).
 */
export function useSeamlessLoop(active: boolean, loop: boolean, tailSec = 0.4, fadeMs = 350) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleTimeUpdate = useCallback(() => {
    const el = ref.current;
    if (!el || !active || !loop || fading) return;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const tail = Math.min(tailSec, dur / 3);
    if (dur - el.currentTime <= tail) setFading(true);
  }, [active, loop, fading, tailSec]);

  useEffect(() => {
    if (!fading) return;
    const el = ref.current;
    if (el) {
      try {
        el.currentTime = 0;
      } catch {
        // Unseekable stream — just fade back in.
      }
      void el.play().catch(() => {});
    }
    timer.current = setTimeout(() => setFading(false), fadeMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fading, fadeMs]);

  return { ref, fading, handleTimeUpdate };
}
