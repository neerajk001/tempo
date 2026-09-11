import { describe, it, expect } from "vitest";
import { FOCUS_TRACKS, FOCUS_VIDEOS, findTrack, findVideo } from "@/lib/focus-library";

describe("focus library catalog", () => {
  it("has unique ids within each list", () => {
    expect(new Set(FOCUS_VIDEOS.map((v) => v.id)).size).toBe(FOCUS_VIDEOS.length);
    expect(new Set(FOCUS_TRACKS.map((t) => t.id)).size).toBe(FOCUS_TRACKS.length);
  });

  it("points at the public/focus folders", () => {
    for (const v of FOCUS_VIDEOS) expect(v.src.startsWith("/focus/videos/")).toBe(true);
    for (const t of FOCUS_TRACKS) expect(t.src.startsWith("/focus/music/")).toBe(true);
  });

  it("looks entries up by id, null-safe", () => {
    expect(findVideo(null)).toBeNull();
    expect(findTrack(null)).toBeNull();
    expect(findVideo("does-not-exist")).toBeNull();
    expect(findTrack("does-not-exist")).toBeNull();
    for (const v of FOCUS_VIDEOS) expect(findVideo(v.id)).toEqual(v);
    for (const t of FOCUS_TRACKS) expect(findTrack(t.id)).toEqual(t);
  });
});
