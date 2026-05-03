import { api } from "./client";

export interface YouTubeSkill {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface ChannelContext {
  niche: string;
  size: "new" | "growing" | "established" | "authority";
  goal: "growth" | "monetization" | "authority" | "engagement";
  url?: string;
}

export interface YouTubeAnalysisRequest {
  skillId: string;
  query: string;
  channelContext: ChannelContext;
}

export interface YouTubeAnalysisResponse {
  message: string;
  skillId: string;
  analysis: string;
}

export const youtubeApi = {
  // YouTube 스킬 목록 조회
  getSkills: () =>
    api.get('/youtube/skills').then(r => r.data),

  // YouTube 스킬 분석 처리
  analyzeSkill: (data: YouTubeAnalysisRequest): Promise<YouTubeAnalysisResponse> =>
    api.post('/youtube/analyze', data).then(r => r.data),
};