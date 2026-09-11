import { describe, it, expect, beforeEach } from "vitest";
import { useAmbientStore } from "@/stores/ambient-store";

beforeEach(() => {
  useAmbientStore.setState({
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
  });
});

describe("ambient store", () => {
  it("starts with nothing selected and both engines off", () => {
    const s = useAmbientStore.getState();
    expect(s.videoId).toBeNull();
    expect(s.trackId).toBeNull();
    expect(s.videoEnabled).toBe(false);
    expect(s.musicEnabled).toBe(false);
  });

  it("selects video and music independently", () => {
    const s = useAmbientStore.getState();
    s.setVideo("rain-window");
    s.setVideoEnabled(true);
    expect(useAmbientStore.getState().videoId).toBe("rain-window");
    expect(useAmbientStore.getState().videoEnabled).toBe(true);
    // Music untouched by video changes.
    expect(useAmbientStore.getState().trackId).toBeNull();
    expect(useAmbientStore.getState().musicEnabled).toBe(false);

    s.setTrack("lofi-01");
    s.setMusicEnabled(true);
    expect(useAmbientStore.getState().trackId).toBe("lofi-01");
    expect(useAmbientStore.getState().videoId).toBe("rain-window");
  });

  it("clamps volumes to 0..1", () => {
    const s = useAmbientStore.getState();
    s.setVideoVolume(4);
    s.setMusicVolume(-2);
    expect(useAmbientStore.getState().videoVolume).toBe(1);
    expect(useAmbientStore.getState().musicVolume).toBe(0);
    s.setVideoVolume(NaN);
    expect(useAmbientStore.getState().videoVolume).toBe(0.5);
  });

  it("pausing one engine never touches the other", () => {
    const s = useAmbientStore.getState();
    s.setVideoPlaying(false);
    expect(useAmbientStore.getState().musicPlaying).toBe(true);
    s.setMusicPlaying(false);
    s.setVideoMuted(true);
    expect(useAmbientStore.getState().musicMuted).toBe(false);
    expect(useAmbientStore.getState().videoEnabled).toBe(false);
  });
});
