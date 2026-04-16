import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  writeProps,
  readProps,
  readDurationInFrames,
  readCurrentSubtitlesJson,
  renderVideo,
  getRenderStatus,
  getDownloadUrl,
  sendKeyframeToStudio,
  generateNarrationForRemotionPublic,
  generateEnglishNarrationForRemotionPublic,
  getEpisodeSubtitle,
  distributeHebrewForEpisode,
  distributeEnglishForEpisode,
  extractAllEnglishNarration,
  PROJECT_PATH,
} from "../services/remotion.service";
import {
  loadReplacements,
  saveReplacements,
  applyWordReplacements,
  WordReplacement,
} from "../services/wordReplacement.service";
import {
  getElevenLabsVoices,
  generateElevenLabsTTS,
  getElevenLabsUserInfo,
} from "../services/elevenlabs.service";
import { studioChat } from "../services/studioChat.service";
import { prisma } from "../config/database";
import { getMediaDuration } from "../services/ffmpeg.service";

// multer 공통 storage (Remotion public/ 에 직접 저장)
const publicStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(PROJECT_PATH, "public");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // 원본 파일명 보존 (공백 → 언더스코어)
    cb(null, file.originalname.replace(/\s+/g, "_"));
  },
});

// multer: 배경 동영상 업로드
const videoUpload = multer({
  storage: publicStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    if (/\.(mp4|webm|mov|avi|mkv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("동영상 파일만 업로드 가능합니다 (mp4/webm/mov/avi/mkv)"));
  },
});

// multer: 나레이션 오디오 업로드
const audioUpload = multer({
  storage: publicStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    if (/\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("오디오 파일만 업로드 가능합니다 (mp3/wav/aac/m4a/ogg/flac)"));
  },
});

const router = Router();

// GET /api/v1/remotion/props
router.get("/props", (_req: Request, res: Response) => {
  const props = readProps();
  if (!props) return res.status(404).json({ error: "data.json 없음" });
  res.json(props);
});

// POST /api/v1/remotion/props — data.json 업데이트
router.post("/props", (req: Request, res: Response) => {
  try {
    const { koreanText, hebrewText, englishText, language, videoFileName, audioFileName, episodeId } =
      req.body;
    if (!koreanText || !hebrewText) {
      return res.status(400).json({ error: "koreanText, hebrewText 필수" });
    }
    const subtitlesJson = readCurrentSubtitlesJson();
    const currentDuration = readDurationInFrames();
    writeProps(
      { koreanText, hebrewText, englishText, language, videoFileName, audioFileName, episodeId, subtitlesJson },
      currentDuration
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/render — 렌더링 시작 (비동기)
router.post("/render", async (_req: Request, res: Response) => {
  try {
    await renderVideo();
    res.json({ accepted: true, message: "렌더링 시작됨. /render/status로 진행 확인" });
  } catch (err: any) {
    res.status(500).json({ error: `렌더 서버 연결 실패: ${err.message}` });
  }
});

// GET /api/v1/remotion/render/status — 렌더 진행 상태
router.get("/render/status", async (_req: Request, res: Response) => {
  try {
    const status = await getRenderStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/download-url — 다운로드 URL 반환
router.get("/download-url", (_req: Request, res: Response) => {
  res.json({ url: getDownloadUrl() });
});

// POST /api/v1/remotion/upload-video — 배경 동영상 업로드 → public/ 에 저장
router.post("/upload-video", videoUpload.single("video"), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
    res.json({ success: true, fileName: req.file.filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/videos — public/ 내 동영상 목록
router.get("/videos", (_req: Request, res: Response) => {
  try {
    const dir = path.join(PROJECT_PATH, "public");
    if (!fs.existsSync(dir)) return res.json({ files: [] });
    const files = fs.readdirSync(dir).filter((f) => /\.(mp4|webm|mov|avi|mkv)$/i.test(f));
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/audios — public/ 내 오디오 파일 목록
router.get("/audios", (_req: Request, res: Response) => {
  try {
    const dir = path.join(PROJECT_PATH, "public");
    if (!fs.existsSync(dir)) return res.json({ files: [] });
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(f))
      .sort((a, b) => {
        // narration.mp3 항상 첫 번째
        if (a === "narration.mp3") return -1;
        if (b === "narration.mp3") return 1;
        return a.localeCompare(b);
      });
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/upload-audio — 나레이션 오디오 업로드 → public/ 에 저장 (원본 파일명 유지)
router.post("/upload-audio", audioUpload.single("audio"), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
    // multer publicStorage가 이미 원본 파일명으로 저장했으므로 그대로 사용
    const savedFileName = req.file.filename;
    console.log(`[Audio Upload] 저장 완료: ${savedFileName}`);
    res.json({ success: true, fileName: savedFileName, originalName: req.file.originalname });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/generate-narration — 한국어 나레이션 TTS 생성 → public/narration.mp3
router.post("/generate-narration", async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.body;
    if (!episodeId) return res.status(400).json({ error: "episodeId 필수" });
    const result = await generateNarrationForRemotionPublic(episodeId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/generate-narration-en — 영어 나레이션 TTS 생성 → public/narration_en.mp3
router.post("/generate-narration-en", async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.body;
    if (!episodeId) return res.status(400).json({ error: "episodeId 필수" });
    const result = await generateEnglishNarrationForRemotionPublic(episodeId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/episode-subtitle/:episodeId — 에피소드 자막 텍스트 추출
router.get("/episode-subtitle/:episodeId", async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const texts = await getEpisodeSubtitle(episodeId);
    res.json(texts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/subtitles — 현재 subtitles.json 읽기
router.get("/subtitles", (_req: Request, res: Response) => {
  try {
    const filePath = path.join(PROJECT_PATH, "public", "subtitles.json");
    if (!fs.existsSync(filePath)) return res.json({ subtitles: [] });
    const subtitles = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json({ subtitles: Array.isArray(subtitles) ? subtitles : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/subtitles — 자막 편집 후 저장 → Root.tsx + subtitles.json 업데이트
router.post("/subtitles", (req: Request, res: Response) => {
  try {
    const { subtitles } = req.body;
    if (!Array.isArray(subtitles)) return res.status(400).json({ error: "subtitles 배열 필수" });

    // 한국어 자막 텍스트에 단어 치환 적용 (저장 전)
    const applied = subtitles.map((s: any) => ({
      ...s,
      text: typeof s.text === "string" ? applyWordReplacements(s.text) : s.text,
    }));

    const subtitlesJson = JSON.stringify(applied);

    // subtitles.json 파일 저장
    const filePath = path.join(PROJECT_PATH, "public", "subtitles.json");
    fs.writeFileSync(filePath, subtitlesJson, "utf-8");

    // 현재 props에 subtitlesJson 병합 → Root.tsx 업데이트 (기존 duration 유지)
    const current = readProps();
    const currentDuration = readDurationInFrames();
    writeProps(
      { ...(current ?? { koreanText: "", hebrewText: "" }), subtitlesJson },
      currentDuration
    );

    res.json({ success: true, count: subtitles.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/subtitles/auto-hebrew — 기존 자막에 히브리어 자동 배분
router.post("/subtitles/auto-hebrew", async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.body;
    if (!episodeId) return res.status(400).json({ error: "episodeId 필수" });
    const subtitles = await distributeHebrewForEpisode(episodeId);
    res.json({ subtitles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/subtitles/auto-english — 기존 자막에 영어(SRT_EN) 자동 배분
router.post("/subtitles/auto-english", async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.body;
    if (!episodeId) return res.status(400).json({ error: "episodeId 필수" });
    const subtitles = await distributeEnglishForEpisode(episodeId);
    res.json({ subtitles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/send-keyframe — 키프레임을 스튜디오로 전송
router.post("/send-keyframe", async (req: Request, res: Response) => {
  try {
    const { keyframeId } = req.body;
    if (!keyframeId) return res.status(400).json({ error: "keyframeId 필수" });
    const props = await sendKeyframeToStudio(keyframeId);
    res.json({ success: true, props });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/word-replacements — 단어 치환 규칙 목록
router.get("/word-replacements", (_req: Request, res: Response) => {
  try {
    res.json({ replacements: loadReplacements() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/remotion/word-replacements — 단어 치환 규칙 저장
router.post("/word-replacements", (req: Request, res: Response) => {
  try {
    const { replacements } = req.body;
    if (!Array.isArray(replacements)) {
      return res.status(400).json({ error: "replacements 배열 필수" });
    }
    // from이 비어 있는 규칙 제거
    const valid = (replacements as WordReplacement[]).filter((r) => r.from?.trim());
    saveReplacements(valid);
    console.log(`[WordRepl] ${valid.length}개 규칙 저장 완료`);
    res.json({ success: true, count: valid.length });
  } catch (err: any) {
    console.error("[WordRepl] 저장 실패:", err.message);
    res.status(500).json({ error: `저장 실패: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────
// ElevenLabs TTS 통합
// ─────────────────────────────────────────────────────────────────

// GET /api/v1/remotion/elevenlabs/voices — 음성 목록 조회
router.get("/elevenlabs/voices", async (_req: Request, res: Response) => {
  try {
    const voices = await getElevenLabsVoices();
    res.json({ voices });
  } catch (err: any) {
    const msg = err.message ?? String(err);
    const statusCode = msg.includes("API_KEY") ? 400 : 500;
    res.status(statusCode).json({ error: msg });
  }
});

// GET /api/v1/remotion/elevenlabs/user — 크레딧 잔량 확인 및 API 키 검증
router.get("/elevenlabs/user", async (_req: Request, res: Response) => {
  try {
    const info = await getElevenLabsUserInfo();
    res.json(info);
  } catch (err: any) {
    const msg = err.message ?? String(err);
    res.status(400).json({ error: msg });
  }
});

// POST /api/v1/remotion/elevenlabs/generate — ElevenLabs TTS 생성 → public/narration.mp3
router.post("/elevenlabs/generate", async (req: Request, res: Response) => {
  try {
    const { episodeId, voiceId, modelId, stability, similarityBoost, style, language } = req.body;
    const lang: "ko" | "en" = language === "en" ? "en" : "ko";
    if (!episodeId) return res.status(400).json({ error: "episodeId 필수" });
    if (!voiceId)   return res.status(400).json({ error: "voiceId 필수" });

    // 에피소드 텍스트 추출 (SCRIPT 나레이션 → SRT_KO 순)
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { contents: { orderBy: { createdAt: "desc" } } },
    });
    if (!episode) return res.status(404).json({ error: "에피소드를 찾을 수 없습니다" });

    let narrationText = "";

    if (lang === "en") {
      // 영어: SRT_EN → SCRIPT Narration(EN)
      const srtEn = episode.contents.find((c) => c.contentType === "SRT_EN");
      if (srtEn?.content) {
        narrationText = srtEn.content
          .replace(/^\uFEFF/, "")
          .split(/\n\s*\n/)
          .map((block) => {
            const lines = block.trim().split("\n").filter(Boolean);
            return lines.filter((l) => !/^\d+$/.test(l.trim()) && !/^\d{2}:\d{2}:\d{2}/.test(l.trim())).join(" ");
          })
          .filter(Boolean)
          .join(" ");
      }
      if (!narrationText) {
        const script = episode.contents.find((c) => c.contentType === "SCRIPT");
        if (script?.content) narrationText = extractAllEnglishNarration(script.content);
      }
    } else {
      // 한국어: SCRIPT Narration(KO) → SRT_KO
      const script = episode.contents.find((c) => c.contentType === "SCRIPT");
      if (script?.content) {
        narrationText = script.content
          .split("\n")
          .filter((l) => {
            const t = l.trim();
            return t && !/^\*{0,3}(씬|Scene)\s*\d/i.test(t) && !/^\d{2}:\d{2}/.test(t) && !/^(에피소드|제목|Title)/i.test(t);
          })
          .map((l) => l.replace(/^\*{1,3}(나레이션|내레이션|해설)\s*[:：]\s*/i, "").replace(/\*{1,3}/g, "").trim())
          .filter(Boolean)
          .join(" ");
      }
      if (!narrationText) {
        const srtKo = episode.contents.find((c) => c.contentType === "SRT_KO");
        if (srtKo?.content) {
          narrationText = srtKo.content
            .replace(/^\uFEFF/, "")
            .split(/\n\s*\n/)
            .map((block) => {
              const lines = block.trim().split("\n").filter(Boolean);
              return lines.filter((l) => !/^\d+$/.test(l.trim()) && !/^\d{2}:\d{2}:\d{2}/.test(l.trim())).join(" ");
            })
            .filter(Boolean)
            .join(" ");
        }
      }
      if (!narrationText) narrationText = episode.titleKo;
    }
    if (!narrationText) return res.status(400).json({ error: "나레이션 텍스트가 없습니다. SCRIPT 또는 SRT_KO를 먼저 생성하세요." });

    // 단어 치환 적용
    narrationText = applyWordReplacements(narrationText);
    console.log(`[ElevenLabs] 텍스트 준비 완료 (${narrationText.length}자): "${narrationText.slice(0, 60)}..."`);

    // TTS 생성 → public/ 에 저장 (타임스탬프 포함 고유 파일명)
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const safeTitle = (episode.titleKo ?? "narration").replace(/[^가-힣a-zA-Z0-9]/g, "_").slice(0, 20);
    const generatedFileName = `el_${lang}_${safeTitle}_${ts}.mp3`;
    const destPath = path.join(PROJECT_PATH, "public", generatedFileName);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    await generateElevenLabsTTS(narrationText, voiceId, destPath, {
      modelId,
      stability:       stability       !== undefined ? Number(stability)       : undefined,
      similarityBoost: similarityBoost !== undefined ? Number(similarityBoost) : undefined,
      style:           style           !== undefined ? Number(style)           : undefined,
    });

    // narration.mp3 도 교체 (현재 재생되는 파일)
    const narrationPath = path.join(PROJECT_PATH, "public", "narration.mp3");
    fs.copyFileSync(destPath, narrationPath);

    const durationSec = getMediaDuration(destPath);
    const durationInFrames = Math.ceil((durationSec + 1) * 30);

    res.json({
      success: true,
      fileName: generatedFileName,
      durationSec: Math.round(durationSec * 10) / 10,
      durationInFrames,
      textLength: narrationText.length,
    });
  } catch (err: any) {
    console.error("[ElevenLabs] 생성 실패:", err.message);
    const detail = err.response?.data
      ? ` (${JSON.stringify(err.response.data).slice(0, 120)})`
      : "";
    res.status(500).json({ error: `ElevenLabs TTS 실패: ${err.message}${detail}` });
  }
});

// ─────────────────────────────────────────────────────────────────
// AI 채팅 — VideoStudio 명령어 인터페이스
// ─────────────────────────────────────────────────────────────────

// POST /api/v1/remotion/chat — AI 채팅으로 비디오 편집 명령
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, context, history } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message 필수" });

    const result = await studioChat(message, context ?? {}, history ?? []);

    // action인 경우 props도 data.json에 자동 반영
    if (result.type === "action" && result.props) {
      const current = readProps();
      const currentDuration = readDurationInFrames();
      const subtitlesJson = readCurrentSubtitlesJson();
      writeProps(
        {
          koreanText:    result.props.koreanText    ?? current?.koreanText    ?? "",
          hebrewText:    result.props.hebrewText    ?? current?.hebrewText    ?? "",
          englishText:   result.props.englishText   ?? current?.englishText   ?? "",
          language:      (result.props.language as "ko" | "en") ?? current?.language ?? "ko",
          videoFileName: result.props.videoFileName ?? current?.videoFileName ?? "",
          audioFileName: result.props.audioFileName ?? current?.audioFileName ?? "narration.mp3",
          episodeId:     current?.episodeId,
          subtitlesJson,
        },
        currentDuration
      );
    }

    res.json(result);
  } catch (err: any) {
    console.error("[StudioChat] 오류:", err.message);
    res.status(500).json({ error: `AI 채팅 오류: ${err.message}` });
  }
});

export default router;
