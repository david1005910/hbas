import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { prisma } from "../config/database";

export async function downloadContent(req: Request, res: Response, next: NextFunction) {
  try {
    const content = await prisma.generatedContent.findUnique({ where: { id: req.params.id } });
    if (!content) return res.status(404).json({ error: "Not found" });

    const extMap: Record<string, string> = {
      SCRIPT: "txt", ANIM_PROMPT: "txt",
      SRT_KO: "srt", SRT_HE: "srt", SRT_EN: "srt",
      YT_META: "json",
    };
    const ext = extMap[content.contentType] || "txt";
    res.setHeader("Content-Disposition", `attachment; filename="${content.contentType.toLowerCase()}.${ext}"`);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(content.content);
  } catch (err) { next(err); }
}

export async function downloadAll(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: {
        contents: { orderBy: { createdAt: "desc" } },
        // isSelected 여부와 관계없이 씬별 최신 키프레임 포함
        keyframes: { orderBy: [{ sceneNumber: "asc" }, { createdAt: "desc" }] },
        videoClips: { where: { status: "COMPLETED" }, orderBy: { sceneNumber: "asc" } },
      },
    });
    if (!episode) return res.status(404).json({ error: "Not found" });

    res.setHeader("Content-Disposition", `attachment; filename="episode_${episode.id.slice(0, 8)}.zip"`);
    res.setHeader("Content-Type", "application/zip");

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    // 콘텐츠 타입별 최신 1개만 포함
    const latestContents = new Map<string, typeof episode.contents[0]>();
    for (const content of episode.contents) {
      if (!latestContents.has(content.contentType)) {
        latestContents.set(content.contentType, content);
      }
    }

    for (const content of latestContents.values()) {
      const extMap: Record<string, string> = {
        SCRIPT: "txt", ANIM_PROMPT: "txt",
        SRT_KO: "srt", SRT_HE: "srt", SRT_EN: "srt",
        YT_META: "json",
      };
      const ext = extMap[content.contentType] || "txt";
      archive.append(content.content, { name: `${content.contentType.toLowerCase()}.${ext}` });
    }

    // 씬별 최신 키프레임 1개만 포함
    const latestKeyframes = new Map<number, typeof episode.keyframes[0]>();
    for (const kf of episode.keyframes) {
      if (!latestKeyframes.has(kf.sceneNumber)) {
        latestKeyframes.set(kf.sceneNumber, kf);
      }
    }
    for (const kf of latestKeyframes.values()) {
      if (kf.imageUrl) {
        const localPath = `/app${kf.imageUrl}`;
        if (fs.existsSync(localPath)) {
          archive.file(localPath, { name: `keyframes/scene_${String(kf.sceneNumber).padStart(2, "0")}.png` });
        }
      }
    }

    for (const clip of episode.videoClips) {
      if (clip.clipUrl) {
        const localPath = `/app${clip.clipUrl}`;
        if (fs.existsSync(localPath)) {
          archive.file(localPath, { name: `video_clips/scene_${String(clip.sceneNumber).padStart(2, "0")}.mp4` });
        }
      }
    }

    const finalMp4 = `/app/storage/videos/${episode.id}/episode_final.mp4`;
    if (fs.existsSync(finalMp4)) {
      archive.file(finalMp4, { name: "episode_final.mp4" });
    }

    await archive.finalize();
  } catch (err) { next(err); }
}
