import { Router } from "express";
import { downloadContent } from "../controllers/download.controller";

const router = Router();
router.get("/:id/download", downloadContent);
export default router;
