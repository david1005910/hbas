import { Router } from "express";
import * as c from "../controllers/projects.controller";

const router = Router();

router.get("/", c.listProjects);
router.post("/", c.createProject);
router.get("/:id", c.getProject);
router.put("/:id", c.updateProject);
router.delete("/:id", c.deleteProject);
router.get("/:id/episodes", c.listProjectEpisodes);

export default router;
