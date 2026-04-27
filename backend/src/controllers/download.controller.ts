import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { prisma } from "../config/database";

export async function getContent(req: Request, res: Response, next: NextFunction) {
  try {
    const content = await prisma.generatedContent.findUnique({ where: { id: req.params.id } });
    if (!content) return res.status(404).json({ error: "Not found" });
    res.json({
      id: content.id,
      contentType: content.contentType,
      content: content.content,
      aiModel: content.aiModel,
      createdAt: content.createdAt
    });
  } catch (err) {
    next(err);
  }
}

export async function updateContent(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = req.body;
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "content 필드가 필요합니다" });
    }
    const updated = await prisma.generatedContent.update({
      where: { id: req.params.id },
      data: { content: content.trim() },
    });
    res.json({ id: updated.id, contentType: updated.contentType, content: updated.content });
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
    next(err);
  }
}

export async function downloadContent(req: Request, res: Response, next: NextFunction) {
  try {
    const content = await prisma.generatedContent.findUnique({ where: { id: req.params.id } });
    if (!content) return res.status(404).json({ error: "Not found" });

    const extMap: Record<string, string> = {
      SCRIPT: "txt", ANIM_PROMPT: "txt",
      SRT_KO: "srt", SRT_HE: "srt", SRT_VI: "srt",
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
        SRT_KO: "srt", SRT_HE: "srt", SRT_VI: "srt",
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

    // 씬별 최선 버전 클립 포함 (narrClipUrl > subClipUrl > clipUrl)
    for (const clip of episode.videoClips) {
      const bestUrl = (clip as any).narrClipUrl ?? (clip as any).subClipUrl ?? clip.clipUrl;
      if (bestUrl) {
        const localPath = `/app${bestUrl}`;
        if (fs.existsSync(localPath)) {
          archive.file(localPath, { name: `video_clips/scene_${String(clip.sceneNumber).padStart(2, "0")}.mp4` });
        }
      }
    }

    // 나레이션 MP3 포함
    if (episode.narrationUrl) {
      const narrPath = `/app${episode.narrationUrl}`;
      if (fs.existsSync(narrPath)) {
        archive.file(narrPath, { name: "narration.mp3" });
      }
    }

    const finalMp4 = `/app/storage/videos/${episode.id}/episode_final.mp4`;
    if (fs.existsSync(finalMp4)) {
      archive.file(finalMp4, { name: "episode_final.mp4" });
    }

    await archive.finalize();
  } catch (err) { next(err); }
}
