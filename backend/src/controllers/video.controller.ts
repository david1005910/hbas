import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import { startVideoGeneration as veoStart, pollVideoStatus, downloadVideoFromGcs } from "../services/veo.service";
import { mergeVideoClips } from "../services/ffmpeg.service";
import { getFinalEpisodePath, saveVideo } from "../utils/imageStorage";
import { prisma } from "../config/database";

export async function startVideoGeneration(req: Request, res: Response, next: NextFunction) {
  try {
    // Veo 비용 승인 게이트
    if (req.body.confirmed !== true) {
      return res.status(402).json({ error: "Veo generation requires explicit confirmation" });
    }

    const keyframe = await prisma.sceneKeyframe.findUnique({
      where: { id: req.params.id },
    });
    if (!keyframe) return res.status(404).json({ error: "Keyframe not found" });
    if (!keyframe.imageUrl) return res.status(400).json({ error: "Keyframe image not available" });

    const { motionPrompt, durationSec = 5 } = req.body;
    const imageBuffer = fs.readFileSync(`/app${keyframe.imageUrl}`);

    console.log(`[Veo] start, episodeId=${keyframe.episodeId}, scene=${keyframe.sceneNumber}, model=${process.env.VEO_MODEL}`);
    const veoJobId = await veoStart(imageBuffer, motionPrompt || "Slow cinematic pan, gentle ambient motion", durationSec);

    const clip = await prisma.sceneVideoClip.create({
      data: {
        keyframeId: keyframe.id,
        episodeId: keyframe.episodeId,
        sceneNumber: keyframe.sceneNumber,
        veoJobId,
        status: "PROCESSING",
        durationSec,
      },
    });

    res.status(202).json(clip);
  } catch (err) { next(err); }
}

export async function getVideoStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const clip = await prisma.sceneVideoClip.findUnique({ where: { id: req.params.id } });
    if (!clip) return res.status(404).json({ error: "Not found" });

    if (clip.status === "COMPLETED" || clip.status === "FAILED") {
      return res.json(clip);
    }

    if (!clip.veoJobId) return res.json(clip);

    const result = await pollVideoStatus(clip.veoJobId);

    if (result.status === "completed") {
      let filePath: string;
      if (result.videoBase64) {
        // inline base64 응답 (Veo 2.0)
        filePath = saveVideo(clip.episodeId, clip.sceneNumber, Buffer.from(result.videoBase64, "base64"));
      } else if (result.videoGcsUri) {
        // GCS URI 응답 (Veo 3+)
        filePath = await downloadVideoFromGcs(result.videoGcsUri, clip.episodeId, clip.sceneNumber);
      } else {
        console.warn(`[Veo] completed but no video data`);
        return res.json(clip);
      }
      const updated = await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: { status: "COMPLETED", clipUrl: filePath.replace("/app", "") },
      });
      return res.json(updated);
    }

    if (result.status === "failed") {
      const updated = await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: { status: "FAILED" },
      });
      return res.json(updated);
    }

    res.json(clip);
  } catch (err) { next(err); }
}

export async function listVideoClips(req: Request, res: Response, next: NextFunction) {
  try {
    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id },
      orderBy: { sceneNumber: "asc" },
    });
    res.json(clips);
  } catch (err) { next(err); }
}

export async function mergeClips(req: Request, res: Response, next: NextFunction) {
  try {
    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });

    if (clips.length === 0) return res.status(400).json({ error: "완료된 클립이 없습니다" });

    const clipPaths = clips.map((c) => `/app${c.clipUrl}`);
    const outputPath = getFinalEpisodePath(req.params.id);

    await mergeVideoClips(clipPaths, outputPath);

    await prisma.episode.update({
      where: { id: req.params.id },
      data: { status: "COMPLETE" },
    });

    res.json({ message: "클립 병합 완료", outputPath: outputPath.replace("/app", "") });
  } catch (err) { next(err); }
}
