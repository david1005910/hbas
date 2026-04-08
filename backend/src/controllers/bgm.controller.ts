import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import { prisma } from "../config/database";

const BGM_BASE = "/app/storage/bgm";

// multer: 에피소드 ID별 디렉터리에 저장
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(BGM_BASE, { recursive: true });
    cb(null, BGM_BASE);
  },
  filename: (req, file, cb) => {
    // 에피소드 ID를 접두사로 붙여 구분
    const episodeId = req.params.id;
    const ext = path.extname(file.originalname).toLowerCase() || ".mp3";
    cb(null, `bgm_${episodeId}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/x-m4a"];
  if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|aac|flac|m4a)$/i)) {
    cb(null, true);
  } else {
    cb(new Error("오디오 파일(mp3, wav, ogg, aac, flac, m4a)만 업로드 가능합니다"));
  }
};

export const bgmUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * BGM 파일 업로드
 * POST /api/v1/episodes/:id/bgm
 * Content-Type: multipart/form-data  (field: bgm)
 */
export async function uploadBgm(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return res.status(400).json({ error: "bgm 필드로 오디오 파일을 첨부해주세요" });

    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "에피소드를 찾을 수 없습니다" });
    }

    // 기존 BGM 파일 삭제 (기본 gregorian.mp3 는 삭제하지 않음)
    if (episode.bgmUrl) {
      const old = `/app${episode.bgmUrl}`;
      if (fs.existsSync(old) && !old.includes("gregorian")) {
        try { fs.unlinkSync(old); } catch { /* 무시 */ }
      }
    }

    const bgmUrl = req.file.path.replace("/app", "");
    const updated = await prisma.episode.update({
      where: { id: req.params.id },
      data: { bgmUrl },
    });

    console.log(`[BGM] 업로드 완료: episodeId=${req.params.id}, file=${req.file.filename}, size=${req.file.size}bytes`);
    res.json({
      message: "BGM 업로드 완료",
      bgmUrl: updated.bgmUrl,
      filename: req.file.originalname,
      sizeKb: Math.round(req.file.size / 1024),
    });
  } catch (err) { next(err); }
}

/**
 * BGM 정보 조회
 * GET /api/v1/episodes/:id/bgm
 */
export async function getBgmInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      select: { bgmUrl: true },
    });
    if (!episode) return res.status(404).json({ error: "Not found" });

    const defaultBgm = process.env.BGM_PATH || "/app/storage/bgm/gregorian.mp3";
    const activePath = episode.bgmUrl ? `/app${episode.bgmUrl}` : defaultBgm;
    const exists = fs.existsSync(activePath);

    res.json({
      bgmUrl: episode.bgmUrl ?? null,
      isCustom: !!episode.bgmUrl,
      defaultBgmExists: fs.existsSync(defaultBgm),
      activeFileExists: exists,
      activeFileSizeKb: exists ? Math.round(fs.statSync(activePath).size / 1024) : null,
    });
  } catch (err) { next(err); }
}

/**
 * BGM 삭제 (기본 BGM으로 되돌림)
 * DELETE /api/v1/episodes/:id/bgm
 */
export async function deleteBgm(req: Request, res: Response, next: NextFunction) {
  try {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: "Not found" });

    if (episode.bgmUrl) {
      const filePath = `/app${episode.bgmUrl}`;
      if (fs.existsSync(filePath) && !filePath.includes("gregorian")) {
        try { fs.unlinkSync(filePath); } catch { /* 무시 */ }
      }
      await prisma.episode.update({ where: { id: req.params.id }, data: { bgmUrl: null } });
    }

    res.json({ message: "BGM 삭제 완료 — 기본 그레고리안 성가로 되돌림" });
  } catch (err) { next(err); }
}
