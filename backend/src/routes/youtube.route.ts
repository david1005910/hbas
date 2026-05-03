import { Router } from "express";
import * as youtubeController from "../controllers/youtube.controller";

const router = Router();

// YouTube 스킬 목록 조회
router.get("/skills", youtubeController.getYouTubeSkills);

// YouTube 스킬 처리
router.post("/analyze", youtubeController.processYouTubeSkill);

// YouTube 프로젝트 관련 (일반 응답)
router.post("/projects/content-ideas", youtubeController.generateContentIdeas);
router.post("/projects/script", youtubeController.generateLongFormScript);
router.post("/projects/trends", youtubeController.analyzeTopicTrends);

// YouTube 프로젝트 관련 (SSE 스트리밍)
router.post("/projects/content-ideas/stream", youtubeController.generateContentIdeasStream);
router.post("/projects/script/stream", youtubeController.generateLongFormScriptStream);
router.post("/projects/trends/stream", youtubeController.analyzeTopicTrendsStream);

export default router;