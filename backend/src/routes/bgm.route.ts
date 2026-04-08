import { Router } from "express";
import { bgmUpload, uploadBgm, getBgmInfo, deleteBgm } from "../controllers/bgm.controller";

const router = Router();
router.get("/:id/bgm", getBgmInfo);
router.post("/:id/bgm", bgmUpload.single("bgm"), uploadBgm);
router.delete("/:id/bgm", deleteBgm);
export default router;
