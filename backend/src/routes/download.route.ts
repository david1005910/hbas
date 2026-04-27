import { Router } from "express";
import { downloadContent, updateContent, getContent } from "../controllers/download.controller";

const router = Router();
router.get("/:id", getContent);
router.get("/:id/download", downloadContent);
router.patch("/:id", updateContent);
export default router;
