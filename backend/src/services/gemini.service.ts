import { genAI } from "../config/gemini";
import { redis } from "../config/redis";
import * as crypto from "crypto";

const SYSTEM_PROMPT = `당신은 구약 히브리 성경 기반 유튜브 3D 애니메이션 제작 전문 어시스턴트입니다.
- 히브리어 마소라 본문(BHS)에 충실하게 작업하세요
- 한국어는 자연스러운 현대 한국어로 작성하세요
- 히브리어는 현대 이스라엘 히브리어 기준으로 작성하세요
- 창작적 각색은 원문의 신학적 의미를 훼손하지 마세요
- 임의의 신학적 해석을 추가하지 마세요`;

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || "86400");

function promptHash(prompt: string): string {
  return "gemini:" + crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export async function* streamGenerate(
  userPrompt: string,
  modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
): AsyncGenerator<string> {
  const cacheKey = promptHash(userPrompt);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      yield cached;
      return;
    }
  } catch {
    // Redis 미연결 시 무시하고 진행
  }

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContentStream(userPrompt);
  let fullText = "";

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullText += text;
      yield text;
    }
  }

  try {
    await redis.set(cacheKey, fullText, "EX", CACHE_TTL);
  } catch {
    // 캐시 저장 실패는 무시
  }
}

export async function generateOnce(
  userPrompt: string,
  modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
): Promise<string> {
  let result = "";
  for await (const chunk of streamGenerate(userPrompt, modelName)) {
    result += chunk;
  }
  return result;
}
