import { Request, Response, NextFunction } from "express";
import { generateKeyframe } from "../services/nanoBanana.service";
import { saveKeyframe, getKeyframeWebPath } from "../utils/imageStorage";
import { buildNanoBananaPrompt, parseAnimPromptByScene } from "../utils/promptBuilder";
import { prisma } from "../config/database";

function sseWrite(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function generateEpisodeKeyframes(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: { bibleBook: true },
    });
    if (!episode) return res.status(404).json({ error: "Not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // ANIM_PROMPT에서 씬별 이미지/모션 프롬프트 파싱 (있으면 사용, 없으면 fallback)
    const animPromptRecord = await prisma.generatedContent.findFirst({
      where: { episodeId: episode.id, contentType: "ANIM_PROMPT" },
      orderBy: { createdAt: "desc" },
    });
    const scenePrompts = animPromptRecord
      ? parseAnimPromptByScene(animPromptRecord.content)
      : new Map<number, { image: string; motion: string }>();

    if (scenePrompts.size > 0) {
      console.log(`[Keyframe] ANIM_PROMPT 파싱 완료: ${scenePrompts.size}개 씬 프롬프트 추출`);
    } else {
      console.warn(`[Keyframe] ANIM_PROMPT 없음 또는 파싱 실패 — fallback 프롬프트 사용`);
    }

    for (let i = 1; i <= episode.sceneCount; i++) {
      if (i > 1) await new Promise((r) => setTimeout(r, 3000));
      sseWrite(res, { scene: i, status: "generating" });
      try {
        // 씬별 이미지 프롬프트 우선 사용, 없으면 fallback
        const sceneImagePrompt = scenePrompts.get(i)?.image;
        const prompt = sceneImagePrompt
          ? buildNanoBananaPrompt(sceneImagePrompt, episode.animStyle || "Epic 3D Cinematic")
          : buildNanoBananaPrompt(
              `Scene ${i} from ${episode.bibleBook.nameEn}: ${episode.titleKo}`,
              episode.animStyle || "Epic 3D Cinematic"
            );

        const promptSource = sceneImagePrompt ? "ANIM_PROMPT" : "fallback";
        console.log(`[Keyframe] 씬 ${i} 생성 (${promptSource}), episodeId=${episode.id}`);

        const imageBuffer = await generateKeyframe(prompt, "16:9", episode.id, i);
        const filePath = saveKeyframe(episode.id, i, imageBuffer);

        await prisma.sceneKeyframe.create({
          data: {
            episodeId: episode.id,
            sceneNumber: i,
            promptUsed: prompt,
            imageUrl: getKeyframeWebPath(filePath),
            nbModel: process.env.NANO_BANANA_MODEL || "gemini-2.5-flash-preview-04-17",
          },
        });

        sseWrite(res, { scene: i, status: "done", imageUrl: getKeyframeWebPath(filePath) });
      } catch (err: any) {
        sseWrite(res, { scene: i, status: "error", error: err.message });
      }
    }

    sseWrite(res, { allDone: true });
    res.end();
  } catch (err: any) {
    if (!res.headersSent) next(err);
    else { sseWrite(res, { error: err.message }); res.end(); }
  }
}

export async function generateSingleKeyframe(req: Request, res: Response, next: NextFunction) {
  try {
    const { episodeId, sceneNo } = req.params as { episodeId?: string; sceneNo: string };
    const { prompt, animStyle, episodeId: bodyEpisodeId } = req.body;

    const eId = episodeId || bodyEpisodeId;
    const sceneNumber = parseInt(sceneNo);
    const finalPrompt = prompt || `Scene ${sceneNumber}`;
    const style = animStyle || "Epic 3D Cinematic";

    const nanaBananaPrompt = buildNanoBananaPrompt(finalPrompt, style);
    console.log(`[Keyframe] Regenerating scene ${sceneNumber}, episodeId=${eId}, model=${process.env.NANO_BANANA_MODEL}`);
    const imageBuffer = await generateKeyframe(nanaBananaPrompt, "16:9", eId, sceneNumber);
    const filePath = saveKeyframe(eId, sceneNumber, imageBuffer);

    const keyframe = await prisma.sceneKeyframe.create({
      data: {
        episodeId: eId,
        sceneNumber,
        promptUsed: nanaBananaPrompt,
        imageUrl: getKeyframeWebPath(filePath),
        nbModel: process.env.NANO_BANANA_MODEL || "gemini-2.5-flash-preview-04-17",
      },
    });

    res.status(201).json(keyframe);
  } catch (err) { next(err); }
}

export async function selectKeyframe(req: Request, res: Response, next: NextFunction) {
  try {
    const keyframe = await prisma.sceneKeyframe.update({
      where: { id: req.params.id },
      data: { isSelected: true },
    });
    res.json(keyframe);
  } catch (err) { next(err); }
}

export async function listKeyframes(req: Request, res: Response, next: NextFunction) {
  try {
    const keyframes = await prisma.sceneKeyframe.findMany({
      where: { episodeId: req.params.id },
      orderBy: { sceneNumber: "asc" },
    });
    res.json(keyframes);
  } catch (err) { next(err); }
}
