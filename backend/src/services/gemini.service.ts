import { genAI } from "../config/gemini";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { redis } from "../config/redis";
import * as crypto from "crypto";

const SYSTEM_PROMPT = `당신은 구약 히브리 성경 기반 유튜브 3D 애니메이션 제작 전문 어시스턴트입니다.
- 히브리어 마소라 본문(BHS)에 충실하게 작업하세요
- 한국어는 자연스러운 현대 한국어로 작성하세요
- 히브리어는 현대 이스라엘 히브리어 기준으로 작성하세요
- 창작적 각색은 원문의 신학적 의미를 훼손하지 마세요
- 임의의 신학적 해석을 추가하지 마세요
- 모든 번역은 AI가 직접 창작한 표현이어야 합니다. 기존 출판된 성경 번역본(개역개정, KJV, NIV, ESV 등)을 그대로 인용하지 마세요.`;

// RECITATION 재시도용: 히브리어 직접 인용 금지 지시 추가
const RECITATION_RETRY_SUFFIX = `

⚠️ 중요: 히브리어 원문을 직접 인용하지 마세요.
히브리어 나레이션(HE) 항목은 히브리어 원문 텍스트 대신 해당 절의 핵심 의미를 현대 히브리어로 풀어 쓰세요.
모든 내용은 AI가 직접 창작한 표현으로 작성하세요.`;

// RECITATION 오류 여부 판단
function isRecitationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.toUpperCase().includes("RECITATION") ||
    err.message.includes("Candidate was blocked");
}

// 안전 설정 — 성경 관련 콘텐츠가 안전 필터에 걸리지 않도록 완화
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || "86400");

function promptHash(prompt: string): string {
  return "gemini:" + crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export async function* streamGenerate(
  userPrompt: string,
  modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash",
  isRetry = false
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
    safetySettings: SAFETY_SETTINGS,
  });

  const prompt = isRetry ? userPrompt + RECITATION_RETRY_SUFFIX : userPrompt;
  const result = await model.generateContentStream(prompt);
  let fullText = "";
  let recitationBlocked = false;

  for await (const chunk of result.stream) {
    try {
      const text = chunk.text();
      if (text) {
        fullText += text;
        yield text;
      }
    } catch (err: unknown) {
      if (isRecitationError(err)) {
        console.warn("[Gemini] RECITATION 차단 발생 — 부분 내용 확인 후 처리");
        recitationBlocked = true;
        break;
      }
      throw err;
    }
  }

  // RECITATION으로 차단됐을 때 처리
  if (recitationBlocked) {
    if (fullText.trim()) {
      // 이미 생성된 내용이 있으면 그대로 사용
      console.log(`[Gemini] RECITATION 차단 — 부분 내용(${fullText.length}자) 반환`);
    } else if (!isRetry) {
      // 내용이 없으면 재시도 (히브리어 직접 인용 금지 지시 추가)
      console.log("[Gemini] RECITATION 차단 — 재시도 (직접 인용 금지 강화)");
      for await (const chunk of streamGenerate(userPrompt, modelName, true)) {
        fullText += chunk;
        yield chunk;
      }
      return;
    } else {
      // 재시도에도 차단 → 사용자에게 안내 메시지
      const fallback = "[RECITATION 오류: 히브리 성경 본문이 저작권 필터에 차단되었습니다. 히브리어 나레이션 항목을 제외하거나 짧은 구절 범위로 재시도해 주세요.]";
      yield fallback;
      fullText = fallback;
    }
  }

  try {
    if (fullText.trim() && !recitationBlocked) {
      await redis.set(cacheKey, fullText, "EX", CACHE_TTL);
    }
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
