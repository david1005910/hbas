import { Router } from "express";
import * as c from "../controllers/generate.controller";

const router = Router();

router.post("/:id/generate/script", c.generateScript);
router.post("/:id/generate/anim-prompt", c.generateAnimPrompt);
router.post("/:id/generate/srt", c.generateSrt);
router.post("/:id/generate/yt-meta", c.generateYtMeta);

export default router;
