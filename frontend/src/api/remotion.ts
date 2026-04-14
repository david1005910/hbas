import { api } from "./client";

export interface SubEntry {
  text: string;      // 한국어 자막
  heText?: string;   // 히브리어 자막
  startSec: number;
  endSec: number;
}

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
  subtitlesJson?: string;
}

export interface RenderStatus {
  status: "idle" | "rendering" | "done" | "error";
  error: string | null;
  fileReady: boolean;
}

export const remotionApi = {
  getProps: () => api.get<RemotionProps>("/remotion/props").then((r) => r.data),

  sendProps: (props: RemotionProps) =>
    api.post<{ success: boolean }>("/remotion/props", props).then((r) => r.data),

  render: () =>
    api.post<{ accepted: boolean }>("/remotion/render").then((r) => r.data),

  getRenderStatus: () =>
    api.get<RenderStatus>("/remotion/render/status").then((r) => r.data),

  // 브라우저에서 직접 Remotion 컨테이너에서 다운로드 (포트 3003)
  downloadUrl: () => "http://localhost:3003/download",

  // 키프레임 → Remotion 스튜디오 전송
  sendKeyframe: (keyframeId: string) =>
    api.post<{ success: boolean; props: RemotionProps }>("/remotion/send-keyframe", { keyframeId }).then((r) => r.data),

  // 에피소드 자막 텍스트 추출 (SCRIPT 나레이션KO / SRT_HE)
  getEpisodeSubtitle: (episodeId: string) =>
    api.get<{ koreanText: string; hebrewText: string }>(
      `/remotion/episode-subtitle/${episodeId}`
    ).then((r) => r.data),

  // 한국어 나레이션 TTS 생성 → public/narration.mp3
  generateNarration: (episodeId: string) =>
    api.post<{ success: boolean; fileName: string; textLength: number; durationSec?: number; durationInFrames?: number; subtitlesJson?: string }>(
      "/remotion/generate-narration", { episodeId }
    ).then((r) => r.data),

  // 현재 자막 목록 조회
  getSubtitles: () =>
    api.get<{ subtitles: SubEntry[] }>("/remotion/subtitles").then((r) => r.data.subtitles),

  // 편집된 자막 저장 → Root.tsx 즉시 반영
  updateSubtitles: (subtitles: SubEntry[]) =>
    api.post<{ success: boolean; count: number }>("/remotion/subtitles", { subtitles }).then((r) => r.data),

  // 배경 동영상 업로드
  uploadVideo: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append("video", file);
    return api.post<{ success: boolean; fileName: string }>("/remotion/upload-video", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    }).then((r) => r.data);
  },

  // public/ 내 동영상 목록
  listVideos: () =>
    api.get<{ files: string[] }>("/remotion/videos").then((r) => r.data.files),
};
