"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import {
  FOCUS_TRACKS,
  FOCUS_VIDEOS,
  type FocusTrack,
  type FocusVideo,
} from "@/lib/focus-library";
import { useAmbientStore } from "@/stores/ambient-store";
import LoopingVideo from "@/components/ambient/LoopingVideo";
import { cn } from "@/lib/utils";

type Tab = "videos" | "music";

/** Chromeless inline preview: tap for play/pause, seamless loop, PiP + fullscreen. */
function PreviewVideo({
  src,
  poster,
  onMissing,
}: {
  src: string;
  poster?: string;
  onMissing: () => void;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <LoopingVideo
      src={src}
      poster={poster}
      playing={!paused}
      muted={false}
      volume={0.9}
      loop
      className="w-full h-full"
      videoClassName="w-full h-full object-cover"
      chrome
      playOverlay
      onToggle={() => setPaused((p) => !p)}
      onError={onMissing}
      onPlayFail={() => setPaused(true)}
    />
  );
}

function VideoCard({ video }: { video: FocusVideo }) {
  const videoId = useAmbientStore((s) => s.videoId);
  const setVideo = useAmbientStore((s) => s.setVideo);
  const setVideoEnabled = useAmbientStore((s) => s.setVideoEnabled);
  const [previewing, setPreviewing] = useState(false);
  const [missing, setMissing] = useState(false);
  const selected = videoId === video.id;

  const toggleSelect = () => {
    if (selected) {
      setVideo(null);
      setVideoEnabled(false);
    } else {
      setVideo(video.id);
      setVideoEnabled(true);
    }
  };

  return (
    <div
      className={cn(
        "bg-surface-container-lowest rounded-xl shadow-sm border p-3 flex flex-col gap-2.5 transition-colors",
        selected ? "border-primary/60" : "border-outline-variant"
      )}
    >
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-surface-container-low border border-outline-variant">
        {previewing && !missing ? (
          <PreviewVideo src={video.src} poster={video.poster} onMissing={() => setMissing(true)} />
        ) : video.poster && !missing ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.poster}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setMissing(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-fixed/60 via-surface-container-low to-tertiary-fixed/50">
            <Icon name="movie" className="text-[32px] text-on-surface-variant" />
          </div>
        )}
        {!previewing && (
          <button
            type="button"
            title={missing ? "File missing" : "Preview"}
            onClick={() => !missing && setPreviewing(true)}
            className="absolute inset-0 flex items-center justify-center group"
          >
            <span className="w-11 h-11 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white group-hover:scale-105 group-hover:bg-primary group-hover:text-on-primary transition-all">
              <Icon name="play_arrow" className="text-[22px]" />
            </span>
          </button>
        )}
        {selected && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-primary text-on-primary font-mono text-code-badge font-semibold">
            Selected
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-body-md font-semibold text-on-surface truncate">{video.title}</span>
          <span className="text-label-xs text-on-surface-variant font-mono">
            {missing ? "Missing file — add it under public/focus/videos/" : "Ambient video · loops"}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleSelect}
          className={cn(
            "h-8 px-3 rounded-lg text-body-sm font-medium transition-colors flex-shrink-0",
            selected
              ? "bg-primary-fixed text-on-primary-fixed"
              : "bg-surface-container text-on-surface hover:bg-surface-container-high"
          )}
        >
          {selected ? "Selected" : "Select"}
        </button>
      </div>
    </div>
  );
}

function MusicRow({
  track,
  previewing,
  onPreview,
}: {
  track: FocusTrack;
  previewing: boolean;
  onPreview: (t: FocusTrack | null) => void;
}) {
  const trackId = useAmbientStore((s) => s.trackId);
  const setTrack = useAmbientStore((s) => s.setTrack);
  const setMusicEnabled = useAmbientStore((s) => s.setMusicEnabled);
  const selected = trackId === track.id;

  const toggleSelect = () => {
    if (selected) {
      setTrack(null);
      setMusicEnabled(false);
    } else {
      setTrack(track.id);
      setMusicEnabled(true);
    }
  };

  return (
    <div
      className={cn(
        "bg-surface-container-lowest rounded-xl shadow-sm border p-3 flex items-center gap-3 transition-colors",
        selected ? "border-primary/60" : "border-outline-variant"
      )}
    >
      <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-accent-amber-container to-primary-fixed border border-outline-variant flex items-center justify-center flex-shrink-0">
        <Icon name="music_note" className="text-[20px] text-on-surface" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-body-md font-semibold text-on-surface truncate">{track.title}</span>
        <span className="text-label-xs text-on-surface-variant truncate">
          {track.artist ?? "Ambient track"} · loops
        </span>
      </div>
      {selected && (
        <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-primary text-on-primary font-mono text-code-badge font-semibold flex-shrink-0">
          Selected
        </span>
      )}
      <button
        type="button"
        title={previewing ? "Stop preview" : "Preview"}
        onClick={() => onPreview(previewing ? null : track)}
        className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors flex-shrink-0"
      >
        <Icon name={previewing ? "stop" : "play_arrow"} className="text-[16px]" />
      </button>
      <button
        type="button"
        onClick={toggleSelect}
        className={cn(
          "h-8 px-3 rounded-lg text-body-sm font-medium transition-colors flex-shrink-0",
          selected
            ? "bg-primary-fixed text-on-primary-fixed"
            : "bg-surface-container text-on-surface hover:bg-surface-container-high"
        )}
      >
        {selected ? "Selected" : "Select"}
      </button>
    </div>
  );
}

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("videos");
  const [previewTrack, setPreviewTrack] = useState<FocusTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (previewTrack) {
      el.src = previewTrack.src;
      void el.play().catch(() => setPreviewTrack(null));
    } else {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [previewTrack]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant uppercase tracking-wider">
          <span>Workspaces</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary font-semibold">Focus Library</span>
        </div>
        <h1 className="text-display-xl text-on-surface tracking-tight">Focus Library</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Pick your atmosphere. Video and music play independently in Focus Mode — mix, match, or mute either.
        </p>
      </div>

      <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container-low self-start border border-outline-variant">
        {(["videos", "music"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPreviewTrack(null);
            }}
            className={cn(
              "px-4 py-1.5 rounded-md transition-colors capitalize",
              tab === t
                ? "bg-surface-container-lowest text-on-surface text-body-sm font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface text-body-sm"
            )}
          >
            {t}
            <span className="font-mono text-label-xs ml-1.5 text-on-surface-variant">
              {t === "videos" ? FOCUS_VIDEOS.length : FOCUS_TRACKS.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "videos" && (
        FOCUS_VIDEOS.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-8 text-center flex flex-col items-center gap-2">
            <Icon name="movie" className="text-[28px] text-on-surface-variant" />
            <p className="text-body-md font-medium text-on-surface">No videos yet</p>
            <p className="text-body-sm text-secondary max-w-sm">
              Drop .mp4 files into <span className="font-mono text-code-badge text-on-surface">public/focus/videos/</span> and
              run <span className="font-mono text-code-badge text-on-surface">npm run library:sync</span> (automatic on dev/build) — they appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FOCUS_VIDEOS.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )
      )}

      {tab === "music" && (
        FOCUS_TRACKS.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-8 text-center flex flex-col items-center gap-2">
            <Icon name="music_note" className="text-[28px] text-on-surface-variant" />
            <p className="text-body-md font-medium text-on-surface">No music yet</p>
            <p className="text-body-sm text-secondary max-w-sm">
              Drop .mp3 files into <span className="font-mono text-code-badge text-on-surface">public/focus/music/</span> and
              run <span className="font-mono text-code-badge text-on-surface">npm run library:sync</span> (automatic on dev/build) — they appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {FOCUS_TRACKS.map((t) => (
              <MusicRow
                key={t.id}
                track={t}
                previewing={previewTrack?.id === t.id}
                onPreview={setPreviewTrack}
              />
            ))}
          </div>
        )
      )}

      <audio ref={audioRef} preload="none" onEnded={() => setPreviewTrack(null)} className="hidden" />
    </div>
  );
}
