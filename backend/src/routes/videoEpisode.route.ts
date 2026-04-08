import { Router } from "express";
import { listVideoClips, mergeClips, mergeSceneClips, burnSubtitlesToClips, addNarrationToClips, produceFinal, resetClipProcessing } from "../controllers/video.controller";

const router = Router();
router.get("/:id/video-clips", listVideoClips);
router.post("/:id/merge-clips", mergeClips);
router.post("/:id/merge-scene/:sceneNo", mergeSceneClips);   // 씬 N의 클립들을 하나로 병합
router.post("/:id/burn-subtitles", burnSubtitlesToClips);
router.post("/:id/add-narration-to-clips", addNarrationToClips);
router.get("/:id/produce-final", produceFinal);
router.post("/:id/reset-clips", resetClipProcessing);
export default router;
