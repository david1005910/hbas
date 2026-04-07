import "dotenv/config";
import { streamGenerate } from "../services/gemini.service";

async function main() {
  console.log("Testing Gemini streaming...");
  let output = "";
  for await (const chunk of streamGenerate("창세기 1장 1절을 한 문장으로 요약해주세요.")) {
    process.stdout.write(chunk);
    output += chunk;
  }
  console.log("\n\n[OK] Gemini streaming works. Length:", output.length);
}

main().catch(console.error);
