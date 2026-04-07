import { api } from "./client";
import type { SceneVideoClip } from "../types";

export const videoClipsApi = {
  list: (episodeId: string) =>
    api.get<SceneVideoClip[]>(`/episodes/${episodeId}/video-clips`).then((r) => r.data),
  start: (keyframeId: string, data: { confirmed: true; motionPrompt?: string; durationSec?: number }) =>
    api.post<SceneVideoClip>(`/keyframes/${keyframeId}/generate-video`, data).then((r) => r.data),
  status: (clipId: string) =>
    api.get<SceneVideoClip>(`/video-clips/${clipId}/status`).then((r) => r.data),
  merge: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/merge-clips`).then((r) => r.data),
  burnSubtitles: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/burn-subtitles`).then((r) => r.data),
  addNarration: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/add-narration-to-clips`).then((r) => r.data),
};
