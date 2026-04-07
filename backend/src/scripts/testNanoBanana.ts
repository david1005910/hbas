import "dotenv/config";
import * as fs from "fs";
import { generateKeyframe } from "../services/nanoBanana.service";

async function main() {
  console.log("Testing Nano Banana image generation...");
  const prompt = "Moses standing before the burning bush, ancient desert landscape, dramatic lighting, Epic 3D Cinematic style, 16:9 composition, no text, no watermarks";
  const buffer = await generateKeyframe(prompt);
  const outPath = "/tmp/test_keyframe.png";
  fs.writeFileSync(outPath, buffer);
  console.log(`[OK] Image generated: ${buffer.length} bytes → ${outPath}`);
}

main().catch(console.error);
