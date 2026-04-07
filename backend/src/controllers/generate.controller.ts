import { Request, Response, NextFunction } from "express";
import { streamGenerate, generateOnce } from "../services/gemini.service";
import { generateSrtPack } from "../services/srt.service";
import { generateYtMetaPack } from "../services/ytMeta.service";
import { generateNarration } from "../services/tts.service";
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
      ],
    });

    res.json({ message: "SRT 2종 생성 완료 (한국어·히브리어)", types: ["SRT_KO", "SRT_HE"] });
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

export async function generateNarrationAudio(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await getEpisodeOrFail(req.params.id, res);
    if (!episode) return;

    const latestScript = await prisma.generatedContent.findFirst({
      where: { episodeId: episode.id, contentType: "SCRIPT" },
      orderBy: { createdAt: "desc" },
    });
    if (!latestScript) return res.status(400).json({ error: "먼저 스크립트를 생성하세요" });

    // Gemini로 상세 나레이션 대본 생성 (SRT 읽기 대신 내용 설명)
    const narrationPrompt = `다음은 구약 히브리 성경 기반 유튜브 3D 애니메이션의 에피소드 스크립트입니다.

에피소드 제목: ${episode.titleKo}
성경 범위: ${episode.verseRange || ""}

스크립트:
${latestScript.content}

위 내용을 바탕으로 유튜브 다큐멘터리 나레이션 대본을 작성해주세요.
- 중년 남성 나레이터가 읽는 차분하고 깊이 있는 나레이션 톤
- 성경 본문의 신학적 의미와 역사적 배경을 상세히 설명
- 시청자가 장면을 이해할 수 있도록 생생한 묘사 포함
- 한국어로만 작성, 자막 번호/타임코드 없이 순수 나레이션 텍스트만
- 약 500~800자 분량으로 작성`;

    console.log(`[Narration] Gemini 나레이션 대본 생성 중, episodeId=${episode.id}`);
    const narrationText = await generateOnce(narrationPrompt);
    console.log(`[Narration] 대본 생성 완료 (${narrationText.length}자), TTS 변환 시작`);

    const filePath = await generateNarration(episode.id, narrationText);
    const narrationUrl = filePath.replace("/app", "");

    await prisma.episode.update({
      where: { id: episode.id },
      data: { narrationUrl },
    });

    res.json({
      message: "나레이션 생성 완료 (Gemini 대본 · ko-KR-Neural2-A · 여성)",
      narrationUrl,
      scriptLength: narrationText.length,
    });
  } catch (err) { next(err); }
}
