/**
 * 저장된 구절에 Gemini 임베딩 생성 스크립트
 * 실행: docker-compose exec backend npx ts-node src/scripts/generateBibleEmbeddings.ts
 *
 * 옵션:
 *   --book N    특정 책 ID만 처리
 *   --limit N   처리 개수 제한 (기본: 500 — Gemini 무료 일일 한도 고려)
 *   --all       제한 없이 전체 처리 (주의: API 호출 비용 발생 가능)
 */
import "dotenv/config";
import { prisma } from "../config/database";
import { embedText } from "../services/ragEmbedding.service";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const bookFilter = args.includes("--book")
    ? parseInt(args[args.indexOf("--book") + 1], 10)
    : null;
  const limit = args.includes("--all")
    ? 999999
    : args.includes("--limit")
      ? parseInt(args[args.indexOf("--limit") + 1], 10)
      : 500;

  // 임베딩 없는 구절 조회
  const bookCondition = bookFilter ? `AND bv."bookId" = ${bookFilter}` : "";
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bv.id, bv."bookId", bv.chapter, bv.verse, bv."hebrewText", bv."koreanText",
            bb."nameKo"
     FROM bible_verses bv
     JOIN bible_books bb ON bb.id = bv."bookId"
     WHERE bv.embedding IS NULL
       AND bv."hebrewText" != ''
       ${bookCondition}
     ORDER BY bv."bookId", bv.chapter, bv.verse
     LIMIT ${limit}`
  );

  if (rows.length === 0) {
    console.log("✅ 모든 구절에 임베딩이 이미 생성되어 있습니다.");
    const status = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS embedded FROM bible_verses`
    );
    console.log(`📊 전체 ${status[0].total}절 / 임베딩 ${status[0].embedded}절`);
    return;
  }

  console.log(`🔢 임베딩 생성 시작: ${rows.length}절 (제한: ${limit === 999999 ? "없음" : limit})`);

  let done = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // 히브리어 + 한국어(있으면) 조합으로 임베딩 생성
      const input = row.koreanText
        ? `[히브리어] ${row.hebrewText}\n[한국어] ${row.koreanText}`
        : `[히브리어] ${row.hebrewText}`;

      const embedding = await embedText(input);
      const vectorLiteral = `[${embedding.join(",")}]`;

      await prisma.$executeRawUnsafe(
        `UPDATE bible_verses SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral, row.id
      );

      done++;
      if (done % 50 === 0) {
        console.log(`  ⚡ ${done}/${rows.length} — ${row.nameKo} ${row.chapter}:${row.verse}`);
      }

      await sleep(150); // Gemini rate limit: 약 7req/s 이내 유지
    } catch (e: any) {
      console.warn(`  ⚠️  ${row.nameKo} ${row.chapter}:${row.verse}: ${e.message}`);
      errors++;
      await sleep(1000); // 오류 시 1초 대기
    }
  }

  console.log(`\n✅ 완료: ${done}절 임베딩 생성, ${errors}절 오류`);
  const status = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS embedded FROM bible_verses`
  );
  console.log(`📊 DB 상태: 전체 ${status[0].total}절 / 임베딩 ${status[0].embedded}절`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
