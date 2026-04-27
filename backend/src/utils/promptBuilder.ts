interface EpisodeCtx {
  titleKo: string;
  verseRange: string | null;
  sceneCount: number;
  animStyle: string | null;
  bibleBook: { nameKo: string; nameHe: string; nameEn: string };
}

export function buildScriptPrompt(ep: EpisodeCtx): string {
  return `
성경 책: ${ep.bibleBook.nameKo} (${ep.bibleBook.nameHe} / ${ep.bibleBook.nameEn})
에피소드 제목: ${ep.titleKo}
참조 절: ${ep.verseRange || "자동 선택"}
씬 수: ${ep.sceneCount}개

⚠️ 번역 원칙 (반드시 준수):
- 한국어 나레이션: 기존 공인 성경(개역개정, 개역한글, 공동번역, 새번역 등)의 표현을 그대로 인용하지 마세요.
  히브리어 원문의 어휘·어순·뉘앙스를 살려 AI가 직접 창작한 자연스러운 현대 한국어로 작성하세요.
  문장 끝은 평서형으로 작성 ("하였다", "되었다" 등 - "하였네", "되었구나" 등 감탄형 사용 금지).
- 히브리어 나레이션: 해당 절의 핵심 내용을 현대 히브리어로 자유롭게 풀어 쓰세요.
  기존 마소라 텍스트를 그대로 복사·인용하지 말고, AI가 해당 내용을 히브리어로 재표현하세요.
- 베트남어 나레이션(VI): 기존 베트남어 성경 표현을 그대로 사용하지 마세요.
  히브리어 원문 의미를 AI가 직접 번역한 자연스럽고 시적인 현대 베트남어로 작성하세요.
  하나님을 지칭할 때는 반드시 "Elohim"을 사용하세요.
  문장 끝은 평서형으로 작성 (감탄형이나 감정 표현 자제).
- 모든 항목은 AI가 독자적으로 창작한 표현이어야 합니다.

다음 형식으로 에피소드 대본을 생성해주세요:

【에피소드 제목】
- 한국어:
- 히브리어:
- 베트남어:

【등장인물】

【씬별 구성】
씬 1:
  장면설명(KO):
  나레이션(KO):
  나레이션(HE):
  나레이션(VI):
  감정톤:

(씬 ${ep.sceneCount}까지 반복)

【핵심 메시지】
`;
}

export function buildAnimPromptRequest(ep: EpisodeCtx): string {
  return `
성경 책: ${ep.bibleBook.nameEn}
에피소드: ${ep.titleKo}
참조 절: ${ep.verseRange || "자동 선택"}
씬 수: ${ep.sceneCount}개
스타일: ${ep.animStyle || "Epic 3D Cinematic"}

각 씬에 대해 다음 두 가지 영문 프롬프트를 생성해주세요:

씬 N:
  [이미지 프롬프트]: (Nano Banana용 - 구도·조명·인물·배경·스타일 포함)
  [모션 프롬프트]: (Veo용 - 카메라 워크·모션·전환 효과 포함)

씬 ${ep.sceneCount}까지 반복. 모든 프롬프트는 영어로 작성하세요.
`;
}

export function buildSrtPrompt(ep: EpisodeCtx, script: string, hebrewSource?: string): string {
  const heSection = hebrewSource
    ? `\n히브리어 원문 (직접 번역 기준):\n${hebrewSource}\n`
    : "";
  return `
당신은 히브리어 성경 전문 번역가입니다.
다음 대본과 히브리어 원문을 바탕으로 ${ep.sceneCount}개 씬에 맞는 자막 텍스트를 생성해주세요.
${heSection}
대본 (씬 구성 참고용):
${script}

⚠️ 번역 규칙:
- 한국어: 개역개정·개역한글·공동번역 등 기존 성경 표현 인용 금지. AI가 직접 창작한 자연스러운 현대 한국어.
- 영어: KJV·NIV·ESV 등 기존 영어 성경 인용 금지. AI가 직접 창작한 자연스러운 현대 영어.
- 히브리어: 마소라 원문을 직접 복사하지 말고, 해당 절 내용을 현대 히브리어로 자유롭게 재표현하세요.
- 모든 항목은 AI가 독자적으로 창작한 표현이어야 합니다.

출력 형식 (JSON only):
{
  "ko": ["씬1 한국어 자막", "씬2 한국어 자막", ...],
  "he": ["씬1 히브리어 자막", "씬2 히브리어 자막", ...],
  "en": ["Scene 1 English subtitle", "Scene 2 English subtitle", ...]
}
`;
}

export function buildYtMetaPrompt(ep: EpisodeCtx): string {
  return `
다음 에피소드에 대한 유튜브 메타데이터를 3개 언어(한국어·히브리어·베트남어)로 생성해주세요.

에피소드: ${ep.titleKo} (${ep.bibleBook.nameKo} ${ep.verseRange || ""})

⚠️ 번역 규칙:
- 한국어: 문장 끝은 평서형으로 작성 ("하였다", "되었다" 등 - "하였네", "되었구나" 등 감탄형 사용 금지).
- 베트남어: 문장 끝은 평서형으로 작성 (감탄형이나 감정 표현 자제).

출력 형식 (JSON only):
{
  "ko": { "title": "", "description": "", "hashtags": [], "tags": [] },
  "he": { "title": "", "description": "", "hashtags": [], "tags": [] },
  "vi": { "title": "", "description": "", "hashtags": [], "tags": [] }
}

각 언어별 SEO 최적화 키워드를 포함하세요.
`;
}

const STYLE_MAP: Record<string, string> = {
  "Epic 3D Cinematic":
    "photorealistic 3D render, cinematic VFX quality, IMAX wide shot, dramatic directional lighting, ancient Levant setting, golden hour atmosphere",
  "Pixar 3D Animation":
    "Pixar-style 3D animation, vibrant expressive character design, warm inviting color palette, subsurface scattering skin shader, soft global illumination, family-friendly cinematic composition, high detail Studio Pixar quality render",
  "Disney Animation":
    "Classic Disney 3D animation style, enchanting fairy-tale aesthetic, expressive character animation, magical sparkles and glows, rich saturated colors, whimsical fantasy atmosphere, Disney Renaissance era quality, smooth fluid motion, musical theatrical composition",
  "Hand-painted Watercolor 3D":
    "3D animation with watercolor texture overlay, soft translucent brush strokes, warm earth tones, impressionistic biblical illustration style",
  "Ancient Fresco Style":
    "ancient Roman-era fresco painting, earthy mineral pigments, Byzantine flat perspective with 3D depth, antique cracked texture, ochre and sienna palette",
  "Dark Fantasy 3D":
    "dark atmospheric 3D render, volumetric god rays, mystical fog, high contrast chiaroscuro, deep shadows, dramatic supernatural atmosphere",
  "Soft Illuminated Manuscript":
    "medieval illuminated manuscript aesthetic, gold leaf accents, ornate decorative borders, warm candlelight illumination, jewel-tone colors",
};

export function buildNanoBananaPrompt(sceneDescription: string, style: string): string {
  const styleStr = STYLE_MAP[style] || STYLE_MAP["Epic 3D Cinematic"];
  return `${sceneDescription}. ${styleStr}. Ancient Israel, historically accurate clothing and architecture, no modern elements, no text, no watermarks, 16:9 composition.`;
}

const MOTION_MAP: Record<string, string> = {
  establishing: "Slow cinematic pan right, gentle wind motion in fabric and foliage, establishing wide shot",
  action: "Dynamic handheld camera movement, subject in purposeful motion, environmental elements reacting",
  emotional: "Subtle slow push-in zoom, still reverent camera, soft particle dust in light beams",
  transition: "Graceful dolly out, scene breathes and settles, natural ambient motion",
};

export function buildVeoMotionPrompt(sceneType: keyof typeof MOTION_MAP): string {
  return MOTION_MAP[sceneType] || MOTION_MAP.establishing;
}

/**
 * ANIM_PROMPT 텍스트에서 씬별 이미지/모션 프롬프트를 파싱
 *
 * 지원 형식:
 *   씬 N: / Scene N:
 *     [이미지 프롬프트]: ...
 *     [모션 프롬프트]: ...
 *   또는 **Scene N:** 형태 (마크다운 bold)
 *
 * 반환값: sceneNumber → { image, motion } 맵
 */
export function parseAnimPromptByScene(animPromptText: string): Map<number, { image: string; motion: string }> {
  const result = new Map<number, { image: string; motion: string }>();

  // 씬 블록 분리 — 씬 N: / Scene N: / **씬 N:** / **Scene N:**
  const sceneBlockRegex = /(?:\*{0,2})(?:씬|Scene)\s+(\d+)\s*[:\*]/gi;
  const parts = animPromptText.split(sceneBlockRegex);

  // split 결과: [pre, n1, block1, n2, block2, ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    const sceneNo = parseInt(parts[i], 10);
    const block = parts[i + 1] || "";

    // [이미지 프롬프트]: 다음 텍스트 추출
    const imageMatch = block.match(/\[이미지\s*프롬프트\][^\:]*:\s*(.+?)(?=\[모션|\[motion|\n\s*\n|\Z)/si);
    // [모션 프롬프트]: 다음 텍스트 추출
    const motionMatch = block.match(/\[모션\s*프롬프트\][^\:]*:\s*(.+?)(?=\[이미지|\[image|\n\s*\n|\Z)/si);

    const image = imageMatch ? imageMatch[1].trim().replace(/\s+/g, " ") : "";
    const motion = motionMatch ? motionMatch[1].trim().replace(/\s+/g, " ") : "";

    if (sceneNo > 0 && image) {
      result.set(sceneNo, { image, motion });
    }
  }

  return result;
}
