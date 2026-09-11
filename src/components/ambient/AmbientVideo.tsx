"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { findVideo } from "@/lib/focus-library";
import { useAmbientStore } from "@/stores/ambient-store";
import { cn } from "@/lib/utils";

export type VideoMode = "background" | "mini" | "fullscreen";

/** Header toggle. Routes to the library when nothing is selected yet. */
export function VideoToggleButton({ onModeChange }: { onModeChange: (m: VideoMode) => void }) {
  const router = useRouter();
  const video = findVideo(useAmbientStore((s) => s.videoId));
  const enabled = useAmbientStore((s) => s.videoEnabled);
  const setEnabled = useAmbientStore((s) => s.setVideoEnabled);
  const setPlaying = useAmbientStore((s) => s.setVideoPlaying);

  return (
    <button
      type="button"
      onClick={() => {
        if (!video) {
          router.push("/library");
          return;
        }
        if (enabled) {
          setEnabled(false);
          onModeChange("background");
        } else {
          setPlaying(true);
          onModeChange("background");
          setEnabled(true);
        }
      }}
      title={video ? "Ambient video" : "Pick a video in the Focus Library"}
      className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant shadow-sm hover:bg-surface-container-low text-on-surface px-3 py-1 rounded-lg transition-colors"
    >
      <Icon name="movie" className={cn("text-[16px]", enabled && video ? "text-primary" : "text-on-surface-variant")} />
      <span className="text-body-sm font-medium hidden sm:inline">
        {video ? (enabled ? "Video On" : "Video") : "Video"}
      </span>
      {video && enabled && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
    </button>
  );
}

function VolumeSlider({ small = false }: { small?: boolean }) {
  const volume = useAmbientStore((s) => s.videoVolume);
  const setVolume = useAmbientStore((s) => s.setVideoVolume);
  const muted = useAmbientStore((s) => s.videoMuted);
  const setMuted = useAmbientStore((s) => s.setVideoMuted);
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        title={muted ? "Unmute video" : "Mute video"}
        onClick={() => setMuted(!muted)}
        className="text-on-surface-variant hover:text-on-surface transition-colors flex"
      >
        <Icon name={muted ? "volume_off" : "volume_up"} className="text-[16px]" />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(muted ? 0 : volume * 100)}
        onChange={(e) => {
          setVolume(Number(e.target.value) / 100);
          if (muted && Number(e.target.value) > 0) setMuted(false);
        }}
        aria-label="Video volume"
        className={cn("accent-primary cursor-pointer", small ? "w-14" : "w-20")}
      />
    </span>
  );
}

/** Compact in-flow controls, rendered by FocusView when video is active. */
export function VideoPill({ mode, setMode }: { mode: VideoMode; setMode: (m: VideoMode) => void }) {
  const video = findVideo(useAmbientStore((s) => s.videoId));
  const enabled = useAmbientStore((s) => s.videoEnabled);
  const playing = useAmbientStore((s) => s.videoPlaying);
  const setPlaying = useAmbientStore((s) => s.setVideoPlaying);
  const loop = useAmbientStore((s) => s.videoLoop);
  const setLoop = useAmbientStore((s) => s.setVideoLoop);
  if (!enabled || !video || mode !== "background") return null;

  const btn =
    "w-7 h-7 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors";
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-sm">
      <span className="font-mono text-code-badge text-on-surface-variant truncate max-w-[110px] hidden sm:inline">
        {video.title}
      </span>
      <button type="button" title={playing ? "Pause video" : "Play video"} onClick={() => setPlaying(!playing)} className={btn}>
        <Icon name={playing ? "pause" : "play_arrow"} className="text-[16px]" />
      </button>
      <VolumeSlider small />
      <button
        type="button"
        title={loop ? "Looping on" : "Looping off"}
        onClick={() => setLoop(!loop)}
        className={cn(btn, loop && "text-primary")}
      >
        <Icon name="repeat" className="text-[16px]" />
      </button>
      <button type="button" title="Minimize to floating player" onClick={() => setMode("mini")} className={btn}>
        <Icon name="picture_in_picture_alt" className="text-[16px]" />
      </button>
      <button type="button" title="Fullscreen video" onClick={() => setMode("fullscreen")} className={btn}>
        <Icon name="fullscreen" className="text-[16px]" />
      </button>
    </div>
  );
}

/**
 * The single video element for Focus Mode — the wrapper is repositioned per
 * mode (background / mini / fullscreen) without unmounting, so playback
 * never restarts on mode switches. Driven only by the ambient store; the
 * Pomodoro timer never touches it.
 */
export function AmbientVideo({ mode, setMode }: { mode: VideoMode; setMode: (m: VideoMode) => void }) {
  const video = findVideo(useAmbientStore((s) => s.videoId));
  const enabled = useAmbientStore((s) => s.videoEnabled);
  const playing = useAmbientStore((s) => s.videoPlaying);
  const setPlaying = useAmbientStore((s) => s.setVideoPlaying);
  const volume = useAmbientStore((s) => s.videoVolume);
  const muted = useAmbientStore((s) => s.videoMuted);
  const setMuted = useAmbientStore((s) => s.setVideoMuted);
  const loop = useAmbientStore((s) => s.videoLoop);
  const setEnabled = useAmbientStore((s) => s.setVideoEnabled);
  const ref = useRef<HTMLVideoElement | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
  }, [video?.src]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !video) return;
    if (el.getAttribute("src") !== video.src) el.setAttribute("src", video.src);
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.src, playing, enabled]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
    el.muted = muted;
    el.loop = loop;
  }, [volume, muted, loop, video?.src]);

  if (!enabled || !video) return null;

  const miniBtn =
    "w-7 h-7 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors";

  return (
    <div
      className={
        mode === "background"
          ? "absolute inset-0 overflow-hidden pointer-events-none"
          : mode === "mini"
            ? "fixed bottom-4 right-4 z-[60] w-44 sm:w-64 rounded-xl overflow-hidden border border-outline bg-black shadow-xl"
            : "fixed inset-0 z-[70] bg-black"
      }
    >
      {missing ? (
        <div className={mode === "background" ? "absolute inset-0 flex items-center justify-center" : "aspect-video flex items-center justify-center p-3 text-center"}>
          <p className={mode === "fullscreen" ? "text-body-sm text-white/70" : "text-label-xs text-on-surface-variant bg-surface-container-lowest/80 border border-outline-variant rounded-lg px-3 py-1.5"}>
            Video file not found — add it under <span className="font-mono">public/focus/videos/</span>
          </p>
        </div>
      ) : (
        <video
          ref={ref}
          playsInline
          onError={() => setMissing(true)}
          className={
            mode === "background"
              ? "w-full h-full object-cover opacity-35"
              : mode === "mini"
                ? "w-full aspect-video object-cover"
                : "absolute inset-0 w-full h-full object-cover"
          }
        />
      )}
      {mode === "background" && !missing && <div className="absolute inset-0 bg-surface/70" />}

      {mode === "mini" && (
        <div className="flex items-center gap-0.5 p-1.5 bg-surface-container-lowest">
          <button
            type="button"
            title={playing ? "Pause video" : "Play video"}
            onClick={() => setPlaying(!playing)}
            className={miniBtn}
          >
            <Icon name={playing ? "pause" : "play_arrow"} className="text-[16px]" />
          </button>
          <button
            type="button"
            title={muted ? "Unmute video" : "Mute video"}
            onClick={() => setMuted(!muted)}
            className={miniBtn}
          >
            <Icon name={muted ? "volume_off" : "volume_up"} className="text-[16px]" />
          </button>
          <span className="font-mono text-code-badge text-on-surface-variant truncate flex-1 px-1">{video.title}</span>
          <button
            type="button"
            title="Back to background"
            onClick={() => setMode("background")}
            className={miniBtn}
          >
            <Icon name="open_in_full" className="text-[14px]" />
          </button>
          <button
            type="button"
            title="Fullscreen video"
            onClick={() => setMode("fullscreen")}
            className={miniBtn}
          >
            <Icon name="fullscreen" className="text-[16px]" />
          </button>
          <button
            type="button"
            title="Turn video off"
            onClick={() => {
              setEnabled(false);
              setMode("background");
            }}
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/15 transition-colors"
          >
            <Icon name="close" className="text-[16px]" />
          </button>
        </div>
      )}

      {mode === "fullscreen" && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <span className="text-body-sm font-medium text-white/90 truncate">{video.title}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              title={playing ? "Pause video" : "Play video"}
              onClick={() => setPlaying(!playing)}
              className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-body-sm font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name={playing ? "pause" : "play_arrow"} className="text-[16px]" />
              <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
            </button>
            <button
              type="button"
              title="Exit fullscreen (Esc)"
              onClick={() => setMode("background")}
              className="h-9 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-body-sm font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="fullscreen_exit" className="text-[16px]" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
