import { Router } from "express";
import { listVideoClips, mergeClips } from "../controllers/video.controller";

const router = Router();
router.get("/:id/video-clips", listVideoClips);
router.post("/:id/merge-clips", mergeClips);
export default router;
