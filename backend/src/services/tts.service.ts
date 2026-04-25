import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getGcpAccessToken } from "../config/vertexai";
import { generateSilenceMp3, concatAudioFiles, getMediaDuration } from "./ffmpeg.service";
import { applyWordReplacements } from "./wordReplacement.service";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const AUDIO_BASE = process.env.AUDIO_STORAGE_PATH || "/app/storage/audio";

// 성경 다큐 나레이션 목소리 — Chirp3-HD Charon (차분하고 안정적인 정보전달형 나레이터)
const NARRATION_VOICE_KO = {
  languageCode: "ko-KR",
  name: "ko-KR-Chirp3-HD-Charon",
  ssmlGender: "MALE",
};

// 베트남어 나레이션 목소리 — Standard-B (더 깊고 중후한 남성 나레이터)
const NARRATION_VOICE_VI = {
  languageCode: "vi-VN",
  name: "vi-VN-Standard-B",
  ssmlGender: "MALE",
};

// 하위 호환용 별칭
const NARRATION_VOICE = NARRATION_VOICE_KO;

const NARRATION_AUDIO_CONFIG = {
  audioEncoding: "MP3",
  speakingRate: 1.0,   // 1.0: 기본 속도
  volumeGainDb: 1.5,
};

const NARRATION_AUDIO_CONFIG_VI = {
  audioEncoding: "MP3",
  speakingRate: 1.0,   // 1.0: 기본 속도
  volumeGainDb: 1.5,
};

/**
 * SRT 형식에서 자막 텍스트만 추출
 * - 숫자 인덱스 줄 (1, 2, 3 ...) 제거
 * - 타임코드 줄 (00:00:00,000 --> 00:00:10,000) 제거
 * - 빈 줄 정리 후 자막 텍스트만 반환
 */
function extractSrtText(srtContent: string): string {
  return srtContent
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(trimmed)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * TTS 전달 전 텍스트 정제 — 음성으로 읽을 수 없는 요소 모두 제거
 *
 * 제거 대상:
 *   - 마크다운: **, *, #, _, ~~, `, [ ], ( ) 기호 쌍
 *   - 씬/Scene 헤더: "씬 1:", "씬1.", "Scene 1:", "[씬 2]", "**씬 3**" 등
 *   - 타임코드/SRT 인덱스
 *   - 이모지 및 특수 유니코드 기호
 *   - 단독 숫자 토큰 (연도/성경 구절 번호 등 문장 중간 숫자 포함)
 *   - 괄호 안 영문 설명: (Scene 1), [SCENE_1], (image prompt) 등
 *   - 반복 구두점/기호
 *
 * 유지:
 *   한국어, 영어 단어(나레이션 일부), 기본 구두점(., , ? ! :)
 */
function cleanNarrationText(text: string): string {
  let t = text;

  // 1. SRT 타임코드 줄 제거
  t = t.replace(/^\d+\s*$/gm, "");
  t = t.replace(/\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}/g, "");

  // 1-1. 에피소드 제목·타이틀 줄 전체 제거
  //      "에피소드 제목:", "제목:", "타이틀:", "Title:", "Episode:", "에피소드:" 등
  t = t.replace(/^\*{0,3}(에피소드\s*제목|에피소드|제목|타이틀|Title|Episode)\s*[:：]?[^\n]*\n?/gim, "");

  // 1-2. "나레이션:", "해설:", "내레이션:" 접두어만 제거 (텍스트는 유지)
  t = t.replace(/^(나레이션|내레이션|해설|Narration)\s*[:：]\s*/gim, "");

  // 2. 씬/Scene 헤더 제거: "씬 1:", "[씬 2]", "**씬 3**", "Scene 1:", "Scene1." 등
  t = t.replace(/\*{0,3}(씬|Scene)\s*\d+\s*[:\.\*]?\*{0,3}/gi, "");
  t = t.replace(/[\[\(](씬|Scene)\s*\d+[\]\)]/gi, "");

  // 3. 마크다운 서식 기호 제거
  t = t.replace(/\*{1,3}([^*]*?)\*{1,3}/g, "$1");  // **굵게**, *기울임*
  t = t.replace(/_{1,2}([^_]*?)_{1,2}/g, "$1");      // __밑줄__, _기울임_
  t = t.replace(/~~([^~]*?)~~/g, "$1");              // ~~취소선~~
  t = t.replace(/`{1,3}[^`]*?`{1,3}/g, "");         // `코드`
  t = t.replace(/^#{1,6}\s+/gm, "");                 // ## 헤더
  t = t.replace(/^[-*+]\s+/gm, "");                  // - 리스트

  // 4. 괄호 안 영문/숫자 태그 제거: [이미지 프롬프트], (Scene 1), [SCENE_1] 등
  t = t.replace(/\[[^\]]{1,80}\]/g, "");
  t = t.replace(/\([A-Za-z0-9_\s]{1,40}\)/g, "");

  // 5. 이모지 및 특수 유니코드 심볼 제거
  t = t.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  t = t.replace(/[\u{2600}-\u{27FF}]/gu, "");
  t = t.replace(/[\u202B\u202A\u200F\u200E\u200B]/gu, ""); // RTL/LTR 마커

  // 6. 특수기호 제거: /, \, |, ~, @, #, $, ^, &, =, <, >, +, {, }
  t = t.replace(/[\/\\|~@#$^&=<>+{}\[\]`]/g, "");

  // 7. 단독 숫자 토큰 제거 (공백으로 둘러싸인 숫자, 앞에 문자 없는 줄 시작 숫자)
  t = t.replace(/(?<!\w)\d+(?!\w)/g, "");

  // 8. 남은 연속 특수문자/줄바꿈 정리
  t = t.replace(/[-—–·•※★▶►▲▼◆◇○●□■…]+/g, " ");
  t = t.replace(/[!?]{2,}/g, (m) => m[0]);           // !!!! → !
  t = t.replace(/\.{2,}/g, ".");                      // ... → .
  t = t.replace(/,{2,}/g, ",");

  // 9. 공백 정규화
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.trim();

  return t;
}

/**
 * Google TTS API 단건 호출 → MP3 Buffer 반환
 * Chirp3-HD는 SSML 미지원 → plain text 사용
 */
async function callTtsApi(text: string, token: string, lang: "ko" | "vi" = "ko", speakingRate?: number): Promise<Buffer> {
  const baseConfig = lang === "vi" ? NARRATION_AUDIO_CONFIG_VI : NARRATION_AUDIO_CONFIG;
  const audioConfig = speakingRate !== undefined
    ? { ...baseConfig, speakingRate }
    : baseConfig;
  const response = await axios.post(
    TTS_ENDPOINT,
    {
      input: { text },
      voice: lang === "vi" ? NARRATION_VOICE_VI : NARRATION_VOICE_KO,
      audioConfig,
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
  return Buffer.from(response.data.audioContent, "base64");
}

export interface SubtitleTiming {
  text: string;       // 한국어 자막
  heText?: string;    // 히브리어 자막 (선택)
  viText?: string;    // 베트남어 자막 (선택)
  startSec: number;
  endSec: number;
  verseNum?: number;  // 절 번호 (절 기반 배분 시 사용, 내부용)
}

export interface NarrationResult {
  filePath: string;
  cleanedText: string;
  timings: SubtitleTiming[];
}

export async function generateNarration(
  episodeId: string,
  inputText: string,
  language: "ko" | "vi" = "ko",
  speakingRate?: number
): Promise<NarrationResult> {
  const token = await getGcpAccessToken();

  const isSrt = /^\d+\s*\n\d{2}:\d{2}:\d{2}/.test(inputText.trim());
  const base = isSrt ? extractSrtText(inputText) : inputText.trim();
  // 한국어만 단어 치환 적용 (베트남어는 불필요)
  const extracted = cleanNarrationText(language === "ko" ? applyWordReplacements(base) : base);

  // 전체 텍스트를 cleanedText로 사용 (바이트 전역 제한 제거 — 긴 에피소드 전체 처리)
  const cleanedText = extracted;

  console.log(`[TTS] 텍스트 정제 완료: ${cleanedText.length}자 (${Buffer.byteLength(cleanedText, "utf8")} bytes)`);

  if (!cleanedText) {
    throw new Error("TTS 변환할 텍스트가 없습니다. 에피소드 SCRIPT/SRT_KO 내용을 확인하세요.");
  }

  // 마침표·물음표·느낌표·쉼표 기준 분절 (자막 한 줄 = 한 절)
  // 쉼표와 마침표 모두 분리 → 쉼표는 더 긴 묵음(600ms), 마침표는 900ms
  const punctSegments = cleanedText
    .split(/(?<=[,!?.，。\u3002\uff0c])\s*/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // 각 분절이 TTS API 한도(4500 bytes)를 초과하면 공백 기준으로 추가 분할
  const TTS_SEG_BYTE_LIMIT = 4500;
  const rawSegments: string[] = [];
  for (const seg of punctSegments) {
    if (Buffer.byteLength(seg, "utf8") <= TTS_SEG_BYTE_LIMIT) {
      rawSegments.push(seg);
    } else {
      // 공백 기준으로 단어를 묶어 4500바이트 이하로 분할
      const words = seg.split(/\s+/);
      let chunk = "";
      for (const word of words) {
        const candidate = chunk ? chunk + " " + word : word;
        if (Buffer.byteLength(candidate, "utf8") > TTS_SEG_BYTE_LIMIT) {
          if (chunk) rawSegments.push(chunk);
          chunk = word;
        } else {
          chunk = candidate;
        }
      }
      if (chunk) rawSegments.push(chunk);
    }
  }

  const dir = path.join(AUDIO_BASE, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "narration.mp3");

  const ts = Date.now();
  const tempFiles: string[] = [];
  const timings: SubtitleTiming[] = [];
  let currentTimeSec = 0;

  try {
    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      if (!seg) continue;

      console.log(`[TTS] 분절 ${i + 1}/${rawSegments.length}: "${seg.slice(0, 40)}"`);
      const buf = await callTtsApi(seg, token, language, speakingRate);
      const segPath = path.join(os.tmpdir(), `narr_seg_${ts}_${i}.mp3`);
      fs.writeFileSync(segPath, buf);
      tempFiles.push(segPath);

      // 실제 분절 길이 측정 → 정확한 자막 타이밍
      const segDuration = getMediaDuration(segPath);
      const segStart = currentTimeSec;
      const segEnd = currentTimeSec + segDuration;

      // 자막 표시용 세분화: 최대 30자 단위로 분할, 시간은 글자 수 비례 배분
      const displayChunks = splitForDisplay(seg, 30);
      let chunkStart = segStart;
      for (const chunk of displayChunks) {
        const chunkDur = (chunk.length / seg.length) * segDuration;
        timings.push({ text: chunk, startSec: chunkStart, endSec: chunkStart + chunkDur });
        chunkStart += chunkDur;
      }

      currentTimeSec = segEnd;

      // 분절 뒤 묵음: 쉼표 600ms / 마침표·문장끝 900ms
      if (i < rawSegments.length - 1) {
        const endsWithComma = /[,，\uff0c]$/.test(seg);
        const silDur = endsWithComma ? 0.6 : 0.9;
        const silPath = path.join(os.tmpdir(), `narr_sil_${ts}_${i}.mp3`);
        await generateSilenceMp3(silDur, silPath);
        tempFiles.push(silPath);
        currentTimeSec += silDur;
        console.log(`[TTS] 묵음 ${silDur * 1000}ms (${endsWithComma ? "쉼표" : "문장끝"})`);
      }
    }

    if (tempFiles.length === 0) {
      throw new Error("TTS 분절 생성 실패 — 생성된 오디오 파일이 없습니다.");
    }
    await concatAudioFiles(tempFiles, filePath);
  } finally {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    }
  }

  const savedSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  console.log(`[TTS] 나레이션 저장 완료: ${filePath} (${savedSize} bytes), 자막 ${timings.length}개`);
  return { filePath, cleanedText, timings };
}

/**
 * 긴 텍스트를 maxChars 이하의 자막 라인으로 분할
 * - 공백(어절 경계)에서 우선 분리
 * - 공백이 없으면 maxChars 위치에서 강제 분리
 */
function splitForDisplay(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    // maxChars 이하에서 가장 마지막 공백 찾기
    let cutAt = maxChars;
    const spaceIdx = remaining.lastIndexOf(" ", maxChars);
    if (spaceIdx > maxChars / 2) {
      // 공백이 앞쪽 절반 이후에 있으면 그 지점에서 분리
      cutAt = spaceIdx;
    }
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
