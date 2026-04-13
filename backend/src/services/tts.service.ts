import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getGcpAccessToken } from "../config/vertexai";
import { generateSilenceMp3, concatAudioFiles } from "./ffmpeg.service";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const AUDIO_BASE = process.env.AUDIO_STORAGE_PATH || "/app/storage/audio";

// 성경 다큐 나레이션 목소리 — Chirp3-HD Iapetus (Gemini 최신 TTS)
const NARRATION_VOICE = {
  languageCode: "ko-KR",
  name: "ko-KR-Chirp3-HD-Iapetus",
  ssmlGender: "MALE",
};

const NARRATION_AUDIO_CONFIG = {
  audioEncoding: "MP3",
  speakingRate: 0.62,   // 0.72→0.62: 더 천천히, 장중한 성경 다큐 나레이션
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
async function callTtsApi(text: string, token: string): Promise<Buffer> {
  const response = await axios.post(
    TTS_ENDPOINT,
    {
      input: { text },
      voice: NARRATION_VOICE,
      audioConfig: NARRATION_AUDIO_CONFIG,
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
  return Buffer.from(response.data.audioContent, "base64");
}

export async function generateNarration(
  episodeId: string,
  inputText: string
): Promise<string> {
  const token = await getGcpAccessToken();

  // SRT 형식이면 타임코드/인덱스 파싱 후 cleanNarrationText 적용
  const isSrt = /^\d+\s*\n\d{2}:\d{2}:\d{2}/.test(inputText.trim());
  const base = isSrt ? extractSrtText(inputText) : inputText.trim();
  const extracted = cleanNarrationText(base);

  // 바이트 한도 적용 (한글 3바이트/자, 4800 bytes)
  let cleanedText = "";
  let byteCount = 0;
  for (const char of extracted) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (byteCount + charBytes > 4800) break;
    cleanedText += char;
    byteCount += charBytes;
  }

  console.log(`[TTS] 텍스트 정제: ${extracted.length}자 → ${cleanedText.length}자`);

  // ── 쉼표·마침표 기준 분절 → 각각 TTS + 사이에 묵음 삽입 ────────────────
  // Chirp3-HD는 SSML break 미지원이므로 FFmpeg로 직접 pause 삽입
  const rawSegments = cleanedText.split(/(?<=[,.\u3002\uff0c])\s*/u).filter((s) => s.trim());

  const dir = path.join(AUDIO_BASE, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "narration.mp3");

  const ts = Date.now();
  const tempFiles: string[] = [];

  try {
    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i].trim();
      if (!seg) continue;

      // 분절별 TTS
      console.log(`[TTS] 분절 ${i + 1}/${rawSegments.length}: "${seg.slice(0, 30)}..."`);
      const buf = await callTtsApi(seg, token);
      const segPath = path.join(os.tmpdir(), `narr_seg_${ts}_${i}.mp3`);
      fs.writeFileSync(segPath, buf);
      tempFiles.push(segPath);

      // 마지막 분절이 아니면 묵음 삽입
      if (i < rawSegments.length - 1) {
        const endsWithPeriod = /[.\u3002]$/.test(seg);
        const silDur = endsWithPeriod ? 0.7 : 0.4;   // 마침표 700ms / 쉼표 400ms
        const silPath = path.join(os.tmpdir(), `narr_sil_${ts}_${i}.mp3`);
        await generateSilenceMp3(silDur, silPath);
        tempFiles.push(silPath);
        console.log(`[TTS] 묵음 삽입 ${silDur * 1000}ms (${endsWithPeriod ? "마침표" : "쉼표"})`);
      }
    }

    // 모든 분절 + 묵음 연결
    await concatAudioFiles(tempFiles, filePath);
  } finally {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    }
  }

  console.log(`[TTS] 나레이션 저장 완료: ${filePath} (${audioBuffer.length} bytes)`);
  return filePath;
}
