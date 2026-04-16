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
  hebrewSource?: string   // SRT_HE 원문 (히브리어 직접 번역 기준)
): Promise<{ ko: string; he: string; en: string }> {

  const hebrewSection = hebrewSource
    ? `\n히브리어 원문 (번역 기준 — 아래 히브리어에서 직접 번역할 것):\n${hebrewSource}\n`
    : "";

  const prompt = `
당신은 히브리어 성경 전문 번역가입니다.
다음 대본과 히브리어 원문을 바탕으로 ${ep.sceneCount}개 씬의 자막 텍스트를 JSON으로 생성해주세요.
${hebrewSection}
대본 (씬 구성 참고용):
${script}

⚠️ 번역 규칙 (반드시 준수):
[한국어 자막]
- 기존 한국어 성경(개역개정·개역한글·공동번역·새번역·현대인의성경 등)의 구절을 그대로 인용하지 마세요.
- 히브리어 원문의 어휘·어순·뉘앙스를 충실히 반영하여 AI가 직접 번역한 자연스러운 현대 한국어로 작성하세요.
- 한 줄 30자 이내로 간결하게 작성하세요.

[영어 자막]
- KJV·NIV·ESV·NASB·NLT 등 기존 영어 성경 번역을 그대로 인용하지 마세요.
- 히브리어 원문에서 AI가 직접 번역한 자연스럽고 현대적인 영어로 작성하세요.
- 한 줄 40자 이내로 간결하게 작성하세요.

[히브리어 자막]
- 마소라 텍스트 원문 그대로 사용하세요 (니쿠드 포함).

반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "ko": ["씬1 한국어 자막", "씬2 한국어 자막"],
  "he": ["씬1 히브리어 자막", "씬2 히브리어 자막"],
  "en": ["Scene 1 English subtitle", "Scene 2 English subtitle"]
}
`;

  const raw = await generateOnce(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("SRT 생성 실패: JSON 파싱 불가");

  const parsed = JSON.parse(jsonMatch[0]) as { ko: string[]; he: string[]; en: string[] };
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
