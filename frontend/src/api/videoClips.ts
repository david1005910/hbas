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
  delete: (clipId: string) =>
    api.delete(`/video-clips/${clipId}`).then((r) => r.data),
  burnSubtitleOne: (clipId: string) =>
    api.post(`/video-clips/${clipId}/burn-subtitle`).then((r) => r.data),
  addNarrationOne: (clipId: string) =>
    api.post(`/video-clips/${clipId}/add-narration`).then((r) => r.data),
  produceFinalUrl: (episodeId: string) => {
    const base = import.meta.env.VITE_API_URL || "";
    return `${base}/api/v1/episodes/${episodeId}/produce-final`;
  },
  resetClips: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/reset-clips`).then((r) => r.data),
  mergeScene: (episodeId: string, sceneNo: number) =>
    api.post(`/episodes/${episodeId}/merge-scene/${sceneNo}`).then((r) => r.data),
};
