"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { FOCUS_TRACKS, findTrack } from "@/lib/focus-library";
import { useAmbientStore } from "@/stores/ambient-store";
import { cn } from "@/lib/utils";

/** Header toggle. Routes to the library when nothing is selected yet. */
export function MusicToggleButton() {
  const router = useRouter();
  const track = findTrack(useAmbientStore((s) => s.trackId));
  const enabled = useAmbientStore((s) => s.musicEnabled);
  const setEnabled = useAmbientStore((s) => s.setMusicEnabled);
  const setPlaying = useAmbientStore((s) => s.setMusicPlaying);

  return (
    <button
      type="button"
      onClick={() => {
        if (!track) {
          router.push("/library");
          return;
        }
        if (enabled) setEnabled(false);
        else {
          setPlaying(true);
          setEnabled(true);
        }
      }}
      title={track ? "Ambient music" : "Pick music in the Focus Library"}
      className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant shadow-sm hover:bg-surface-container-low text-on-surface px-3 py-1 rounded-lg transition-colors"
    >
      <Icon name="music_note" className={cn("text-[16px]", enabled && track ? "text-primary" : "text-on-surface-variant")} />
      <span className="text-body-sm font-medium hidden sm:inline">
        {track ? (enabled ? "Music On" : "Music") : "Music"}
      </span>
      {track && enabled && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
    </button>
  );
}

function stepTrack(id: string | null, dir: 1 | -1): string | null {
  if (FOCUS_TRACKS.length === 0) return null;
  const i = FOCUS_TRACKS.findIndex((t) => t.id === id);
  const next = i < 0 ? 0 : (i + dir + FOCUS_TRACKS.length) % FOCUS_TRACKS.length;
  return FOCUS_TRACKS[next].id;
}

/** Compact in-flow controls, rendered by FocusView when music is active. */
export function MusicPill() {
  const track = findTrack(useAmbientStore((s) => s.trackId));
  const enabled = useAmbientStore((s) => s.musicEnabled);
  const playing = useAmbientStore((s) => s.musicPlaying);
  const setPlaying = useAmbientStore((s) => s.setMusicPlaying);
  const volume = useAmbientStore((s) => s.musicVolume);
  const setVolume = useAmbientStore((s) => s.setMusicVolume);
  const muted = useAmbientStore((s) => s.musicMuted);
  const setMuted = useAmbientStore((s) => s.setMusicMuted);
  const loop = useAmbientStore((s) => s.musicLoop);
  const setLoop = useAmbientStore((s) => s.setMusicLoop);
  const setTrack = useAmbientStore((s) => s.setTrack);
  if (!enabled || !track) return null;

  const btn =
    "w-7 h-7 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex-shrink-0";
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-sm max-w-full">
      <button type="button" title="Previous track" onClick={() => setTrack(stepTrack(track.id, -1))} className={btn}>
        <Icon name="skip_previous" className="text-[16px]" />
      </button>
      <button type="button" title={playing ? "Pause music" : "Play music"} onClick={() => setPlaying(!playing)} className={btn}>
        <Icon name={playing ? "pause" : "play_arrow"} className="text-[16px]" />
      </button>
      <button type="button" title="Next track" onClick={() => setTrack(stepTrack(track.id, 1))} className={btn}>
        <Icon name="skip_next" className="text-[16px]" />
      </button>
      <span className="font-mono text-code-badge text-on-surface-variant truncate max-w-[110px] hidden sm:inline">
        {track.title}
      </span>
      <span className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          title={muted ? "Unmute music" : "Mute music"}
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
          aria-label="Music volume"
          className="accent-primary cursor-pointer w-14 sm:w-20"
        />
      </span>
      <button
        type="button"
        title={loop ? "Looping on" : "Looping off"}
        onClick={() => setLoop(!loop)}
        className={cn(btn, loop && "text-primary")}
      >
        <Icon name="repeat" className="text-[16px]" />
      </button>
      <Link
        href="/library"
        title="Change track in the Focus Library"
        className={btn}
      >
        <Icon name="library_music" className="text-[16px]" />
      </Link>
    </div>
  );
}

/**
 * The single audio element for Focus Mode. Driven only by the ambient
 * store — fully independent from video playback and the Pomodoro timer.
 */
export function AmbientMusic() {
  const track = findTrack(useAmbientStore((s) => s.trackId));
  const enabled = useAmbientStore((s) => s.musicEnabled);
  const playing = useAmbientStore((s) => s.musicPlaying);
  const setPlaying = useAmbientStore((s) => s.setMusicPlaying);
  const volume = useAmbientStore((s) => s.musicVolume);
  const muted = useAmbientStore((s) => s.musicMuted);
  const loop = useAmbientStore((s) => s.musicLoop);
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    if (el.getAttribute("src") !== track.src) el.setAttribute("src", track.src);
    if (enabled && playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.src, enabled, playing]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
    el.muted = muted;
    el.loop = loop;
  }, [volume, muted, loop, track?.src]);

  if (!track) return null;
  return (
    <audio
      ref={ref}
      preload="none"
      className="hidden"
      onEnded={() => {
        if (!loop) setPlaying(false);
      }}
      onError={() => setPlaying(false)}
    />
  );
}
