import fs from "fs";
import path from "path";
import http from "http";
import { prisma } from "../config/database";
import { generateNarration } from "./tts.service";
import { getMediaDuration } from "./ffmpeg.service";

export const PROJECT_PATH =
  process.env.REMOTION_PROJECT_PATH || "/app/remotion-project";

// Remotion 컨테이너 내부의 렌더 서버 주소 (Docker 서비스명 사용)
const RENDER_SERVER =
  process.env.REMOTION_RENDER_URL || "http://remotion:3003";

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
  subtitlesJson?: string; // JSON: Array<{text,startSec,endSec}>
}

// ─── data.json 읽기/쓰기 ─────────────────────────────────────────────────────

export function writeProps(props: RemotionProps, durationInFrames?: number): void {
  // 1. data.json 업데이트 (CLI 렌더링용)
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  const payload = {
    koreanText: props.koreanText,
    hebrewText: props.hebrewText,
    videoFileName: props.videoFileName ?? "",
    audioFileName: props.audioFileName ?? "narration.mp3",
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
  const vf = JSON.stringify(props.videoFileName ?? "");
  const af = JSON.stringify(props.audioFileName ?? "narration.mp3");
  const sj = JSON.stringify(props.subtitlesJson ?? "");

  const content = `import { Composition } from 'remotion';
import { HelloWorld, myCompSchema } from './HelloWorld';

const defaultProps = {
  koreanText: ${ko},
  hebrewText: ${he},
  videoFileName: ${vf},
  audioFileName: ${af},
  subtitlesJson: ${sj},
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

// ─── 렌더 서버 호출 헬퍼 ─────────────────────────────────────────────────────

function httpRequest(
  url: string,
  method: "GET" | "POST",
  body?: object
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
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
): Promise<{ koreanText: string; hebrewText: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { contents: { orderBy: { createdAt: "desc" } } },
  });
  if (!episode) throw new Error("Episode not found");

  let koreanText = "";
  let hebrewText = "";

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

  console.log(`[Remotion] 에피소드 ${episodeId} 자막 추출:`, {
    koLen: koreanText.length,
    heLen: hebrewText.length,
    hePreview: hebrewText.slice(0, 40),
  });

  return { koreanText, hebrewText };
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

    return verses
      .map((v) => v.hebrewText.replace(/\u202B/g, "").trim())
      .filter(Boolean)
      .join(" ");
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

// 히브리어 라인당 목표 기본 문자 수 (니쿠드 제거 기준, 이미지 참조 ~45자)
const HE_CHARS_PER_LINE = 45;

/** 히브리어 니쿠드·칸틸레이션 기호 제거 → 기본 문자만 */
function stripNiqqud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, "");
}

/** 히브리어 텍스트를 단어 경계 기준으로 HE_CHARS_PER_LINE 기본 문자씩 분할 */
function splitHebrewByLength(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const segments: string[] = [];
  let current = "";
  let baseCount = 0;

  for (const word of words) {
    const wordBase = stripNiqqud(word).length;
    if (baseCount + wordBase > HE_CHARS_PER_LINE && current) {
      segments.push(current.trim());
      current = word;
      baseCount = wordBase;
    } else {
      current = current ? `${current} ${word}` : word;
      baseCount += wordBase;
    }
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

/** 한국어 텍스트를 N등분 (단어 경계 기준) */
function splitKoreanIntoN(text: string, n: number): string[] {
  if (n <= 1) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const size = Math.ceil(words.length / n);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const chunk = words.slice(i * size, (i + 1) * size).join(" ");
    if (chunk) parts.push(chunk);
  }
  // 부족하면 빈 문자열로 채워 N개 맞춤
  while (parts.length < n) parts.push(parts[parts.length - 1] ?? "");
  return parts;
}

/**
 * verseRange 기준으로 구절을 가져와 글자 수 기반 자막 페어 생성
 * 히브리어: ~45 기본 문자씩 분할
 * 한국어: 히브리어 분할 수와 동일하게 N등분
 * 타이밍: 히브리어 기본 글자 수 비례 배분
 */
async function buildVerseSubtitlePairs(
  bookId: number,
  verseRange: string,
  totalDurationSec: number
): Promise<Array<{ heText: string; text: string; startSec: number; endSec: number }>> {
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

    const cleanHe = (t: string) => t.replace(/\u202B/g, "").trim();
    const allHe = verses.map((v) => cleanHe(v.hebrewText)).join(" ");
    const allKo = verses.map((v) => v.koreanText).join(" ");

    // 히브리어를 ~45 기본 문자 단위로 분할
    const heSegments = splitHebrewByLength(allHe);
    const N = heSegments.length;

    // 한국어를 동일 N등분
    const koSegments = splitKoreanIntoN(allKo, N);

    // 히브리어 기본 문자 수 비례로 타이밍 배분
    const totalBaseChars = heSegments.reduce(
      (sum, s) => sum + stripNiqqud(s).replace(/\s/g, "").length, 0
    );

    const result: Array<{ heText: string; text: string; startSec: number; endSec: number }> = [];
    let currentSec = 0;

    for (let i = 0; i < N; i++) {
      const segBase = stripNiqqud(heSegments[i]).replace(/\s/g, "").length;
      const segDur = (segBase / totalBaseChars) * totalDurationSec;
      result.push({
        heText: heSegments[i],
        text: koSegments[i] ?? "",
        startSec: currentSec,
        endSec: currentSec + segDur,
      });
      currentSec += segDur;
    }

    console.log(`[Subtitle] 히브리어 ${N}개 라인 (HE_CHARS_PER_LINE=${HE_CHARS_PER_LINE}): ${heSegments.map(s => stripNiqqud(s).replace(/\s/g,'').length).join(", ")}자`);
    return result;
  } catch {
    return [];
  }
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

// ─── 에피소드 한국어 나레이션 생성 → Remotion public/ 에 저장 ─────────────────

export async function generateNarrationForRemotionPublic(
  episodeId: string
): Promise<{ fileName: string; textLength: number }> {
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

  // 구절 기반 자막 페어 우선 시도 (히브리어+한국어 번역 일치)
  // 구절 데이터 없으면 narration 분절 타이밍으로 fallback
  let finalTimings: typeof timings = timings;
  if (episode.verseRange) {
    const versePairs = await buildVerseSubtitlePairs(
      episode.bibleBookId,
      episode.verseRange,
      narrationDuration
    );
    if (versePairs.length > 0) {
      finalTimings = versePairs as typeof timings;
      console.log(`[Remotion-TTS] 구절 기반 자막 ${versePairs.length}개 사용`);
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
