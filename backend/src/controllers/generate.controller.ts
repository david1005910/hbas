import { Request, Response, NextFunction } from "express";
import { streamGenerate, generateOnce } from "../services/gemini.service";
import { generateSrtPack } from "../services/srt.service";
import { generateYtMetaPack } from "../services/ytMeta.service";
import { generateNarration } from "../services/tts.service";
import { buildScriptPrompt, buildAnimPromptRequest } from "../utils/promptBuilder";
import { prisma } from "../config/database";
import { applyWordReplacements } from "../services/wordReplacement.service";
import { fetchVersesForRange, syncAllSubtitlesForEpisode, PROJECT_PATH } from "../services/remotion.service";
import { buildSrtContent, distributeTiming } from "../utils/srtFormatter";
import { addUtf8Bom } from "../utils/hebrewUtils";
import fs from "fs";
import path from "path";

/** SCRIPT에서 씬별 특정 언어 나레이션 텍스트 배열 추출 */
function extractNarrationScenesByLang(script: string, langTag: string): string[] {
  const results: string[] = [];
  const blocks = script.split(/씬\s+\d+:/);
  for (const block of blocks.slice(1)) {
    const re = new RegExp(
      `나레이션\\s*\\(${langTag}\\):\\s*([\\s\\S]*?)(?=나레이션\\s*\\(|감정톤:|【|씬\\s*\\d+:|$)`
    );
    const m = block.match(re);
    if (m) {
      const text = m[1].trim().replace(/\n\s+/g, "\n").replace(/\n/g, " ").trim();
      if (text) results.push(text);
    }
  }
  return results;
}

/** SRT 문자열에서 씬별 텍스트 배열 추출 (인덱스·타임코드 제외) */
function extractSrtScenes(srt: string): string[] {
  return srt
    .replace(/^\uFEFF/, "")
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.filter((l) => !/^\d+$/.test(l) && !/^\d{2}:\d{2}:\d{2}/.test(l)).join(" ");
    })
    .filter(Boolean);
}

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

    // 1순위: BibleVerse DB에서 마소라 히브리어 원문 직접 조회 (정확한 번역 기준)
    let hebrewSource = "";
    let koHints: string[] = [];
    let dbHebrewSrt: string | null = null;
    let dbVerses: Array<{ hebrewText: string; koreanText: string; verse: number }> = [];
    let sceneCount = episode.sceneCount ?? 5;
    let timings: Array<{ startSec: number; endSec: number }> = [];
    let versePerScene = 1;

    if (episode.verseRange && episode.bibleBookId) {
      const fetchedVerses = await fetchVersesForRange(episode.bibleBookId, episode.verseRange);
      if (fetchedVerses.length > 0) {
        dbVerses = fetchedVerses;
        // 마소라 히브리어 원문 (각 절 번호 포함하여 번역 기준 명확화)
        hebrewSource = dbVerses.map((v) => `${v.verse}절: ${v.hebrewText}`).join("\n");
        // BibleVerse 한국어 번역 (AI 번역 힌트로 제공)
        koHints = dbVerses.map((v) => v.koreanText);

        // SRT_HE: BibleVerse 원문을 N씬으로 직접 분할 (Gemini 미사용 → 정확도 100%)
        timings = distributeTiming(sceneCount, episode.targetDuration ?? 300);
        versePerScene = Math.ceil(dbVerses.length / sceneCount);
        const heEntries = Array.from({ length: sceneCount }, (_, i) => {
          let chunk: typeof dbVerses;
          if (dbVerses.length >= sceneCount) {
            // 절 수 ≥ 씬 수: 균등 분할
            chunk = dbVerses.slice(i * versePerScene, (i + 1) * versePerScene);
          } else {
            // 절 수 < 씬 수: 비례 배분으로 빈 씬 방지 (절을 씬에 걸쳐 반복 배치)
            const vIdx = Math.min(Math.floor(i * dbVerses.length / sceneCount), dbVerses.length - 1);
            chunk = [dbVerses[vIdx]];
          }
          return {
            index: i + 1,
            startSec: timings[i]?.startSec ?? i * 10,
            endSec: timings[i]?.endSec ?? (i + 1) * 10,
            text: chunk.map((v) => v.hebrewText).filter(Boolean).join(" "),
          };
        });
        dbHebrewSrt = addUtf8Bom(buildSrtContent(heEntries, true));
        console.log(`[SRT] BibleVerse DB에서 히브리어 원문 ${dbVerses.length}절 로드 완료 → SRT_HE ${sceneCount}씬 직접 생성`);
      }
    }

    // 2순위: SCRIPT에서 추출 (verseRange 없거나 DB 조회 실패 시)
    if (!hebrewSource) {
      hebrewSource = extractHebrewNarrationLines(latestScript.content);
      console.log("[SRT] SCRIPT에서 히브리어 추출 (DB 조회 실패 fallback)");
    }

    if (timings.length === 0) timings = distributeTiming(sceneCount, episode.targetDuration ?? 300);

    // SCRIPT 나레이션(KO)/(EN) 직접 추출 → Gemini 재호출 없이 SRT 생성 (품질·속도 향상)
    const scriptKoScenes = extractNarrationScenesByLang(latestScript.content, "KO");
    const scriptEnScenes = extractNarrationScenesByLang(latestScript.content, "EN");

    let koSrtFromScript: string | null = null;
    let enSrtFromScript: string | null = null;

    if (scriptKoScenes.length === sceneCount) {
      const koEntries = scriptKoScenes.map((text, i) => ({
        index: i + 1,
        startSec: timings[i]?.startSec ?? i * 10,
        endSec: timings[i]?.endSec ?? (i + 1) * 10,
        text: applyWordReplacements(text),
      }));
      koSrtFromScript = buildSrtContent(koEntries);
      console.log(`[SRT] SCRIPT 나레이션(KO) ${scriptKoScenes.length}씬 → SRT_KO 직접 생성`);
    }

    if (scriptEnScenes.length === sceneCount) {
      const enEntries = scriptEnScenes.map((text, i) => ({
        index: i + 1,
        startSec: timings[i]?.startSec ?? i * 10,
        endSec: timings[i]?.endSec ?? (i + 1) * 10,
        text,
      }));
      enSrtFromScript = buildSrtContent(enEntries);
      console.log(`[SRT] SCRIPT 나레이션(EN) ${scriptEnScenes.length}씬 → SRT_EN 직접 생성`);
    }

    // Gemini SRT 생성: SCRIPT 나레이션이 누락된 언어만 보완
    let pack: { ko: string; he: string; en: string } | null = null;
    if (!koSrtFromScript || !enSrtFromScript) {
      console.log("[SRT] SCRIPT 나레이션 불완전 → Gemini generateSrtPack 호출");
      pack = await generateSrtPack(
        episode,
        latestScript.content,
        hebrewSource || undefined,
        koHints.length > 0 ? koHints : undefined
      );

      // Gemini KO 씬 수 보정: sceneCount와 불일치 시 BibleVerse 한국어로 보완
      if (!koSrtFromScript && pack) {
        let geminiKoSrt = pack.ko;
        const geminiKoScenes = extractSrtScenes(pack.ko);
        if (geminiKoScenes.length !== sceneCount && dbVerses.length > 0) {
          console.log(`[SRT] SRT_KO 씬 수 보정: Gemini=${geminiKoScenes.length}씬 → ${sceneCount}씬`);
          const koEntries = Array.from({ length: sceneCount }, (_, i) => {
            const geminiText = geminiKoScenes[i] ?? "";
            const chunk = dbVerses.slice(i * versePerScene, (i + 1) * versePerScene);
            const text = geminiText || chunk.map((v) => applyWordReplacements(v.koreanText.trim())).filter(Boolean).join(" ");
            return { index: i + 1, startSec: timings[i]?.startSec ?? i * 10, endSec: timings[i]?.endSec ?? (i + 1) * 10, text };
          });
          geminiKoSrt = buildSrtContent(koEntries);
        }
        koSrtFromScript = geminiKoSrt;
      }
    }

    const finalKoSrt = koSrtFromScript ?? "";
    const finalEnSrt = enSrtFromScript ?? pack?.en ?? "";
    // SRT_HE: DB에서 직접 생성된 경우 Gemini 결과 대신 사용
    const srtHe = dbHebrewSrt ?? pack?.he ?? "";

    // 기존 SRT 레코드 삭제 후 새로 생성 (중복 누적 방지, 오염된 이전 데이터 교체)
    await prisma.generatedContent.deleteMany({
      where: { episodeId: episode.id, contentType: { in: ["SRT_KO", "SRT_HE", "SRT_EN"] } },
    });
    await prisma.generatedContent.createMany({
      data: [
        { episodeId: episode.id, contentType: "SRT_KO", content: finalKoSrt, aiModel: process.env.GEMINI_MODEL },
        { episodeId: episode.id, contentType: "SRT_HE", content: srtHe, aiModel: "BibleVerse-DB" },
        { episodeId: episode.id, contentType: "SRT_EN", content: finalEnSrt, aiModel: process.env.GEMINI_MODEL },
      ],
    });

    // SRT 생성 완료 후 subtitles.json이 있으면 자동 동기화 (HE+KO+EN 타이밍 일치 보장)
    const subtitlesPath = path.join(PROJECT_PATH, "public", "subtitles.json");
    if (fs.existsSync(subtitlesPath)) {
      try {
        await syncAllSubtitlesForEpisode(episode.id);
        console.log("[SRT] subtitles.json 자동 동기화 완료 (HE+KO+EN)");
      } catch (syncErr) {
        console.warn("[SRT] subtitles.json 자동 동기화 실패 (무시):", (syncErr as Error).message);
      }
    }

    const heSource = dbHebrewSrt ? "BibleVerse DB 원문" : "SCRIPT";
    const koSource = koSrtFromScript && !pack ? "SCRIPT 나레이션" : "Gemini";
    const enSource = enSrtFromScript && !pack ? "SCRIPT 나레이션" : "Gemini";
    res.json({
      message: `SRT 3종 생성 완료 — KO: ${koSource} | EN: ${enSource} | HE: ${heSource}`,
      types: ["SRT_KO", "SRT_HE", "SRT_EN"],
    });
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
