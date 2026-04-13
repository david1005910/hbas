import { Router, Request, Response } from "express";
import fs from "fs";
import {
  writeProps,
  readProps,
  renderVideo,
  getOutputPath,
} from "../services/remotion.service";

const router = Router();

// GET /api/v1/remotion/props — 현재 data.json 반환
router.get("/props", (_req: Request, res: Response) => {
  const props = readProps();
  if (!props) return res.status(404).json({ error: "data.json 없음" });
  res.json(props);
});

// POST /api/v1/remotion/props — data.json 업데이트 (Remotion Studio 실시간 반영)
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

// POST /api/v1/remotion/render — 비디오 렌더링 시작
router.post("/render", async (_req: Request, res: Response) => {
  try {
    await renderVideo("out.mp4");
    res.json({ success: true, file: "out.mp4" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/remotion/download — 렌더링 결과 다운로드
router.get("/download", (req: Request, res: Response) => {
  const outputPath = getOutputPath("out.mp4");
  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ error: "렌더링된 파일이 없습니다. 먼저 렌더링을 실행하세요." });
  }
  res.download(outputPath, "hbas_video.mp4");
});

export default router;
