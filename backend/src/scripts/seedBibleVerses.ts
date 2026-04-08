/**
 * 히브리어 성경 구절 시드 스크립트
 * 실행: docker-compose exec backend npx ts-node src/scripts/seedBibleVerses.ts
 */
import "dotenv/config";
import { prisma } from "../config/database";
import verses from "../../prisma/seeds/bibleVerses.json";

async function main() {
  console.log("📖 히브리어 구절 시드 시작...");

  let created = 0;
  let skipped = 0;

  for (const v of verses) {
    const book = await prisma.bibleBook.findFirst({ where: { orderNo: v.bookOrderNo } });
    if (!book) {
      console.warn(`  ⚠️  bookOrderNo=${v.bookOrderNo} 책 없음, 건너뜀`);
      skipped++;
      continue;
    }

    await prisma.bibleVerse.upsert({
      where: { bookId_chapter_verse: { bookId: book.id, chapter: v.chapter, verse: v.verse } },
      update: { hebrewText: v.hebrewText, koreanText: v.koreanText, actorTag: v.actorTag ?? null },
      create: {
        bookId: book.id,
        chapter: v.chapter,
        verse: v.verse,
        hebrewText: v.hebrewText,
        koreanText: v.koreanText,
        actorTag: v.actorTag ?? null,
      },
    });
    console.log(`  ✅ ${book.nameKo} ${v.chapter}:${v.verse} — ${v.hebrewText.slice(0, 30)}...`);
    created++;
  }

  console.log(`\n완료: ${created}개 저장, ${skipped}개 건너뜀`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
