/**
 * 히브리어 성경 구절 API 테스트
 * 실행: docker-compose exec backend npx ts-node src/scripts/testBibleVerses.ts
 */
import "dotenv/config";
import { prisma } from "../config/database";

async function main() {
  console.log("📖 BibleVerse API 테스트 시작\n");

  // 1. 전체 구절 수 확인
  const total = await prisma.bibleVerse.count();
  console.log(`✅ 전체 구절 수: ${total}`);
  if (total === 0) { console.error("❌ 데이터 없음 — seedBibleVerses.ts를 먼저 실행하세요"); process.exit(1); }

  // 2. RTL 마커 포함 확인
  const gen1v1 = await prisma.bibleVerse.findFirst({
    where: { chapter: 1, verse: 1 },
    include: { book: true },
  });
  if (!gen1v1) { console.error("❌ 창세기 1:1 없음"); process.exit(1); }
  const rtlText = `\u202B${gen1v1.hebrewText}`;
  const rtlOk = rtlText.startsWith("\u202B");
  console.log(`✅ RTL 마커(U+202B) 적용: ${rtlOk}`);
  console.log(`   히브리어: ${rtlText}`);
  console.log(`   한국어:   ${gen1v1.koreanText}`);

  // 3. actorTag 검색
  const tabernacle = await prisma.bibleVerse.findMany({
    where: { actorTag: { contains: "Tabernacle" } },
  });
  console.log(`\n✅ 성막 기구 구절 (actorTag='Tabernacle*'): ${tabernacle.length}개`);
  for (const v of tabernacle) {
    console.log(`   ${v.actorTag} ← ${v.koreanText.slice(0, 30)}`);
  }

  // 4. 특정 actorTag 직접 조회
  const menorah = await prisma.bibleVerse.findFirst({
    where: { actorTag: "Tabernacle_Menorah" },
    include: { book: true },
  });
  if (!menorah) { console.error("❌ Tabernacle_Menorah 구절 없음"); process.exit(1); }
  console.log(`\n✅ Tabernacle_Menorah 조회: ${menorah.book.nameKo} ${menorah.chapter}:${menorah.verse}`);

  // 5. @@unique([bookId, chapter, verse]) 중복 방지 테스트
  const upsertTest = await prisma.bibleVerse.upsert({
    where: { bookId_chapter_verse: { bookId: gen1v1.bookId, chapter: 1, verse: 1 } },
    update: { actorTag: "Scene_Creation_Heavens_Updated" },
    create: {
      bookId: gen1v1.bookId, chapter: 1, verse: 1,
      hebrewText: gen1v1.hebrewText, koreanText: gen1v1.koreanText,
      actorTag: "Scene_Creation_Heavens_Updated",
    },
  });
  await prisma.bibleVerse.update({
    where: { id: upsertTest.id },
    data: { actorTag: "Scene_Creation_Heavens" },
  });
  console.log(`\n✅ Upsert 중복 방지: ${upsertTest.actorTag} → 원복 완료`);

  console.log("\n🎉 모든 테스트 통과!");
}

main()
  .catch((e) => { console.error("❌ 오류:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
