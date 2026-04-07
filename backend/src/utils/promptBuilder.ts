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

다음 형식으로 한국어+히브리어 이중 언어 에피소드 대본을 생성해주세요:

【에피소드 제목】
- 한국어:
- 히브리어:

【등장인물】

【씬별 구성】
씬 1:
  장면설명(KO):
  나레이션(KO):
  나레이션(HE):
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

export function buildSrtPrompt(ep: EpisodeCtx, script: string): string {
  return `
다음 대본을 바탕으로 ${ep.sceneCount}개 씬에 맞는 자막 텍스트를 생성해주세요.
총 영상 길이는 약 ${Math.floor((ep as any).targetDuration / 60)}분입니다.

대본:
${script}

출력 형식 (JSON):
{
  "ko": ["씬1 한국어 자막", "씬2 한국어 자막", ...],
  "he": ["씬1 히브리어 자막", "씬2 히브리어 자막", ...],
  "en": ["Scene 1 English subtitle", "Scene 2 English subtitle", ...]
}

히브리어는 반드시 히브리 문자로 작성하세요.
`;
}

export function buildYtMetaPrompt(ep: EpisodeCtx): string {
  return `
다음 에피소드에 대한 유튜브 메타데이터를 3개 언어(한국어·히브리어·영어)로 생성해주세요.

에피소드: ${ep.titleKo} (${ep.bibleBook.nameKo} ${ep.verseRange || ""})

출력 형식 (JSON):
{
  "ko": { "title": "", "description": "", "hashtags": [], "tags": [] },
  "he": { "title": "", "description": "", "hashtags": [], "tags": [] },
  "en": { "title": "", "description": "", "hashtags": [], "tags": [] }
}

각 언어별 SEO 최적화 키워드를 포함하세요.
`;
}

const STYLE_MAP: Record<string, string> = {
  "Epic 3D Cinematic":
    "photorealistic 3D render, cinematic VFX quality, IMAX wide shot, dramatic directional lighting, ancient Levant setting, golden hour atmosphere",
  "Pixar 3D Animation":
    "Pixar-style 3D animation, vibrant expressive character design, warm inviting color palette, subsurface scattering skin shader, soft global illumination, family-friendly cinematic composition, high detail Studio Pixar quality render",
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
