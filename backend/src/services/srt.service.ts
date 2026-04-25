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
): Promise<{ ko: string; he: string; vi: string }> {

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

[한국어 자막 - 반드시 지켜야 할 형식]
⚠️ 각 씬은 반드시 다음과 같이 2줄로 구성:
  1줄: 한국어 번역 문장
  2줄: [히브리어단어1(한글뜻1) · 히브리어단어2(한글뜻2) · 히브리어단어3(한글뜻3)]

규칙:
- 위 히브리어 원문 각 절에 정확히 대응하는 씬별 자막 작성
- 자연스러운 현대 한국어로 번역 (기존 성경 인용 금지)
- 각 씬마다 반드시 히브리어 핵심 단어 2-3개를 한글 발음과 뜻으로 표기
- 줄바꿈 문자(\\n)를 사용하여 번역과 단어 설명을 구분

올바른 예시:
"태초에 하나님이 천지를 창조하시니라\\n[베레시트(태초) · 엘로힘(하나님) · 바라(창조하다)]"

잘못된 예시 (단어 설명이 없음):
"태초에 하나님이 천지를 창조하시니라"

[베트남어 자막]
- 위에 제공된 히브리어 원문에서 직접 번역한 자연스럽고 현대적인 베트남어로 작성하세요.
- 글자 수 제한 없이 각 씬에 해당하는 내용 전체를 완전한 베트남어 문장으로 번역하세요.
- 모든 씬마다 서로 다른 고유한 문장을 작성하세요 (동일 단어·구문 반복 금지).
- 기존 베트남어 성경을 그대로 인용하지 마세요.
- 하나님을 지칭할 때는 반드시 "엘로힘(Elohim)"을 사용하세요 (Đức Chúa Trời 대신).

[히브리어 자막]
- 위에 제공된 히브리어 원문을 씬별로 분배하여 그대로 사용하세요 (니쿠드 포함).
- 각 씬의 히브리어 텍스트는 반드시 한 줄로 작성하세요 (줄바꿈 없이).

⚠️ 반드시 다음 JSON 형식으로만 응답 (한국어는 각 요소가 2줄):
{
  "ko": [
    "태초에 하나님이 천지를 창조하시니라\\n[베레시트(태초) · 엘로힘(하나님) · 바라(창조하다)]",
    "땅은 형태가 없고 비어있었으며\\n[토후(혼돈) · 보후(공허) · 호셰크(어둠)]"
  ],
  "he": ["בְּרֵאשִׁית בָּרָא אֱלֹהִים", "וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ"],
  "vi": ["Ban đầu 엘로힘(Elohim) sáng tạo", "Và trái đất không có hình dạng và trống rỗng"]
}

⚠️ 한국어(ko) 배열의 각 요소는 반드시 \\n을 포함해야 합니다!
`;

  let parsed: { ko: string[]; he: string[]; vi: string[] } | null = null;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const raw = await generateOnce(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (attempt === MAX_RETRIES) throw new Error("SRT 생성 실패: JSON 파싱 불가");
      console.warn(`[SRT] JSON 파싱 실패 (시도 ${attempt}/${MAX_RETRIES}), 재시도...`);
      continue;
    }

    const candidate = JSON.parse(jsonMatch[0]) as { ko: string[]; he: string[]; vi: string[] };

    // 베트남어 자막 품질 검증: 씬 수 일치 + 평균 길이 >= 5자 + 중복 과다 여부 (글자 수 제한 없는 완전 번역이므로 긴 텍스트 허용)
    const viArr = (candidate.vi ?? []).slice(0, ep.sceneCount);
    const avgViLen = viArr.length > 0
      ? viArr.reduce((sum, s) => sum + (s?.length ?? 0), 0) / viArr.length
      : 0;
    const uniqueVi = new Set(viArr.map((s) => s?.trim().toLowerCase())).size;
    const viRatio = viArr.length > 0 ? uniqueVi / viArr.length : 0;

    const viOk = viArr.length >= Math.min(ep.sceneCount, 1) && avgViLen >= 5 && (viArr.length <= 1 || viRatio > 0.5);

    if (!viOk && attempt < MAX_RETRIES) {
      console.warn(`[SRT] 베트남어 자막 품질 불량 (시도 ${attempt}/${MAX_RETRIES}): 씬수=${viArr.length}, 평균길이=${avgViLen.toFixed(1)}, 고유비율=${viRatio.toFixed(2)} — 재시도...`);
      continue;
    }

    parsed = candidate;
    break;
  }

  if (!parsed) throw new Error("SRT 생성 실패: 베트남어 자막 품질 검증 실패");

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
  const viLines = (parsed.vi ?? []).slice(0, ep.sceneCount);
  // 히브리어 텍스트는 한 줄로 처리 (줄바꿈 제거)
  const heLines = parsed.he.slice(0, ep.sceneCount).map((t) => t ? t.replace(/[\r\n]+/g, ' ').trim() : t);

  return {
    ko: makeSrt(koLines),
    he: addUtf8Bom(makeSrt(heLines, true)),
    vi: makeSrt(viLines.length > 0 ? viLines : koLines.map(() => "")),
  };
}
