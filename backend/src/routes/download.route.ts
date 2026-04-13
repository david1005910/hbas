import { Router } from "express";
import { downloadContent, updateContent } from "../controllers/download.controller";

const router = Router();
router.get("/:id/download", downloadContent);
router.patch("/:id", updateContent);
export default router;
