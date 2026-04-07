import "dotenv/config";
import * as fs from "fs";
import { startVideoGeneration, pollVideoStatus } from "../services/veo.service";

async function main() {
  console.log("Testing Veo 3.1 video generation...");

  // 테스트용 임시 이미지 필요 — testNanaBanana.ts 실행 후 생성된 파일 사용
  const imagePath = "/tmp/test_keyframe.png";
  if (!fs.existsSync(imagePath)) {
    console.error("먼저 testNanaBanana.ts를 실행해 /tmp/test_keyframe.png를 생성하세요");
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const jobId = await startVideoGeneration(imageBuffer, "Slow cinematic pan, gentle ambient motion", 4);
  console.log("[OK] Veo job started:", jobId);

  console.log("Polling status (30s interval, up to 3 attempts)...");
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 30000));
    const result = await pollVideoStatus(jobId);
    console.log(`Poll ${i + 1}:`, result.status);
    if (result.status === "completed") {
      console.log("[OK] Video completed:", result.videoGcsUri);
      break;
    }
    if (result.status === "failed") {
      console.error("[FAIL] Video generation failed");
      break;
    }
  }
}

main().catch(console.error);
