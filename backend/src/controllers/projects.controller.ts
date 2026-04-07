import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";

export async function listProjects(_req: Request, res: Response, next: NextFunction) {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { episodes: true } } },
    });
    res.json(projects);
  } catch (err) { next(err); }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description } = req.body;
    const project = await prisma.project.create({ data: { name, description } });
    res.status(201).json(project);
  } catch (err) { next(err); }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { episodes: { orderBy: { createdAt: "desc" } } },
    });
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  } catch (err) { next(err); }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(project);
  } catch (err) { next(err); }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function listProjectEpisodes(req: Request, res: Response, next: NextFunction) {
  try {
    const episodes = await prisma.episode.findMany({
      where: { projectId: req.params.id },
      include: { bibleBook: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(episodes);
  } catch (err) { next(err); }
}
