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
  script: string
): Promise<{ ko: string; he: string }> {
  const prompt = `
다음 대본을 바탕으로 ${ep.sceneCount}개 씬의 자막 텍스트를 JSON으로 생성해주세요.
자막은 한국어와 히브리어 2종만 생성합니다.

대본:
${script}

반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "ko": ["씬1 한국어 자막", "씬2 한국어 자막"],
  "he": ["씬1 히브리어 자막", "씬2 히브리어 자막"]
}
`;

  const raw = await generateOnce(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("SRT 생성 실패: JSON 파싱 불가");

  const parsed = JSON.parse(jsonMatch[0]) as { ko: string[]; he: string[] };
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
  return {
    ko: makeSrt(koLines),
    he: addUtf8Bom(makeSrt(parsed.he.slice(0, ep.sceneCount), true)),
  };
}
