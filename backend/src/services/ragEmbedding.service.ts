import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../config/database";

const EMBED_MODEL = "text-embedding-004"; // 768-dim, multilingual
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// ─── 임베딩 생성 ───────────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

function buildEmbedInput(koreanText: string, hebrewText: string): string {
  return `[한국어] ${koreanText}\n[히브리어] ${hebrewText}`;
}

// ─── 단일 구절 저장 (upsert + 임베딩) ────────────────────────────────────────
// 주의: Prisma DB 컬럼명은 camelCase (bookId, koreanText, hebrewText, createdAt)

export async function ingestVerse(
  bookId: number,
  chapter: number,
  verse: number,
  koreanText: string,
  hebrewText: string
): Promise<void> {
  // 1. 구절 upsert
  await prisma.$executeRawUnsafe(
    `INSERT INTO bible_verses (id, "bookId", chapter, verse, "koreanText", "hebrewText", "createdAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
     ON CONFLICT ("bookId", chapter, verse) DO UPDATE
       SET "koreanText" = EXCLUDED."koreanText",
           "hebrewText" = EXCLUDED."hebrewText"`,
    bookId, chapter, verse, koreanText, hebrewText
  );

  // 2. 임베딩 생성 및 저장
  const embedding = await embedText(buildEmbedInput(koreanText, hebrewText));
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE bible_verses
     SET embedding = $1::vector
     WHERE "bookId" = $2 AND chapter = $3 AND verse = $4`,
    vectorLiteral, bookId, chapter, verse
  );
}

// ─── 의미 기반 검색 ──────────────────────────────────────────────────────────

export interface VerseSearchResult {
  id: string;
  bookId: number;
  bookNameKo: string;
  bookNameHe: string;
  chapter: number;
  verse: number;
  koreanText: string;
  hebrewText: string;
  similarity: number;
}

export async function searchVerses(
  query: string,
  limit = 10,
  bookId?: number
): Promise<VerseSearchResult[]> {
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  const bookFilter = bookId ? `AND bv."bookId" = ${Number(bookId)}` : "";

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
       bv.id,
       bv."bookId",
       bb."nameKo"      AS "bookNameKo",
       bb."nameHe"      AS "bookNameHe",
       bv.chapter,
       bv.verse,
       bv."koreanText",
       bv."hebrewText",
       1 - (bv.embedding <=> $1::vector) AS similarity
     FROM bible_verses bv
     JOIN bible_books  bb ON bb.id = bv."bookId"
     WHERE bv.embedding IS NOT NULL
       ${bookFilter}
     ORDER BY bv.embedding <=> $1::vector
     LIMIT $2`,
    vectorLiteral,
    limit
  );

  return rows.map((r) => ({ ...r, similarity: parseFloat(r.similarity) }));
}

// ─── 상태 조회 ────────────────────────────────────────────────────────────────

export async function getIngestStatus(): Promise<{
  total: number;
  embedded: number;
}> {
  const [totalRow] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS count FROM bible_verses`
  );
  const [embeddedRow] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS count FROM bible_verses WHERE embedding IS NOT NULL`
  );
  return { total: Number(totalRow.count), embedded: Number(embeddedRow.count) };
}
