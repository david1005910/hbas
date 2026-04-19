import { generateOnce } from "./gemini.service";
import { buildSrtContent, distributeTiming } from "../utils/srtFormatter";
import { addUtf8Bom } from "../utils/hebrewUtils";
import { applyWordReplacements } from "./wordReplacement.service";

interface EpisodeCtx {
  sceneCount: number;
  targetDuration: number;
}

export async function generateSrtPack(
  ep: EpisodeCtx,
  script: string,
  hebrewSource?: string,   // 히브리어 원문 (번역 기준)
  koHints?: string[]       // BibleVerse DB 한국어 번역 (정확도 향상 힌트)
): Promise<{ ko: string; he: string; en: string }> {

  const hebrewSection = hebrewSource
    ? `\n히브리어 원문 (번역 기준 — 각 절 번호와 함께 제공, 반드시 이 원문에서 직접 번역할 것):\n${hebrewSource}\n`
    : "";

  const koHintSection = koHints && koHints.length > 0
    ? `\n참고 번역 (각 절의 한국어 번역 — 의미 파악 참고용, 그대로 인용 금지):\n${koHints.map((t, i) => `${i + 1}절: ${t}`).join("\n")}\n`
    : "";

  // 씬수=1이면 전체 패시지 완전 번역, 씬수>1이면 씬별 완전 번역
  const singleScene = ep.sceneCount === 1;
  const sceneInstruction = singleScene
    ? `히브리어 원문 전체(모든 절)를 하나의 완전한 번역으로 작성하세요.`
    : `히브리어 원문을 ${ep.sceneCount}개 씬으로 균등하게 나누어 각 씬의 절 내용 전체를 완전하게 번역하세요.`;

  const prompt = `
당신은 히브리어 성경 전문 번역가입니다.
다음 히브리어 원문을 바탕으로 ${ep.sceneCount}개 씬의 자막 텍스트를 JSON으로 생성해주세요.
${hebrewSection}${koHintSection}
대본 (씬 구성 참고용):
${script}

⚠️ 번역 규칙 (반드시 준수):
${sceneInstruction}

[한국어 자막]
- 위에 제공된 히브리어 원문 각 절에 정확히 대응하는 씬별 자막을 작성하세요.
- 히브리어의 핵심 어휘와 뉘앙스를 충실히 반영한 자연스러운 현대 한국어로 작성하세요.
- 참고 번역이 있으면 의미 파악에만 활용하고, 직접 인용하지 마세요.
- 기존 한국어 성경(개역개정·개역한글 등)을 그대로 인용하지 마세요.
- 글자 수 제한 없이 각 씬에 해당하는 내용 전체를 완전하게 번역하세요.
- 모든 씬의 내용이 서로 다르고 고유해야 합니다.

[영어 자막]
- 위에 제공된 히브리어 원문에서 직접 번역한 자연스럽고 현대적인 영어로 작성하세요.
- 글자 수 제한 없이 각 씬에 해당하는 내용 전체를 완전한 영어 문장으로 번역하세요.
- 모든 씬마다 서로 다른 고유한 문장을 작성하세요 (동일 단어·구문 반복 금지).
- KJV·NIV 등 기존 영어 성경을 그대로 인용하지 마세요.

[히브리어 자막]
- 위에 제공된 히브리어 원문을 씬별로 분배하여 그대로 사용하세요 (니쿠드 포함).

반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "ko": ["씬1 한국어 자막", "씬2 한국어 자막"],
  "he": ["씬1 히브리어 자막", "씬2 히브리어 자막"],
  "en": ["Scene 1 English subtitle", "Scene 2 English subtitle"]
}
`;

  let parsed: { ko: string[]; he: string[]; en: string[] } | null = null;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const raw = await generateOnce(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (attempt === MAX_RETRIES) throw new Error("SRT 생성 실패: JSON 파싱 불가");
      console.warn(`[SRT] JSON 파싱 실패 (시도 ${attempt}/${MAX_RETRIES}), 재시도...`);
      continue;
    }

    const candidate = JSON.parse(jsonMatch[0]) as { ko: string[]; he: string[]; en: string[] };

    // 영어 자막 품질 검증: 씬 수 일치 + 평균 길이 >= 5자 + 중복 과다 여부 (글자 수 제한 없는 완전 번역이므로 긴 텍스트 허용)
    const enArr = (candidate.en ?? []).slice(0, ep.sceneCount);
    const avgEnLen = enArr.length > 0
      ? enArr.reduce((sum, s) => sum + (s?.length ?? 0), 0) / enArr.length
      : 0;
    const uniqueEn = new Set(enArr.map((s) => s?.trim().toLowerCase())).size;
    const enRatio = enArr.length > 0 ? uniqueEn / enArr.length : 0;

    const enOk = enArr.length >= Math.min(ep.sceneCount, 1) && avgEnLen >= 5 && (enArr.length <= 1 || enRatio > 0.5);

    if (!enOk && attempt < MAX_RETRIES) {
      console.warn(`[SRT] 영어 자막 품질 불량 (시도 ${attempt}/${MAX_RETRIES}): 씬수=${enArr.length}, 평균길이=${avgEnLen.toFixed(1)}, 고유비율=${enRatio.toFixed(2)} — 재시도...`);
      continue;
    }

    parsed = candidate;
    break;
  }

  if (!parsed) throw new Error("SRT 생성 실패: 영어 자막 품질 검증 실패");

  const timings = distributeTiming(ep.sceneCount, ep.targetDuration);

  const makeSrt = (lines: string[], isHebrew = false) =>
    buildSrtContent(
      lines.map((text, i) => ({
        index: i + 1,
        startSec: timings[i]?.startSec ?? i * 10,
        endSec: timings[i]?.endSec ?? (i + 1) * 10,
        text,
      })),
      isHebrew
    );

  const koLines = parsed.ko.slice(0, ep.sceneCount).map((t) => applyWordReplacements(t));
  const enLines = (parsed.en ?? []).slice(0, ep.sceneCount);

  return {
    ko: makeSrt(koLines),
    he: addUtf8Bom(makeSrt(parsed.he.slice(0, ep.sceneCount), true)),
    en: makeSrt(enLines.length > 0 ? enLines : koLines.map(() => "")),
  };
}
