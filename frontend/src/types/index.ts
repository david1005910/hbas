export type ProjectType = "bible" | "youtube";

export interface Project {
  id: string;
  name: string;
  description?: string;
  type?: ProjectType; // 기본값은 "bible" (기존 프로젝트와의 호환성)
  createdAt: string;
  updatedAt: string;
  _count?: { episodes: number };
  // YouTube 프로젝트 전용 필드
  niche?: string;
  targetAudience?: string;
  contentType?: "educational" | "entertainment" | "tutorial" | "review" | "vlog";
}

export interface BibleBook {
  id: number;
  nameKo: string;
  nameHe: string;
  nameEn: string;
  orderNo: number;
  totalChapters: number;
}

export type EpisodeStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETE";
export type AnimStyle =
  | "Epic 3D Cinematic"
  | "Pixar 3D Animation"
  | "Disney Animation"
  | "Hand-painted Watercolor 3D"
  | "Ancient Fresco Style"
  | "Dark Fantasy 3D"
  | "Soft Illuminated Manuscript";

export interface Episode {
  id: string;
  projectId: string;
  bibleBookId: number;
  bibleBook: BibleBook;
  titleKo: string;
  titleHe?: string;
  verseRange?: string;
  sceneCount: number;
  animStyle?: AnimStyle;
  targetDuration: number;
  status: EpisodeStatus;
  narrationUrl?: string | null;
  createdAt: string;
  contents?: GeneratedContent[];
  keyframes?: SceneKeyframe[];
  videoClips?: SceneVideoClip[];
}

export type ContentType = "SCRIPT" | "ANIM_PROMPT" | "SRT_KO" | "SRT_HE" | "SRT_VI" | "YT_META";

export interface GeneratedContent {
  id: string;
  episodeId: string;
  contentType: ContentType;
  content: string;
  version: number;
  aiModel?: string;
  createdAt: string;
}

export interface SceneKeyframe {
  id: string;
  episodeId: string;
  sceneNumber: number;
  promptUsed?: string;
  imageUrl?: string;
  resolution: string;
  isSelected: boolean;
  nbModel?: string;
  createdAt: string;
}

export type VideoClipStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface SceneVideoClip {
  id: string;
  keyframeId: string;
  episodeId: string;
  sceneNumber: number;
  veoJobId?: string;
  status: VideoClipStatus;
  clipUrl?: string | null;
  clipGcsUri?: string | null;
  extendCount: number;
  subClipUrl?: string | null;
  narrClipUrl?: string | null;
  durationSec: number;
  seqOrder: number;   // 0=독립, 1~N=연속 체인 순서
  seqTotal: number;   // 연속 체인 총 수 (0=독립)
  createdAt: string;
  nextClip?: SceneVideoClip; // 체인 시작 시 API 응답에 포함
}

export type PipelineStep = "script" | "prompt" | "keyframe" | "video" | "srt" | "meta";
