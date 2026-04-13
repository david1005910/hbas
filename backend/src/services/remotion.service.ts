import { exec } from "child_process";
import fs from "fs";
import path from "path";

const PROJECT_PATH =
  process.env.REMOTION_PROJECT_PATH || "/app/remotion-project";

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
}

export function writeProps(props: RemotionProps): void {
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  const payload = {
    koreanText: props.koreanText,
    hebrewText: props.hebrewText,
    videoFileName: props.videoFileName || "background_video.mp4",
    audioFileName: props.audioFileName || "narration.mp3",
  };
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2), "utf-8");
}

export function readProps(): RemotionProps | null {
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  if (!fs.existsSync(dataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  } catch {
    return null;
  }
}

export function renderVideo(outputName = "out.mp4"): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = path.join(PROJECT_PATH, "node_modules", ".bin", "remotion");
    const output = path.join(PROJECT_PATH, outputName);
    const cmd = `"${bin}" render HelloWorld "${output}" --props="${path.join(PROJECT_PATH, "public", "data.json")}" --audio-codec=mp3`;
    exec(cmd, { cwd: PROJECT_PATH, timeout: 300_000 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(output);
    });
  });
}

export function getOutputPath(outputName = "out.mp4"): string {
  return path.join(PROJECT_PATH, outputName);
}
