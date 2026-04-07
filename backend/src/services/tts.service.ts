import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { getGcpAccessToken } from "../config/vertexai";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const AUDIO_BASE = process.env.AUDIO_STORAGE_PATH || "/app/storage/audio";

// 중년 남성 부드럽고 차분한 한국어 나레이션 목소리
const NARRATION_VOICE = {
  languageCode: "ko-KR",
  name: "ko-KR-Neural2-C",   // 남성 Neural2 (최고품질)
  ssmlGender: "MALE",
};

const NARRATION_AUDIO_CONFIG = {
  audioEncoding: "MP3",
  speakingRate: 0.78,   // 천천히 — 차분한 다큐 나레이션 톤
  pitch: -1.0,          // 살짝 낮게 — 부드럽고 안정감 있는 음색
  volumeGainDb: 1.0,
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
      // 순수 숫자 인덱스 줄 제거 (1, 2, 10, 100 등)
      if (/^\d+$/.test(trimmed)) return false;
      // 타임코드 줄 제거 (00:00:00,000 --> 00:00:10,000)
      if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(trimmed)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function generateNarration(
  episodeId: string,
  inputText: string
): Promise<string> {
  const token = await getGcpAccessToken();

  // SRT 형식이면 파싱, 아니면 그대로 사용 (Gemini 대본은 순수 텍스트)
  const isSrt = /^\d+\s*\n\d{2}:\d{2}:\d{2}/.test(inputText.trim());
  const extracted = isSrt ? extractSrtText(inputText) : inputText.trim();

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

  console.log(`[TTS] 나레이션 생성 (SRT_KO 기반), episodeId=${episodeId}, 추출텍스트=${cleanedText.length}자`);

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
