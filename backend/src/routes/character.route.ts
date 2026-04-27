import { Router } from "express";
import * as c from "../controllers/character.controller";

const router = Router();

// 캐릭터 이미지 관리
router.get("/episodes/:episodeId/characters", c.getCharacterImages);
router.post("/episodes/:episodeId/characters", c.uploadCharacterImage, c.createCharacterImage);
router.put("/characters/:imageId", c.updateCharacterImage);
router.delete("/characters/:imageId", c.deleteCharacterImage);

// 캐릭터 이미지 파일 서빙
router.get("/characters/:episodeId/:filename", c.serveCharacterImage);

export default router;