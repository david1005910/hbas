export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { episodes: number };
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
  createdAt: string;
  contents?: GeneratedContent[];
  keyframes?: SceneKeyframe[];
  videoClips?: SceneVideoClip[];
}

export type ContentType = "SCRIPT" | "ANIM_PROMPT" | "SRT_KO" | "SRT_HE" | "SRT_EN" | "YT_META";

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
  clipUrl?: string;
  durationSec: number;
  createdAt: string;
}

export type PipelineStep = "script" | "prompt" | "keyframe" | "video" | "srt" | "meta";
