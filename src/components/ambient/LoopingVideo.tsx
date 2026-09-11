"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

interface LoopingVideoProps {
  src: string;
  poster?: string;
  playing: boolean;
  muted: boolean;
  volume: number;
  loop: boolean;
  fadeMs?: number;
  /** Sizing for the root box. */
  className?: string;
  /** Sizing for the in-flow (front) video element. */
  videoClassName?: string;
  /** Dim the picture (ambient background use). */
  dimmed?: boolean;
  /** Tap the picture to toggle play/pause. */
  onToggle?: () => void;
  /** Big center play button while paused. */
  playOverlay?: boolean;
  /** PiP + fullscreen buttons. */
  chrome?: boolean;
  onEnded?: () => void;
  onError?: () => void;
  onPlayFail?: () => void;
}

/**
 * Chromeless looping video: no timeline, no duration, no native bar.
 * Loops by crossfading two players at the boundary, so there is no stop,
 * no black flash, and no timeline jump — the picture simply continues.
 */
export default function LoopingVideo({
  src,
  poster,
  playing,
  muted,
  volume,
  loop,
  fadeMs = 600,
  className = "w-full h-full",
  videoClassName = "w-full h-full object-cover",
  dimmed = false,
  onToggle,
  playOverlay = false,
  chrome = false,
  onEnded,
  onError,
  onPlayFail,
}: LoopingVideoProps) {
  const aRef = useRef<HTMLVideoElement | null>(null);
  const bRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [front, setFront] = useState<0 | 1>(0);
  const frontRef = useRef<0 | 1>(0);
  const busyRef = useRef(false);
  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pip, setPip] = useState(false);
  const [fs, setFs] = useState(false);
  const [pipOk, setPipOk] = useState(false);
  const failRef = useRef(onPlayFail);
  failRef.current = onPlayFail;
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  useEffect(() => {
    try {
      const v = document.createElement("video");
      setPipOk(!!document.pictureInPictureEnabled || "webkitSupportsPresentationMode" in v);
    } catch {
      setPipOk(false);
    }
    const onPip = () => {
      try {
        setPip(!!document.pictureInPictureElement);
      } catch {
        setPip(false);
      }
    };
    const onFs = () => {
      try {
        setFs(!!document.fullscreenElement);
      } catch {
        setFs(false);
      }
    };
    document.addEventListener("enterpictureinpicture", onPip);
    document.addEventListener("leavepictureinpicture", onPip);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("enterpictureinpicture", onPip);
      document.removeEventListener("leavepictureinpicture", onPip);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  // Single driver: keep sources, audibility, and desired playback in sync.
  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    let srcChanged = false;
    for (const el of [a, b]) {
      if (el.getAttribute("src") !== src) {
        el.setAttribute("src", src);
        srcChanged = true;
      }
    }
    if (srcChanged) {
      genRef.current += 1;
      busyRef.current = false;
      frontRef.current = 0;
      setFront(0);
      b.pause();
      try {
        b.currentTime = 0;
      } catch {
        // Not seekable yet.
      }
    }
    const f = frontRef.current === 0 ? a : b;
    const o = frontRef.current === 0 ? b : a;
    f.muted = muted;
    f.volume = volume;
    o.muted = true;
    if (playing) {
      const p = f.play();
      if (p && typeof p.catch === "function") p.catch(() => failRef.current?.());
    } else {
      f.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playing, front, muted, volume]);

  const beginSwap = (current: HTMLVideoElement) => {
    const nf = (frontRef.current === 0 ? 1 : 0) as 0 | 1;
    const next = nf === 0 ? aRef.current : bRef.current;
    if (!next) return;
    try {
      next.currentTime = 0;
    } catch {
      // Will play from wherever it can.
    }
    next.muted = true;
    void next.play().catch(() => {});
    const gen = ++genRef.current;
    busyRef.current = true;
    frontRef.current = nf;
    setFront(nf);
    timerRef.current = setTimeout(() => {
      if (genRef.current !== gen) return;
      current.muted = true;
      current.pause();
      try {
        current.currentTime = 0;
      } catch {
        // Best effort pre-seek for the next cycle.
      }
      busyRef.current = false;
    }, fadeMs);
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!loop || busyRef.current) return;
    try {
      // PiP captures a single element — never swap underneath it.
      if (document.pictureInPictureElement) return;
    } catch {
      return;
    }
    const el = e.currentTarget;
    const isFront = (frontRef.current === 0 ? aRef.current : bRef.current) === el;
    if (!isFront) return;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const tail = Math.min(fadeMs / 1000 + 0.25, dur / 3);
    if (dur - el.currentTime <= tail) beginSwap(el);
  };

  const handleEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    const isFront = (frontRef.current === 0 ? aRef.current : bRef.current) === el;
    if (!isFront) return;
    if (loop) {
      // Fallback path (e.g. PiP active skipped the crossfade): hard restart.
      try {
        el.currentTime = 0;
      } catch {
        // Ignore.
      }
      if (playing) void el.play().catch(() => {});
      return;
    }
    endedRef.current?.();
  };

  const togglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      const el = frontRef.current === 0 ? aRef.current : bRef.current;
      if (!el) return;
      const anyEl = el as HTMLVideoElement & {
        webkitSetPresentationMode?: (mode: string) => void;
      };
      if (document.pictureInPictureEnabled) await el.requestPictureInPicture();
      else if (anyEl.webkitSetPresentationMode) anyEl.webkitSetPresentationMode("picture-in-picture");
    } catch {
      // Unsupported — button stays hidden on most such browsers anyway.
    }
  };

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const wrap = wrapRef.current;
      if (wrap?.requestFullscreen) {
        await wrap.requestFullscreen();
        return;
      }
      const el = frontRef.current === 0 ? aRef.current : bRef.current;
      const anyEl = el as (HTMLVideoElement & {
        webkitEnterFullscreen?: () => void;
      }) | null;
      anyEl?.webkitEnterFullscreen?.();
    } catch {
      // Ignore.
    }
  };

  return (
    <div
      ref={wrapRef}
      onClick={onToggle}
      className={cn("relative overflow-hidden", onToggle && "cursor-pointer", className)}
    >
      {[0, 1].map((i) => {
        const isFront = front === (i as 0 | 1);
        return (
          <video
            key={i}
            ref={i === 0 ? aRef : bRef}
            playsInline
            preload="auto"
            poster={poster}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={onError}
            className={cn(
              isFront ? videoClassName : "absolute inset-0 w-full h-full object-cover",
              "transition-opacity",
              isFront
                ? dimmed
                  ? "opacity-35"
                  : "opacity-100"
                : "opacity-0"
            )}
            style={{ transitionDuration: `${fadeMs}ms` }}
          />
        );
      })}
      {playOverlay && !playing && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-11 h-11 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white">
            <Icon name="play_arrow" className="text-[22px]" />
          </span>
        </span>
      )}
      {chrome && (
        <span className="absolute bottom-2 right-2 z-10 flex gap-1">
          {pipOk && (
            <button
              type="button"
              title={pip ? "Exit picture-in-picture" : "Picture-in-picture"}
              onClick={togglePiP}
              className="w-8 h-8 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-primary hover:text-on-primary transition-colors"
            >
              <Icon name="picture_in_picture_alt" className="text-[16px]" />
            </button>
          )}
          <button
            type="button"
            title={fs ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-primary hover:text-on-primary transition-colors"
          >
            <Icon name={fs ? "fullscreen_exit" : "fullscreen"} className="text-[16px]" />
          </button>
        </span>
      )}
    </div>
  );
}
