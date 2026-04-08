import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { getGcpAccessToken } from "../config/vertexai";

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
  speakingRate: 0.82,   // Chirp3-HD는 pitch 미지원 — 속도로 무게감 조절
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

export async function generateNarration(
  episodeId: string,
  inputText: string
): Promise<string> {
  const token = await getGcpAccessToken();

  // SRT 형식이면 타임코드/인덱스 파싱 후 cleanNarrationText 적용
  const isSrt = /^\d+\s*\n\d{2}:\d{2}:\d{2}/.test(inputText.trim());
  const base = isSrt ? extractSrtText(inputText) : inputText.trim();
  const extracted = cleanNarrationText(base);

  // Google TTS 단건 한도: 5000 bytes (한글 3바이트/자)
  // 바이트 기준으로 4800 bytes까지만 사용
  let cleanedText = "";
  let byteCount = 0;
  for (const char of extracted) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (byteCount + charBytes > 4800) break;
    cleanedText += char;
    byteCount += charBytes;
  }

  console.log(`[TTS] 나레이션 텍스트 정제 완료: ${extracted.length}자 → ${cleanedText.length}자 (TTS 전달)`);
  console.log(`[TTS] 샘플: "${cleanedText.slice(0, 80)}..."`);

  let response;
  try {
    response = await axios.post(
      TTS_ENDPOINT,
      {
        input: { text: cleanedText },
        voice: NARRATION_VOICE,
        audioConfig: NARRATION_AUDIO_CONFIG,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error(`[TTS] API 오류 ${err.response?.status}:`, JSON.stringify(err.response?.data).slice(0, 300));
    throw err;
  }

  const audioBase64: string = response.data.audioContent;
  const audioBuffer = Buffer.from(audioBase64, "base64");

  const dir = path.join(AUDIO_BASE, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "narration.mp3");
  fs.writeFileSync(filePath, audioBuffer);

  console.log(`[TTS] 나레이션 저장 완료: ${filePath} (${audioBuffer.length} bytes)`);
  return filePath;
}
