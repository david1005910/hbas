import { Request, Response, NextFunction } from "express";
import { streamGenerate } from "../services/gemini.service";
import { generateSrtPack } from "../services/srt.service";
import { generateYtMetaPack } from "../services/ytMeta.service";
import { buildScriptPrompt, buildAnimPromptRequest } from "../utils/promptBuilder";
import { prisma } from "../config/database";

function sseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx 버퍼링 비활성화
  res.flushHeaders();
}

function sseWrite(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function getEpisodeOrFail(id: string, res: Response) {
  const episode = await prisma.episode.findUnique({
    where: { id },
    include: { bibleBook: true },
  });
  if (!episode) {
    res.status(404).json({ error: "Episode not found" });
    return null;
  }
  return episode;
}

export async function generateScript(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await getEpisodeOrFail(req.params.id, res);
    if (!episode) return;

    sseHeaders(res);
    const prompt = buildScriptPrompt(episode);
    let fullContent = "";

    for await (const chunk of streamGenerate(prompt)) {
      fullContent += chunk;
      sseWrite(res, { chunk });
    }

    await prisma.generatedContent.create({
      data: {
        episodeId: episode.id,
        contentType: "SCRIPT",
        content: fullContent,
        aiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      },
    });

    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: "IN_PROGRESS" },
    });

    sseWrite(res, { done: true });
    res.end();
  } catch (err: any) {
    if (!res.headersSent) return next(err);
    sseWrite(res, { error: err.message });
    res.end();
  }
}

export async function generateAnimPrompt(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await getEpisodeOrFail(req.params.id, res);
    if (!episode) return;

    sseHeaders(res);
    const prompt = buildAnimPromptRequest(episode);
    let fullContent = "";

    for await (const chunk of streamGenerate(prompt)) {
      fullContent += chunk;
      sseWrite(res, { chunk });
    }

    await prisma.generatedContent.create({
      data: {
        episodeId: episode.id,
        contentType: "ANIM_PROMPT",
        content: fullContent,
        aiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      },
    });

    sseWrite(res, { done: true });
    res.end();
  } catch (err: any) {
    if (!res.headersSent) return next(err);
    sseWrite(res, { error: err.message });
    res.end();
  }
}

export async function generateSrt(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await getEpisodeOrFail(req.params.id, res);
    if (!episode) return;

    const latestScript = await prisma.generatedContent.findFirst({
      where: { episodeId: episode.id, contentType: "SCRIPT" },
      orderBy: { createdAt: "desc" },
    });
    if (!latestScript) return res.status(400).json({ error: "먼저 스크립트를 생성하세요" });

    const pack = await generateSrtPack(episode, latestScript.content);

    await prisma.generatedContent.createMany({
      data: [
        { episodeId: episode.id, contentType: "SRT_KO", content: pack.ko, aiModel: process.env.GEMINI_MODEL },
        { episodeId: episode.id, contentType: "SRT_HE", content: pack.he, aiModel: process.env.GEMINI_MODEL },
        { episodeId: episode.id, contentType: "SRT_EN", content: pack.en, aiModel: process.env.GEMINI_MODEL },
      ],
    });

    res.json({ message: "SRT 3종 생성 완료", types: ["SRT_KO", "SRT_HE", "SRT_EN"] });
  } catch (err) { next(err); }
}

export async function generateYtMeta(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await getEpisodeOrFail(req.params.id, res);
    if (!episode) return;

    const result = await generateYtMetaPack(
      episode.titleKo,
      episode.bibleBook.nameKo,
      episode.bibleBook.nameHe,
      episode.bibleBook.nameEn,
      episode.verseRange
    );

    await prisma.generatedContent.create({
      data: {
        episodeId: episode.id,
        contentType: "YT_META",
        content: result,
        aiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      },
    });

    res.json({ message: "YT 메타데이터 생성 완료", content: result });
  } catch (err) { next(err); }
}
