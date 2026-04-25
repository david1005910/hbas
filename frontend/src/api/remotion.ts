import { api } from "./client";

export interface WordReplacement {
  from: string;
  to: string;
  enabled: boolean;
}

export interface SubEntry {
  text: string;      // 한국어 자막
  heText?: string;   // 히브리어 자막
  viText?: string;   // 베트남어 자막
  startSec: number;
  endSec: number;
}

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  vietnameseText?: string;
  language?: "ko" | "vi";
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
  subtitlesJson?: string;
  showSubtitle?: boolean;
  showNarration?: boolean;
  fontSizeScale?: number;
}

export interface RenderStatus {
  status: "idle" | "rendering" | "done" | "error";
  error: string | null;
  fileReady: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatActionResult {
  type: "action" | "message";
  message: string;
  props?: Partial<RemotionProps>;
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

  // 에피소드 자막 텍스트 추출 (SCRIPT 나레이션KO / SRT_HE / SRT_VI)
  getEpisodeSubtitle: (episodeId: string) =>
    api.get<{ koreanText: string; hebrewText: string; vietnameseText: string }>(
      `/remotion/episode-subtitle/${episodeId}`
    ).then((r) => r.data),

  // 씬별 텍스트 추출 (SRT_KO / SRT_HE / SRT_VI의 N번째 씬)
  getEpisodeSceneText: (episodeId: string, sceneNumber: number) =>
    api.get<{ koreanText: string; hebrewText: string; vietnameseText: string; videoFileName: string }>(
      `/remotion/episode-scene/${episodeId}/${sceneNumber}`
    ).then((r) => r.data),

  // 한국어 나레이션 TTS 생성 → public/narration.mp3
  // narrationText: 자막 편집기의 현재 한국어 텍스트 (최우선 적용)
  generateNarration: (episodeId: string, speakingRate?: number, narrationText?: string) =>
    api.post<{ success: boolean; fileName: string; textLength: number; durationSec?: number; durationInFrames?: number; subtitlesJson?: string }>(
      "/remotion/generate-narration", { episodeId, speakingRate, narrationText }
    ).then((r) => r.data),

  // 베트남어 나레이션 TTS 생성 → public/narration_vi.mp3
  generateVietnameseNarration: (episodeId: string, speakingRate?: number) =>
    api.post<{ success: boolean; fileName: string; textLength: number; durationSec?: number; durationInFrames?: number; subtitlesJson?: string }>(
      "/remotion/generate-narration-vi", { episodeId, speakingRate }
    ).then((r) => r.data),

  // 현재 자막 목록 조회
  getSubtitles: () =>
    api.get<{ subtitles: SubEntry[] }>("/remotion/subtitles").then((r) => r.data.subtitles),

  // 편집된 자막 저장 → Root.tsx 즉시 반영
  updateSubtitles: (subtitles: SubEntry[]) =>
    api.post<{ success: boolean; count: number }>("/remotion/subtitles", { subtitles }).then((r) => r.data),

  // 기존 자막에 히브리어 자동 배분
  autoFillHebrew: (episodeId: string) =>
    api.post<{ subtitles: SubEntry[] }>("/remotion/subtitles/auto-hebrew", { episodeId }).then((r) => r.data.subtitles),

  // 기존 자막에 베트남어(SRT_VI) 자동 배분
  autoFillVietnamese: (episodeId: string) =>
    api.post<{ subtitles: SubEntry[] }>("/remotion/subtitles/auto-vietnamese", { episodeId }).then((r) => r.data.subtitles),

  // 기존 자막에 한국어(SRT_KO) 자동 배분
  autoFillKorean: (episodeId: string) =>
    api.post<{ subtitles: SubEntry[] }>("/remotion/subtitles/auto-korean", { episodeId }).then((r) => r.data.subtitles),

  // HE+KO+VI 3종 동시 배분 (씬 경계 완전 일치 — 히브리어·한국어·베트남어 정렬 보장)
  syncAllSubtitles: (episodeId: string) =>
    api.post<{ subtitles: SubEntry[] }>("/remotion/subtitles/sync-all", { episodeId }).then((r) => r.data.subtitles),

  // 단어 치환 규칙 조회
  getWordReplacements: () =>
    api.get<{ replacements: WordReplacement[] }>("/remotion/word-replacements").then((r) => r.data.replacements),

  // 단어 치환 규칙 저장
  saveWordReplacements: (replacements: WordReplacement[]) =>
    api.post<{ success: boolean; count: number }>("/remotion/word-replacements", { replacements }).then((r) => r.data),

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

  // Gemini AI 채팅 — VideoStudio 편집 명령
  chat: (message: string, context: Partial<RemotionProps> & { subtitleCount?: number }, history: ChatMessage[]) =>
    api.post<ChatActionResult>("/remotion/chat", { message, context, history }).then((r) => r.data),

  // public/ 내 동영상 목록
  listVideos: () =>
    api.get<{ files: string[] }>("/remotion/videos").then((r) => r.data.files),

  // public/ 내 오디오 파일 목록
  listAudios: () =>
    api.get<{ files: string[] }>("/remotion/audios").then((r) => r.data.files),

  // ── ElevenLabs ──────────────────────────────────────────────────

  // ElevenLabs 음성 목록 조회
  getElevenLabsVoices: () =>
    api.get<{ voices: Array<{ voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url: string | null }> }>(
      "/remotion/elevenlabs/voices"
    ).then((r) => r.data.voices),

  // ElevenLabs 크레딧/API 키 확인
  getElevenLabsUser: () =>
    api.get<{ characterCount: number; characterLimit: number; keyValid: boolean }>("/remotion/elevenlabs/user").then((r) => r.data),

  // ElevenLabs TTS 생성 → narration.mp3 교체
  generateElevenLabsNarration: (params: {
    episodeId: string;
    voiceId: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    language?: "ko" | "vi";
  }) =>
    api.post<{ success: boolean; fileName: string; durationSec: number; durationInFrames: number; textLength: number }>(
      "/remotion/elevenlabs/generate", params
    ).then((r) => r.data),

  // ── 오디오 업로드 ────────────────────────────────────────────────

  // 나레이션 오디오 업로드 → public/narration.mp3 으로 덮어쓰기
  uploadAudio: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append("audio", file);
    return api.post<{ success: boolean; fileName: string; originalName: string }>(
      "/remotion/upload-audio", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
        },
      }
    ).then((r) => r.data);
  },
};
