import { generateKeyframe } from "./nanoBanana.service";
import { saveKeyframe, getKeyframeWebPath } from "../utils/imageStorage";
import { prisma } from "../config/database";

interface ThumbnailOptions {
  aspectRatio?: "16:9" | "9:16";
  style?: "cinematic" | "modern" | "classic";
  textSize?: "large" | "medium" | "small";
  colorScheme?: "vibrant" | "dark" | "light";
}

export async function generateThumbnail(
  episodeTitle: string,
  bookName: string,
  verseRange: string,
  shortText: string,
  episodeId: string,
  options: ThumbnailOptions = {},
  characterImages?: string[]
): Promise<{ imageBuffer: Buffer; savedPath: string; webPath: string }> {
  const {
    aspectRatio = "16:9",
    style = "cinematic",
    textSize = "large",
    colorScheme = "vibrant"
  } = options;

  // 썸네일 전용 프롬프트 생성
  const thumbnailPrompt = buildThumbnailPrompt(
    episodeTitle,
    bookName,
    verseRange,
    shortText,
    style,
    textSize,
    colorScheme
  );

  console.log(`[Thumbnail] 썸네일 생성 시작: ${episodeTitle} (${aspectRatio})`);

  // Nano Banana로 썸네일 생성
  const imageBuffer = await generateKeyframe(
    thumbnailPrompt,
    aspectRatio,
    episodeId,
    999, // 썸네일용 특별한 씬 번호
    characterImages
  );

  // 썸네일 저장 (특별한 파일명 패턴 사용)
  const savedPath = saveThumbnail(episodeId, imageBuffer);
  const webPath = getKeyframeWebPath(savedPath);

  // 데이터베이스에 썸네일 키프레임 저장
  await prisma.sceneKeyframe.create({
    data: {
      episodeId,
      sceneNumber: 999, // 썸네일용 특별 씬 번호
      promptUsed: `${shortText} - ${style} style, ${colorScheme} colors`,
      imageUrl: webPath,
      resolution: aspectRatio === "16:9" ? "1280x720" : "720x1280",
      isSelected: false,
      nbModel: "gemini-2.0-flash-image"
    }
  });

  console.log(`[Thumbnail] 썸네일 생성 완료: ${webPath}`);

  return {
    imageBuffer,
    savedPath,
    webPath
  };
}

function buildThumbnailPrompt(
  episodeTitle: string,
  bookName: string,
  verseRange: string,
  shortText: string,
  style: string,
  textSize: string,
  colorScheme: string
): string {
  const stylePrompts = {
    cinematic: "epic cinematic biblical scene, dramatic lighting, film quality",
    modern: "modern clean design, contemporary style, professional layout",
    classic: "traditional biblical art style, renaissance painting influence"
  };

  const colorPrompts = {
    vibrant: "vibrant colors, high contrast, eye-catching",
    dark: "dark moody atmosphere, dramatic shadows, golden highlights",
    light: "bright warm lighting, heavenly atmosphere, soft colors"
  };

  const textSizePrompts = {
    large: "large bold text, easily readable on mobile",
    medium: "medium sized text, balanced composition",
    small: "subtle text overlay, image-focused design"
  };

  return `Create a professional YouTube thumbnail for a biblical animation:

CONTENT:
- Title: "${episodeTitle}"
- Book: ${bookName} ${verseRange}
- Main text overlay: "${shortText}"

TECHNICAL REQUIREMENTS:
- 16:9 aspect ratio (YouTube standard)
- 1280x720 minimum resolution
- Mobile-optimized readability
- High contrast for text visibility

DESIGN STYLE:
- ${stylePrompts[style as keyof typeof stylePrompts]}
- ${colorPrompts[colorScheme as keyof typeof colorPrompts]}
- ${textSizePrompts[textSize as keyof typeof textSizePrompts]}

TEXT REQUIREMENTS:
- Bold, readable font
- Text: "${shortText}" should be prominent
- Korean/Hebrew bilingual if needed: "${episodeTitle}"
- Position text using rule of thirds
- Ensure text stands out against background

COMPOSITION:
- Biblical/religious theme appropriate
- Professional YouTube thumbnail style
- Clear focal point
- Emotional impact for high click-through rate
- Safe area: keep important elements in center 90%

QUALITY:
- Sharp, high-quality image
- Professional production value
- Suitable for Hebrew Bible animation channel`;
}

function saveThumbnail(episodeId: string, buffer: Buffer): string {
  // 썸네일용 특별한 저장 함수 (씬 번호 999 사용)
  return saveKeyframe(episodeId, 999, buffer);
}

// 다중 썸네일 변형 생성 (A/B 테스트용)
export async function generateThumbnailVariants(
  episodeTitle: string,
  bookName: string,
  verseRange: string,
  shortText: string,
  episodeId: string,
  characterImages?: string[]
): Promise<Array<{ imageBuffer: Buffer; savedPath: string; webPath: string; variant: string }>> {
  const variants = [
    { style: "cinematic", colorScheme: "vibrant", variant: "Cinematic Vibrant" },
    { style: "cinematic", colorScheme: "dark", variant: "Cinematic Dark" },
    { style: "modern", colorScheme: "light", variant: "Modern Light" }
  ];

  const results = [];

  for (const variantOptions of variants) {
    try {
      const result = await generateThumbnail(
        episodeTitle,
        bookName,
        verseRange,
        shortText,
        episodeId,
        variantOptions as ThumbnailOptions,
        characterImages
      );

      results.push({
        ...result,
        variant: variantOptions.variant
      });

      // 각 변형 생성 사이에 짧은 지연
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[Thumbnail] 변형 생성 실패 (${variantOptions.variant}):`, error);
    }
  }

  return results;
}