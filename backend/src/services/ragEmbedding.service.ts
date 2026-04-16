import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../config/database";

const EMBED_MODEL = "text-embedding-004"; // 768-dim, multilingual
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!, {
  apiVersion: "v1",
});

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

// ─── Sefaria API에서 히브리어 성경 다운로드 ────────────────────────────────────

const SEFARIA_BOOK_MAP: Record<number, string> = {
  1:"Genesis",2:"Exodus",3:"Leviticus",4:"Numbers",5:"Deuteronomy",
  6:"Joshua",7:"Judges",8:"Ruth",9:"I Samuel",10:"II Samuel",
  11:"I Kings",12:"II Kings",13:"I Chronicles",14:"II Chronicles",
  15:"Ezra",16:"Nehemiah",17:"Esther",18:"Job",19:"Psalms",
  20:"Proverbs",21:"Ecclesiastes",22:"Song of Songs",23:"Isaiah",
  24:"Jeremiah",25:"Lamentations",26:"Ezekiel",27:"Daniel",
  28:"Hosea",29:"Joel",30:"Amos",31:"Obadiah",32:"Jonah",
  33:"Micah",34:"Nahum",35:"Habakkuk",36:"Zephaniah",
  37:"Haggai",38:"Zechariah",39:"Malachi",
};

const CHAPTER_COUNTS: Record<number, number> = {
  1:50,2:40,3:27,4:36,5:34,6:24,7:21,8:4,9:31,10:24,
  11:22,12:25,13:29,14:36,15:10,16:13,17:10,18:42,19:150,20:31,
  21:12,22:8,23:66,24:52,25:5,26:48,27:12,28:14,29:3,30:9,
  31:1,32:4,33:7,34:3,35:3,36:3,37:2,38:14,39:4,
};

// 진행 상태 (인메모리)
let downloadProgress: { running: boolean; done: number; total: number; current: string } = {
  running: false, done: 0, total: 0, current: "",
};

export function getDownloadProgress() { return { ...downloadProgress }; }

async function sefariaFetchChapter(sefariaName: string, chapter: number): Promise<string[]> {
  const url = `https://www.sefaria.org/api/texts/${encodeURIComponent(sefariaName)}.${chapter}?language=he&context=0&commentary=0`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json() as any;
  let heArray: any = json.he ?? json.text;
  if (!Array.isArray(heArray)) return [];
  if (Array.isArray(heArray[0])) heArray = heArray.map((sub: any[]) => sub.join(" "));
  return (heArray as string[]).map((v: string) => v.replace(/<[^>]*>/g, "").trim()).filter(Boolean);
}

/** Sefaria에서 전체 히브리어 성경 다운로드 (백그라운드 실행) */
export async function startBibleDownload(bookId?: number): Promise<void> {
  if (downloadProgress.running) return; // 이미 실행 중

  downloadProgress = { running: true, done: 0, total: 0, current: "시작 중..." };

  // 비동기 백그라운드 실행
  (async () => {
    try {
      const books = await prisma.bibleBook.findMany({
        where: bookId ? { id: bookId } : {},
        orderBy: { id: "asc" },
      });

      // 총 절 수 추정
      downloadProgress.total = books.reduce((s, b) => {
        const ch = CHAPTER_COUNTS[b.id] ?? 1;
        return s + ch * 25; // 장당 평균 25절로 추정
      }, 0);

      for (const book of books) {
        const sefariaName = SEFARIA_BOOK_MAP[book.id];
        if (!sefariaName) continue;
        const totalCh = CHAPTER_COUNTS[book.id] ?? 1;

        for (let ch = 1; ch <= totalCh; ch++) {
          downloadProgress.current = `${book.nameKo} ${ch}/${totalCh}장`;
          const verses = await sefariaFetchChapter(sefariaName, ch);

          for (let vi = 0; vi < verses.length; vi++) {
            const heText = verses[vi];
            if (!heText) continue;
            await prisma.$executeRawUnsafe(
              `INSERT INTO bible_verses (id, "bookId", chapter, verse, "koreanText", "hebrewText", "createdAt")
               VALUES (gen_random_uuid(), $1, $2, $3, '', $4, NOW())
               ON CONFLICT ("bookId", chapter, verse) DO UPDATE
                 SET "hebrewText" = EXCLUDED."hebrewText"`,
              book.id, ch, vi + 1, heText
            );
            downloadProgress.done++;
          }
          await new Promise((r) => setTimeout(r, 350)); // Sefaria rate limit
        }
        console.log(`[BibleDL] ${book.nameKo} 완료`);
      }
    } catch (e: any) {
      console.error("[BibleDL] 오류:", e.message);
    } finally {
      downloadProgress.running = false;
      downloadProgress.current = "완료";
    }
  })();
}

/** 임베딩 없는 구절 배치 임베딩 생성 (백그라운드, limit 개씩) */
export async function startEmbeddingGeneration(limit = 200, bookId?: number): Promise<void> {
  const bookCondition = bookId ? `AND bv."bookId" = ${Number(bookId)}` : "";
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bv.id, bv."hebrewText", bv."koreanText"
     FROM bible_verses bv
     WHERE bv.embedding IS NULL AND bv."hebrewText" != ''
       ${bookCondition}
     LIMIT ${limit}`
  );

  (async () => {
    let done = 0;
    for (const row of rows) {
      try {
        const input = row.koreanText
          ? `[히브리어] ${row.hebrewText}\n[한국어] ${row.koreanText}`
          : `[히브리어] ${row.hebrewText}`;
        const embedding = await embedText(input);
        const vec = `[${embedding.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE bible_verses SET embedding = $1::vector WHERE id = $2`, vec, row.id
        );
        done++;
        await new Promise((r) => setTimeout(r, 150));
      } catch { /* ignore individual errors */ }
    }
    console.log(`[Embed] ${done}/${rows.length}절 임베딩 완료`);
  })();
}
