import { Router } from "express";
import { getVideoStatus } from "../controllers/video.controller";

const router = Router();
router.get("/:id/status", getVideoStatus);
export default router;
