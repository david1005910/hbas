import fs from "fs";
import path from "path";
import http from "http";
import { prisma } from "../config/database";
import { generateNarration, SubtitleTiming } from "./tts.service";
import { getMediaDuration } from "./ffmpeg.service";
import { applyWordReplacements } from "./wordReplacement.service";

export const PROJECT_PATH =
  process.env.REMOTION_PROJECT_PATH || "/app/remotion-project";

// Remotion 컨테이너 내부의 렌더 서버 주소 (Docker 서비스명 사용)
const RENDER_SERVER =
  process.env.REMOTION_RENDER_URL || "http://remotion:3003";

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  englishText?: string;
  language?: "ko" | "en";
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
  subtitlesJson?: string; // JSON: Array<{text,startSec,endSec}>
  showSubtitle?: boolean;
  showNarration?: boolean;
  bgmFileName?: string;   // BGM 파일명 (public/ 기준)
  bgmVolume?: number;     // 0.0 ~ 1.0
}

// ─── data.json 읽기/쓰기 ─────────────────────────────────────────────────────

export function writeProps(props: RemotionProps, durationInFrames?: number): void {
  // 1. data.json 업데이트 (CLI 렌더링용) — subtitlesJson 포함해야 렌더 영상에 자막 반영됨
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");

  // BGM 설정은 명시적으로 전달되지 않은 경우 기존 data.json 값을 유지 (에피소드 갱신 시 BGM 초기화 방지)
  const existingProps = readProps();
  const bgmFileName = props.bgmFileName !== undefined
    ? props.bgmFileName
    : (existingProps?.bgmFileName ?? "");
  const bgmVolume = props.bgmVolume !== undefined
    ? props.bgmVolume
    : (existingProps?.bgmVolume ?? 0.15);

  const payload: Record<string, unknown> = {
    koreanText: props.koreanText,
    hebrewText: props.hebrewText,
    englishText: props.englishText ?? "",
    language: props.language ?? "ko",
    videoFileName: props.videoFileName ?? "",
    audioFileName: props.audioFileName ?? "narration.mp3",
    subtitlesJson: props.subtitlesJson ?? "",
    showSubtitle: props.showSubtitle ?? true,
    showNarration: props.showNarration ?? true,
    bgmFileName,
    bgmVolume,
  };
  if (props.episodeId) payload.episodeId = props.episodeId;
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2), "utf-8");

  // 2. Root.tsx defaultProps 업데이트 → Remotion Studio 핫-리로드 트리거
  //    (bgmFileName/bgmVolume은 위에서 resolve된 값을 그대로 전달)
  updateRootDefaultProps({ ...props, bgmFileName, bgmVolume }, durationInFrames);
}

function updateRootDefaultProps(props: RemotionProps, durationInFrames = 150): void {
  const rootPath = path.join(PROJECT_PATH, "src", "Root.tsx");
  if (!fs.existsSync(rootPath)) return;

  const ko = JSON.stringify(props.koreanText);
  const he = JSON.stringify(props.hebrewText);
  const en = JSON.stringify(props.englishText ?? "");
  const langVal = props.language ?? "ko";
  const lang = `"${langVal}" as const`;
  const vf = JSON.stringify(props.videoFileName ?? "");
  const af = JSON.stringify(props.audioFileName ?? "narration.mp3");
  const sj = JSON.stringify(props.subtitlesJson ?? "");
  const showSub = props.showSubtitle !== false;
  const showNarr = props.showNarration !== false;
  const bmf = JSON.stringify(props.bgmFileName ?? "");
  const bmv = typeof props.bgmVolume === "number" ? props.bgmVolume : 0.15;

  const content = `import React from 'react';
import { Composition } from 'remotion';
import { HelloWorld, myCompSchema } from './HelloWorld';

const defaultProps = {
  koreanText: ${ko},
  hebrewText: ${he},
  englishText: ${en},
  language: ${lang},
  videoFileName: ${vf},
  audioFileName: ${af},
  subtitlesJson: ${sj},
  showSubtitle: ${showSub},
  showNarration: ${showNarr},
  bgmFileName: ${bmf},
  bgmVolume: ${bmv},
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="HebrewBibleAnimationStudio"
      component={HelloWorld}
      durationInFrames={${durationInFrames}}
      fps={30}
      width={1920}
      height={1080}
      schema={myCompSchema}
      defaultProps={defaultProps}
    />
  );
};
`;
  fs.writeFileSync(rootPath, content, "utf-8");
}

export function readProps(): RemotionProps | null {
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  if (!fs.existsSync(dataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  } catch {
    return null;
  }
}

/** 현재 public/subtitles.json 내용 읽기 (props 업데이트 시 유지용) */
export function readCurrentSubtitlesJson(): string {
  const filePath = path.join(PROJECT_PATH, "public", "subtitles.json");
  if (!fs.existsSync(filePath)) return "";
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/** Root.tsx에서 현재 durationInFrames 값을 읽기 (저장 시 유지용) */
export function readDurationInFrames(): number {
  const rootPath = path.join(PROJECT_PATH, "src", "Root.tsx");
  if (!fs.existsSync(rootPath)) return 150;
  try {
    const content = fs.readFileSync(rootPath, "utf-8");
    const match = content.match(/durationInFrames=\{(\d+)\}/);
    return match ? parseInt(match[1], 10) : 150;
  } catch {
    return 150;
  }
}

// ─── 렌더 서버 호출 헬퍼 ─────────────────────────────────────────────────────

function httpRequest(
  url: string,
  method: "GET" | "POST",
  body?: object,
  timeoutMs = 30_000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          let errMsg = data;
          try { errMsg = JSON.parse(data)?.error ?? data; } catch {}
          return reject(new Error(`HTTP ${res.statusCode}: ${errMsg}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`렌더 서버 응답 없음 (${timeoutMs / 1000}초 초과) — ${url}`));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── 키프레임 → Remotion 스튜디오 전송 ──────────────────────────────────────

export async function sendKeyframeToStudio(keyframeId: string): Promise<RemotionProps> {
  const keyframe = await prisma.sceneKeyframe.findUnique({
    where: { id: keyframeId },
    include: { episode: { include: { contents: { orderBy: { createdAt: "desc" } } } } },
  });
  if (!keyframe) throw new Error("Keyframe not found");
  if (!keyframe.imageUrl) throw new Error("Keyframe image not available");

  // 1. 키프레임 이미지를 Remotion public 폴더로 복사
  const srcPath = `/app${keyframe.imageUrl}`;
  const destDir = path.join(PROJECT_PATH, "public");
  // 확장자 보존 (png/jpg 등)
  const ext = path.extname(keyframe.imageUrl) || ".png";
  const destFile = `preview_keyframe_${keyframe.sceneNumber}${ext}`;
  const destPath = path.join(destDir, destFile);

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcPath, destPath);

  const contents = keyframe.episode.contents;
  const sceneNumber = keyframe.sceneNumber;
  const fallbackKo = keyframe.episode.titleKo;
  const fallbackHe = keyframe.episode.titleHe ?? "";

  // 2. 씬별 자막 텍스트 추출 (우선순위: SRT → SCRIPT → 에피소드 제목)
  let koreanText = "";
  let hebrewText = "";

  // 2-a. SRT_KO / SRT_HE 에서 씬별 텍스트 추출
  const srtKo = contents.find((c) => c.contentType === "SRT_KO");
  const srtHe = contents.find((c) => c.contentType === "SRT_HE");

  if (srtKo?.content) {
    koreanText = extractSrtSceneText(srtKo.content, sceneNumber);
  }
  if (srtHe?.content) {
    hebrewText = extractSrtSceneText(srtHe.content, sceneNumber);
  }

  // 2-b. SRT 에서 못 찾은 경우 SCRIPT 에서 추출
  if (!koreanText || !hebrewText) {
    const scriptContent = contents.find((c) => c.contentType === "SCRIPT");
    const fromScript = extractSceneText(
      scriptContent?.content ?? "",
      sceneNumber,
      fallbackKo,
      fallbackHe
    );
    if (!koreanText) koreanText = fromScript.koreanText;
    // SCRIPT에 HE 나레이션이 없으면 전체 HE 추출 시도
    if (!hebrewText) {
      const scriptHe = extractAllHebrewNarration(scriptContent?.content ?? "");
      hebrewText = fromScript.hebrewText || scriptHe;
    }
  }

  // 2-c. 히브리어 fallback: BibleVerse 원문 → titleHe
  if (!hebrewText && keyframe.episode.verseRange) {
    hebrewText = await fetchHebrewFromVerseRange(
      keyframe.episode.bibleBookId,
      keyframe.episode.verseRange
    );
  }
  if (!koreanText) koreanText = fallbackKo;
  if (!hebrewText) hebrewText = fallbackHe;

  console.log(`[Remotion] 씬 ${sceneNumber} 자막 추출:`, {
    koreanText: koreanText.slice(0, 50),
    hebrewText: hebrewText.slice(0, 30),
    srtKoExists: !!srtKo,
    srtHeExists: !!srtHe,
  });

  // 3. data.json 업데이트
  const props: RemotionProps = {
    koreanText,
    hebrewText,
    videoFileName: destFile,
    audioFileName: "narration.mp3",
    episodeId: keyframe.episodeId,
  };
  writeProps(props);
  return props;
}

/** SRT 텍스트에서 N번째 씬의 자막 텍스트 추출 */
function extractSrtSceneText(srt: string, sceneNumber: number): string {
  // BOM 제거 후 빈 줄 기준 블록 분리
  const blocks = srt
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    // 첫 줄이 씬 번호 인덱스인지 확인
    if (parseInt(lines[0], 10) === sceneNumber) {
      // 타임코드 줄(두 번째) 이후의 텍스트를 합쳐서 반환
      const textLines = lines.slice(2).filter(
        (l) => !/^\d{2}:\d{2}:\d{2}/.test(l)
      );
      const text = textLines.join(" ").trim();
      if (text) return text;
    }
  }
  return "";
}

/** SCRIPT 텍스트에서 씬별 나레이션 추출 (다양한 AI 출력 형식 지원) */
function extractSceneText(
  script: string,
  sceneNumber: number,
  fallbackKo: string,
  fallbackHe: string
): { koreanText: string; hebrewText: string } {
  if (!script) return { koreanText: fallbackKo, hebrewText: fallbackHe };

  // 마크다운 볼드(**) 제거 후 파싱
  const cleaned = script.replace(/\*\*/g, "");

  // "씬 N:" 블록 찾기 — 다음 씬 블록 또는 문자열 끝까지
  const sceneRegex = new RegExp(
    `씬\\s*${sceneNumber}\\s*[:\\.]([\\s\\S]*?)(?=씬\\s*\\d+\\s*[:\\.]|【|$)`,
    "i"
  );
  const sceneBlock = cleaned.match(sceneRegex)?.[1] ?? "";

  // 나레이션(KO) / 나레이션 (KO) / Narration(KO) 등 다양한 표기 지원
  const koMatch = sceneBlock.match(
    /나레이션\s*[\(（]?\s*KO\s*[\)）]?\s*[:\-]\s*(.+)/i
  );
  const heMatch = sceneBlock.match(
    /나레이션\s*[\(（]?\s*HE\s*[\)）]?\s*[:\-]\s*(.+)/i
  );

  return {
    koreanText: koMatch?.[1]?.trim() || fallbackKo,
    hebrewText: heMatch?.[1]?.trim() || fallbackHe,
  };
}

// ─── 렌더링 시작 (비동기) ────────────────────────────────────────────────────

export async function renderVideo(): Promise<void> {
  await httpRequest(`${RENDER_SERVER}/render`, "POST");
  // 렌더는 비동기로 진행됨 — 완료는 /status 폴링으로 확인
}

// ─── 렌더 상태 확인 ──────────────────────────────────────────────────────────

export async function getRenderStatus(): Promise<{
  status: "idle" | "rendering" | "done" | "error";
  error: string | null;
  fileReady: boolean;
}> {
  return httpRequest(`${RENDER_SERVER}/status`, "GET");
}

// ─── 다운로드 URL ─────────────────────────────────────────────────────────────

export function getDownloadUrl(): string {
  // 브라우저에서 직접 접근 가능한 URL (호스트 포트 3003)
  return "http://localhost:3003/download";
}

// ─── 에피소드 자막 텍스트 추출 (VideoStudio 에피소드 선택용) ──────────────────

export async function getEpisodeSubtitle(
  episodeId: string
): Promise<{ koreanText: string; hebrewText: string; englishText: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  let koreanText = "";
  let hebrewText = "";
  let englishText = "";

  // ── 한국어: SCRIPT 나레이션(KO) → SRT_KO → 에피소드 제목 ─────────────────
  const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
  if (scriptContent?.content) {
    koreanText = extractAllKoreanNarration(scriptContent.content);
  }
  if (!koreanText) {
    const srtKo = episode.contents.find((c) => c.contentType === "SRT_KO");
    if (srtKo?.content) {
      koreanText = srtSingleText(srtKo.content);
    }
  }
  if (!koreanText) koreanText = episode.titleKo;

  // ── 히브리어: SRT_HE → SCRIPT HE → BibleVerse 원문 → titleHe ────────────
  const srtHe = episode.contents.find((c) => c.contentType === "SRT_HE");
  if (srtHe?.content) {
    hebrewText = srtSingleText(srtHe.content);
  }

  // SCRIPT의 나레이션(HE) 라인 시도
  if (!hebrewText && scriptContent?.content) {
    hebrewText = extractAllHebrewNarration(scriptContent.content);
  }

  // verseRange → BibleVerse 원문 직접 조회
  if (!hebrewText && episode.verseRange) {
    hebrewText = await fetchHebrewFromVerseRange(episode.bibleBookId, episode.verseRange);
  }

  // 최종 fallback: titleHe
  if (!hebrewText) hebrewText = episode.titleHe ?? "";

  // ── 영어: SRT_EN → SCRIPT EN 나레이션 → titleKo 번역 없으므로 빈 문자열 ─
  const srtEn = episode.contents.find((c) => c.contentType === "SRT_EN");
  if (srtEn?.content) {
    englishText = srtSingleText(srtEn.content);
  }
  if (!englishText && scriptContent?.content) {
    englishText = extractAllEnglishNarration(scriptContent.content);
  }

  console.log(`[Remotion] 에피소드 ${episodeId} 자막 추출:`, {
    koLen: koreanText.length,
    heLen: hebrewText.length,
    enLen: englishText.length,
    hePreview: hebrewText.slice(0, 40),
  });

  return { koreanText, hebrewText, englishText };
}

// ─── 씬별 자막 텍스트 추출 (VideoStudio 씬 선택용) ──────────────────────────

export async function getEpisodeSceneText(
  episodeId: string,
  sceneNumber: number
): Promise<{ koreanText: string; hebrewText: string; englishText: string; videoFileName: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  const contents = episode.contents;
  const srtKo = contents.find((c) => c.contentType === "SRT_KO");
  const srtHe = contents.find((c) => c.contentType === "SRT_HE");
  const srtEn = contents.find((c) => c.contentType === "SRT_EN");
  const script = contents.find((c) => c.contentType === "SCRIPT");

  let koreanText = srtKo?.content ? extractSrtSceneText(srtKo.content, sceneNumber) : "";
  let hebrewText = srtHe?.content ? extractSrtSceneText(srtHe.content, sceneNumber) : "";
  let englishText = srtEn?.content ? extractSrtSceneText(srtEn.content, sceneNumber) : "";

  // SRT에서 못 찾은 경우 SCRIPT에서 추출
  if ((!koreanText || !hebrewText) && script?.content) {
    const fromScript = extractSceneText(script.content, sceneNumber, episode.titleKo, episode.titleHe ?? "");
    if (!koreanText) koreanText = fromScript.koreanText;
    if (!hebrewText) hebrewText = fromScript.hebrewText;
  }

  // 최종 fallback
  if (!koreanText) koreanText = episode.titleKo;
  if (!hebrewText) hebrewText = episode.titleHe ?? "";

  const videoFileName = `preview_keyframe_${sceneNumber}.png`;

  return { koreanText, hebrewText, englishText, videoFileName };
}

/** SRT 문자열 → 텍스트만 추출 (타임코드·인덱스 제거) */
function srtSingleText(srt: string): string {
  return srt
    .replace(/^\uFEFF/, "")
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      return lines
        .filter((l) => !/^\d+$/.test(l) && !/^\d{2}:\d{2}:\d{2}/.test(l))
        .join(" ");
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * verseRange 문자열을 파싱해 BibleVerse 원문 배열 반환 (히브리어 + 한국어)
 * 외부에서 사용 가능 (SRT 생성 시 번역 기준으로 사용)
 */
export async function fetchVersesForRange(
  bookId: number,
  verseRange: string
): Promise<Array<{ hebrewText: string; koreanText: string; verse: number }>> {
  try {
    const rangeOnly = verseRange.replace(/^[^\d]+/, "").trim();
    const match = rangeOnly.match(
      /^(\d+):(\d+)\s*-\s*(?:(\d+):)?(\d+)$|^(\d+):(\d+)$/
    );
    if (!match) return [];

    let chapter: number;
    let verseStart: number;
    let verseEnd: number;

    if (match[5]) {
      chapter = parseInt(match[5]);
      verseStart = verseEnd = parseInt(match[6]);
    } else {
      chapter = parseInt(match[1]);
      verseStart = parseInt(match[2]);
      verseEnd = parseInt(match[4]);
    }

    // 크로스-챕터 범위 처리 (예: "1:1-2:3" → 챕터1:절1 ~ 챕터2:절3)
    const endChapter = match[3] ? parseInt(match[3]) : chapter;

    let verses;
    if (endChapter !== chapter) {
      verses = await prisma.bibleVerse.findMany({
        where: {
          bookId,
          OR: [
            { chapter, verse: { gte: verseStart } },
            ...(endChapter - chapter > 1
              ? [{ chapter: { gt: chapter, lt: endChapter } }]
              : []),
            { chapter: endChapter, verse: { lte: verseEnd } },
          ],
        },
        orderBy: [{ chapter: "asc" }, { verse: "asc" }],
      });
    } else {
      verses = await prisma.bibleVerse.findMany({
        where: { bookId, chapter, verse: { gte: verseStart, lte: verseEnd } },
        orderBy: { verse: "asc" },
      });
    }

    return verses.map((v) => ({
      hebrewText: cleanHebrewForDisplay(v.hebrewText),
      koreanText: v.koreanText.trim(),
      verse: v.verse,
    }));
  } catch {
    return [];
  }
}

/**
 * verseRange 문자열을 파싱해 BibleVerse 히브리어 원문을 조합
 * 지원 형식:
 *   "1:1-5"          → 창 1:1~5
 *   "창세기 1:1-5"   → 창 1:1~5
 *   "1:1 - 1:10"     → 창 1:1~10 (공백·반복 장 표기 허용)
 *   "1:1"            → 창 1:1
 */
export async function fetchHebrewFromVerseRange(
  bookId: number,
  verseRange: string
): Promise<string> {
  try {
    // 책 이름 앞부분 제거 (숫자가 처음 나오는 위치부터 파싱)
    const rangeOnly = verseRange.replace(/^[^\d]+/, "").trim();

    // "chapter:verse - chapter:verse" 또는 "chapter:verse-verse"
    // 공백·하이픈 주위 공백 허용
    const match = rangeOnly.match(
      /^(\d+):(\d+)\s*-\s*(?:(\d+):)?(\d+)$|^(\d+):(\d+)$/
    );
    if (!match) return "";

    let chapter: number;
    let verseStart: number;
    let verseEnd: number;

    if (match[5]) {
      // 단일 절: "chapter:verse"
      chapter = parseInt(match[5]);
      verseStart = verseEnd = parseInt(match[6]);
    } else {
      chapter = parseInt(match[1]);
      verseStart = parseInt(match[2]);
      // "1:1-1:10" 같은 반복 장 표기 무시 (같은 장 가정)
      verseEnd = parseInt(match[4]);
    }

    const verses = await prisma.bibleVerse.findMany({
      where: {
        bookId,
        chapter,
        verse: { gte: verseStart, lte: verseEnd },
      },
      orderBy: { verse: "asc" },
    });

    if (verses.length === 0) return "";

    return cleanHebrewForDisplay(
      verses.map((v) => v.hebrewText).filter(Boolean).join(" ")
    );
  } catch {
    return "";
  }
}

/** SCRIPT에서 히브리어 나레이션(HE) 라인 전체 추출 */
function extractAllHebrewNarration(script: string): string {
  if (!script) return "";
  const cleaned = script.replace(/\*\*/g, "");
  const matches = cleaned.match(/나레이션\s*[\(（]?\s*HE\s*[\)）]?\s*[:\-]\s*(.+)/gi) ?? [];
  return matches
    .map((m) => m.replace(/나레이션\s*[\(（]?\s*HE\s*[\)）]?\s*[:\-]\s*/i, "").trim())
    .filter(Boolean)
    .join(" ");
}

// 히브리어 라인당 최대 글자 수 (자음+공백 포함, 한 화면 한 줄 기준)
const HE_CHARS_PER_LINE = 30;

/** 히브리어 니쿠드·칸틸레이션 기호 제거 → 기본 문자만 */
function stripNiqqud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, "");
}

/** 히브리어 텍스트를 단어 경계 기준으로 HE_CHARS_PER_LINE 이내로 분할
 *  자음 수 + 공백 수를 합산하여 실제 렌더 길이 기준으로 제한 */
function splitHebrewByLength(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const segments: string[] = [];
  let current = "";
  let lineLen = 0; // 자음 + 공백 합계

  for (const word of words) {
    const wordLen = stripNiqqud(word).length;
    // 현재 세그먼트에 추가할 길이: 단어 + (앞 공백 1칸, 첫 단어 제외)
    const addLen = current ? wordLen + 1 : wordLen;

    if (lineLen + addLen > HE_CHARS_PER_LINE && current) {
      // 현재 세그먼트 확정 → 새 세그먼트 시작
      segments.push(current.trim());
      current = word;
      lineLen = wordLen;
    } else {
      current = current ? `${current} ${word}` : word;
      lineLen += addLen;
    }
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

// 한국어 자막 한 줄 최대 글자 수
const KO_CHARS_PER_LINE = 30;

/** 히브리어 텍스트를 N등분 (단어 경계 기준, RTL 그대로 유지) */
function splitHebrewIntoN(text: string, n: number): string[] {
  if (n <= 1) return [text.trim()];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return Array(n).fill("");
  const size = Math.ceil(words.length / n);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const chunk = words.slice(i * size, (i + 1) * size).join(" ");
    if (chunk) parts.push(chunk.trim());
  }
  // 부족하면 마지막 항목으로 채움
  while (parts.length < n) parts.push(parts[parts.length - 1] ?? text.trim());
  return parts;
}

/** 한국어 텍스트를 N등분 (단어 경계 기준), 각 세그먼트 KO_CHARS_PER_LINE 이내로 제한 */
function splitKoreanIntoN(text: string, n: number): string[] {
  if (n <= 1) return [trimKo(text)];
  const words = text.split(/\s+/).filter(Boolean);
  const size = Math.ceil(words.length / n);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const chunk = words.slice(i * size, (i + 1) * size).join(" ");
    if (chunk) parts.push(trimKo(chunk));
  }
  // 부족하면 빈 문자열로 채워 N개 맞춤
  while (parts.length < n) parts.push(parts[parts.length - 1] ?? "");
  return parts;
}

/** 한국어 세그먼트를 KO_CHARS_PER_LINE 이내로 단어 경계에서 잘라냄 */
function trimKo(text: string): string {
  if (text.length <= KO_CHARS_PER_LINE) return text;
  const spaceIdx = text.lastIndexOf(" ", KO_CHARS_PER_LINE);
  return (spaceIdx > KO_CHARS_PER_LINE / 2 ? text.slice(0, spaceIdx) : text.slice(0, KO_CHARS_PER_LINE)).trim();
}

/**
 * verseRange 기준으로 구절별 자막 페어 생성 (히브리어-한국어 절 단위 1:1 대응)
 *
 * 각 절마다:
 *   - 히브리어: ~HE_CHARS_PER_LINE 기본 문자씩 서브 세그먼트로 분할
 *   - 한국어: 해당 절의 번역 전체 (히브리어 서브 세그먼트 모두에 동일하게 반복)
 *   → 히브리어와 한국어가 항상 같은 절에서 온다는 것을 보장
 *
 * 타이밍: 히브리어 기본 문자 수 비례 배분
 */
async function buildVerseSubtitlePairs(
  bookId: number,
  verseRange: string,
  totalDurationSec: number
): Promise<Array<{ heText: string; text: string; startSec: number; endSec: number; verseNum: number }>> {
  try {
    const rangeOnly = verseRange.replace(/^[^\d]+/, "").trim();
    const match = rangeOnly.match(
      /^(\d+):(\d+)\s*-\s*(?:(\d+):)?(\d+)$|^(\d+):(\d+)$/
    );
    if (!match) return [];

    let chapter: number, verseStart: number, verseEnd: number;
    if (match[5]) {
      chapter = parseInt(match[5]);
      verseStart = verseEnd = parseInt(match[6]);
    } else {
      chapter = parseInt(match[1]);
      verseStart = parseInt(match[2]);
      verseEnd = parseInt(match[4]);
    }

    const verses = await prisma.bibleVerse.findMany({
      where: { bookId, chapter, verse: { gte: verseStart, lte: verseEnd } },
      orderBy: { verse: "asc" },
    });
    if (verses.length === 0) return [];

    // 절마다 (히브리어 서브세그먼트[], 한국어 번역) 쌍 구성
    // 히브리어 서브세그먼트가 여러 개여도 한국어는 그 절의 번역 전체를 반복 표시
    type VersePair = { heText: string; koText: string; baseChars: number; verseNum: number };
    const pairs: VersePair[] = [];

    for (const v of verses) {
      const cleanedHe = cleanHebrewForDisplay(v.hebrewText);
      const cleanedKo = applyWordReplacements(v.koreanText.trim());
      if (!cleanedHe) continue;

      const heSegs = splitHebrewByLength(cleanedHe);
      for (const seg of heSegs) {
        pairs.push({
          heText: seg,
          koText: cleanedKo,   // 같은 절의 한국어 번역 — 항상 일치
          baseChars: stripNiqqud(seg).replace(/\s/g, "").length,
          verseNum: v.verse,   // 절 번호 — 한국어 배분에 활용
        });
      }
    }

    if (pairs.length === 0) return [];

    // 히브리어 기본 문자 수 비례 타이밍 배분
    const totalBaseChars = pairs.reduce((sum, p) => sum + p.baseChars, 0);
    const result: Array<{ heText: string; text: string; startSec: number; endSec: number; verseNum: number }> = [];
    let currentSec = 0;

    for (const pair of pairs) {
      const segDur = (pair.baseChars / totalBaseChars) * totalDurationSec;
      result.push({
        heText: pair.heText,
        text: pair.koText,
        startSec: currentSec,
        endSec: currentSec + segDur,
        verseNum: pair.verseNum,
      });
      currentSec += segDur;
    }

    console.log(`[Subtitle] 절 기반 자막 ${result.length}개 (${verses.length}절): ${verses.map((v) => `${v.verse}절`).join(", ")}`);
    return result;
  } catch {
    return [];
  }
}

/** SCRIPT에서 영어 나레이션(EN) 라인 전체 추출 */
export function extractAllEnglishNarration(script: string): string {
  if (!script) return "";
  const cleaned = script.replace(/\*\*/g, "");
  // "Narration(EN):", "나레이션(EN):", "Narration:" 등 다양한 표기 지원
  const matches = cleaned.match(
    /(?:Narration|나레이션)\s*[\(（]?\s*EN\s*[\)）]?\s*[:\-]\s*(.+)/gi
  ) ?? [];
  if (matches.length > 0) {
    return matches
      .map((m) => m.replace(/(?:Narration|나레이션)\s*[\(（]?\s*EN\s*[\)）]?\s*[:\-]\s*/i, "").trim())
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

// ─── SCRIPT에서 한국어 나레이션 전체 추출 ────────────────────────────────────

export function extractAllKoreanNarration(script: string): string {
  if (!script) return "";
  const cleaned = script.replace(/\*\*/g, "");

  // 모든 "나레이션(KO):" 라인 추출
  const matches = cleaned.match(/나레이션\s*[\(（]?\s*KO\s*[\)）]?\s*[:\-]\s*(.+)/gi) ?? [];
  return matches
    .map((m) => m.replace(/나레이션\s*[\(（]?\s*KO\s*[\)）]?\s*[:\-]\s*/i, "").trim())
    .filter(Boolean)
    .join(" ");
}

// ─── 히브리어 텍스트 정리 (Sefaria 편집 주석·단락 기호 제거) ──────────────────

/** Sefaria SRT/API에서 오는 히브리어 텍스트의 편집 주석·특수기호·유니코드 제어문자 제거 */
function cleanHebrewForDisplay(text: string): string {
  return text
    .replace(/[\u0591-\u05AF]/g, "")                                   // 칸틸레이션 마크 (트로프/악센트) — 폰트 미지원 □ 원인
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")  // 양방향·제어문자 (□ 원인)
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")   // 비표준 유니코드 공백 → 일반 공백 (□ 원인)
    .replace(/\*([\(（][^)）]*[\)）])/g, "")                             // *(주석) 형태 편집 주석
    .replace(/\([\u0591-\u05FF\s,]+\)/g, "")                           // 히브리어 괄호 주석
    .replace(/\{[^\}]*\}/g, "")                                         // {ס}, {פ} 단락 기호
    .replace(/&nbsp;/g, " ")                                            // HTML 엔티티
    .replace(/&[a-zA-Z0-9#]+;/g, "")                                   // 기타 HTML 엔티티
    .replace(/<[^>]*>/g, "")                                            // HTML 태그
    .replace(/\s{2,}/g, " ")                                            // 연속 공백
    .trim();
}

// ─── 히브리어 텍스트를 타이밍 배열에 배분 ──────────────────────────────────────

function distributeHebrewToTimings(
  timings: SubtitleTiming[],
  hebrewText: string,
  totalDurationSec: number
): SubtitleTiming[] {
  if (!hebrewText || timings.length === 0) return timings;
  const heSegments = splitHebrewByLength(hebrewText);
  const N = heSegments.length;
  if (N === 0) return timings;
  const segDur = totalDurationSec / N;
  return timings.map((t) => {
    const segIdx = Math.min(Math.floor(t.startSec / segDur), N - 1);
    return { ...t, heText: heSegments[segIdx] };
  });
}

/** 에피소드의 히브리어 텍스트를 우선순위대로 추출 */
async function fetchEpisodeHebrew(
  episode: { contents: { contentType: string; content: string }[]; bibleBookId: number; verseRange: string | null; titleHe: string | null }
): Promise<string> {
  const srtHe = episode.contents.find((c) => c.contentType === "SRT_HE");
  if (srtHe?.content) return cleanHebrewForDisplay(srtSingleText(srtHe.content));

  const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
  if (scriptContent?.content) {
    const fromScript = extractAllHebrewNarration(scriptContent.content);
    if (fromScript) return fromScript;
  }

  if (episode.verseRange) {
    const fromVerse = await fetchHebrewFromVerseRange(episode.bibleBookId, episode.verseRange);
    if (fromVerse) return fromVerse;
  }

  return episode.titleHe ?? "";
}

/** SRT 파일에서 씬별 텍스트를 배열로 추출 (인덱스·타임코드 제외) */
function extractSrtAllScenes(srt: string): string[] {
  return srt
    .replace(/^\uFEFF/, "")
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      return lines
        .filter((l) => !/^\d+$/.test(l) && !/^\d{2}:\d{2}:\d{2}/.test(l))
        .join(" ");
    })
    // 방향 제어 문자만 있는 항목 제거 (\u202B\u202C 같은 빈 히브리어 래퍼 포함)
    .filter((s) => s.replace(/[\u202A-\u202E\u200B-\u200F\uFEFF\u00A0\s]/g, "").length > 0);
}

/** 영어 씬 배열을 타이밍 배열의 enText에 시간 비례 배분 */
function distributeEnglishToTimings(
  timings: SubtitleTiming[],
  englishScenes: string[]
): SubtitleTiming[] {
  if (!englishScenes.length || timings.length === 0) return timings;
  const N = englishScenes.length;
  const total = timings[timings.length - 1].endSec;
  const segDur = total / N;
  return timings.map((t) => {
    const idx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
    return { ...t, enText: englishScenes[idx] ?? englishScenes[N - 1] ?? "" };
  });
}

// ─── 기존 자막에 히브리어 자동 배분 ──────────────────────────────────────────

/** 히브리어 씬 배열을 타이밍 배열의 heText에 시간 비례 배분 (한국어/영어와 동일한 방식) */
function distributeHebrewToTimingsScene(
  timings: SubtitleTiming[],
  hebrewScenes: string[]
): SubtitleTiming[] {
  if (!hebrewScenes.length || timings.length === 0) return timings;
  const N = hebrewScenes.length;
  const total = timings[timings.length - 1].endSec;
  const segDur = total / N;
  return timings.map((t) => {
    const idx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
    return { ...t, heText: hebrewScenes[idx] ?? hebrewScenes[N - 1] ?? "" };
  });
}

export async function distributeHebrewForEpisode(episodeId: string): Promise<SubtitleTiming[]> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  const subtitlesPath = path.join(PROJECT_PATH, "public", "subtitles.json");
  if (!fs.existsSync(subtitlesPath)) throw new Error("subtitles.json 파일이 없습니다. 나레이션을 먼저 생성하세요.");

  const existing: SubtitleTiming[] = JSON.parse(fs.readFileSync(subtitlesPath, "utf-8"));
  if (!Array.isArray(existing) || existing.length === 0) throw new Error("자막 항목이 없습니다.");

  // SRT_HE에서 씬별 텍스트 추출 (한국어/영어와 동일한 씬 기반 배분)
  const srtHe = episode.contents.find((c) => c.contentType === "SRT_HE");
  let hebrewScenes: string[] = [];

  if (srtHe?.content) {
    hebrewScenes = extractSrtAllScenes(srtHe.content);
  }

  // SRT_HE가 없으면 SCRIPT HE 또는 전체 히브리어 텍스트로 fallback
  if (!hebrewScenes.length) {
    const episodeHebrew = await fetchEpisodeHebrew(episode as any);
    if (!episodeHebrew) throw new Error("히브리어 텍스트를 찾을 수 없습니다. SRT_HE 또는 SCRIPT HE를 먼저 생성하세요.");
    hebrewScenes = [episodeHebrew];
  }

  const totalDuration = existing[existing.length - 1].endSec;
  const N = hebrewScenes.length;
  const n = existing.length;

  let updated: SubtitleTiming[];
  // N=1이면 절 단위 배분 우선 시도 (verseRange 있을 때), 없으면 전체 텍스트 유지
  if (N === 1 && n > 1) {
    if (episode.verseRange && episode.bibleBookId) {
      const verseHeBounds = await getVerseHebrewBoundaries(episode.bibleBookId, episode.verseRange, totalDuration);
      if (verseHeBounds && verseHeBounds.length > 0) {
        const verseMap = new Map(verseHeBounds.map((b) => [b.verseNum, b.hebrewText]));
        // verseNum 필드가 있으면 직접 매핑 (TTS 타이밍과 히브리어 글자 수 비례의 불일치 방지)
        const hasVerseNums = existing.every((t: any) => typeof (t as any).verseNum === "number");
        if (hasVerseNums) {
          updated = existing.map((t) => ({
            ...t,
            heText: verseMap.get((t as any).verseNum) ?? verseHeBounds[verseHeBounds.length - 1].hebrewText,
          }));
          console.log(`[Subtitle] 히브리어 배분(verseNum 직접 매핑 ${verseHeBounds.length}절→${n}개) 완료`);
        } else {
          // verseNum 없으면 시간 비례 fallback
          updated = existing.map((t) => {
            let idx = verseHeBounds.findIndex((b, i) => {
              const isLast = i === verseHeBounds.length - 1;
              return t.startSec >= b.startSec && (isLast || t.startSec < verseHeBounds[i + 1].startSec);
            });
            if (idx < 0) idx = verseHeBounds.length - 1;
            return { ...t, heText: verseHeBounds[idx].hebrewText };
          });
          console.log(`[Subtitle] 히브리어 배분(시간 비례 ${verseHeBounds.length}절→${n}개) 완료`);
        }
      } else {
        // 절 경계 없음 → 전체 텍스트를 모든 항목에 동일하게
        updated = existing.map((t) => ({ ...t, heText: cleanHebrewForDisplay(hebrewScenes[0]) }));
        console.log(`[Subtitle] 히브리어 배분(단일씬 전체, 절 경계 없음) 완료`);
      }
    } else {
      // verseRange 없음 → 전체 텍스트를 모든 항목에 동일하게
      updated = existing.map((t) => ({ ...t, heText: cleanHebrewForDisplay(hebrewScenes[0]) }));
      console.log(`[Subtitle] 히브리어 배분(단일씬 전체, verseRange 없음) 완료`);
    }
  } else {
    const segDur = totalDuration / N;
    updated = existing.map((t) => {
      const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
      return { ...t, heText: hebrewScenes[sIdx] ?? "" };
    });
    console.log(`[Subtitle] 히브리어 배분 완료: ${updated.filter((s) => s.heText).length}개 항목 (${N}씬)`);
  }

  const subtitlesJson = JSON.stringify(updated);
  fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");

  const currentProps = readProps();
  const currentDuration = readDurationInFrames();
  const heText = hebrewScenes.join(" ");
  writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: heText }), subtitlesJson }, currentDuration);

  return updated;
}

// ─── 절 기반 시간 경계 계산 (한국어·영어 배분에 공통 사용) ──────────────────────

/**
 * verseRange + bookId로 BibleVerse를 조회해 절 단위 히브리어 텍스트와 타임 경계를 반환.
 * 반환값: 절마다 { startSec, endSec, hebrewText, verseNum }
 * — heText는 정제된 히브리어 원문 전체 (30자 세그먼트 분할 없음)
 */
async function getVerseHebrewBoundaries(
  bookId: number,
  verseRange: string,
  totalDurationSec: number
): Promise<Array<{ startSec: number; endSec: number; hebrewText: string; verseNum: number }> | null> {
  try {
    const rangeOnly = verseRange.replace(/^[^\d]+/, "").trim();
    const match = rangeOnly.match(/^(\d+):(\d+)\s*-\s*(?:(\d+):)?(\d+)$|^(\d+):(\d+)$/);
    if (!match) return null;

    let chapter: number, verseStart: number, verseEnd: number;
    if (match[5]) {
      chapter = parseInt(match[5]);
      verseStart = verseEnd = parseInt(match[6]);
    } else {
      chapter = parseInt(match[1]);
      verseStart = parseInt(match[2]);
      verseEnd = parseInt(match[4]);
    }
    const endChapter = match[3] ? parseInt(match[3]) : chapter;

    let verses;
    if (endChapter !== chapter) {
      verses = await prisma.bibleVerse.findMany({
        where: {
          bookId,
          OR: [
            { chapter, verse: { gte: verseStart } },
            ...(endChapter - chapter > 1 ? [{ chapter: { gt: chapter, lt: endChapter } }] : []),
            { chapter: endChapter, verse: { lte: verseEnd } },
          ],
        },
        orderBy: [{ chapter: "asc" }, { verse: "asc" }],
      });
    } else {
      verses = await prisma.bibleVerse.findMany({
        where: { bookId, chapter, verse: { gte: verseStart, lte: verseEnd } },
        orderBy: { verse: "asc" },
      });
    }
    if (verses.length === 0) return null;

    // 히브리어 자음 수 비례로 각 절의 시간 배분
    const charCounts = verses.map((v) =>
      Math.max(1, stripNiqqud(cleanHebrewForDisplay(v.hebrewText)).replace(/\s/g, "").length)
    );
    const totalChars = charCounts.reduce((a, b) => a + b, 0);

    let cumSec = 0;
    return verses.map((v, i) => {
      const dur = (charCounts[i] / totalChars) * totalDurationSec;
      const boundary = {
        startSec: cumSec,
        endSec: cumSec + dur,
        hebrewText: cleanHebrewForDisplay(v.hebrewText),
        verseNum: v.verse,
      };
      cumSec += dur;
      return boundary;
    });
  } catch {
    return null;
  }
}

/**
 * verseRange + bookId로 BibleVerse를 조회해 히브리어 자음 수 비례 타임 경계를 계산.
 * 반환값: 절마다 { startSec, endSec, koreanText, verseNum }
 */
async function getVerseTimeBoundaries(
  bookId: number,
  verseRange: string,
  totalDurationSec: number
): Promise<Array<{ startSec: number; endSec: number; koreanText: string; verseNum: number }> | null> {
  try {
    const rangeOnly = verseRange.replace(/^[^\d]+/, "").trim();
    const match = rangeOnly.match(/^(\d+):(\d+)\s*-\s*(?:(\d+):)?(\d+)$|^(\d+):(\d+)$/);
    if (!match) return null;

    let chapter: number, verseStart: number, verseEnd: number;
    if (match[5]) {
      chapter = parseInt(match[5]);
      verseStart = verseEnd = parseInt(match[6]);
    } else {
      chapter = parseInt(match[1]);
      verseStart = parseInt(match[2]);
      verseEnd = parseInt(match[4]);
    }
    const endChapter = match[3] ? parseInt(match[3]) : chapter;

    let verses;
    if (endChapter !== chapter) {
      verses = await prisma.bibleVerse.findMany({
        where: {
          bookId,
          OR: [
            { chapter, verse: { gte: verseStart } },
            ...(endChapter - chapter > 1 ? [{ chapter: { gt: chapter, lt: endChapter } }] : []),
            { chapter: endChapter, verse: { lte: verseEnd } },
          ],
        },
        orderBy: [{ chapter: "asc" }, { verse: "asc" }],
      });
    } else {
      verses = await prisma.bibleVerse.findMany({
        where: { bookId, chapter, verse: { gte: verseStart, lte: verseEnd } },
        orderBy: { verse: "asc" },
      });
    }
    if (verses.length === 0) return null;

    // 히브리어 자음 수 비례로 각 절의 시간 배분
    const charCounts = verses.map((v) =>
      Math.max(1, stripNiqqud(cleanHebrewForDisplay(v.hebrewText)).replace(/\s/g, "").length)
    );
    const totalChars = charCounts.reduce((a, b) => a + b, 0);

    let cumSec = 0;
    return verses.map((v, i) => {
      const dur = (charCounts[i] / totalChars) * totalDurationSec;
      const boundary = {
        startSec: cumSec,
        endSec: cumSec + dur,
        koreanText: applyWordReplacements(v.koreanText.trim()),
        verseNum: v.verse,
      };
      cumSec += dur;
      return boundary;
    });
  } catch {
    return null;
  }
}

// ─── 기존 자막에 한국어 자동 배분 (BibleVerse.koreanText → text) ───────────────

/**
 * 한국어 씬 배열을 타이밍 배열의 text에 시간 비례 배분
 */
function distributeKoreanToTimings(
  timings: SubtitleTiming[],
  koreanScenes: string[],
  totalDurationSec?: number
): SubtitleTiming[] {
  if (!koreanScenes.length || timings.length === 0) return timings;
  const N = koreanScenes.length;
  const total = totalDurationSec ?? timings[timings.length - 1].endSec;
  const segDur = total / N;
  return timings.map((t) => {
    const idx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
    return { ...t, text: koreanScenes[idx] ?? koreanScenes[N - 1] ?? "" };
  });
}

export async function distributeKoreanForEpisode(episodeId: string): Promise<SubtitleTiming[]> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  const subtitlesPath = path.join(PROJECT_PATH, "public", "subtitles.json");
  if (!fs.existsSync(subtitlesPath)) throw new Error("subtitles.json 파일이 없습니다. 나레이션을 먼저 생성하세요.");

  const existing: SubtitleTiming[] = JSON.parse(fs.readFileSync(subtitlesPath, "utf-8"));
  if (!Array.isArray(existing) || existing.length === 0) throw new Error("자막 항목이 없습니다.");

  const totalDuration = existing[existing.length - 1].endSec;
  let updated: SubtitleTiming[];

  // ── 1순위: SRT_KO 씬 배분 (사용자 편집 내용 항상 반영 — 기존 text 무조건 덮어씀) ───
  const srtKoFirst = episode.contents.find((c) => c.contentType === "SRT_KO");
  if (srtKoFirst?.content) {
    const koreanScenes = extractSrtAllScenes(srtKoFirst.content);
    if (koreanScenes.length > 0) {
      const N = koreanScenes.length;
      const n = existing.length;
      // N=1이면 전체 텍스트를 단어 단위로 분할해 나레이션 타이밍과 동기화
      if (N === 1 && n > 1) {
        const koChunks = expandSceneToChunks(koreanScenes[0], n, KO_CHARS_PER_LINE);
        updated = existing.map((t, i) => ({ ...t, text: applyWordReplacements(koChunks[i] ?? "") }));
        console.log(`[Subtitle] 한국어 배분(SRT_KO 단어분할, ${n}개) 완료`);
      } else {
        const segDur = totalDuration / N;
        updated = existing.map((t) => {
          const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
          return { ...t, text: applyWordReplacements(koreanScenes[sIdx] ?? "") };
        });
        console.log(`[Subtitle] 한국어 배분(SRT_KO ${N}씬) 완료: ${updated.filter((s) => s.text).length}개 항목`);
      }
      const subtitlesJson = JSON.stringify(updated);
      fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
      const currentProps = readProps();
      writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
      return updated;
    }
  }

  // ── 2순위: BibleVerse 절 기반 배분 (SRT_KO 없을 때) ─────────────────────────
  // 1순위: BibleVerse 절 기반 배분 (verseRange가 있을 때, 한국어 텍스트가 실제로 있을 때만)
  if (episode.verseRange && episode.bibleBookId) {
    const boundaries = await getVerseTimeBoundaries(episode.bibleBookId, episode.verseRange, totalDuration);
    if (boundaries && boundaries.length > 0 && boundaries.some((b) => b.koreanText)) {
      updated = existing.map((t) => {
        let idx = boundaries.findIndex((b, i) => {
          const isLast = i === boundaries.length - 1;
          return t.startSec >= b.startSec && (isLast || t.startSec < boundaries[i + 1].startSec);
        });
        if (idx < 0) idx = boundaries.length - 1;
        return { ...t, text: boundaries[idx].koreanText };
      });
      console.log(`[Subtitle] 한국어 배분(절 기반) 완료: ${updated.filter((s) => s.text).length}개 항목 (${boundaries.length}절)`);
      const subtitlesJson = JSON.stringify(updated);
      fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
      const currentProps = readProps();
      writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
      return updated;
    }
    // BibleVerse.koreanText가 없어도 verseRange가 있으면 절 수로 SRT_KO 비례 배분
    if (boundaries && boundaries.length > 0) {
      console.log(`[Subtitle] BibleVerse.koreanText 비어있음 (${boundaries.length}절) → SRT_KO 절 비례 배분 시도`);
      const srtKoContent = episode.contents.find((c) => c.contentType === "SRT_KO");
      if (srtKoContent?.content) {
        const koScenes = extractSrtAllScenes(srtKoContent.content);
        if (koScenes.length > 0) {
          // TTS 자막이 이미 다양하면 나레이션 ↔ 자막 일치를 보호 (SRT 씬보다 많은 고유값 = TTS 생성 텍스트)
          const existingKoValues = new Set(existing.map((t) => t.text).filter(Boolean));
          if (existingKoValues.size > koScenes.length) {
            console.log(`[Subtitle] 기존 한국어 ${existingKoValues.size}개 고유값 > SRT 씬 ${koScenes.length}개 → TTS 자막 보존 (나레이션 일치)`);
            return existing;
          }

          const V = boundaries.length;
          const K = koScenes.length;

          // TTS 텍스트 보존: 비어있는 항목만 씬 텍스트로 채움 (sub-phrase 분할 없음)
          updated = existing.map((t) => {
            if (t.text && t.text.trim()) return t;
            let vIdx = boundaries.findIndex((b, i) => {
              const isLast = i === boundaries.length - 1;
              return t.startSec >= b.startSec && (isLast || t.startSec < boundaries[i + 1].startSec);
            });
            if (vIdx < 0) vIdx = V - 1;
            const sIdx = Math.min(Math.floor(vIdx * K / V), K - 1);
            return { ...t, text: koScenes[sIdx] ?? "" };
          });
          const subtitlesJson = JSON.stringify(updated);
          fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
          const currentProps = readProps();
          writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
          console.log(`[Subtitle] 한국어 배분(절 비례 SRT, ${V}절→${K}씬) 완료: ${updated.filter((s) => s.text).length}개 항목`);
          return updated;
        }
      }
    }
  }

  // 2순위: SRT_KO 씬 배분 (verseNum이 있으면 절 단위, 없으면 시간 비례)
  let koreanScenes: string[] = [];
  const srtKo = episode.contents.find((c) => c.contentType === "SRT_KO");
  if (srtKo?.content) koreanScenes = extractSrtAllScenes(srtKo.content);

  // verseNum 필드가 있으면 절 단위 비례 배분 (TTS 텍스트 보존, 비어있는 항목만 채움)
  if (koreanScenes.length > 0) {
    const verseNums = existing.map((t: any) => t.verseNum as number | undefined).filter((v): v is number => v !== undefined);
    if (verseNums.length === existing.length) {
      const uniqueVerses = [...new Set(verseNums)].sort((a, b) => a - b);
      const V = uniqueVerses.length;
      const K = koreanScenes.length;

      const verseToSceneIdx: Record<number, number> = {};
      uniqueVerses.forEach((vn, i) => {
        verseToSceneIdx[vn] = Math.min(Math.floor(i * K / V), K - 1);
      });

      // TTS 텍스트 보존: 비어있는 항목만 씬 텍스트로 채움
      updated = (existing as any[]).map((t) => {
        if (t.text && t.text.trim()) return t;
        const vn: number = t.verseNum ?? uniqueVerses[uniqueVerses.length - 1];
        const sIdx = verseToSceneIdx[vn] ?? K - 1;
        return { ...t, text: koreanScenes[sIdx] ?? "" };
      });
      const subtitlesJson = JSON.stringify(updated);
      fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
      const currentProps = readProps();
      writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
      console.log(`[Subtitle] 한국어 배분(절 비례 verseNum, ${V}절→${K}씬) 완료: ${updated.filter((s) => s.text).length}개 항목`);
      return updated;
    }
  }

  // 3순위: SCRIPT 나레이션(KO)
  if (!koreanScenes.length) {
    const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
    if (scriptContent?.content) {
      const allKo = extractAllKoreanNarration(scriptContent.content);
      if (allKo) koreanScenes = [allKo];
    }
  }
  // 4순위: 에피소드의 한국어 텍스트를 직접 추출 (SRT_KO 전체 합산 or 제목)
  if (!koreanScenes.length) {
    // SRT_KO 전체를 하나의 씬으로
    const srtKoContent = episode.contents.find((c) => c.contentType === "SRT_KO");
    if (srtKoContent?.content) {
      const koText = srtSingleText(srtKoContent.content);
      if (koText) koreanScenes = [koText];
    }
  }
  // 5순위: data.json koreanText — 기존 항목에 이미 다양한 한국어가 있으면 사용 안 함
  if (!koreanScenes.length) {
    const existingKoValues = new Set(existing.map((t) => t.text).filter(Boolean));
    if (existingKoValues.size > 1) {
      // 이미 다양한 한국어 값이 있음 → 단일 값 폴백 금지, 현재 값 유지
      console.log(`[Subtitle] 기존 한국어 ${existingKoValues.size}개 고유값 → 폴백 덮어쓰기 방지`);
      return existing;
    }
    const savedProps = readProps();
    if (savedProps?.koreanText) {
      koreanScenes = [savedProps.koreanText];
      console.log(`[Subtitle] 폴백: data.json koreanText 사용 (${koreanScenes[0].length}자)`);
    }
  }
  // 6순위: 에피소드 제목 — 기존 한국어가 다양하면 사용 안 함
  if (!koreanScenes.length && episode.titleKo) {
    const existingKoValues = new Set(existing.map((t) => t.text).filter(Boolean));
    if (existingKoValues.size > 1) {
      console.log(`[Subtitle] 기존 한국어 ${existingKoValues.size}개 고유값 → 에피소드 제목 폴백 방지`);
      return existing;
    }
    koreanScenes = [episode.titleKo];
    console.log(`[Subtitle] 폴백: 에피소드 제목 사용 — "${episode.titleKo}"`);
  }

  if (!koreanScenes.length) throw new Error("한국어 텍스트를 찾을 수 없습니다. SRT_KO 또는 SCRIPT를 먼저 생성하세요.");

  updated = distributeKoreanToTimings(existing, koreanScenes, totalDuration);
  const subtitlesJson = JSON.stringify(updated);
  fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
  const currentProps = readProps();
  writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
  console.log(`[Subtitle] 한국어 배분(SRT_KO) 완료: ${updated.filter((s) => s.text).length}개 항목 (${koreanScenes.length}씬)`);
  return updated;
}

// ─── 기존 자막에 영어 자동 배분 (SRT_EN → enText, 절 기반 우선) ───────────────

export async function distributeEnglishForEpisode(episodeId: string): Promise<SubtitleTiming[]> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  const subtitlesPath = path.join(PROJECT_PATH, "public", "subtitles.json");
  if (!fs.existsSync(subtitlesPath)) throw new Error("subtitles.json 파일이 없습니다. 나레이션을 먼저 생성하세요.");

  const existing: SubtitleTiming[] = JSON.parse(fs.readFileSync(subtitlesPath, "utf-8"));
  if (!Array.isArray(existing) || existing.length === 0) throw new Error("자막 항목이 없습니다.");

  const srtEn = episode.contents.find((c) => c.contentType === "SRT_EN");
  if (!srtEn?.content) throw new Error("SRT_EN 컨텐츠가 없습니다. 에피소드 상세 페이지에서 SRT 3종을 먼저 생성하세요.");

  const englishScenes = extractSrtAllScenes(srtEn.content);
  if (!englishScenes.length) throw new Error("SRT_EN에서 텍스트를 추출할 수 없습니다.");

  const totalDuration = existing[existing.length - 1].endSec;
  const N = englishScenes.length;
  const n = existing.length;

  let updated: SubtitleTiming[];
  // N=1이면 전체 영어 텍스트를 단어 단위로 분할해 나레이션 타이밍과 동기화
  if (N === 1 && n > 1) {
    const enChunks = expandSceneToChunks(englishScenes[0], n, 40);
    updated = existing.map((t, i) => ({ ...t, enText: enChunks[i] ?? "" }));
    console.log(`[Subtitle] 영어 배분(SRT_EN 단어분할, ${n}개) 완료`);
  } else {
    const segDur = totalDuration / N;
    updated = existing.map((t) => {
      const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
      return { ...t, enText: englishScenes[sIdx] ?? "" };
    });
    console.log(`[Subtitle] 영어 배분(SRT_EN ${N}씬) 완료: ${updated.filter((s) => s.enText).length}개 항목`);
  }

  const subtitlesJson = JSON.stringify(updated);
  fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
  writeProps({ ...(readProps() ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
  return updated;
}

// ─── HE + KO + EN 3종 자막 동시 배분 (씬 경계 완전 일치) ────────────────────────

/**
 * SRT_HE / SRT_KO / SRT_EN을 동일한 씬 경계로 subtitles.json에 배분.
 * SRT_HE 씬 수를 기준으로 삼아 Korean·English도 동일 시간 구간에 맞춤 →
 * 히브리어 N씬 = 한국어 N씬 = 영어 N씬 보장.
 */
/**
 * 단일 씬 텍스트를 n개 항목에 단어 단위로 균등 분할 (≤maxChars 기준)
 * sceneCount=1인 경우 전체 텍스트가 한 항목에 몰리는 것을 방지해 나레이션 타이밍과 동기화
 */
function expandSceneToChunks(text: string, n: number, _maxChars: number): string[] {
  if (!text || n <= 0) return Array(n).fill("");
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return Array(n).fill("");
  return Array.from({ length: n }, (_, i) => {
    const start = Math.floor(i * words.length / n);
    const end = Math.floor((i + 1) * words.length / n);
    return words.slice(start, Math.max(end, start + 1)).join(" ").trim();
  });
}

export async function syncAllSubtitlesForEpisode(episodeId: string): Promise<SubtitleTiming[]> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  const subtitlesPath = path.join(PROJECT_PATH, "public", "subtitles.json");
  if (!fs.existsSync(subtitlesPath)) throw new Error("subtitles.json 파일이 없습니다. 나레이션을 먼저 생성하세요.");

  const existing: SubtitleTiming[] = JSON.parse(fs.readFileSync(subtitlesPath, "utf-8"));
  if (!Array.isArray(existing) || existing.length === 0) throw new Error("자막 항목이 없습니다.");

  const srtKo = episode.contents.find((c) => c.contentType === "SRT_KO");
  const srtHe = episode.contents.find((c) => c.contentType === "SRT_HE");
  const srtEn = episode.contents.find((c) => c.contentType === "SRT_EN");

  const koScenes = srtKo?.content ? extractSrtAllScenes(srtKo.content) : [];
  const heScenes = srtHe?.content ? extractSrtAllScenes(srtHe.content) : [];
  const enScenes = srtEn?.content ? extractSrtAllScenes(srtEn.content) : [];

  // SRT_HE(BibleVerse 기반) 씬 수를 기준으로 삼음. 없으면 KO 씬 수 사용
  const refCount = heScenes.length || koScenes.length || enScenes.length;
  if (refCount === 0) throw new Error("SRT 컨텐츠가 없습니다. SRT 3종을 먼저 생성하세요.");

  const totalDuration = existing[existing.length - 1].endSec;
  const n = existing.length;

  // SRT 씬이 1개뿐이고 타이밍 항목이 여러 개인 경우:
  // 단일 장문 텍스트를 타이밍 항목 수에 맞게 단어 단위로 분할해 나레이션 동기화
  const singleScene = refCount === 1 && n > 1;

  let koChunks: string[] | null = null;
  let heChunks: string[] | null = null;
  let enChunks: string[] | null = null;

  if (singleScene) {
    if (koScenes.length === 1 && koScenes[0]) {
      koChunks = expandSceneToChunks(koScenes[0], n, KO_CHARS_PER_LINE);
    }
    if (heScenes.length === 1 && heScenes[0]) {
      // 히브리어: verseRange 있으면 절 단위, 없으면 전체 텍스트를 모든 항목에
      if (episode.verseRange && episode.bibleBookId) {
        const verseHeBounds = await getVerseHebrewBoundaries(episode.bibleBookId, episode.verseRange, totalDuration);
        if (verseHeBounds && verseHeBounds.length > 0) {
          const verseMap = new Map(verseHeBounds.map((b) => [b.verseNum, b.hebrewText]));
          const hasVerseNums = existing.every((t: any) => typeof (t as any).verseNum === "number");
          if (hasVerseNums) {
            // verseNum 직접 매핑 — TTS 타이밍과 히브리어 글자 수 비례의 불일치 방지
            heChunks = existing.map((t: any) =>
              verseMap.get((t as any).verseNum) ?? verseHeBounds[verseHeBounds.length - 1].hebrewText
            );
            console.log(`[Subtitle] 단일씬→verseNum 직접 매핑 HE ${verseHeBounds.length}절→${n}개`);
          } else {
            heChunks = existing.map((t) => {
              let idx = verseHeBounds.findIndex((b, i) => {
                const isLast = i === verseHeBounds.length - 1;
                return t.startSec >= b.startSec && (isLast || t.startSec < verseHeBounds[i + 1].startSec);
              });
              if (idx < 0) idx = verseHeBounds.length - 1;
              return verseHeBounds[idx].hebrewText;
            });
            console.log(`[Subtitle] 단일씬→시간 비례 HE ${verseHeBounds.length}절→${n}개`);
          }
        } else {
          heChunks = Array(n).fill(cleanHebrewForDisplay(heScenes[0]));
        }
      } else {
        heChunks = Array(n).fill(cleanHebrewForDisplay(heScenes[0]));
      }
    }
    if (enScenes.length === 1 && enScenes[0]) {
      enChunks = expandSceneToChunks(enScenes[0], n, 40);
    }
    console.log(`[Subtitle] 단일씬→분할: KO ${n}개, HE ${heChunks?.length ?? 0}개, EN ${n}개`);
  }

  const segDur = totalDuration / refCount;

  // non-singleScene 경로: verseRange 있으면 절 경계 기반 히브리어 배분
  // (generateNarrationForRemotionPublic과 동일한 방식 → 한국어 나레이션 타이밍과 히브리어가 동일 절에 매핑)
  let verseHeBoundsForNonSingle: Array<{ startSec: number; endSec: number; hebrewText: string; verseNum: number }> | null = null;
  if (!singleScene && heScenes.length > 0 && episode.verseRange && episode.bibleBookId) {
    verseHeBoundsForNonSingle = await getVerseHebrewBoundaries(episode.bibleBookId, episode.verseRange, totalDuration);
    if (verseHeBoundsForNonSingle) {
      console.log(`[Subtitle] non-singleScene HE: 절 경계 기반 배분 준비 완료 (${verseHeBoundsForNonSingle.length}절)`);
    }
  }

  // non-singleScene 경로에서도 씬별 expandSceneToChunks 적용
  // → 같은 씬에 속하는 항목들이 전체 단락 텍스트를 동일하게 갖는 문제 방지
  if (!singleScene && koScenes.length > 0) {
    koChunks = new Array(n).fill("");
    if (koScenes.length > refCount) {
      // SRT_KO가 단어/구절 단위(항목 수 > 씬 수): 시간 비례 직접 매핑
      // (refCount 기준 segDur를 쓰면 마지막 씬에만 극히 일부 SRT 항목이 배정되어 텍스트가 잘림)
      const koSegDur = totalDuration / koScenes.length;
      existing.forEach((t, idx) => {
        const sIdx = koSegDur > 0 ? Math.min(Math.floor(t.startSec / koSegDur), koScenes.length - 1) : 0;
        koChunks![idx] = applyWordReplacements(koScenes[sIdx] ?? "");
      });
      console.log(`[Subtitle] non-singleScene KO 시간 비례 직접 매핑: ${koScenes.length}항목 → ${n}개`);
    } else {
      // SRT_KO가 씬 단위: 씬별 expandSceneToChunks 적용
      const sceneGroups: number[][] = Array.from({ length: koScenes.length }, () => []);
      existing.forEach((t, idx) => {
        const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), koScenes.length - 1) : 0;
        if (sceneGroups[sIdx]) sceneGroups[sIdx].push(idx);
      });
      sceneGroups.forEach((indices, sceneIdx) => {
        const chunks = expandSceneToChunks(koScenes[sceneIdx] ?? "", indices.length, KO_CHARS_PER_LINE);
        indices.forEach((entryIdx, chunkIdx) => {
          koChunks![entryIdx] = applyWordReplacements(chunks[chunkIdx] ?? "");
        });
      });
      console.log(`[Subtitle] non-singleScene KO 씬별 청크 분할: ${koScenes.length}씬 → ${n}개`);
    }
  }

  const updated: SubtitleTiming[] = existing.map((t, i) => {
    const entry: SubtitleTiming = { ...t };
    if (koChunks) {
      entry.text = applyWordReplacements(koChunks[i] ?? "");
    }
    if (heChunks) {
      entry.heText = heChunks[i] ?? "";
    } else if (verseHeBoundsForNonSingle && verseHeBoundsForNonSingle.length > 0) {
      // verseRange 기반 절 경계 시간 매핑 (generateNarrationForRemotionPublic과 동일)
      // 한국어 나레이션 타이밍과 히브리어가 동일한 절에 매핑되어 일치
      let idx = verseHeBoundsForNonSingle.findIndex((b, bi) => {
        const isLast = bi === verseHeBoundsForNonSingle!.length - 1;
        return t.startSec >= b.startSec && (isLast || t.startSec < verseHeBoundsForNonSingle![bi + 1].startSec);
      });
      if (idx < 0) idx = verseHeBoundsForNonSingle.length - 1;
      entry.heText = verseHeBoundsForNonSingle[idx].hebrewText;
    } else if (heScenes.length > 0) {
      // verseRange 없으면 씬 기반 시간 비례 fallback
      const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), heScenes.length - 1) : 0;
      entry.heText = heScenes[sIdx] ?? "";
    }
    if (enChunks) {
      entry.enText = enChunks[i] ?? "";
    } else if (enScenes.length > 0) {
      const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), enScenes.length - 1) : 0;
      entry.enText = enScenes[sIdx] ?? "";
    }
    return entry;
  });

  const subtitlesJson = JSON.stringify(updated);
  fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
  const currentProps = readProps();
  writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());

  console.log(
    `[Subtitle] 전체 동기화 완료: KO=${koScenes.length}씬, HE=${heScenes.length}씬, EN=${enScenes.length}씬 ` +
    `(기준 ${refCount}씬) → ${updated.length}개 항목`
  );
  return updated;
}

// ─── 에피소드 한국어 나레이션 생성 → Remotion public/ 에 저장 ─────────────────

export async function generateNarrationForRemotionPublic(
  episodeId: string,
  speakingRate?: number,
  overrideNarrationText?: string  // 프론트엔드 자막 편집기 현재 내용 (최우선)
): Promise<{ fileName: string; textLength: number; durationSec?: number; durationInFrames?: number; subtitlesJson?: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  // 텍스트 우선순위:
  //   0순위: overrideNarrationText (프론트엔드 자막 편집기 현재 상태 직접 전달 — 가장 신뢰성 높음)
  //   1순위: subtitles.json (마지막 저장된 파일)
  //   2순위: SRT_KO DB
  //   3순위: SCRIPT 나레이션(KO)
  //   4순위: 에피소드 제목
  let narrationText = "";

  // 1순위: SRT_KO DB (전체 성경 구절 내용 — 가장 완전한 소스)
  const srtKoForText = episode.contents.find((c) => c.contentType === "SRT_KO");
  if (srtKoForText?.content) {
    const srtKoText = extractSrtAllScenes(srtKoForText.content).join(" ");
    if (srtKoText) {
      narrationText = applyWordReplacements(srtKoText);
      console.log(`[Remotion-TTS] SRT_KO DB 사용 (${narrationText.length}자)`);
    }
  }

  // 0순위: 프론트엔드 자막 편집기 직접 전달 텍스트 (SRT_KO보다 80% 이상 길이가 비슷할 때만 우선)
  // SRT_KO보다 현저히 짧으면 이전 TTS 잘림 결과를 재사용하는 악순환 방지 → SRT_KO 유지
  if (overrideNarrationText?.trim()) {
    const overrideLen = overrideNarrationText.trim().length;
    const srtKoLen = narrationText.length;
    if (srtKoLen === 0 || overrideLen >= srtKoLen * 0.8) {
      narrationText = applyWordReplacements(overrideNarrationText.trim());
      console.log(`[Remotion-TTS] 자막 편집기 직접 전달 텍스트 사용 (${narrationText.length}자) ← 최우선`);
    } else {
      console.log(`[Remotion-TTS] 자막 편집기 텍스트(${overrideLen}자)가 SRT_KO(${srtKoLen}자)보다 현저히 짧아 SRT_KO 유지 (잘림 방지)`);
    }
  }

  // 2순위: subtitles.json — 자막 편집기 저장 내용 (단, data.json의 episodeId와 일치할 때만 사용)
  if (!narrationText) {
    const subtitlesFilePath = path.join(PROJECT_PATH, "public", "subtitles.json");
    const dataJsonPath = path.join(PROJECT_PATH, "public", "data.json");
    const dataEpisodeId = fs.existsSync(dataJsonPath)
      ? (() => { try { return JSON.parse(fs.readFileSync(dataJsonPath, "utf-8")).episodeId; } catch { return null; } })()
      : null;
    const isSameEpisode = !dataEpisodeId || dataEpisodeId === episodeId;
    if (isSameEpisode && fs.existsSync(subtitlesFilePath)) {
      try {
        const rawSubs: Array<{ text?: string }> = JSON.parse(fs.readFileSync(subtitlesFilePath, "utf-8"));
        if (Array.isArray(rawSubs) && rawSubs.length > 0) {
          // 연속 중복 제거: 씬 내 동일 text가 여러 항목에 반복 → 씬별 고유 텍스트만 추출
          const uniqueTexts: string[] = [];
          for (const s of rawSubs) {
            const t = s.text?.trim() ?? "";
            if (t && (uniqueTexts.length === 0 || t !== uniqueTexts[uniqueTexts.length - 1])) {
              uniqueTexts.push(t);
            }
          }
          if (uniqueTexts.length > 0) {
            narrationText = uniqueTexts.join(" ");
            console.log(`[Remotion-TTS] subtitles.json 사용 (${uniqueTexts.length}씬, ${narrationText.length}자)`);
          }
        }
      } catch (e) {
        console.warn("[Remotion-TTS] subtitles.json 읽기 실패:", (e as Error).message);
      }
    } else if (!isSameEpisode) {
      console.log(`[Remotion-TTS] subtitles.json 스킵 — 다른 에피소드(${dataEpisodeId}) 데이터`);
    }
  }

  // 3순위: SCRIPT 나레이션(KO) (구 2순위: SRT_KO DB는 1순위로 이동)
  // 3순위: SCRIPT 나레이션(KO)
  if (!narrationText) {
    const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
    if (scriptContent?.content) {
      narrationText = extractAllKoreanNarration(scriptContent.content);
      if (narrationText) {
        console.log(`[Remotion-TTS] SCRIPT 나레이션(KO) 폴백 사용 (${narrationText.length}자)`);
      }
    }
  }

  // 4순위: 에피소드 제목
  if (!narrationText) {
    narrationText = episode.titleKo;
    console.log(`[Remotion-TTS] 폴백: 에피소드 제목 사용 — "${narrationText}"`);
  }

  if (!narrationText) throw new Error("나레이션 텍스트를 찾을 수 없습니다. 자막을 먼저 저장하거나 SRT_KO 또는 SCRIPT 컨텐츠를 생성하세요.");

  console.log(`[Remotion-TTS] 나레이션 텍스트 준비 완료 (${narrationText.length}자): "${narrationText.slice(0, 80)}..."`);

  // TTS 생성 → storage에 저장 (분절별 타이밍 데이터 포함)
  const { filePath: storagePath, timings } = await generateNarration(episodeId, narrationText, "ko", speakingRate);

  // Remotion public/ 에 복사
  const destDir = path.join(PROJECT_PATH, "public");
  fs.mkdirSync(destDir, { recursive: true });
  const fileName = "narration.mp3";
  const destPath = path.join(destDir, fileName);
  fs.copyFileSync(storagePath, destPath);

  console.log(`[Remotion-TTS] Remotion public/ 복사 완료: ${destPath}`);

  // 나레이션 길이로 durationInFrames 자동 조정 (30fps, 여유 1초)
  const FPS = 30;
  const narrationDuration = getMediaDuration(destPath);
  const durationInFrames = Math.ceil((narrationDuration + 1) * FPS);

  // 히브리어 텍스트 미리 조회
  const episodeHebrew = await fetchEpisodeHebrew(episode as any);

  // TTS timings를 항상 기준으로 유지 (한국어 text = 실제 나레이션 음성과 일치)
  // BibleVerse 기반 자막으로 절대 대체하지 않음 — 대체하면 음성과 자막 텍스트 불일치 발생
  let finalTimings: typeof timings = timings;

  // 절 범위가 있으면 TTS 타이밍 각 항목에 verseNum + heText 할당
  // (Korean text는 TTS 그대로 유지, 히브리어만 절 기반으로 배분)
  if (episode.verseRange && episode.bibleBookId) {
    const verseHeBounds = await getVerseHebrewBoundaries(
      episode.bibleBookId,
      episode.verseRange,
      narrationDuration
    );
    if (verseHeBounds && verseHeBounds.length > 0) {
      finalTimings = timings.map((t) => {
        let idx = verseHeBounds.findIndex((b, i) => {
          const isLast = i === verseHeBounds.length - 1;
          return t.startSec >= b.startSec && (isLast || t.startSec < verseHeBounds[i + 1].startSec);
        });
        if (idx < 0) idx = verseHeBounds.length - 1;
        return {
          ...t,
          heText: verseHeBounds[idx].hebrewText,
          verseNum: verseHeBounds[idx].verseNum,
        };
      }) as typeof timings;
      console.log(`[Remotion-TTS] TTS 타이밍 유지 + 절 기반 히브리어 배분 완료 (${verseHeBounds.length}절, ${finalTimings.length}항목)`);
    } else if (episodeHebrew) {
      finalTimings = distributeHebrewToTimings(timings, episodeHebrew, narrationDuration);
      console.log(`[Remotion-TTS] 절 경계 없음 → 히브리어 균등 배분`);
    }
  } else if (episodeHebrew) {
    // verseRange 없으면 히브리어 전체를 균등 배분
    finalTimings = distributeHebrewToTimings(timings, episodeHebrew, narrationDuration);
    console.log(`[Remotion-TTS] 히브리어 자동 배분 (${splitHebrewByLength(episodeHebrew).length}개 라인)`);
  }

  // TTS 분절 텍스트에 단어 치환만 적용 — 타이밍은 TTS 기반 그대로 유지
  // TTS가 이미 실제 음성 시간에 맞는 text/startSec/endSec를 생성했으므로
  // SRT_KO 청크로 덮어쓰면 나레이션 음성과 자막 타이밍이 어긋남
  finalTimings = finalTimings.map((t) => ({
    ...t,
    text: applyWordReplacements(t.text),
  })) as typeof timings;
  console.log(`[Remotion-TTS] TTS 타이밍 기반 한국어 자막 유지 (${finalTimings.length}개) — 나레이션 동기화`);

  // ── SRT_HE 씬 기반 히브리어 재배분 (verseNum이 없을 때만) ──────────────────────
  // verseNum이 이미 설정된 경우 위에서 heText도 올바르게 배분됐으므로 건너뜀
  const heAlreadyDistributed = finalTimings.every((t: any) => typeof (t as any).verseNum === "number");
  if (!heAlreadyDistributed) {
    const srtHeForNarr = episode.contents.find((c) => c.contentType === "SRT_HE");
    if (srtHeForNarr?.content) {
      const heNarrScenes = extractSrtAllScenes(srtHeForNarr.content);
      if (heNarrScenes.length > 0) {
        const HN = heNarrScenes.length;
        const heNarrSegDur = narrationDuration / HN;
        finalTimings = finalTimings.map((t) => {
          const sIdx = heNarrSegDur > 0 ? Math.min(Math.floor(t.startSec / heNarrSegDur), HN - 1) : 0;
          return { ...t, heText: heNarrScenes[sIdx] ?? "" };
        }) as typeof timings;
        console.log(`[Remotion-TTS] SRT_HE 씬 기반 히브리어 재배분 완료 (${HN}씬)`);
      }
    }
  } else {
    console.log(`[Remotion-TTS] verseNum 기반 히브리어 배분 완료 → SRT_HE 재배분 건너뜀`);
  }

  // ── SRT_EN 있으면 씬 기반 영어 자막 자동 배분 (enText) ──────────────────────────
  const srtEnForNarr = episode.contents.find((c) => c.contentType === "SRT_EN");
  if (srtEnForNarr?.content) {
    const enNarrScenes = extractSrtAllScenes(srtEnForNarr.content);
    if (enNarrScenes.length > 0) {
      const EN = enNarrScenes.length;
      const enNarrSegDur = narrationDuration / EN;

      finalTimings = finalTimings.map((t) => {
        const sIdx = enNarrSegDur > 0 ? Math.min(Math.floor(t.startSec / enNarrSegDur), EN - 1) : 0;
        return { ...t, enText: enNarrScenes[sIdx] ?? "" };
      }) as typeof timings;

      console.log(`[Remotion-TTS] SRT_EN 씬 기반 영어 자막 자동 배분 완료 (${EN}씬)`);
    }
  }

  // ── 마지막 항목 텍스트 단편 보정 ─────────────────────────────────────────────
  // Google TTS word timing이 마지막 몇 단어를 별도 항목으로 제공하지 않아
  // 마지막 entry에 "주님께서" 같은 단어 단편만 남는 문제 수정.
  // 마지막 entry 텍스트가 짧고 문장 끝 부호가 없으면 SRT_KO 전체 문장으로 교체.
  if (finalTimings.length > 0) {
    const lastEntry = finalTimings[finalTimings.length - 1] as any;
    const lastText: string = lastEntry.text ?? "";
    // 문장 종료 부호(마침표·쉼표·물음표·닫는따옴표 등)로 끝나지 않으면 단편으로 판단
    const isTruncated = !/[.?!。,，、'"」』)\]…]\s*$/.test(lastText);
    if (isTruncated) {
      const srtKoForFix = episode.contents.find((c) => c.contentType === "SRT_KO");
      if (srtKoForFix?.content) {
        const koScenesForFix = extractSrtAllScenes(srtKoForFix.content);
        if (koScenesForFix.length > 0) {
          const fixSegDur = narrationDuration / koScenesForFix.length;
          const fixIdx = fixSegDur > 0
            ? Math.min(Math.floor(lastEntry.startSec / fixSegDur), koScenesForFix.length - 1)
            : koScenesForFix.length - 1;
          const fullText = applyWordReplacements(koScenesForFix[fixIdx] ?? "");
          if (fullText.length > lastText.length) {
            finalTimings[finalTimings.length - 1] = { ...lastEntry, text: fullText };
            console.log(`[Remotion-TTS] 마지막 항목 단편 보정: "${lastText}" → "${fullText.slice(0, 60)}"`);
          }
        }
      }
    }
  }

  // subtitlesJson: 자막 타이밍 JSON → Remotion props에 전달
  const subtitlesJson = JSON.stringify(finalTimings);

  // subtitles.json 파일로도 저장 (CLI 렌더링용)
  fs.writeFileSync(
    path.join(destDir, "subtitles.json"),
    subtitlesJson,
    "utf-8"
  );

  // Root.tsx + data.json 업데이트
  const currentProps = readProps();
  const updatedProps: RemotionProps = {
    ...(currentProps ?? { koreanText: narrationText, hebrewText: "" }),
    audioFileName: fileName,
    subtitlesJson,
  };
  writeProps(updatedProps, durationInFrames);

  console.log(
    `[Remotion-TTS] ${narrationDuration.toFixed(2)}초 → ${durationInFrames}프레임, 자막 ${timings.length}개`
  );

  return { fileName, textLength: narrationText.length, durationSec: narrationDuration, durationInFrames, subtitlesJson };
}

// ─── 에피소드 영어 나레이션 생성 → Remotion public/ 에 저장 ──────────────────

export async function generateEnglishNarrationForRemotionPublic(
  episodeId: string,
  speakingRate?: number
): Promise<{ fileName: string; textLength: number; durationSec: number; durationInFrames: number; subtitlesJson?: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  let narrationText = "";

  // 우선순위: SRT_EN → SCRIPT Narration(EN) → titleKo (영어 없으면 에러)
  const srtEn = episode.contents.find((c) => c.contentType === "SRT_EN");
  if (srtEn?.content) {
    narrationText = srtSingleText(srtEn.content);
    if (narrationText) console.log(`[Remotion-TTS-EN] SRT_EN 사용 (${narrationText.length}자)`);
  }

  if (!narrationText) {
    const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
    if (scriptContent?.content) {
      narrationText = extractAllEnglishNarration(scriptContent.content);
      if (narrationText) console.log(`[Remotion-TTS-EN] SCRIPT Narration(EN) 사용 (${narrationText.length}자)`);
    }
  }

  if (!narrationText) {
    throw new Error("영어 나레이션 텍스트가 없습니다. SRT_EN 또는 SCRIPT에 Narration(EN) 내용을 먼저 생성하세요.");
  }

  // Google TTS 영어 생성
  const { filePath: storagePath, timings } = await generateNarration(episodeId, narrationText, "en", speakingRate);

  const destDir = path.join(PROJECT_PATH, "public");
  fs.mkdirSync(destDir, { recursive: true });
  const fileName = "narrationEN.mp3";
  const destPath = path.join(destDir, fileName);
  fs.copyFileSync(storagePath, destPath);

  const FPS = 30;
  const narrationDuration = getMediaDuration(destPath);
  const durationInFrames = Math.ceil((narrationDuration + 1) * FPS);

  // 구절 기반 자막 페어 우선 시도 (히브리어+한국어 번역 절 단위 일치)
  let usedVersePairs = false;
  let finalTimings: typeof timings = timings;

  if (episode.verseRange) {
    const versePairs = await buildVerseSubtitlePairs(
      episode.bibleBookId,
      episode.verseRange,
      narrationDuration
    );
    if (versePairs.length > 0) {
      // versePairs: {heText(Hebrew), text(Korean), startSec, endSec} — 절 단위 정렬 완료
      // 영어 TTS 텍스트는 enText 배분으로 나중에 채울 수 있음
      finalTimings = versePairs.map((p) => ({ ...p, enText: "" })) as typeof timings;
      usedVersePairs = true;
      console.log(`[Remotion-TTS-EN] 구절 기반 자막 ${versePairs.length}개 사용 (히브리어+한국어 절 단위 정렬)`);
    }
  }

  if (!usedVersePairs) {
    // 구절 데이터 없음 → 히브리어만 배분, 영어 TTS 텍스트는 enText로
    const episodeHebrew = await fetchEpisodeHebrew(episode as any);
    if (episodeHebrew) {
      finalTimings = distributeHebrewToTimings(timings, episodeHebrew, narrationDuration);
    }
    // TTS timing의 text(영어) → enText로 이동, text는 Korean용으로 비워둠
    finalTimings = finalTimings.map((t) => ({
      ...t,
      enText: t.text,
      text: "",
    }));
  }

  // ── SRT_HE 있으면 씬 기반 히브리어 재배분 (씬 전체 텍스트 배분) ──────────────────
  const srtHeEnPath = episode.contents.find((c) => c.contentType === "SRT_HE");
  if (srtHeEnPath?.content) {
    const heEnScenes = extractSrtAllScenes(srtHeEnPath.content);
    if (heEnScenes.length > 0) {
      const HN = heEnScenes.length;
      const heEnSegDur = narrationDuration / HN;

      finalTimings = finalTimings.map((t) => {
        const sIdx = heEnSegDur > 0 ? Math.min(Math.floor(t.startSec / heEnSegDur), HN - 1) : 0;
        return { ...t, heText: heEnScenes[sIdx] ?? "" };
      }) as typeof timings;

      console.log(`[Remotion-TTS-EN] SRT_HE 씬 기반 히브리어 재배분 완료 (${HN}씬)`);
    }
  }

  // ── SRT_KO 있으면 씬 기반 한국어 자막 자동 배분 (text) ──────────────────────────
  // 영어 TTS 타이밍 항목의 text는 비어 있으므로 SRT_KO로 채움
  const srtKoForEn = episode.contents.find((c) => c.contentType === "SRT_KO");
  if (srtKoForEn?.content) {
    const koEnScenes = extractSrtAllScenes(srtKoForEn.content);
    if (koEnScenes.length > 0) {
      const KN = koEnScenes.length;
      const koEnSegDur = narrationDuration / KN;

      finalTimings = finalTimings.map((t) => {
        if (t.text && t.text.trim()) return t; // 이미 한국어 있으면 보존
        const sIdx = koEnSegDur > 0 ? Math.min(Math.floor(t.startSec / koEnSegDur), KN - 1) : 0;
        return { ...t, text: applyWordReplacements(koEnScenes[sIdx] ?? "") };
      }) as typeof timings;

      console.log(`[Remotion-TTS-EN] SRT_KO 씬 기반 한국어 자막 자동 배분 완료 (${KN}씬)`);
    }
  }

  const subtitlesJson = JSON.stringify(finalTimings);
  fs.writeFileSync(path.join(destDir, "subtitles.json"), subtitlesJson, "utf-8");

  const currentProps = readProps();
  const updatedProps: RemotionProps = {
    ...(currentProps ?? { koreanText: "", hebrewText: "" }),
    englishText: narrationText,
    language: "en",
    audioFileName: fileName,
    subtitlesJson,
  };
  writeProps(updatedProps, durationInFrames);

  console.log(`[Remotion-TTS-EN] ${narrationDuration.toFixed(2)}초 → ${durationInFrames}프레임`);
  return { fileName, textLength: narrationText.length, durationSec: narrationDuration, durationInFrames, subtitlesJson };
}

// ─── BGM을 Remotion public/ 에 복사하고 props 업데이트 ───────────────────────

/**
 * 에피소드 BGM을 Remotion public/ 에 복사하고 bgmFileName/bgmVolume을 props에 반영.
 * @param episodeId 에피소드 ID
 * @param bgmVolume 0.0 ~ 1.0 (기본 0.15)
 */
export async function applyBgmToRemotionPublic(
  episodeId: string,
  bgmVolume = 0.15
): Promise<{ bgmFileName: string; bgmVolume: number }> {
  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Episode not found");

  const defaultBgm = process.env.BGM_PATH || "/app/storage/bgm/gregorian.mp3";
  let sourcePath = episode.bgmUrl ? `/app${episode.bgmUrl}` : defaultBgm;

  // 커스텀 BGM 파일이 없으면 기본 BGM으로 폴백 (파일 소실 방어)
  if (!fs.existsSync(sourcePath)) {
    console.warn(`[BGM] 커스텀 파일 없음 (${sourcePath}), 기본 BGM으로 폴백`);
    sourcePath = defaultBgm;
    // DB의 stale bgmUrl 초기화
    await prisma.episode.update({ where: { id: episodeId }, data: { bgmUrl: null } });
  }

  if (!fs.existsSync(sourcePath)) throw new Error(`BGM 파일을 찾을 수 없습니다: ${sourcePath} (기본 BGM도 없음)`);

  const ext = path.extname(sourcePath) || ".mp3";
  const bgmFileName = `bgm${ext}`;
  const destDir = path.join(PROJECT_PATH, "public");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(destDir, bgmFileName));

  // 최소 볼륨 0.10 보장 (너무 낮으면 무음으로 들림)
  const vol = Math.max(0.10, Math.min(1, bgmVolume));
  const currentProps = readProps();
  writeProps(
    { ...(currentProps ?? { koreanText: "", hebrewText: "" }), bgmFileName, bgmVolume: vol },
    readDurationInFrames()
  );

  console.log(`[BGM] Remotion public/ 복사 완료: ${bgmFileName}, volume=${vol}`);
  return { bgmFileName, bgmVolume: vol };
}

/**
 * BGM 음량만 업데이트 (파일 복사 없이 props만 변경)
 */
export function updateBgmVolume(bgmVolume: number): void {
  const vol = Math.max(0.10, Math.min(1, bgmVolume));
  const currentProps = readProps();
  writeProps(
    { ...(currentProps ?? { koreanText: "", hebrewText: "" }), bgmVolume: vol },
    readDurationInFrames()
  );
  console.log(`[BGM] 음량 업데이트: ${vol}`);
}
