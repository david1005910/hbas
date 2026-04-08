import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import { parseAnimPromptByScene } from "../utils/promptBuilder";
import { startVideoGeneration as veoStart, extendVideo as veoExtend, pollVideoStatus, downloadVideoFromGcs } from "../services/veo.service";
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
import { GCS_OUTPUT_BUCKET, TARGET_SCENE_DURATION } from "../config/vertexai";

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

    const { durationSec = 8 } = req.body;
    let { motionPrompt } = req.body;

    // ANIM_PROMPT에서 씬별 모션 프롬프트 자동 조회 (req.body에 없으면)
    if (!motionPrompt) {
      const animRecord = await prisma.generatedContent.findFirst({
        where: { episodeId: keyframe.episodeId, contentType: "ANIM_PROMPT" },
        orderBy: { createdAt: "desc" },
      });
      if (animRecord) {
        const scenePrompts = parseAnimPromptByScene(animRecord.content);
        motionPrompt = scenePrompts.get(keyframe.sceneNumber)?.motion;
        if (motionPrompt) {
          console.log(`[Veo] 씬 ${keyframe.sceneNumber} 모션 프롬프트 ANIM_PROMPT에서 로드`);
        }
      }
    }

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

/**
 * 씬 클립 상태 폴링 + Veo 3.1 자동 연장 체인
 *
 * 연장 조건: GCS_OUTPUT_BUCKET 설정 AND 현재 durationSec < TARGET_SCENE_DURATION
 *   - 초기 클립 완료(8s) → 연장1 시작 → 15s
 *   - 연장1 완료         → 연장2 시작 → 22s  ← TARGET_SCENE_DURATION 기본값
 *   - 연장2 완료         → COMPLETED 확정
 *
 * GCS_OUTPUT_BUCKET 없으면 Veo 2.0 모드: 8초 클립에서 바로 COMPLETED
 */
export async function getVideoStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const clip = await prisma.sceneVideoClip.findUnique({ where: { id: req.params.id } });
    if (!clip) return res.status(404).json({ error: "Not found" });

    if (clip.status === "COMPLETED" || clip.status === "FAILED") {
      return res.json(clip);
    }
    if (!clip.veoJobId) return res.json(clip);

    const result = await pollVideoStatus(clip.veoJobId);

    // ── 아직 처리 중 ──────────────────────────────────────────────
    if (result.status === "processing") return res.json(clip);

    // ── 실패 ─────────────────────────────────────────────────────
    if (result.status === "failed") {
      const updated = await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: { status: "FAILED" },
      });
      return res.json(updated);
    }

    // ── 완료: 파일 다운로드 또는 GCS URI 보존 ────────────────────
    if (result.status === "completed") {
      let filePath: string | null = null;
      let newGcsUri: string | null = result.videoGcsUri ?? null;

      if (result.videoBase64) {
        // Veo 2.0 inline base64 → 즉시 저장
        filePath = saveVideo(clip.episodeId, clip.sceneNumber, Buffer.from(result.videoBase64, "base64"));
      } else if (result.videoGcsUri) {
        // Veo 3.1 GCS URI: 연장이 끝날 때 다운로드
        newGcsUri = result.videoGcsUri;
      } else {
        console.warn(`[Veo] 완료됐지만 영상 없음 → FAILED`);
        const updated = await prisma.sceneVideoClip.update({
          where: { id: clip.id },
          data: { status: "FAILED" },
        });
        return res.json(updated);
      }

      // ── 연장 필요 여부 판단 ──────────────────────────────────────
      // 초기 8초 + 7초 × extendCount = 현재 누적 길이
      const currentDuration = 8 + (clip.extendCount ?? 0) * 7;
      const canExtend = GCS_OUTPUT_BUCKET && newGcsUri && currentDuration < TARGET_SCENE_DURATION;

      if (canExtend) {
        // 키프레임의 모션 프롬프트 재사용
        const keyframe = await prisma.sceneKeyframe.findUnique({ where: { id: clip.keyframeId } });
        const extPrompt = keyframe?.promptUsed?.split("\n")[0] ?? "Slow cinematic pan, gentle ambient motion";
        const extendedDur = currentDuration + 7;
        const newExtendCount = (clip.extendCount ?? 0) + 1;

        console.log(`[Veo] 씬 ${clip.sceneNumber} 연장 ${newExtendCount}회차 시작 (${currentDuration}s → ${extendedDur}s)`);
        const newOpName = await veoExtend(newGcsUri!, extPrompt);

        const updated = await prisma.sceneVideoClip.update({
          where: { id: clip.id },
          data: {
            veoJobId: newOpName,
            clipGcsUri: newGcsUri,          // 다음 연장의 입력용 GCS URI
            extendCount: newExtendCount,
            durationSec: extendedDur,       // 다음 완료 시 예상 길이
            status: "PROCESSING",
          },
        });
        return res.json(updated);
      }

      // ── 최종 완료: 로컬에 다운로드 ──────────────────────────────
      if (!filePath && newGcsUri) {
        console.log(`[Veo] 씬 ${clip.sceneNumber} 최종 연장 완료 → 다운로드 중`);
        filePath = await downloadVideoFromGcs(newGcsUri, clip.episodeId, clip.sceneNumber);
      }

      const finalDuration = 8 + (clip.extendCount ?? 0) * 7;
      const updated = await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: {
          status: "COMPLETED",
          clipUrl: filePath!.replace("/app", ""),
          clipGcsUri: newGcsUri,
          durationSec: finalDuration,
        },
      });
      console.log(`[Veo] 씬 ${clip.sceneNumber} 완료 (총 ${finalDuration}초)`);
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

/** 에피소드의 유효한 BGM 경로 반환 (커스텀 → 환경변수 기본 순) */
async function getEpisodeBgmPath(episodeId: string): Promise<string | null> {
  const ep = await prisma.episode.findUnique({ where: { id: episodeId }, select: { bgmUrl: true } });
  if (ep?.bgmUrl) {
    const p = `/app${ep.bgmUrl}`;
    if (fs.existsSync(p)) return p;
  }
  const def = process.env.BGM_PATH || "/app/storage/bgm/gregorian.mp3";
  return fs.existsSync(def) ? def : null;
}

export async function mergeClips(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: "Not found" });

    const allClips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      orderBy: [{ sceneNumber: "asc" }, { createdAt: "desc" }],
    });

    if (allClips.length === 0) return res.status(400).json({ error: "완료된 클립이 없습니다" });

    // 씬별 최신 클립 1개만 선택 (narrClipUrl 있는 것 우선, 없으면 최신순)
    const sceneMap = new Map<number, typeof allClips[0]>();
    for (const c of allClips) {
      if (!sceneMap.has(c.sceneNumber)) {
        sceneMap.set(c.sceneNumber, c);
      } else {
        // 이미 있어도 narrClipUrl 있는 클립으로 교체
        const existing = sceneMap.get(c.sceneNumber)!;
        if (!existing.narrClipUrl && c.narrClipUrl) sceneMap.set(c.sceneNumber, c);
      }
    }
    const clips = Array.from(sceneMap.values()).sort((a, b) => a.sceneNumber - b.sceneNumber);

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

    const bgmPath = await getEpisodeBgmPath(req.params.id);
    const hasBgm = !!bgmPath;
    // bgmVolume: 0.0~1.0, 기본 0.10 (10%)
    const bgmVolume = Math.min(1.0, Math.max(0.0, parseFloat(req.body.bgmVolume ?? "0.10")));

    if (hasNarration && !hasPerClipNarr) {
      const tempPath = finalPath.replace(".mp4", "_silent.mp4");
      await mergeVideoClips(clipPaths, tempPath);
      console.log(`[FFmpeg] 나레이션 합성 중: ${narrationLocalPath}`);
      const withNarrPath = hasBgm ? finalPath.replace(".mp4", "_narr.mp4") : finalPath;
      await mergeVideoWithNarration(tempPath, narrationLocalPath!, withNarrPath);
      fs.unlinkSync(tempPath);
      if (hasBgm) {
        console.log(`[FFmpeg] BGM 혼합 중: ${bgmPath} (volume=${bgmVolume})`);
        await mixWithBackgroundMusic(withNarrPath, bgmPath!, finalPath, bgmVolume);
        fs.unlinkSync(withNarrPath);
      }
    } else if (hasBgm) {
      const tempPath = finalPath.replace(".mp4", "_nobgm.mp4");
      await mergeVideoClips(clipPaths, tempPath);
      console.log(`[FFmpeg] BGM 혼합 중: ${bgmPath} (volume=${bgmVolume})`);
      await mixWithBackgroundMusic(tempPath, bgmPath!, finalPath, bgmVolume);
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
      message: `클립 병합 완료 (${label}${hasBgm ? ` + BGM(${Math.round(bgmVolume * 100)}%)` : ""})`,
      outputPath: finalPath.replace("/app", ""),
      hasNarration: hasNarration || hasPerClipNarr,
      hasBgm,
      bgmVolume: hasBgm ? bgmVolume : null,
    });
  } catch (err) { next(err); }
}

/**
 * 영상 클립 삭제 (모든 상태)
 * DELETE /api/v1/video-clips/:id
 */
export async function deleteVideoClip(req: Request, res: Response, next: NextFunction) {
  try {
    const clip = await prisma.sceneVideoClip.findUnique({ where: { id: req.params.id } });
    if (!clip) return res.status(404).json({ error: "Not found" });

    // 관련 파일 삭제
    const files = [clip.clipUrl, clip.subClipUrl, clip.narrClipUrl].filter(Boolean) as string[];
    for (const f of files) {
      const localPath = `/app${f}`;
      if (fs.existsSync(localPath)) {
        try { fs.unlinkSync(localPath); } catch { /* 파일 삭제 실패는 무시 */ }
      }
    }

    await prisma.sceneVideoClip.delete({ where: { id: clip.id } });
    res.json({ message: "클립 삭제 완료", sceneNumber: clip.sceneNumber });
  } catch (err) { next(err); }
}

/**
 * 모든 완료된 클립에 SRT_KO + SRT_HE 자막 삽입
 * POST /api/v1/episodes/:id/burn-subtitles
 */
export async function burnSubtitlesToClips(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: "Episode not found" });

    const [srtKoRecord, srtHeRecord] = await Promise.all([
      prisma.generatedContent.findFirst({
        where: { episodeId: req.params.id, contentType: "SRT_KO" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.generatedContent.findFirst({
        where: { episodeId: req.params.id, contentType: "SRT_HE" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!srtKoRecord) return res.status(400).json({ error: "먼저 SRT_KO를 생성하세요" });

    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });
    if (clips.length === 0) return res.status(400).json({ error: "완료된 클립이 없습니다" });

    const results: string[] = [];

    for (const clip of clips) {
      if (!clip.clipUrl) continue;

      const koSrt = buildSceneSrt(srtKoRecord.content, clip.sceneNumber, clip.durationSec);
      if (!koSrt) { console.warn(`[Subtitle] 씬 ${clip.sceneNumber} KO SRT 없음, 건너뜀`); continue; }

      const heSrt = srtHeRecord
        ? buildSceneSrt(srtHeRecord.content, clip.sceneNumber, clip.durationSec)
        : undefined;

      const clipLocalPath = `/app${clip.clipUrl}`;
      const subOutputPath = path.join(path.dirname(clipLocalPath), `scene_${clip.sceneNumber}_sub.mp4`);

      const tracks = heSrt ? "KO+HE" : "KO";
      console.log(`[Subtitle] 씬 ${clip.sceneNumber} 자막 삽입 중 (${tracks})`);
      await embedSubtitleToClip(clipLocalPath, koSrt, subOutputPath, heSrt || undefined);

      await prisma.sceneVideoClip.update({
        where: { id: clip.id },
        data: { subClipUrl: subOutputPath.replace("/app", "") },
      });

      results.push(`씬 ${clip.sceneNumber}(${tracks})`);
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

/**
 * 특정 클립 하나에만 자막 삽입
 * POST /api/v1/video-clips/:id/burn-subtitle
 */
export async function burnSubtitleToSingleClip(req: Request, res: Response, next: NextFunction) {
  try {
    const clip = await prisma.sceneVideoClip.findUnique({ where: { id: req.params.id } });
    if (!clip) return res.status(404).json({ error: "Clip not found" });
    if (clip.status !== "COMPLETED" || !clip.clipUrl) {
      return res.status(400).json({ error: "완료된 클립이 아닙니다" });
    }

    const [srtKoRecord, srtHeRecord] = await Promise.all([
      prisma.generatedContent.findFirst({
        where: { episodeId: clip.episodeId, contentType: "SRT_KO" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.generatedContent.findFirst({
        where: { episodeId: clip.episodeId, contentType: "SRT_HE" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!srtKoRecord) return res.status(400).json({ error: "먼저 SRT_KO를 생성하세요" });

    const koSrt = buildSceneSrt(srtKoRecord.content, clip.sceneNumber, clip.durationSec);
    if (!koSrt) return res.status(400).json({ error: `씬 ${clip.sceneNumber} SRT 항목 없음` });

    const heSrt = srtHeRecord
      ? buildSceneSrt(srtHeRecord.content, clip.sceneNumber, clip.durationSec) || undefined
      : undefined;

    const clipLocalPath = `/app${clip.clipUrl}`;
    const subOutputPath = path.join(path.dirname(clipLocalPath), `scene_${clip.sceneNumber}_sub.mp4`);
    const tracks = heSrt ? "KO+HE" : "KO";

    console.log(`[Subtitle] 씬 ${clip.sceneNumber} 자막 삽입 (${tracks})`);
    await embedSubtitleToClip(clipLocalPath, koSrt, subOutputPath, heSrt);

    const updated = await prisma.sceneVideoClip.update({
      where: { id: clip.id },
      data: { subClipUrl: subOutputPath.replace("/app", "") },
    });

    res.json({ message: `씬 ${clip.sceneNumber} 자막 삽입 완료 (${tracks})`, clip: updated });
  } catch (err) { next(err); }
}

/**
 * 특정 클립 하나에만 나레이션 합성
 * POST /api/v1/video-clips/:id/add-narration
 */
export async function addNarrationToSingleClip(req: Request, res: Response, next: NextFunction) {
  try {
    const clip = await prisma.sceneVideoClip.findUnique({ where: { id: req.params.id } });
    if (!clip) return res.status(404).json({ error: "Clip not found" });
    if (clip.status !== "COMPLETED" || !clip.clipUrl) {
      return res.status(400).json({ error: "완료된 클립이 아닙니다" });
    }

    const episode = await prisma.episode.findUnique({ where: { id: clip.episodeId } });
    if (!episode?.narrationUrl) return res.status(400).json({ error: "먼저 나레이션을 생성하세요" });

    const narrationLocalPath = `/app${episode.narrationUrl}`;
    if (!fs.existsSync(narrationLocalPath)) {
      return res.status(400).json({ error: "나레이션 파일을 찾을 수 없습니다" });
    }

    // 같은 에피소드의 완료 클립 수로 씬 길이 계산
    const allClips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: clip.episodeId, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });
    const clipIndex = allClips.findIndex((c) => c.id === clip.id);
    const totalDuration = getMediaDuration(narrationLocalPath);
    const segmentDur = totalDuration / allClips.length;
    const segmentStart = clipIndex * segmentDur;

    const baseClipPath = clip.subClipUrl && fs.existsSync(`/app${clip.subClipUrl}`)
      ? `/app${clip.subClipUrl}`
      : `/app${clip.clipUrl}`;
    const narrOutputPath = path.join(path.dirname(`/app${clip.clipUrl}`), `scene_${clip.sceneNumber}_narr.mp4`);

    console.log(`[Narration] 씬 ${clip.sceneNumber}: ${segmentStart.toFixed(1)}s ~ ${(segmentStart + segmentDur).toFixed(1)}s`);
    await addNarrationSegmentToClip(baseClipPath, narrationLocalPath, segmentStart, segmentDur, narrOutputPath);

    const updated = await prisma.sceneVideoClip.update({
      where: { id: clip.id },
      data: { narrClipUrl: narrOutputPath.replace("/app", "") },
    });

    res.json({ message: `씬 ${clip.sceneNumber} 나레이션 합성 완료`, clip: updated });
  } catch (err) { next(err); }
}

/**
 * 씬 클립의 subClipUrl / narrClipUrl 초기화 (재처리 전 리셋)
 * POST /api/v1/episodes/:id/reset-clips
 */
export async function resetClipProcessing(req: Request, res: Response, next: NextFunction) {
  try {
    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
    });

    for (const clip of clips) {
      // 처리된 파일 삭제
      for (const url of [clip.subClipUrl, clip.narrClipUrl]) {
        if (!url) continue;
        const p = `/app${url}`;
        if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }

    await prisma.sceneVideoClip.updateMany({
      where: { episodeId: req.params.id, status: "COMPLETED" },
      data: { subClipUrl: null, narrClipUrl: null },
    });

    res.json({ message: `${clips.length}개 클립 초기화 완료 — 최종 영상 생성을 다시 실행하세요` });
  } catch (err) { next(err); }
}

/**
 * 씬 N의 완료된 클립(여러 개)을 하나로 이어 붙여 씬 단일 클립 생성
 * POST /api/v1/episodes/:id/merge-scene/:sceneNo
 *
 * 동작:
 *   1. 해당 씬의 COMPLETED 클립을 createdAt 순으로 조회
 *   2. narrClipUrl → subClipUrl → clipUrl 우선순위로 최선 버전 선택
 *   3. FFmpeg concat 으로 하나의 scene_N_scene.mp4 생성
 *   4. 가장 오래된 클립 레코드의 clipUrl 을 업데이트 (대표 레코드 유지)
 *   5. 나머지 클립 레코드는 DB 에서 제거
 */
export async function mergeSceneClips(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: episodeId, sceneNo } = req.params;
    const sceneNumber = parseInt(sceneNo, 10);
    if (isNaN(sceneNumber)) return res.status(400).json({ error: "sceneNo 는 숫자여야 합니다" });

    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId, sceneNumber, status: "COMPLETED" },
      orderBy: { createdAt: "asc" },
    });

    if (clips.length === 0) return res.status(400).json({ error: `씬 ${sceneNumber}에 완료된 클립이 없습니다` });
    if (clips.length === 1) {
      return res.json({
        message: `씬 ${sceneNumber}: 클립 1개 — 병합 불필요`,
        clip: clips[0],
        totalDurationSec: clips[0].durationSec,
      });
    }

    // 각 클립의 최선 파일 경로 선택
    const sourcePaths: string[] = [];
    for (const c of clips) {
      let p = "";
      if (c.narrClipUrl && fs.existsSync(`/app${c.narrClipUrl}`)) p = `/app${c.narrClipUrl}`;
      else if (c.subClipUrl && fs.existsSync(`/app${c.subClipUrl}`)) p = `/app${c.subClipUrl}`;
      else if (c.clipUrl && fs.existsSync(`/app${c.clipUrl}`)) p = `/app${c.clipUrl}`;
      else continue; // 파일 없으면 건너뜀
      sourcePaths.push(p);
    }

    if (sourcePaths.length === 0) return res.status(400).json({ error: "병합 가능한 파일이 없습니다" });

    // 출력 파일 경로: 첫 번째 클립과 같은 디렉터리에 저장
    const baseDir = path.dirname(`/app${clips[0].clipUrl}`);
    const outPath = path.join(baseDir, `scene_${String(sceneNumber).padStart(2, "0")}_merged.mp4`);

    console.log(`[MergeScene] 씬 ${sceneNumber}: ${sourcePaths.length}개 클립 병합 → ${outPath}`);
    await mergeVideoClips(sourcePaths, outPath);

    const totalDuration = sourcePaths.length; // 각 클립 8초 가정 — ffprobe로 정확히 계산
    const outRelPath = outPath.replace("/app", "");

    // 대표 레코드(첫 번째) 업데이트, 나머지 삭제
    const [representative, ...rest] = clips;
    await prisma.sceneVideoClip.update({
      where: { id: representative.id },
      data: {
        clipUrl: outRelPath,
        subClipUrl: null,
        narrClipUrl: null,
        durationSec: sourcePaths.length * 8, // 대략적인 총 길이
      },
    });
    if (rest.length > 0) {
      await prisma.sceneVideoClip.deleteMany({ where: { id: { in: rest.map((c) => c.id) } } });
    }

    const updated = await prisma.sceneVideoClip.findUnique({ where: { id: representative.id } });
    console.log(`[MergeScene] 씬 ${sceneNumber} 병합 완료: ${sourcePaths.length}개 → ${outRelPath}`);

    res.json({
      message: `씬 ${sceneNumber}: ${sourcePaths.length}개 클립 → 1개 병합 완료`,
      clip: updated,
      totalDurationSec: sourcePaths.length * 8,
      mergedPath: outRelPath,
    });
  } catch (err) { next(err); }
}

/**
 * 자막 삽입 → 나레이션 합성 → 최종 병합(+BGM)을 한 번에 실행
 * POST /api/v1/episodes/:id/produce-final  (SSE 스트림)
 */
export async function produceFinal(req: Request, res: Response, next: NextFunction) {
  // SSE 헤더
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (step: string, msg: string, done = false, error = "") => {
    res.write(`data: ${JSON.stringify({ step, msg, done, error })}\n\n`);
  };

  try {
    const episodeId = req.params.id;

    // ── 에피소드 / 클립 조회 ──────────────────────────────────
    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) { send("error", "Episode not found", true, "not_found"); res.end(); return; }

    const clips = await prisma.sceneVideoClip.findMany({
      where: { episodeId, status: "COMPLETED" },
      orderBy: { sceneNumber: "asc" },
    });
    if (clips.length === 0) { send("error", "완료된 클립이 없습니다", true, "no_clips"); res.end(); return; }

    // ── STEP 1: 자막 삽입 ────────────────────────────────────
    send("subtitle", `📝 자막 삽입 시작 (${clips.length}개 씬)`);

    const [srtKoRecord, srtHeRecord] = await Promise.all([
      prisma.generatedContent.findFirst({
        where: { episodeId, contentType: "SRT_KO" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.generatedContent.findFirst({
        where: { episodeId, contentType: "SRT_HE" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const updatedClips = [...clips];

    if (srtKoRecord) {
      const tracks = srtHeRecord ? "한국어+히브리어" : "한국어";
      send("subtitle", `  ${tracks} 자막 삽입 중...`);

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        if (!clip.clipUrl) continue;

        const koSrt = buildSceneSrt(srtKoRecord.content, clip.sceneNumber, clip.durationSec);
        if (!koSrt) continue;

        const heSrt = srtHeRecord
          ? buildSceneSrt(srtHeRecord.content, clip.sceneNumber, clip.durationSec) || undefined
          : undefined;

        const clipLocalPath = `/app${clip.clipUrl}`;
        const subOutputPath = path.join(path.dirname(clipLocalPath), `scene_${clip.sceneNumber}_sub.mp4`);

        send("subtitle", `  씬 ${clip.sceneNumber} (${heSrt ? "KO+HE" : "KO"}) 삽입 중...`);
        await embedSubtitleToClip(clipLocalPath, koSrt, subOutputPath, heSrt);

        const updated = await prisma.sceneVideoClip.update({
          where: { id: clip.id },
          data: { subClipUrl: subOutputPath.replace("/app", "") },
        });
        updatedClips[i] = updated as any;
      }
      send("subtitle", `✅ 자막 삽입 완료 (${tracks})`);
    } else {
      send("subtitle", `⚠️ SRT_KO 없음 — 자막 삽입 건너뜀`);
    }

    // ── STEP 2: 나레이션 합성 ────────────────────────────────
    send("narration", `🎙 나레이션 합성 시작`);

    const narrationLocalPath = episode.narrationUrl ? `/app${episode.narrationUrl}` : null;

    if (narrationLocalPath && fs.existsSync(narrationLocalPath)) {
      const totalDuration = getMediaDuration(narrationLocalPath);
      const segmentDur = totalDuration / clips.length;
      send("narration", `  나레이션 총 ${totalDuration.toFixed(1)}s → 씬당 ${segmentDur.toFixed(1)}s`);

      for (let i = 0; i < clips.length; i++) {
        const clip = updatedClips[i];
        if (!clip.clipUrl) continue;

        const baseClipPath = (clip as any).subClipUrl && fs.existsSync(`/app${(clip as any).subClipUrl}`)
          ? `/app${(clip as any).subClipUrl}`
          : `/app${clip.clipUrl}`;

        const segmentStart = i * segmentDur;
        const narrOutputPath = path.join(path.dirname(`/app${clip.clipUrl}`), `scene_${clip.sceneNumber}_narr.mp4`);

        send("narration", `  씬 ${clip.sceneNumber} 나레이션 합성 중...`);
        await addNarrationSegmentToClip(baseClipPath, narrationLocalPath, segmentStart, segmentDur, narrOutputPath);

        await prisma.sceneVideoClip.update({
          where: { id: clip.id },
          data: { narrClipUrl: narrOutputPath.replace("/app", "") },
        });
        (updatedClips[i] as any).narrClipUrl = narrOutputPath.replace("/app", "");
      }
      send("narration", `✅ 나레이션 합성 완료`);
    } else {
      send("narration", `⚠️ 나레이션 파일 없음 — 나레이션 합성 건너뜀`);
    }

    // ── STEP 3: 최종 병합 + BGM ──────────────────────────────
    send("merge", `🎬 최종 영상 병합 시작`);

    // 씬별 최신 클립 1개만 선택 (narrClipUrl 우선)
    const allFreshClips = await prisma.sceneVideoClip.findMany({
      where: { episodeId, status: "COMPLETED" },
      orderBy: [{ sceneNumber: "asc" }, { createdAt: "desc" }],
    });
    const freshSceneMap = new Map<number, typeof allFreshClips[0]>();
    for (const c of allFreshClips) {
      if (!freshSceneMap.has(c.sceneNumber)) freshSceneMap.set(c.sceneNumber, c);
      else if (!freshSceneMap.get(c.sceneNumber)!.narrClipUrl && c.narrClipUrl) freshSceneMap.set(c.sceneNumber, c);
    }
    const freshClips = Array.from(freshSceneMap.values()).sort((a, b) => a.sceneNumber - b.sceneNumber);

    const clipPaths = freshClips.map((c) => {
      if ((c as any).narrClipUrl && fs.existsSync(`/app${(c as any).narrClipUrl}`)) return `/app${(c as any).narrClipUrl}`;
      if ((c as any).subClipUrl && fs.existsSync(`/app${(c as any).subClipUrl}`)) return `/app${(c as any).subClipUrl}`;
      return `/app${c.clipUrl}`;
    });

    const finalPath = getFinalEpisodePath(episodeId);
    const bgmPath = await getEpisodeBgmPath(episodeId);
    const hasBgm = !!bgmPath;
    // SSE 요청은 GET이라 body가 없음 → query string으로 받음
    const bgmVolume = Math.min(1.0, Math.max(0.0, parseFloat((req.query.bgmVolume as string) ?? "0.10")));

    if (hasBgm) {
      const tempPath = finalPath.replace(".mp4", "_nobgm.mp4");
      send("merge", `  ${clipPaths.length}개 클립 병합 중...`);
      await mergeVideoClips(clipPaths, tempPath);
      const bgmLabel = bgmPath!.includes("gregorian") ? "그레고리안 성가" : "커스텀 BGM";
      send("merge", `  ${bgmLabel} 혼합 중... (볼륨 ${Math.round(bgmVolume * 100)}%)`);
      await mixWithBackgroundMusic(tempPath, bgmPath!, finalPath, bgmVolume);
      fs.unlinkSync(tempPath);
    } else {
      send("merge", `  ${clipPaths.length}개 클립 병합 중...`);
      await mergeVideoClips(clipPaths, finalPath);
    }

    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "COMPLETE" },
    });

    const outputUrl = finalPath.replace("/app", "");
    send("complete", `✅ 최종 영상 생성 완료${hasBgm ? " (BGM 포함)" : ""}`, true);
    res.write(`data: ${JSON.stringify({ step: "result", outputUrl, hasBgm, done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    send("error", err.message, true, err.message);
    res.end();
  }
}
