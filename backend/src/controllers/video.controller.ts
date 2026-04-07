import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import { startVideoGeneration as veoStart, pollVideoStatus, downloadVideoFromGcs } from "../services/veo.service";
import {
  mergeVideoClips,
  mergeVideoWithNarration,
  embedSubtitleToClip,
  addNarrationSegmentToClip,
  getMediaDuration,
  mixWithBackgroundMusic,
} from "../services/ffmpeg.service";
import { getFinalEpisodePath, saveVideo } from "../utils/imageStorage";
import { buildSceneSrt } from "../utils/srtParser";
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

    const { motionPrompt, durationSec = 8 } = req.body;
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
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: "Not found" });

    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });

    if (clips.length === 0) return res.status(400).json({ error: "완료된 클립이 없습니다" });

    // narrClipUrl > subClipUrl > clipUrl 순서로 최선 클립 선택
    const clipPaths = clips.map((c) => {
      if (c.narrClipUrl && fs.existsSync(`/app${c.narrClipUrl}`)) return `/app${c.narrClipUrl}`;
      if (c.subClipUrl && fs.existsSync(`/app${c.subClipUrl}`)) return `/app${c.subClipUrl}`;
      return `/app${c.clipUrl}`;
    });

    const finalPath = getFinalEpisodePath(req.params.id);
    const narrationLocalPath = episode.narrationUrl ? `/app${episode.narrationUrl}` : null;
    const hasNarration = narrationLocalPath && fs.existsSync(narrationLocalPath);

    // 씬별 나레이션이 이미 합성된 경우 별도 나레이션 합성 불필요
    const hasPerClipNarr = clips.some((c) => c.narrClipUrl);

    const bgmPath = process.env.BGM_PATH || "/app/storage/bgm/gregorian.mp3";
    const hasBgm = fs.existsSync(bgmPath);

    if (hasNarration && !hasPerClipNarr) {
      const tempPath = finalPath.replace(".mp4", "_silent.mp4");
      await mergeVideoClips(clipPaths, tempPath);
      console.log(`[FFmpeg] 나레이션 합성 중: ${narrationLocalPath}`);
      const withNarrPath = hasBgm ? finalPath.replace(".mp4", "_narr.mp4") : finalPath;
      await mergeVideoWithNarration(tempPath, narrationLocalPath!, withNarrPath);
      fs.unlinkSync(tempPath);
      if (hasBgm) {
        console.log(`[FFmpeg] BGM 혼합 중: ${bgmPath}`);
        await mixWithBackgroundMusic(withNarrPath, bgmPath, finalPath);
        fs.unlinkSync(withNarrPath);
      }
    } else if (hasBgm) {
      const tempPath = finalPath.replace(".mp4", "_nobgm.mp4");
      await mergeVideoClips(clipPaths, tempPath);
      console.log(`[FFmpeg] BGM 혼합 중: ${bgmPath}`);
      await mixWithBackgroundMusic(tempPath, bgmPath, finalPath);
      fs.unlinkSync(tempPath);
    } else {
      await mergeVideoClips(clipPaths, finalPath);
    }

    await prisma.episode.update({
      where: { id: req.params.id },
      data: { status: "COMPLETE" },
    });

    const label = hasPerClipNarr ? "씬별 나레이션" : hasNarration ? "나레이션 포함" : "나레이션 없음";
    res.json({
      message: `클립 병합 완료 (${label}${hasBgm ? " + BGM" : ""})`,
      outputPath: finalPath.replace("/app", ""),
      hasNarration: hasNarration || hasPerClipNarr,
      hasBgm,
    });
  } catch (err) { next(err); }
}

/**
 * 모든 완료된 클립에 SRT_KO 자막 삽입
 * POST /api/v1/episodes/:id/burn-subtitles
 */
export async function burnSubtitlesToClips(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: "Episode not found" });

    const srtRecord = await prisma.generatedContent.findFirst({
      where: { episodeId: req.params.id, contentType: "SRT_KO" },
      orderBy: { createdAt: "desc" },
    });
    if (!srtRecord) return res.status(400).json({ error: "먼저 SRT_KO를 생성하세요" });

    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });
    if (clips.length === 0) return res.status(400).json({ error: "완료된 클립이 없습니다" });

    const results: string[] = [];

    for (const clip of clips) {
      if (!clip.clipUrl) continue;
      const sceneSrt = buildSceneSrt(srtRecord.content, clip.sceneNumber, clip.durationSec);
      if (!sceneSrt) {
        console.warn(`[Subtitle] 씬 ${clip.sceneNumber} SRT 항목 없음, 건너뜀`);
        continue;
      }

      const clipLocalPath = `/app${clip.clipUrl}`;
      const subDir = path.dirname(clipLocalPath);
      const subOutputPath = path.join(subDir, `scene_${clip.sceneNumber}_sub.mp4`);

      console.log(`[Subtitle] 씬 ${clip.sceneNumber} 자막 삽입 중`);
      await embedSubtitleToClip(clipLocalPath, sceneSrt, subOutputPath);

      await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: { subClipUrl: subOutputPath.replace("/app", "") },
      });

      results.push(`씬 ${clip.sceneNumber}`);
    }

    res.json({ message: `자막 삽입 완료: ${results.join(", ")}`, scenes: results });
  } catch (err) { next(err); }
}

/**
 * 모든 완료된 클립에 씬별 나레이션 구간 합성
 * POST /api/v1/episodes/:id/add-narration-to-clips
 */
export async function addNarrationToClips(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: "Episode not found" });
    if (!episode.narrationUrl) return res.status(400).json({ error: "먼저 나레이션을 생성하세요" });

    const narrationLocalPath = `/app${episode.narrationUrl}`;
    if (!fs.existsSync(narrationLocalPath)) {
      return res.status(400).json({ error: "나레이션 파일을 찾을 수 없습니다" });
    }

    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });
    if (clips.length === 0) return res.status(400).json({ error: "완료된 클립이 없습니다" });

    // 나레이션 전체 길이를 씬 수로 균등 분할
    const totalDuration = getMediaDuration(narrationLocalPath);
    const segmentDur = totalDuration / clips.length;
    console.log(`[Narration] 총 ${totalDuration.toFixed(1)}s → 씬당 ${segmentDur.toFixed(1)}s`);

    const results: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip.clipUrl) continue;

      // 자막이 삽입된 클립이 있으면 그것을 기반으로 나레이션 추가
      const baseClipPath = clip.subClipUrl && fs.existsSync(`/app${clip.subClipUrl}`)
        ? `/app${clip.subClipUrl}`
        : `/app${clip.clipUrl}`;

      const segmentStart = i * segmentDur;
      const clipDir = path.dirname(`/app${clip.clipUrl}`);
      const narrOutputPath = path.join(clipDir, `scene_${clip.sceneNumber}_narr.mp4`);

      console.log(`[Narration] 씬 ${clip.sceneNumber}: ${segmentStart.toFixed(1)}s ~ ${(segmentStart + segmentDur).toFixed(1)}s`);
      await addNarrationSegmentToClip(baseClipPath, narrationLocalPath, segmentStart, segmentDur, narrOutputPath);

      await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: { narrClipUrl: narrOutputPath.replace("/app", "") },
      });

      results.push(`씬 ${clip.sceneNumber}`);
    }

    res.json({ message: `나레이션 합성 완료: ${results.join(", ")}`, scenes: results });
  } catch (err) { next(err); }
}
