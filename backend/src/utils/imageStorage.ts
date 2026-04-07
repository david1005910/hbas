import * as fs from "fs";
import * as path from "path";

const KEYFRAME_BASE = process.env.KEYFRAME_STORAGE_PATH || "/app/storage/keyframes";
const VIDEO_BASE = process.env.VIDEO_STORAGE_PATH || "/app/storage/videos";

export function saveKeyframe(episodeId: string, sceneNumber: number, buffer: Buffer): string {
  const dir = path.join(KEYFRAME_BASE, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `scene_${String(sceneNumber).padStart(2, "0")}_${Date.now()}.png`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

export function getKeyframeWebPath(filePath: string): string {
  // Convert absolute storage path to web-accessible URL path
  return filePath.replace("/app", "");
}

export function saveVideo(episodeId: string, sceneNumber: number, buffer: Buffer): string {
  const dir = path.join(VIDEO_BASE, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `scene_${String(sceneNumber).padStart(2, "0")}_${Date.now()}.mp4`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

export function getFinalEpisodePath(episodeId: string): string {
  const dir = path.join(VIDEO_BASE, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "episode_final.mp4");
}
