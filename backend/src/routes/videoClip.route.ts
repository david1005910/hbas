import { Router } from "express";
import { getVideoStatus, deleteVideoClip } from "../controllers/video.controller";

const router = Router();
router.get("/:id/status", getVideoStatus);
router.delete("/:id", deleteVideoClip);
export default router;
