import { Router } from "express";
import * as c from "../controllers/episodes.controller";
import { downloadAll } from "../controllers/download.controller";

const router = Router();

router.post("/", c.createEpisode);
router.get("/:id", c.getEpisode);
router.put("/:id", c.updateEpisode);
router.delete("/:id", c.deleteEpisode);
router.get("/:id/download/all", downloadAll);

export default router;
