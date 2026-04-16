import { Request, Response, NextFunction } from "express";
import { streamGenerate, generateOnce } from "../services/gemini.service";
import { generateSrtPack } from "../services/srt.service";
import { generateYtMetaPack } from "../services/ytMeta.service";
import { generateNarration } from "../services/tts.service";
import { buildScriptPrompt, buildAnimPromptRequest } from "../utils/promptBuilder";
import { prisma } from "../config/database";
import { applyWordReplacements } from "../services/wordReplacement.service";

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
    console.log(`[Gemini] 스크립트 생성 시작, episodeId=${episode.id}, model=${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`);
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
        content: applyWordReplacements(fullContent),
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
    console.log(`[Gemini] 애니메이션 프롬프트 생성 시작, episodeId=${episode.id}, model=${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`);
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
        content: applyWordReplacements(fullContent),
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

/** SCRIPT에서 씬별 히브리어 나레이션을 추출해 줄바꿈으로 이어 붙임 */
function extractHebrewNarrationLines(script: string): string {
  const lines: string[] = [];
  const re = /나레이션\s*[\(（]?\s*HE\s*[\)）]?\s*[:\-]\s*(.+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    const t = m[1].trim();
    if (t) lines.push(t);
  }
  return lines.join("\n");
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

    // 스크립트에서 히브리어 원문 추출 → SRT 번역 기준으로 사용
    const hebrewSource = extractHebrewNarrationLines(latestScript.content);

    const pack = await generateSrtPack(episode, latestScript.content, hebrewSource || undefined);

    await prisma.generatedContent.createMany({
      data: [
        { episodeId: episode.id, contentType: "SRT_KO", content: pack.ko, aiModel: process.env.GEMINI_MODEL },
        { episodeId: episode.id, contentType: "SRT_HE", content: pack.he, aiModel: process.env.GEMINI_MODEL },
        { episodeId: episode.id, contentType: "SRT_EN", content: pack.en, aiModel: process.env.GEMINI_MODEL },
      ],
    });

    res.json({ message: "SRT 3종 생성 완료 (한국어·히브리어·영어)", types: ["SRT_KO", "SRT_HE", "SRT_EN"] });
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

    // 자막(SRT_KO)과 나레이션이 동일한 텍스트를 읽도록 SRT_KO 우선 사용
    // SRT_KO 없으면 SCRIPT fallback
    const srtKo = await prisma.generatedContent.findFirst({
      where: { episodeId: episode.id, contentType: "SRT_KO" },
      orderBy: { createdAt: "desc" },
    });

    let narrationText: string;

    if (srtKo) {
      // SRT_KO → 씬 순서대로 자막 텍스트 추출 (타임코드·인덱스 제거)
      narrationText = srtKo.content
        .replace(/^\uFEFF/, "")                       // BOM 제거
        .split(/\n\s*\n/)                              // 블록 분리
        .map((block) => {
          const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
          // 인덱스·타임코드 줄 제거 → 텍스트 줄만
          return lines.filter(
            (l) => !/^\d+$/.test(l) && !/^\d{2}:\d{2}:\d{2}/.test(l)
          ).join(" ");
        })
        .filter(Boolean)
        .join(" ");                                    // 씬 1, 2, 3... 순서로 이어붙임

      console.log(`[Narration] SRT_KO 텍스트 추출 완료 (${narrationText.length}자), TTS 변환 시작`);
    } else {
      // SRT_KO 없을 때 SCRIPT로 fallback
      const latestScript = await prisma.generatedContent.findFirst({
        where: { episodeId: episode.id, contentType: "SCRIPT" },
        orderBy: { createdAt: "desc" },
      });
      if (!latestScript) return res.status(400).json({ error: "먼저 SRT 또는 스크립트를 생성하세요" });
      narrationText = latestScript.content;
      console.log(`[Narration] SCRIPT fallback 사용 (SRT_KO 없음), TTS 변환 시작`);
    }

    // 단어 치환 적용 (예: 하나님 → 엘로힘) — generateNarration 내부에서도 적용되지만
    // 여기서 먼저 적용해 자막 text 필드에도 치환된 텍스트가 들어가도록 보장
    narrationText = applyWordReplacements(narrationText);
    const { filePath } = await generateNarration(episode.id, narrationText);
    const narrationUrl = filePath.replace("/app", "");

    await prisma.episode.update({
      where: { id: episode.id },
      data: { narrationUrl },
    });

    res.json({
      message: `나레이션 생성 완료 (${srtKo ? "SRT_KO 자막 텍스트" : "SCRIPT"} · Chirp3-HD-Iapetus)`,
      narrationUrl,
      textLength: narrationText.length,
      source: srtKo ? "SRT_KO" : "SCRIPT",
    });
  } catch (err) { next(err); }
}
