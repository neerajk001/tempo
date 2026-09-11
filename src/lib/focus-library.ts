/**
 * Focus Library catalog.
 *
 * Drop files into `public/focus/videos/` (.mp4/.webm) or
 * `public/focus/music/` (.mp3/.ogg/.wav) and run `npm run library:sync`
 * (runs automatically on `npm run dev` and `npm run build`) — they appear
 * below with zero config edits. A same-name image next to a video becomes
 * its poster thumbnail.
 *
 * For full control (custom titles, posters, ordering), add a manual entry
 * with the SAME id as the generated one — manual entries always win.
 *
 * Example:
 *   { id: "rain-window", title: "Rain on Window", src: "/focus/videos/rain-window.mp4", poster: "/focus/videos/rain-window.jpg" },
 *   { id: "lofi-01", title: "Midnight Lofi", artist: "Tempo Mix", src: "/focus/music/lofi-01.mp3" },
 */

import { GENERATED_TRACKS, GENERATED_VIDEOS } from "./focus-library.generated";

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

export const MANUAL_VIDEOS: FocusVideo[] = [
  {
    id: "boy-having-coffee-studying",
    title: "Boy Having a Coffee and Studying",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/boy%20having%20a%20coffee%20and%20studying.mp4",
  },
  {
    id: "boy-studying",
    title: "Boy Studying",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/boy%20studying.mp4",
  },
  {
    id: "cat-fire-place",
    title: "Cat by the Fireplace",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/cat%20fire%20place.mp4",
  },
  {
    id: "cat-looking-through-window",
    title: "Cat Looking Through Window",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/cat%20looking%20through%20window.mp4",
  },
  {
    id: "cozy",
    title: "Cozy",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/cozy.mp4",
  },
  {
    id: "girl-snow-coffee",
    title: "Girl in the Snow with Coffee",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/girl%20in%20a%20snow%20coffee.mp4",
  },
  {
    id: "girl-studying-ambience",
    title: "Girl Studying Ambience",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/girl%20studying%20ambience.mp4",
  },
  {
    id: "girl-studying",
    title: "Girl Studying",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/girl%20studying.mp4",
  },
  {
    id: "oil-paint-cat",
    title: "Oil Paint Cat",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/oil%20paint%20cat.mp4",
  },
  {
    id: "sky",
    title: "Sky",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/sky.mp4",
  },
  {
    id: "studying-light-girl",
    title: "Girl in Warm Light",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/studying%20light%20girl.mp4",
  },
];

export const MANUAL_TRACKS: FocusTrack[] = [];

function merge<T extends { id: string }>(manual: T[], generated: T[]): T[] {
  const seen = new Set(manual.map((m) => m.id));
  return [...manual, ...generated.filter((g) => !seen.has(g.id))];
}

export const FOCUS_VIDEOS: FocusVideo[] = merge(MANUAL_VIDEOS, GENERATED_VIDEOS);

export const FOCUS_TRACKS: FocusTrack[] = merge(MANUAL_TRACKS, GENERATED_TRACKS);

export function findVideo(id: string | null): FocusVideo | null {
  if (!id) return null;
  return FOCUS_VIDEOS.find((v) => v.id === id) ?? null;
}

export function findTrack(id: string | null): FocusTrack | null {
  if (!id) return null;
  return FOCUS_TRACKS.find((t) => t.id === id) ?? null;
}
