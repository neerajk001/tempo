/**
 * Focus Library catalog.
 *
 * To add media, drop files into `public/focus/videos/` (.mp4/.webm) or
 * `public/focus/music/` (.mp3/.ogg/.wav) and add one entry below — no
 * component changes needed. `id` must be unique within its list.
 *
 * Example:
 *   { id: "rain-window", title: "Rain on Window", src: "/focus/videos/rain-window.mp4", poster: "/focus/videos/rain-window.jpg" },
 *   { id: "lofi-01", title: "Midnight Lofi", artist: "Tempo Mix", src: "/focus/music/lofi-01.mp3" },
 */

export interface FocusVideo {
  id: string;
  title: string;
  /** Path under public/, e.g. "/focus/videos/rain.mp4". */
  src: string;
  /** Optional thumbnail shown on cards and while loading. */
  poster?: string;
}

export interface FocusTrack {
  id: string;
  title: string;
  artist?: string;
  /** Path under public/, e.g. "/focus/music/lofi.mp3". */
  src: string;
}

export const FOCUS_VIDEOS: FocusVideo[] = [];

export const FOCUS_TRACKS: FocusTrack[] = [];

export function findVideo(id: string | null): FocusVideo | null {
  if (!id) return null;
  return FOCUS_VIDEOS.find((v) => v.id === id) ?? null;
}

export function findTrack(id: string | null): FocusTrack | null {
  if (!id) return null;
  return FOCUS_TRACKS.find((t) => t.id === id) ?? null;
}
