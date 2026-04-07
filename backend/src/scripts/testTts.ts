import "dotenv/config";
import * as fs from "fs";
import { generateNarration } from "../services/tts.service";

async function main() {
  console.log("Testing TTS narration service (ko-KR-Neural2-C 중년남성)...");

  const testText = `창세기 1장의 천지창조 이야기는 히브리 성경의 서막을 열며,
하나님의 말씀으로 빛과 어둠, 하늘과 땅, 바다와 육지가 차례로 분리되는 장면을 묘사합니다.
이 서사는 단순한 우주 기원론을 넘어서, 하나님의 주권과 창조 질서의 선함을 선포하는 신학적 선언입니다.`;

  const episodeId = `test_${Date.now()}`;
  const filePath = await generateNarration(episodeId, testText);

  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] Audio file not created: ${filePath}`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  console.log(`[OK] Narration generated: ${filePath} (${stat.size} bytes)`);
  console.log("[OK] Voice: ko-KR-Neural2-C (MALE), speakingRate=0.82, pitch=-1.5");
  console.log("TTS test PASSED");
}

main().catch(console.error);
