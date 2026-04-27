import { api } from "./client";

export interface Thumbnail {
  id?: string;
  webPath: string;
  variant?: string;
  episodeId: string;
  shortText: string;
  style?: string;
  colorScheme?: string;
  createdAt?: string;
  isSelected?: boolean;
}

export interface ThumbnailGenerateRequest {
  shortText: string;
  style?: "cinematic" | "modern" | "classic";
  colorScheme?: "vibrant" | "dark" | "light";
  textSize?: "large" | "medium" | "small";
  referenceImages?: string[]; // base64 encoded images
}

export const thumbnailApi = {
  // 단일 썸네일 생성
  generateSingle: (episodeId: string, data: ThumbnailGenerateRequest) =>
    api.post(`/episodes/${episodeId}/generate/thumbnail`, data).then(r => r.data),

  // 다중 썸네일 변형 생성
  generateMultiple: (episodeId: string, data: Pick<ThumbnailGenerateRequest, 'shortText' | 'referenceImages'>) =>
    api.post(`/episodes/${episodeId}/generate/thumbnails`, data).then(r => r.data),

  // 에피소드의 썸네일 목록 조회
  getThumbnails: (episodeId: string) =>
    api.get(`/episodes/${episodeId}/thumbnails`).then(r => r.data),
};