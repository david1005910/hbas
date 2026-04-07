import "dotenv/config";
import { generateSrtPack } from "../services/srt.service";
import { prisma } from "../config/database";

async function main() {
  console.log("Testing SRT generation service...");

  const episodeId = process.argv[2];
  if (!episodeId) {
    console.log("Usage: npx ts-node src/scripts/testSrt.ts <episodeId>");
    process.exit(1);
  }

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { bibleBook: true },
  });
  if (!episode) {
    console.error(`[FAIL] Episode not found: ${episodeId}`);
    process.exit(1);
  }

  const script = await prisma.generatedContent.findFirst({
    where: { episodeId, contentType: "SCRIPT" },
    orderBy: { createdAt: "desc" },
  });
  if (!script) {
    console.error("[FAIL] SCRIPT content not found — generate script first");
    process.exit(1);
  }

  console.log(`Generating SRT for episode: ${episode.titleKo}`);
  const srtPack = await generateSrtPack(episode, script.content);

  console.log(`[OK] SRT_KO (${srtPack.ko.length} chars):\n${srtPack.ko.slice(0, 200)}`);
  console.log(`[OK] SRT_HE (${srtPack.he.length} chars):\n${srtPack.he.slice(0, 200)}`);
  console.log("SRT generation test PASSED");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
