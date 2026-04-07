import { Router } from "express";
import { selectKeyframe, generateSingleKeyframe } from "../controllers/keyframe.controller";
import { startVideoGeneration } from "../controllers/video.controller";

const router = Router();
router.put("/:id/select", selectKeyframe);
router.post("/:id/generate-video", startVideoGeneration);
router.post("/:sceneNo/keyframe", generateSingleKeyframe); // /keyframes/:sceneNo/keyframe
export default router;
