/**
 * 히브리어 성경 전체 다운로드 스크립트 (Sefaria API)
 * 실행: docker-compose exec backend npx ts-node src/scripts/downloadHebrewBible.ts
 *
 * 옵션:
 *   --embed   구절 저장 시 Gemini 임베딩도 함께 생성 (느림, API 제한 주의)
 *   --book N  특정 책 ID만 다운로드 (예: --book 1)
 */
import "dotenv/config";
import { prisma } from "../config/database";
import { ingestVerse, embedText } from "../services/ragEmbedding.service";

// Sefaria API 책 이름 매핑 (bible_books.id 순서)
const SEFARIA_BOOK_NAMES: Record<number, string> = {
  1:  "Genesis",
  2:  "Exodus",
  3:  "Leviticus",
  4:  "Numbers",
  5:  "Deuteronomy",
  6:  "Joshua",
  7:  "Judges",
  8:  "Ruth",
  9:  "I Samuel",
  10: "II Samuel",
  11: "I Kings",
  12: "II Kings",
  13: "I Chronicles",
  14: "II Chronicles",
  15: "Ezra",
  16: "Nehemiah",
  17: "Esther",
  18: "Job",
  19: "Psalms",
  20: "Proverbs",
  21: "Ecclesiastes",
  22: "Song of Songs",
  23: "Isaiah",
  24: "Jeremiah",
  25: "Lamentations",
  26: "Ezekiel",
  27: "Daniel",
  28: "Hosea",
  29: "Joel",
  30: "Amos",
  31: "Obadiah",
  32: "Jonah",
  33: "Micah",
  34: "Nahum",
  35: "Habakkuk",
  36: "Zephaniah",
  37: "Haggai",
  38: "Zechariah",
  39: "Malachi",
};

// 각 책의 장 수
const CHAPTER_COUNTS: Record<number, number> = {
  1: 50, 2: 40, 3: 27, 4: 36, 5: 34,
  6: 24, 7: 21, 8: 4, 9: 31, 10: 24,
  11: 22, 12: 25, 13: 29, 14: 36, 15: 10,
  16: 13, 17: 10, 18: 42, 19: 150, 20: 31,
  21: 12, 22: 8, 23: 66, 24: 52, 25: 5,
  26: 48, 27: 12, 28: 14, 29: 3, 30: 9,
  31: 1, 32: 4, 33: 7, 34: 3, 35: 3,
  36: 3, 37: 2, 38: 14, 39: 4,
};

/** Sefaria에서 특정 장의 히브리어 구절 배열 가져오기 */
async function fetchChapter(sefariaName: string, chapter: number): Promise<string[]> {
  const url = `https://www.sefaria.org/api/texts/${encodeURIComponent(sefariaName)}.${chapter}?language=he&context=0&commentary=0`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`    ⚠️  HTTP ${res.status} — ${sefariaName} ${chapter}`);
    return [];
  }
  const json = await res.json() as any;

  // Sefaria 응답: `he` 필드가 배열(단순 텍스트) 또는 중첩 배열(시편 등)
  let heArray: any = json.he ?? json.text;
  if (!Array.isArray(heArray)) return [];

  // 중첩 배열(예: 시편 — 한 절이 여러 줄) → 펼치기
  if (Array.isArray(heArray[0])) {
    heArray = heArray.map((sub: any[]) => sub.join(" "));
  }

  return (heArray as string[]).map((v: string) =>
    // HTML 태그 제거
    v.replace(/<[^>]*>/g, "").trim()
  ).filter(Boolean);
}

/** 1초 대기 헬퍼 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const withEmbed = args.includes("--embed");
  const bookFilter = args.includes("--book")
    ? parseInt(args[args.indexOf("--book") + 1], 10)
    : null;

  console.log(`📖 히브리어 성경 다운로드 시작 (embed=${withEmbed}, book=${bookFilter ?? "all"})`);

  const books = await prisma.bibleBook.findMany({ orderBy: { id: "asc" } });

  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const book of books) {
    if (bookFilter && book.id !== bookFilter) continue;

    const sefariaName = SEFARIA_BOOK_NAMES[book.id];
    if (!sefariaName) {
      console.warn(`  ⚠️  bookId=${book.id} (${book.nameKo}) Sefaria 이름 없음`);
      continue;
    }

    const totalChapters = CHAPTER_COUNTS[book.id] ?? 1;
    console.log(`\n📚 ${book.nameKo} (${sefariaName}) — ${totalChapters}장`);

    for (let ch = 1; ch <= totalChapters; ch++) {
      const verses = await fetchChapter(sefariaName, ch);
      if (verses.length === 0) {
        console.log(`    ${book.nameKo} ${ch}장 — 0절 (건너뜀)`);
        await sleep(300);
        continue;
      }

      for (let vi = 0; vi < verses.length; vi++) {
        const verseNo = vi + 1;
        const heText = verses[vi];
        if (!heText) continue;

        try {
          if (withEmbed) {
            // 임베딩 포함 저장 (Gemini API 호출 — 느림)
            await ingestVerse(book.id, ch, verseNo, "", heText);
            await sleep(200); // Gemini rate limit 대응
          } else {
            // 텍스트만 저장 (빠름)
            await prisma.$executeRawUnsafe(
              `INSERT INTO bible_verses (id, "bookId", chapter, verse, "koreanText", "hebrewText", "createdAt")
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
               ON CONFLICT ("bookId", chapter, verse) DO UPDATE
                 SET "hebrewText" = EXCLUDED."hebrewText"`,
              book.id, ch, verseNo, "", heText
            );
          }
          totalUpserted++;
        } catch (e: any) {
          console.warn(`    ⚠️  ${book.nameKo} ${ch}:${verseNo} 오류: ${e.message}`);
          totalSkipped++;
        }
      }

      process.stdout.write(`  ${book.nameKo} ${ch}/${totalChapters}장 (${verses.length}절) 완료\r`);
      await sleep(400); // Sefaria rate limit 대응
    }

    console.log(`\n  ✅ ${book.nameKo} 완료`);
  }

  console.log(`\n🎉 완료: ${totalUpserted}절 저장, ${totalSkipped}절 오류`);
  const status = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS embedded FROM bible_verses`
  );
  console.log(`📊 DB 상태: 전체 ${status[0].total}절, 임베딩 ${status[0].embedded}절`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
