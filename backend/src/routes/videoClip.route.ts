import { Router } from "express";
import { getVideoStatus, deleteVideoClip, burnSubtitleToSingleClip, addNarrationToSingleClip } from "../controllers/video.controller";

const router = Router();
router.get("/:id/status", getVideoStatus);
router.delete("/:id", deleteVideoClip);
router.post("/:id/burn-subtitle", burnSubtitleToSingleClip);
router.post("/:id/add-narration", addNarrationToSingleClip);
export default router;
