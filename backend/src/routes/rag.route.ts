import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import {
  searchVerses,
  ingestVerse,
  getIngestStatus,
  startBibleDownload,
  startEmbeddingGeneration,
  getDownloadProgress,
} from "../services/ragEmbedding.service";

const router = Router();

// GET /api/v1/rag/status — 임베딩 현황
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await getIngestStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/rag/search?q=text&limit=10&bookId=1 — 의미 기반 검색
router.get("/search", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q 파라미터 필수" });
    const limit = Math.min(parseInt(String(req.query.limit || "10")), 30);
    const bookId = req.query.bookId ? parseInt(String(req.query.bookId)) : undefined;
    const results = await searchVerses(q, limit, bookId);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/rag/ingest — 구절 배열 임베딩 저장
// body: { bookId, verses: [{chapter, verse, koreanText, hebrewText}] }
router.post("/ingest", async (req: Request, res: Response) => {
  try {
    const { bookId, verses } = req.body;
    if (!bookId || !Array.isArray(verses) || verses.length === 0) {
      return res.status(400).json({ error: "bookId, verses[] 필수" });
    }
    let count = 0;
    for (const v of verses) {
      await ingestVerse(bookId, v.chapter, v.verse, v.koreanText, v.hebrewText);
      count++;
    }
    res.json({ success: true, ingested: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/rag/ingest-file — data/bible/*.json 파일 일괄 임포트
router.post("/ingest-file", async (req: Request, res: Response) => {
  try {
    const filename = String(req.body.filename || "").replace(/[^a-zA-Z0-9._-]/g, "");
    const dataDir = path.join(__dirname, "../../data/bible");
    const files = filename
      ? [path.join(dataDir, filename)]
      : fs.readdirSync(dataDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(dataDir, f));

    let total = 0;
    const processed: string[] = [];

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      for (const v of data.verses) {
        await ingestVerse(data.bookId, v.chapter, v.verse, v.koreanText, v.hebrewText);
        total++;
      }
      processed.push(path.basename(filePath));
    }

    res.json({ success: true, ingested: total, files: processed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/rag/download — Sefaria에서 히브리어 성경 다운로드 (백그라운드)
router.post("/download", async (req: Request, res: Response) => {
  try {
    const bookId = req.body.bookId ? parseInt(String(req.body.bookId)) : undefined;
    const progress = getDownloadProgress();
    if (progress.running) {
      return res.json({ message: "이미 다운로드 중입니다.", progress });
    }
    startBibleDownload(bookId);
    res.json({ message: bookId ? `bookId=${bookId} 다운로드 시작` : "전체 히브리어 성경 다운로드 시작 (백그라운드)", started: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/rag/download/progress — 다운로드 진행 상황
router.get("/download/progress", (_req: Request, res: Response) => {
  res.json(getDownloadProgress());
});

// POST /api/v1/rag/embed — 저장된 구절 임베딩 생성 (백그라운드)
router.post("/embed", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.body.limit || "200")), 1000);
    const bookId = req.body.bookId ? parseInt(String(req.body.bookId)) : undefined;
    startEmbeddingGeneration(limit, bookId);
    res.json({ message: `${limit}절 임베딩 생성 시작 (백그라운드)`, started: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
