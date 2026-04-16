import axios from "axios";
import * as fs from "fs";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;          // "premade" | "cloned" | "generated"
  labels: Record<string, string>;
  preview_url: string | null;
}

export interface ElevenLabsTTSOptions {
  modelId?: string;          // 기본: eleven_multilingual_v2
  stability?: number;        // 0~1, 기본 0.5
  similarityBoost?: number;  // 0~1, 기본 0.75
  style?: number;            // 0~1, 기본 0
  speakerBoost?: boolean;    // 기본 true
}

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY 환경변수가 설정되지 않았습니다.");
  return key;
}

// 다국어 지원 프리셋 음성 (voices_read 권한 없을 때 폴백)
const PRESET_VOICES: ElevenLabsVoice[] = [
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni",  category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",    category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",     category: "premade", labels: { accent: "American", language: "en" },        preview_url: null },
  { voice_id: "nPczCjzI2devNBz1zQrb", name: "Brian",   category: "premade", labels: { accent: "American", language: "multilingual" }, preview_url: null },
  { voice_id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", category: "premade", labels: { accent: "Australian", language: "multilingual" }, preview_url: null },
  { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", category: "premade", labels: { accent: "English-Swedish", language: "multilingual" }, preview_url: null },
  { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice",   category: "premade", labels: { accent: "British", language: "multilingual" }, preview_url: null },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",  category: "premade", labels: { accent: "British", language: "multilingual" }, preview_url: null },
  { voice_id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", category: "premade", labels: { accent: "American", language: "multilingual" }, preview_url: null },
];

/**
 * 사용 가능한 음성 목록 조회
 * voices_read 권한 없으면 프리셋 목록으로 폴백
 */
export async function getElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  const key = getApiKey();
  try {
    const response = await axios.get(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": key },
      timeout: 10_000,
    });
    const voices: ElevenLabsVoice[] = response.data.voices ?? [];
    return voices.sort((a, b) => {
      const aScore = a.category === "premade" ? 0 : 1;
      const bScore = b.category === "premade" ? 0 : 1;
      return aScore - bScore || a.name.localeCompare(b.name);
    });
  } catch (err: any) {
    // voices_read 권한 없음 → 프리셋 반환
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.warn("[ElevenLabs] voices_read 권한 없음 — 프리셋 목록 사용");
      return PRESET_VOICES;
    }
    throw err;
  }
}

/**
 * ElevenLabs TTS 생성 → MP3 파일 저장
 * 한국어 지원: eleven_multilingual_v2 / eleven_turbo_v2_5
 */
export async function generateElevenLabsTTS(
  text: string,
  voiceId: string,
  outputPath: string,
  opts: ElevenLabsTTSOptions = {}
): Promise<void> {
  const key = getApiKey();
  const model = opts.modelId ?? "eleven_multilingual_v2";

  console.log(`[ElevenLabs] TTS 생성 시작 — voice: ${voiceId}, model: ${model}, ${text.length}자`);

  let response;
  try {
    response = await axios.post(
      `${ELEVENLABS_API}/text-to-speech/${voiceId}`,
      {
        text,
        model_id: model,
        voice_settings: {
          stability:         opts.stability        ?? 0.5,
          similarity_boost:  opts.similarityBoost  ?? 0.75,
          style:             opts.style            ?? 0,
          use_speaker_boost: opts.speakerBoost     ?? true,
        },
      },
      {
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        responseType: "arraybuffer",
        timeout: 120_000,
      }
    );
  } catch (err: any) {
    // arraybuffer 모드에서 4xx/5xx 응답 본문이 Buffer로 오므로 직접 파싱
    if (err.response?.data) {
      let detail = "";
      try {
        const text = Buffer.from(err.response.data).toString("utf-8");
        const json = JSON.parse(text);
        detail = json?.detail?.message ?? json?.detail ?? text.slice(0, 200);
      } catch {
        detail = `HTTP ${err.response.status}`;
      }
      const statusCode = err.response.status;
      if (statusCode === 402) {
        throw new Error(`크레딧 부족 또는 구독 필요 (402) — ElevenLabs 계정을 확인하세요. ${detail}`);
      }
      if (statusCode === 401 || statusCode === 403) {
        throw new Error(`API 키 권한 없음 (${statusCode}) — text_to_speech 권한이 필요합니다. ${detail}`);
      }
      throw new Error(`ElevenLabs API 오류 (${statusCode}): ${detail}`);
    }
    throw err;
  }

  fs.writeFileSync(outputPath, Buffer.from(response.data));
  const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`[ElevenLabs] 저장 완료: ${outputPath} (${sizeKb} KB)`);
}

/**
 * 남은 크레딧 조회 — user_read 권한 없으면 API 키 유효 여부만 반환
 */
export async function getElevenLabsUserInfo(): Promise<{ characterCount: number; characterLimit: number; keyValid: boolean }> {
  const key = getApiKey();
  try {
    const response = await axios.get(`${ELEVENLABS_API}/user/subscription`, {
      headers: { "xi-api-key": key },
      timeout: 8_000,
    });
    return {
      characterCount: response.data.character_count ?? 0,
      characterLimit: response.data.character_limit ?? 0,
      keyValid: true,
    };
  } catch (err: any) {
    // user_read 권한 없어도 키 자체는 유효
    if (err.response?.data?.detail?.status === "missing_permissions") {
      return { characterCount: -1, characterLimit: -1, keyValid: true };
    }
    throw err;
  }
}
