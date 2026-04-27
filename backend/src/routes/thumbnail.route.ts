import { Router } from "express";
import * as thumbnailController from "../controllers/thumbnail.controller";

const router = Router();

// 단일 썸네일 생성
router.post("/:id/generate/thumbnail", thumbnailController.generateSingleThumbnail);

// 다중 썸네일 변형 생성 (A/B 테스트용)
router.post("/:id/generate/thumbnails", thumbnailController.generateMultipleThumbnails);

// 에피소드의 썸네일 목록 조회
router.get("/:id/thumbnails", thumbnailController.getThumbnails);

export default router;