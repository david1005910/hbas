import { Router } from "express";
import projectsRouter from "./projects.route";
import episodesRouter from "./episodes.route";
import generateRouter from "./generate.route";
import keyframeEpisodeRouter from "./keyframeEpisode.route";
import keyframeItemRouter from "./keyframeItem.route";
import videoEpisodeRouter from "./videoEpisode.route";
import videoClipRouter from "./videoClip.route";
import downloadRouter from "./download.route";
import bibleRouter from "./bible.route";
import bgmRouter from "./bgm.route";
import remotionRouter from "./remotion.route";
import ragRouter from "./rag.route";
import characterRouter from "./character.route";
import thumbnailRouter from "./thumbnail.route";

const router = Router();

router.use("/projects", projectsRouter);
router.use("/episodes", episodesRouter);
router.use("/episodes", generateRouter);
router.use("/episodes", keyframeEpisodeRouter);   // /episodes/:id/generate/keyframes, /episodes/:id/keyframes
router.use("/keyframes", keyframeItemRouter);      // /keyframes/:id/select, /keyframes/:id/generate-video
router.use("/video-clips", videoClipRouter);       // /video-clips/:id/status
router.use("/episodes", videoEpisodeRouter);       // /episodes/:id/video-clips, /episodes/:id/merge-clips
router.use("/contents", downloadRouter);
router.use("/bible", bibleRouter);
router.use("/episodes", bgmRouter);   // /episodes/:id/bgm
router.use("/remotion", remotionRouter); // /remotion/props, /remotion/render, /remotion/download
router.use("/rag", ragRouter);          // /rag/search, /rag/ingest, /rag/ingest-file, /rag/status
router.use("/", characterRouter);      // /episodes/:episodeId/characters, /characters/:imageId
router.use("/episodes", thumbnailRouter); // /episodes/:id/generate/thumbnail, /episodes/:id/thumbnails

router.get("/health", (_req, res) => res.json({ status: "ok" }));

export default router;
