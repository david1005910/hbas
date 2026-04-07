import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { mergeVideoClips, getMediaDuration } from "../services/ffmpeg.service";

async function main() {
  console.log("Testing FFmpeg merge service...");

  // 합칠 테스트 클립 경로 (실제 MP4 파일 필요)
  const clips = process.argv.slice(2);
  if (clips.length < 2) {
    console.log("Usage: npx ts-node src/scripts/testFFmpeg.ts clip1.mp4 clip2.mp4 [...]");
    console.log("Skipping merge test — no clips provided");

    // FFmpeg 설치 여부만 확인
    const { execSync } = await import("child_process");
    try {
      const version = execSync("ffmpeg -version").toString().split("\n")[0];
      console.log(`[OK] FFmpeg available: ${version}`);
      const probeVersion = execSync("ffprobe -version").toString().split("\n")[0];
      console.log(`[OK] FFprobe available: ${probeVersion}`);
    } catch (err) {
      console.error("[FAIL] FFmpeg not found:", err);
    }
    return;
  }

  for (const clip of clips) {
    if (!fs.existsSync(clip)) {
      console.error(`[FAIL] File not found: ${clip}`);
      process.exit(1);
    }
    const dur = getMediaDuration(clip);
    console.log(`[OK] ${path.basename(clip)}: ${dur.toFixed(2)}s`);
  }

  const outputPath = path.join(os.tmpdir(), `test_merge_${Date.now()}.mp4`);
  console.log(`Merging ${clips.length} clips → ${outputPath}`);
  await mergeVideoClips(clips, outputPath);

  const finalDur = getMediaDuration(outputPath);
  console.log(`[OK] Merged: ${finalDur.toFixed(2)}s → ${outputPath}`);
  console.log("FFmpeg merge test PASSED");
}

main().catch(console.error);
