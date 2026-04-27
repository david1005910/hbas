import { Request, Response, NextFunction } from "express";
import { generateThumbnail, generateThumbnailVariants } from "../services/thumbnail.service";
import { prisma } from "../config/database";
// 캐릭터 이미지 조회 함수
async function getCharacterImages(episodeId: string) {
  const characterImages = await prisma.characterImage.findMany({
    where: { episodeId },
    orderBy: { orderIndex: "asc" }
  });
  return { images: characterImages };
}

// 에피소드 조회 헬퍼 함수
async function getEpisodeOrFail(episodeId: string, res: Response) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { bibleBook: true }
  });
  
  if (!episode) {
    res.status(404).json({ error: "에피소드를 찾을 수 없습니다" });
    return null;
  }
  
  return episode;
}

export async function generateSingleThumbnail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: episodeId } = req.params;
    const { shortText, style, colorScheme, textSize, referenceImages } = req.body;

    const episode = await getEpisodeOrFail(episodeId, res);
    if (!episode) return;

    if (!shortText || shortText.trim().length === 0) {
      return res.status(400).json({ error: "썸네일 텍스트가 필요합니다" });
    }

    // 캐릭터 이미지 조회
    let characterImages: string[] = [];
    try {
      const characterImagesData = await getCharacterImages(episodeId);
      characterImages = characterImagesData.images.map(img => 
        // 파일에서 base64로 변환하는 로직이 필요할 수 있음
        // 현재는 빈 배열로 처리
        ""
      ).filter(Boolean);
    } catch (error) {
      console.warn(`[Thumbnail] 캐릭터 이미지 조회 실패:`, error);
    }

    // 참조 이미지 우선 사용, 없으면 캐릭터 이미지 사용
    const finalReferenceImages = referenceImages && referenceImages.length > 0 
      ? referenceImages 
      : (characterImages.length > 0 ? characterImages : undefined);

    const result = await generateThumbnail(
      episode.titleKo,
      episode.bibleBook.nameKo,
      episode.verseRange || "",
      shortText,
      episodeId,
      { style, colorScheme, textSize },
      finalReferenceImages
    );

    res.json({
      message: "썸네일 생성 완료",
      thumbnail: {
        webPath: result.webPath,
        episodeId,
        shortText,
        style: style || "cinematic",
        colorScheme: colorScheme || "vibrant"
      }
    });

  } catch (error) {
    console.error("[Thumbnail] 단일 썸네일 생성 오류:", error);
    next(error);
  }
}

export async function generateMultipleThumbnails(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: episodeId } = req.params;
    const { shortText, referenceImages } = req.body;

    const episode = await getEpisodeOrFail(episodeId, res);
    if (!episode) return;

    if (!shortText || shortText.trim().length === 0) {
      return res.status(400).json({ error: "썸네일 텍스트가 필요합니다" });
    }

    // 캐릭터 이미지 조회
    let characterImages: string[] = [];
    try {
      const characterImagesData = await getCharacterImages(episodeId);
      characterImages = characterImagesData.images.map(img => "").filter(Boolean);
    } catch (error) {
      console.warn(`[Thumbnail] 캐릭터 이미지 조회 실패:`, error);
    }

    // 참조 이미지 우선 사용, 없으면 캐릭터 이미지 사용
    const finalReferenceImages = referenceImages && referenceImages.length > 0 
      ? referenceImages 
      : (characterImages.length > 0 ? characterImages : undefined);

    const variants = await generateThumbnailVariants(
      episode.titleKo,
      episode.bibleBook.nameKo,
      episode.verseRange || "",
      shortText,
      episodeId,
      finalReferenceImages
    );

    const thumbnails = variants.map(variant => ({
      webPath: variant.webPath,
      variant: variant.variant,
      episodeId,
      shortText
    }));

    res.json({
      message: `썸네일 ${thumbnails.length}개 변형 생성 완료`,
      thumbnails
    });

  } catch (error) {
    console.error("[Thumbnail] 다중 썸네일 생성 오류:", error);
    next(error);
  }
}

export async function getThumbnails(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: episodeId } = req.params;
    
    const episode = await getEpisodeOrFail(episodeId, res);
    if (!episode) return;

    // 썸네일 키프레임들 조회 (씬 번호 999인 것들)
    const thumbnailKeyframes = await prisma.sceneKeyframe.findMany({
      where: { 
        episodeId,
        sceneNumber: 999 // 썸네일용 특별 씬 번호
      },
      orderBy: { createdAt: "desc" }
    });

    const thumbnails = thumbnailKeyframes.map(kf => ({
      id: kf.id,
      webPath: kf.imageUrl,
      createdAt: kf.createdAt,
      isSelected: kf.isSelected
    }));

    res.json({ thumbnails });

  } catch (error) {
    console.error("[Thumbnail] 썸네일 조회 오류:", error);
    next(error);
  }
}