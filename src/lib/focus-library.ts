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

export const MANUAL_TRACKS: FocusTrack[] = [
  {
    id: "1-a-m-study-session-lofi-hip-hop",
    title: "1 A.M Study Session Lofi Hip Hop",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/1%20A.M%20Study%20Session%20%20%5Blofi%20hip%20hop%5D.mp3",
  },
  {
    id: "1-hour-study-with-me-no-break-calm-piano-background-noises-rain-sounds",
    title: "1-Hour Study With Me Calm Piano, Rain Sounds",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/1-HOUR%20STUDY%20WITH%20ME%20No%20Break%20%20Calm%20Piano%F0%9F%8E%B9%2C%20Background%20noises%2C%20Rain%20sounds.mp3",
  },
  {
    id: "batman-finally-exhales-dark-jazz-noir-for-lonely-night-drives-relaxation",
    title: "Batman Finally Exhales Dark Jazz Noir",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/Batman%20Finally%20Exhales.%20%20Dark%20Jazz%20Noir%20for%20Lonely%20Night%20Drives%20%26%20Relaxation..mp3",
  },
  {
    id: "japanese-noir-jazz-for-slow-days",
    title: "Japanese Noir Jazz for Slow Days",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/Japanese%20Noir%20Jazz%20for%20Slow%20Days..mp3",
  },
  {
    id: "when-the-stakes-are-high-focus-music",
    title: "When the Stakes Are High Focus Music",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/When%20the%20Stakes%20Are%20High%20%20Focus%20Music.mp3",
  },
  {
    id: "you-are-finding-your-way-home-the-odyssey-focus-music-1",
    title: "Finding Your Way Home The Odyssey 1",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/You%20Are%20Finding%20Your%20Way%20Home%20%20The%20Odyssey%20Focus%20Music%20(1).mp3",
  },
  {
    id: "lost-in-thoughts-for-1-hour",
    title: "Lost in Thoughts for 1 Hour",
    src: "https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev/lost%20in%20thoughts%20for%201%20hour.mp3",
  },
];

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
