"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Ambient Engine preferences — deliberately separate from the Pomodoro
 * Engine. Video and music are fully independent: changing, pausing, or
 * disabling either one never touches the timer. Persisted per device.
 */

interface AmbientActions {
  setVideo: (id: string | null) => void;
  setTrack: (id: string | null) => void;
  setVideoVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setVideoMuted: (v: boolean) => void;
  setMusicMuted: (v: boolean) => void;
  setVideoEnabled: (v: boolean) => void;
  setMusicEnabled: (v: boolean) => void;
  setVideoPlaying: (v: boolean) => void;
  setMusicPlaying: (v: boolean) => void;
  setVideoLoop: (v: boolean) => void;
  setMusicLoop: (v: boolean) => void;
}

interface AmbientStore extends AmbientActions {
  videoId: string | null;
  trackId: string | null;
  /** 0..1 */
  videoVolume: number;
  /** 0..1 */
  musicVolume: number;
  videoMuted: boolean;
  musicMuted: boolean;
  videoEnabled: boolean;
  musicEnabled: boolean;
  /** Session-only (never persisted): pause keeps position, unlike disable. */
  videoPlaying: boolean;
  musicPlaying: boolean;
  videoLoop: boolean;
  musicLoop: boolean;
}

const STORAGE_KEY = "tempo-ambient-v1";

const ssrSafeStorage = () => {
  if (typeof window !== "undefined") return localStorage;
  return {
    getItem: (_k: string) => null,
    setItem: (_k: string, _v: string) => {},
    removeItem: (_k: string) => {},
  };
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

export const useAmbientStore = create<AmbientStore>()(
  persist(
    (set) => ({
      videoId: null,
      trackId: null,
      videoVolume: 0.5,
      musicVolume: 0.5,
      videoMuted: false,
      musicMuted: false,
      videoEnabled: false,
      musicEnabled: false,
      videoPlaying: true,
      musicPlaying: true,
      videoLoop: true,
      musicLoop: true,

      setVideo: (id) => set({ videoId: id }),
      setTrack: (id) => set({ trackId: id }),
      setVideoVolume: (v) => set({ videoVolume: clamp01(v) }),
      setMusicVolume: (v) => set({ musicVolume: clamp01(v) }),
      setVideoMuted: (v) => set({ videoMuted: v }),
      setMusicMuted: (v) => set({ musicMuted: v }),
      setVideoEnabled: (v) => set({ videoEnabled: v }),
      setMusicEnabled: (v) => set({ musicEnabled: v }),
      setVideoPlaying: (v) => set({ videoPlaying: v }),
      setMusicPlaying: (v) => set({ musicPlaying: v }),
      setVideoLoop: (v) => set({ videoLoop: v }),
      setMusicLoop: (v) => set({ musicLoop: v }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({
        videoId: s.videoId,
        trackId: s.trackId,
        videoVolume: s.videoVolume,
        musicVolume: s.musicVolume,
        videoMuted: s.videoMuted,
        musicMuted: s.musicMuted,
        videoEnabled: s.videoEnabled,
        musicEnabled: s.musicEnabled,
      }) as unknown as AmbientStore,
    }
  )
);
