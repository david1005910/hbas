import "dotenv/config";
import { generateYtMetaPack } from "../services/ytMeta.service";
import { prisma } from "../config/database";

async function main() {
  console.log("Testing YT Meta generation service...");

  const episodeId = process.argv[2];
  if (!episodeId) {
    console.log("Usage: npx ts-node src/scripts/testYtMeta.ts <episodeId>");
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

  console.log(`Generating YT Meta for episode: ${episode.titleKo}`);
  const meta = await generateYtMetaPack(episode, script.content);

  console.log(`[OK] YT Meta (${meta.length} chars):\n${meta.slice(0, 400)}`);
  console.log("YT Meta generation test PASSED");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
