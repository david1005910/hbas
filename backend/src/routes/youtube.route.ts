import { Router } from "express";
import * as youtubeController from "../controllers/youtube.controller";

const router = Router();

// YouTube 스킬 목록 조회
router.get("/skills", youtubeController.getYouTubeSkills);

// YouTube 스킬 처리
router.post("/analyze", youtubeController.processYouTubeSkill);

export default router;