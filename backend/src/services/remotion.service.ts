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
}

// ─── data.json 읽기/쓰기 ─────────────────────────────────────────────────────

export function writeProps(props: RemotionProps, durationInFrames?: number): void {
  // 1. data.json 업데이트 (CLI 렌더링용) — subtitlesJson 포함해야 렌더 영상에 자막 반영됨
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  const payload = {
    koreanText: props.koreanText,
    hebrewText: props.hebrewText,
    englishText: props.englishText ?? "",
    language: props.language ?? "ko",
    videoFileName: props.videoFileName ?? "",
    audioFileName: props.audioFileName ?? "narration.mp3",
    subtitlesJson: props.subtitlesJson ?? "",
    showSubtitle: props.showSubtitle ?? true,
    showNarration: props.showNarration ?? true,
  };
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2), "utf-8");

  // 2. Root.tsx defaultProps 업데이트 → Remotion Studio 핫-리로드 트리거
  updateRootDefaultProps(props, durationInFrames);
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

  const content = `import { Composition } from 'remotion';
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
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="HelloWorld"
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
 * verseRange 문자열을 파싱해 BibleVerse 히브리어 원문을 조합
 * 지원 형식:
 *   "1:1-5"          → 창 1:1~5
 *   "창세기 1:1-5"   → 창 1:1~5
 *   "1:1 - 1:10"     → 창 1:1~10 (공백·반복 장 표기 허용)
 *   "1:1"            → 창 1:1
 */
async function fetchHebrewFromVerseRange(
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
    .filter(Boolean);
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
  const updated = distributeHebrewToTimingsScene(existing, hebrewScenes);
  const subtitlesJson = JSON.stringify(updated);

  fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");

  const currentProps = readProps();
  const currentDuration = readDurationInFrames();
  const heText = hebrewScenes.join(" ");
  writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: heText }), subtitlesJson }, currentDuration);

  console.log(`[Subtitle] 히브리어 배분 완료: ${updated.filter((s) => s.heText).length}개 항목 (${hebrewScenes.length}씬)`);
  return updated;
}

// ─── 절 기반 시간 경계 계산 (한국어·영어 배분에 공통 사용) ──────────────────────

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

    const verses = await prisma.bibleVerse.findMany({
      where: { bookId, chapter, verse: { gte: verseStart, lte: verseEnd } },
      orderBy: { verse: "asc" },
    });
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

  // ── 1순위: SRT_KO 씬 배분 (히브리어·영어와 동일한 씬 수로 정렬 보장) ────────
  const srtKoFirst = episode.contents.find((c) => c.contentType === "SRT_KO");
  if (srtKoFirst?.content) {
    const koreanScenes = extractSrtAllScenes(srtKoFirst.content);
    if (koreanScenes.length > 0) {
      // 기존 한국어 TTS 자막이 SRT 씬보다 다양하면 보존
      const existingKoValues = new Set(existing.map((t) => t.text).filter(Boolean));
      if (existingKoValues.size > koreanScenes.length) {
        console.log(`[Subtitle] 기존 한국어 ${existingKoValues.size}개 고유값 > SRT 씬 ${koreanScenes.length}개 → TTS 자막 보존`);
        return existing;
      }
      const N = koreanScenes.length;
      const segDur = totalDuration / N;
      // 씬별 항목 그룹화 (sub-phrase 분할용)
      const sceneGroupsMap = new Map<number, SubtitleTiming[]>();
      existing.forEach((t) => {
        const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
        if (!sceneGroupsMap.has(sIdx)) sceneGroupsMap.set(sIdx, []);
        sceneGroupsMap.get(sIdx)!.push(t);
      });
      // 씬별 sub-phrase 분할: 같은 씬 내 항목마다 고유 구문
      const scenePhrases = new Map<number, string[]>();
      sceneGroupsMap.forEach((group, sIdx) => {
        scenePhrases.set(sIdx, splitKoreanIntoN(koreanScenes[sIdx], group.length));
      });
      const posCounters = new Map<number, number>();
      updated = existing.map((t) => {
        const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
        const phrases = scenePhrases.get(sIdx) ?? [koreanScenes[sIdx]];
        const pos = posCounters.get(sIdx) ?? 0;
        posCounters.set(sIdx, pos + 1);
        return { ...t, text: phrases[Math.min(pos, phrases.length - 1)] };
      });
      const subtitlesJson = JSON.stringify(updated);
      fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
      const currentProps = readProps();
      writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
      console.log(`[Subtitle] 한국어 배분(SRT_KO 씬 + sub-phrase, ${N}씬) 완료: ${updated.filter((s) => s.text).length}개 항목`);
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

          // 씬별 타이밍 항목 그룹화 (sub-phrase 분할을 위해 그룹 크기 필요)
          const sceneGroupsMap = new Map<number, SubtitleTiming[]>();
          existing.forEach((t) => {
            let vIdx = boundaries.findIndex((b, i) => {
              const isLast = i === boundaries.length - 1;
              return t.startSec >= b.startSec && (isLast || t.startSec < boundaries[i + 1].startSec);
            });
            if (vIdx < 0) vIdx = V - 1;
            const sIdx = Math.min(Math.floor(vIdx * K / V), K - 1);
            if (!sceneGroupsMap.has(sIdx)) sceneGroupsMap.set(sIdx, []);
            sceneGroupsMap.get(sIdx)!.push(t);
          });

          // 씬별 sub-phrase 분할: 같은 씬을 담당하는 항목 수만큼 텍스트 분할
          const scenePhrases = new Map<number, string[]>();
          sceneGroupsMap.forEach((group, sIdx) => {
            scenePhrases.set(sIdx, splitKoreanIntoN(koScenes[sIdx], group.length));
          });

          // 각 항목에 순서대로 sub-phrase 배분 (같은 씬 내 중복 없음)
          const posCounters = new Map<number, number>();
          updated = existing.map((t) => {
            let vIdx = boundaries.findIndex((b, i) => {
              const isLast = i === boundaries.length - 1;
              return t.startSec >= b.startSec && (isLast || t.startSec < boundaries[i + 1].startSec);
            });
            if (vIdx < 0) vIdx = V - 1;
            const sIdx = Math.min(Math.floor(vIdx * K / V), K - 1);
            const phrases = scenePhrases.get(sIdx) ?? [koScenes[sIdx]];
            const pos = posCounters.get(sIdx) ?? 0;
            posCounters.set(sIdx, pos + 1);
            return { ...t, text: phrases[Math.min(pos, phrases.length - 1)] };
          });
          const subtitlesJson = JSON.stringify(updated);
          fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
          const currentProps = readProps();
          writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
          console.log(`[Subtitle] 한국어 배분(절 비례 SRT + sub-phrase, ${V}절→${K}씬) 완료: ${updated.filter((s) => s.text).length}개 항목`);
          return updated;
        }
      }
    }
  }

  // 2순위: SRT_KO 씬 배분 (verseNum이 있으면 절 단위, 없으면 시간 비례)
  let koreanScenes: string[] = [];
  const srtKo = episode.contents.find((c) => c.contentType === "SRT_KO");
  if (srtKo?.content) koreanScenes = extractSrtAllScenes(srtKo.content);

  // verseNum 필드가 있으면 절 단위 비례 배분 (sub-phrase 분할로 각 항목 고유 텍스트)
  if (koreanScenes.length > 0) {
    const verseNums = existing.map((t: any) => t.verseNum as number | undefined).filter((v): v is number => v !== undefined);
    if (verseNums.length === existing.length) {
      // TTS 자막이 이미 다양하면 나레이션 일치 보호
      const existingKoValues = new Set(existing.map((t) => t.text).filter(Boolean));
      if (existingKoValues.size > koreanScenes.length) {
        console.log(`[Subtitle] 기존 한국어 ${existingKoValues.size}개 고유값 > SRT 씬 ${koreanScenes.length}개 → TTS 자막 보존`);
        return existing;
      }

      const uniqueVerses = [...new Set(verseNums)].sort((a, b) => a - b);
      const V = uniqueVerses.length;
      const K = koreanScenes.length;

      // 절별 씬 매핑
      const verseToSceneIdx: Record<number, number> = {};
      uniqueVerses.forEach((vn, i) => {
        verseToSceneIdx[vn] = Math.min(Math.floor(i * K / V), K - 1);
      });

      // 절별(=씬별) 항목 그룹 — sub-phrase 분할 크기 결정
      const verseGroups = new Map<number, SubtitleTiming[]>();
      (existing as any[]).forEach((t) => {
        const vn: number = t.verseNum ?? uniqueVerses[uniqueVerses.length - 1];
        if (!verseGroups.has(vn)) verseGroups.set(vn, []);
        verseGroups.get(vn)!.push(t);
      });

      // 절별 sub-phrase 생성
      const versePhrases = new Map<number, string[]>();
      verseGroups.forEach((group, vn) => {
        const sIdx = verseToSceneIdx[vn] ?? K - 1;
        versePhrases.set(vn, splitKoreanIntoN(koreanScenes[sIdx], group.length));
      });

      // 배분
      const posCounters = new Map<number, number>();
      updated = (existing as any[]).map((t) => {
        const vn: number = t.verseNum ?? uniqueVerses[uniqueVerses.length - 1];
        const phrases = versePhrases.get(vn) ?? [koreanScenes[K - 1]];
        const pos = posCounters.get(vn) ?? 0;
        posCounters.set(vn, pos + 1);
        return { ...t, text: phrases[Math.min(pos, phrases.length - 1)] };
      });
      const subtitlesJson = JSON.stringify(updated);
      fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
      const currentProps = readProps();
      writeProps({ ...(currentProps ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
      console.log(`[Subtitle] 한국어 배분(절 비례 verseNum + sub-phrase, ${V}절→${K}씬) 완료: ${updated.filter((s) => s.text).length}개 항목`);
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
  const segDur = totalDuration / N;

  // 씬별 항목 그룹화 (sub-phrase 분할용)
  const enSceneGroupsMap = new Map<number, SubtitleTiming[]>();
  existing.forEach((t) => {
    const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
    if (!enSceneGroupsMap.has(sIdx)) enSceneGroupsMap.set(sIdx, []);
    enSceneGroupsMap.get(sIdx)!.push(t);
  });

  // 씬별 sub-phrase 분할
  const enScenePhrases = new Map<number, string[]>();
  enSceneGroupsMap.forEach((group, sIdx) => {
    enScenePhrases.set(sIdx, splitKoreanIntoN(englishScenes[sIdx], group.length));
  });

  const enPosCounters = new Map<number, number>();
  const updated = existing.map((t) => {
    const sIdx = segDur > 0 ? Math.min(Math.floor(t.startSec / segDur), N - 1) : 0;
    const phrases = enScenePhrases.get(sIdx) ?? [englishScenes[sIdx]];
    const pos = enPosCounters.get(sIdx) ?? 0;
    enPosCounters.set(sIdx, pos + 1);
    return { ...t, enText: phrases[Math.min(pos, phrases.length - 1)] };
  });

  const subtitlesJson = JSON.stringify(updated);
  fs.writeFileSync(subtitlesPath, subtitlesJson, "utf-8");
  writeProps({ ...(readProps() ?? { koreanText: "", hebrewText: "" }), subtitlesJson }, readDurationInFrames());
  console.log(`[Subtitle] 영어 배분(SRT_EN 씬 + sub-phrase, ${N}씬) 완료: ${updated.filter((s) => s.enText).length}개 항목`);
  return updated;
}

// ─── 에피소드 한국어 나레이션 생성 → Remotion public/ 에 저장 ─────────────────

export async function generateNarrationForRemotionPublic(
  episodeId: string
): Promise<{ fileName: string; textLength: number; durationSec?: number; durationInFrames?: number; subtitlesJson?: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  // 텍스트 우선순위: SCRIPT 나레이션(KO) → SRT_KO → 에피소드 제목
  // SCRIPT가 최신 편집 내용을 반영하는 원본 소스이므로 우선 사용
  let narrationText = "";

  const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
  if (scriptContent?.content) {
    narrationText = extractAllKoreanNarration(scriptContent.content);
    if (narrationText) {
      console.log(`[Remotion-TTS] SCRIPT 나레이션(KO) 추출 완료 (${narrationText.length}자)`);
    }
  }

  if (!narrationText) {
    const srtKo = episode.contents.find((c) => c.contentType === "SRT_KO");
    if (srtKo?.content) {
      // SRT → 타임코드/인덱스 제거 후 텍스트만
      narrationText = srtKo.content
        .replace(/^\uFEFF/, "")
        .split(/\n\s*\n/)
        .map((block) => {
          const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
          return lines.filter(
            (l) => !/^\d+$/.test(l) && !/^\d{2}:\d{2}:\d{2}/.test(l)
          ).join(" ");
        })
        .filter(Boolean)
        .join(" ");
      if (narrationText) {
        console.log(`[Remotion-TTS] SRT_KO 폴백 사용 (${narrationText.length}자)`);
      }
    }
  }

  if (!narrationText) {
    narrationText = episode.titleKo;
    console.log(`[Remotion-TTS] 폴백: 에피소드 제목 사용 — "${narrationText}"`);
  }

  if (!narrationText) throw new Error("나레이션 텍스트를 찾을 수 없습니다. SCRIPT 또는 SRT_KO 컨텐츠를 먼저 생성하세요.");

  console.log(`[Remotion-TTS] 나레이션 텍스트 준비 완료 (${narrationText.length}자): "${narrationText.slice(0, 80)}..."`);

  // TTS 생성 → storage에 저장 (분절별 타이밍 데이터 포함)
  const { filePath: storagePath, timings } = await generateNarration(episodeId, narrationText);

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

  // 구절 기반 자막 페어 우선 시도 (BibleVerse.koreanText가 실제로 있을 때만 사용)
  // koreanText가 없으면 TTS 타이밍(실제 읽힌 한국어 구문)을 그대로 유지
  let finalTimings: typeof timings = timings;
  if (episode.verseRange) {
    const versePairs = await buildVerseSubtitlePairs(
      episode.bibleBookId,
      episode.verseRange,
      narrationDuration
    );
    // 절 기반은 한국어 번역이 충분히 있을 때만 사용 (80% 이상 절에 한국어 있어야 함)
    // some()만 체크하면 3/31절만 있어도 통과 → 대부분 항목이 빈 한국어로 채워지는 버그 방지
    const pairsWithKorean = versePairs.filter((p) => p.text && p.text.trim()).length;
    const hasPairKorean = versePairs.length > 0 && pairsWithKorean / versePairs.length >= 0.8;
    if (versePairs.length > 0 && hasPairKorean) {
      finalTimings = versePairs as typeof timings;
      console.log(`[Remotion-TTS] 구절 기반 자막 ${versePairs.length}개 사용 (BibleVerse 한국어 있음)`);
    } else if (versePairs.length > 0) {
      // 한국어 없지만 히브리어는 있음 → TTS 타이밍 유지 + heText만 절 기반으로 보완
      const heMap = new Map<number, string>(
        versePairs.map((p, i) => [i, p.heText] as [number, string])
      );
      const heTotal = versePairs[versePairs.length - 1]?.endSec ?? narrationDuration;
      finalTimings = distributeHebrewToTimings(timings, episodeHebrew, narrationDuration);
      console.log(`[Remotion-TTS] BibleVerse 한국어 없음 → TTS 타이밍 유지, 히브리어만 배분`);
    }
  }

  // verseRange 없거나 위에서 finalTimings가 timings 그대로면 히브리어만 배분
  if (finalTimings === timings && episodeHebrew) {
    finalTimings = distributeHebrewToTimings(timings, episodeHebrew, narrationDuration);
    console.log(`[Remotion-TTS] 히브리어 자동 배분 (${splitHebrewByLength(episodeHebrew).length}개 라인)`);
  }

  // 구절 기반 자막에 한국어(text)가 비어 있거나 대부분 비어 있으면 SRT_KO / SCRIPT / narrationText로 채움
  // some()이 아닌 80% 커버리지 기준 — 일부 절만 한국어가 있는 경우 채움 대상으로 처리
  const koCount = finalTimings.filter((t) => t.text && t.text.trim()).length;
  const hasKorean = koCount >= finalTimings.length * 0.8;
  if (!hasKorean) {
    let koScenes: string[] = [];
    const srtKoContent = episode.contents.find((c) => c.contentType === "SRT_KO");
    if (srtKoContent?.content) koScenes = extractSrtAllScenes(srtKoContent.content);
    if (!koScenes.length) {
      const scriptContent = episode.contents.find((c) => c.contentType === "SCRIPT");
      if (scriptContent?.content) {
        const allKo = extractAllKoreanNarration(scriptContent.content);
        if (allKo) koScenes = [allKo];
      }
    }
    if (!koScenes.length && narrationText) koScenes = [narrationText];
    if (koScenes.length) {
      const K = koScenes.length;
      // verseNum 필드가 있으면 절 비례 배분 + sub-phrase 분할로 각 항목 고유 텍스트
      const verseNums = (finalTimings as any[]).map((t) => t.verseNum as number | undefined).filter((v): v is number => v !== undefined);
      if (verseNums.length === finalTimings.length) {
        const uniqueVerses = [...new Set(verseNums)].sort((a, b) => a - b);
        const V = uniqueVerses.length;
        const verseToSceneIdx: Record<number, number> = {};
        uniqueVerses.forEach((vn, i) => {
          verseToSceneIdx[vn] = Math.min(Math.floor(i * K / V), K - 1);
        });
        // 절별 항목 그룹화 → sub-phrase 분할
        const vGroups = new Map<number, any[]>();
        (finalTimings as any[]).forEach((t) => {
          const vn = t.verseNum ?? uniqueVerses[uniqueVerses.length - 1];
          if (!vGroups.has(vn)) vGroups.set(vn, []);
          vGroups.get(vn)!.push(t);
        });
        const vPhrases = new Map<number, string[]>();
        vGroups.forEach((group, vn) => {
          const sIdx = verseToSceneIdx[vn] ?? K - 1;
          vPhrases.set(vn, splitKoreanIntoN(koScenes[sIdx], group.length));
        });
        const vCounters = new Map<number, number>();
        finalTimings = (finalTimings as any[]).map((t) => {
          const vn = t.verseNum ?? uniqueVerses[uniqueVerses.length - 1];
          const phrases = vPhrases.get(vn) ?? [koScenes[K - 1]];
          const pos = vCounters.get(vn) ?? 0;
          vCounters.set(vn, pos + 1);
          return { ...t, text: phrases[Math.min(pos, phrases.length - 1)] };
        }) as typeof timings;
        console.log(`[Remotion-TTS] 한국어 보완 배분(절 비례 + sub-phrase, ${V}절→${K}씬)`);
      } else {
        finalTimings = distributeKoreanToTimings(finalTimings as SubtitleTiming[], koScenes, narrationDuration) as typeof timings;
        console.log(`[Remotion-TTS] 한국어 보완 배분(시간비례, ${koScenes.length}씬)`);
      }
    }
  }

  // 자막 한국어 텍스트에 단어 치환 최종 적용 (경로에 무관하게 보장)
  finalTimings = finalTimings.map((t) => ({
    ...t,
    text: applyWordReplacements(t.text),
  }));

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
  episodeId: string
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
  const { filePath: storagePath, timings } = await generateNarration(episodeId, narrationText, "en");

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
