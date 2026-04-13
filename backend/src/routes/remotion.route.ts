import { Router, Request, Response } from "express";
import {
  writeProps,
  readProps,
  renderVideo,
  getRenderStatus,
  getDownloadUrl,
  sendKeyframeToStudio,
} from "../services/remotion.service";

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
