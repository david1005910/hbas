import { Router } from "express";
import { generateEpisodeKeyframes, listKeyframes } from "../controllers/keyframe.controller";

const router = Router();
router.post("/:id/generate/keyframes", generateEpisodeKeyframes);
router.get("/:id/keyframes", listKeyframes);
export default router;
