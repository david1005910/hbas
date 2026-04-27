import { Request, Response, NextFunction } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../config/database";

// 캐릭터 이미지 저장 디렉토리
const CHARACTER_STORAGE = process.env.CHARACTER_STORAGE_PATH || "/app/storage/characters";

// 파일 저장 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const episodeId = req.params.episodeId;
    const dir = path.join(CHARACTER_STORAGE, episodeId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `character_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드 가능합니다.'));
    }
    cb(null, true);
  }
});

export const uploadCharacterImage = upload.single('image');

// 에피소드의 캐릭터 이미지 목록 조회
export async function getCharacterImages(req: Request, res: Response, next: NextFunction) {
  try {
    const { episodeId } = req.params;
    
    const images = await prisma.characterImage.findMany({
      where: { episodeId },
      orderBy: { orderIndex: 'asc' }
    });
    
    res.json({ images });
  } catch (err) {
    next(err);
  }
}

// 캐릭터 이미지 업로드
export async function createCharacterImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { episodeId } = req.params;
    const { name, description } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "이미지 파일이 필요합니다." });
    }
    
    // 에피소드 존재 확인
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId }
    });
    
    if (!episode) {
      return res.status(404).json({ error: "에피소드를 찾을 수 없습니다." });
    }
    
    // 현재 캐릭터 이미지 개수 확인 (최대 3개)
    const count = await prisma.characterImage.count({
      where: { episodeId }
    });
    
    if (count >= 3) {
      // 파일 삭제
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: "캐릭터 이미지는 최대 3개까지 업로드 가능합니다." });
    }
    
    // 이미지 URL 생성 (상대 경로)
    const imageUrl = `/characters/${episodeId}/${file.filename}`;
    
    const characterImage = await prisma.characterImage.create({
      data: {
        episodeId,
        name: name || `캐릭터 ${count + 1}`,
        description,
        imageUrl,
        orderIndex: count
      }
    });
    
    res.json({ 
      message: "캐릭터 이미지가 업로드되었습니다.",
      image: characterImage 
    });
  } catch (err) {
    next(err);
  }
}

// 캐릭터 이미지 수정
export async function updateCharacterImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { imageId } = req.params;
    const { name, description, orderIndex } = req.body;
    
    const characterImage = await prisma.characterImage.update({
      where: { id: imageId },
      data: {
        name: name || undefined,
        description: description || undefined,
        orderIndex: orderIndex !== undefined ? parseInt(orderIndex) : undefined
      }
    });
    
    res.json({ 
      message: "캐릭터 이미지가 수정되었습니다.",
      image: characterImage 
    });
  } catch (err) {
    next(err);
  }
}

// 캐릭터 이미지 삭제
export async function deleteCharacterImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { imageId } = req.params;
    
    const characterImage = await prisma.characterImage.findUnique({
      where: { id: imageId }
    });
    
    if (!characterImage) {
      return res.status(404).json({ error: "캐릭터 이미지를 찾을 수 없습니다." });
    }
    
    // 파일 삭제
    const filePath = path.join(CHARACTER_STORAGE, characterImage.episodeId, path.basename(characterImage.imageUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    await prisma.characterImage.delete({
      where: { id: imageId }
    });
    
    res.json({ message: "캐릭터 이미지가 삭제되었습니다." });
  } catch (err) {
    next(err);
  }
}

// 캐릭터 이미지 파일 서빙
export async function serveCharacterImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { episodeId, filename } = req.params;
    const filePath = path.join(CHARACTER_STORAGE, episodeId, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "이미지를 찾을 수 없습니다." });
    }
    
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}