import { genAI } from "../config/gemini";
import { redis } from "../config/redis";
import * as crypto from "crypto";

// process.env 접근은 파일 상단에서만
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || "gemini-2.5-flash-image";
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || "86400", 10);
const RETRY_DELAYS_MS = [5000, 15000, 30000]; // 429 시 대기 시간

function promptHash(prompt: string): string {
  return "nb:" + crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function generateKeyframe(
  prompt: string,
  aspectRatio: "16:9" | "9:16" = "16:9",
  episodeId?: string,
  sceneNumber?: number
): Promise<Buffer> {
  const enhancedPrompt = `${prompt} Aspect ratio: ${
    aspectRatio === "16:9" ? "landscape widescreen 16:9" : "portrait vertical 9:16"
  }.`;

  // ── AI 비용 가드: Redis 캐시 확인 ─────────────────────────────
  const cacheKey = promptHash(enhancedPrompt);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[NanaBanana] 캐시 히트, episodeId=${episodeId ?? "-"}, scene=${sceneNumber ?? "-"}`);
      return Buffer.from(cached, "base64");
    }
  } catch {
    // Redis 미연결 시 무시하고 API 호출 진행
  }

  // ── AI 비용 로그 (모델 + episodeId + sceneNumber) ──────────────
  console.log(`[NanaBanana] 이미지 생성 시작, model=${NANO_BANANA_MODEL}, episodeId=${episodeId ?? "-"}, scene=${sceneNumber ?? "-"}`);

  const model = genAI.getGenerativeModel({ model: NANO_BANANA_MODEL });

  let lastError: Error = new Error("unknown");

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await (model as any).generateContent({
        contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      });

      const candidates = result.response?.candidates ?? [];
      if (!candidates.length) {
        const reason = result.response?.promptFeedback?.blockReason ?? "unknown";
        throw new Error(`이미지 생성 차단됨 (blockReason=${reason})`);
      }

      const parts = candidates[0]?.content?.parts ?? [];
      const inlinePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

      if (inlinePart?.inlineData?.data) {
        const imageBuffer = Buffer.from(inlinePart.inlineData.data, "base64");
        console.log(`[NanaBanana] ✅ 이미지 생성 완료, model=${NANO_BANANA_MODEL}, scene=${sceneNumber ?? "-"}, size=${imageBuffer.length}bytes`);

        // 캐시 저장 (24h)
        try {
          await redis.set(cacheKey, imageBuffer.toString("base64"), "EX", CACHE_TTL);
        } catch {
          // 캐시 저장 실패는 무시
        }

        return imageBuffer;
      }

      const textPart = parts.find((p: any) => p.text);
      throw new Error(
        `이미지 데이터 없음. 응답: ${textPart?.text?.slice(0, 200) ?? "없음"}`
      );
    } catch (err: any) {
      lastError = err;
      const is429 =
        err?.status === 429 ||
        (err?.message ?? "").includes("429") ||
        (err?.message ?? "").includes("Too Many Requests") ||
        (err?.message ?? "").includes("quota");

      if (is429 && attempt < RETRY_DELAYS_MS.length) {
        const retryMatch = (err?.message ?? "").match(/retryDelay["\s:]+(\d+)/);
        const waitMs = retryMatch
          ? parseInt(retryMatch[1]) * 1000 + 1000
          : RETRY_DELAYS_MS[attempt];

        console.warn(
          `[NanaBanana] ⚠️ 429 rate limit — ${waitMs / 1000}초 후 재시도 (${attempt + 1}/${RETRY_DELAYS_MS.length})`
        );
        await sleep(waitMs);
        continue;
      }

      if (is429 && (err?.message ?? "").includes("limit: 0")) {
        throw new Error(
          "이미지 생성 쿼터 초과: gemini-2.5-flash-image는 유료 플랜이 필요합니다. " +
          "Google AI Studio → 결제 활성화 후 다시 시도해주세요."
        );
      }

      throw err;
    }
  }

  throw lastError;
}
