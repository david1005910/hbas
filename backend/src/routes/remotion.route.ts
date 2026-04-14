import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  writeProps,
  readProps,
  readDurationInFrames,
  renderVideo,
  getRenderStatus,
  getDownloadUrl,
  sendKeyframeToStudio,
  generateNarrationForRemotionPublic,
  getEpisodeSubtitle,
  distributeHebrewForEpisode,
  PROJECT_PATH,
} from "../services/remotion.service";

// multer: Remotion public/ 에 직접 저장
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(PROJECT_PATH, "public");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // 원본 파일명 보존 (공백 → 언더스코어)
      cb(null, file.originalname.replace(/\s+/g, "_"));
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    if (/\.(mp4|webm|mov|avi|mkv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("동영상 파일만 업로드 가능합니다 (mp4/webm/mov/avi/mkv)"));
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
    const { koreanText, hebrewText, videoFileName, audioFileName, episodeId } =
      req.body;
    if (!koreanText || !hebrewText) {
      return res.status(400).json({ error: "koreanText, hebrewText 필수" });
    }
    writeProps({ koreanText, hebrewText, videoFileName, audioFileName, episodeId });
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

    const subtitlesJson = JSON.stringify(subtitles);

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

export default router;
