import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";

export async function createEpisode(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, bibleBookId, titleKo, titleHe, verseRange, sceneCount, animStyle, targetDuration } = req.body;
    const episode = await prisma.episode.create({
      data: { projectId, bibleBookId, titleKo, titleHe, verseRange, sceneCount, animStyle, targetDuration },
      include: { bibleBook: true },
    });
    res.status(201).json(episode);
  } catch (err) { next(err); }
}

export async function getEpisode(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: {
        bibleBook: true,
        contents: { orderBy: { createdAt: "desc" } },
        keyframes: { orderBy: { sceneNumber: "asc" } },
        videoClips: { orderBy: { sceneNumber: "asc" } },
      },
    });
    if (!episode) return res.status(404).json({ error: "Not found" });
    res.json(episode);
  } catch (err) { next(err); }
}

export async function updateEpisode(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.update({
      where: { id: req.params.id },
      data: req.body,
      include: { bibleBook: true },
    });
    res.json(episode);
  } catch (err) { next(err); }
}

export async function deleteEpisode(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.episode.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
}
