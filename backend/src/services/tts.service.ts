import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { getGcpAccessToken } from "../config/vertexai";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const AUDIO_BASE = process.env.AUDIO_STORAGE_PATH || "/app/storage/audio";

// 중년 남성 부드러운 한국어 나레이션 목소리
const NARRATION_VOICE = {
  languageCode: "ko-KR",
  name: "ko-KR-Neural2-C",   // 남성 Neural2 (최고품질)
  ssmlGender: "MALE",
};

const NARRATION_AUDIO_CONFIG = {
  audioEncoding: "MP3",
  speakingRate: 0.88,   // 약간 느리게 — 중후한 나레이션 톤
  pitch: -2.5,          // 낮은 음조 — 중년 남성
  volumeGainDb: 1.0,
};

export async function generateNarration(
  episodeId: string,
  scriptText: string
): Promise<string> {
  const token = await getGcpAccessToken();

  // Google TTS 단건 한도: 5000 bytes (한글 3바이트/자 → 최대 ~1600자)
  // 안전하게 1500자로 제한, 바이트 초과 시 청크 분할
  const cleaned = scriptText
    .replace(/[#*`>\[\]]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 바이트 기준으로 4800 bytes까지만 사용
  let cleanedText = "";
  let byteCount = 0;
  for (const char of cleaned) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (byteCount + charBytes > 4800) break;
    cleanedText += char;
    byteCount += charBytes;
  }

  console.log(`[TTS] 나레이션 생성 시작, episodeId=${episodeId}, 텍스트길이=${cleanedText.length}`);

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
