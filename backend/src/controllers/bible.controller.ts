import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";

// ── 성경 책 목록 ──────────────────────────────────────────
export async function listBooks(_req: Request, res: Response, next: NextFunction) {
  try {
    const books = await prisma.bibleBook.findMany({ orderBy: { orderNo: "asc" } });
    res.json(books);
  } catch (err) { next(err); }
}

// ── 구절 목록 (책별 or 전체, actorTag 필터 가능) ──────────
// GET /api/v1/bible/verses?bookId=1&chapter=1&actorTag=Tabernacle_Ark
export async function listVerses(req: Request, res: Response, next: NextFunction) {
  try {
    const { bookId, chapter, actorTag } = req.query;
    const verses = await prisma.bibleVerse.findMany({
      where: {
        ...(bookId   ? { bookId:   parseInt(bookId as string) } : {}),
        ...(chapter  ? { chapter:  parseInt(chapter as string) } : {}),
        ...(actorTag ? { actorTag: { contains: actorTag as string } } : {}),
      },
      include: { book: { select: { nameKo: true, nameHe: true, nameEn: true, orderNo: true } } },
      orderBy: [{ bookId: "asc" }, { chapter: "asc" }, { verse: "asc" }],
    });

    // 언리얼 엔진 VaRest에서 바로 쓸 수 있는 형식으로 정규화
    res.json(verses.map(normalizeVerse));
  } catch (err) { next(err); }
}

// ── 단일 구절 조회 ─────────────────────────────────────────
// GET /api/v1/bible/verses/:id
export async function getVerse(req: Request, res: Response, next: NextFunction) {
  try {
    const v = await prisma.bibleVerse.findUnique({
      where: { id: req.params.id },
      include: { book: { select: { nameKo: true, nameHe: true, nameEn: true, orderNo: true } } },
    });
    if (!v) return res.status(404).json({ error: "Not found" });
    res.json(normalizeVerse(v));
  } catch (err) { next(err); }
}

// ── actorTag로 직접 조회 (언리얼 엔진 카메라 이동용) ──────
// GET /api/v1/bible/verses/by-tag/:actorTag
export async function getVerseByActorTag(req: Request, res: Response, next: NextFunction) {
  try {
    const verses = await prisma.bibleVerse.findMany({
      where: { actorTag: req.params.actorTag },
      include: { book: { select: { nameKo: true, nameHe: true, nameEn: true, orderNo: true } } },
    });
    res.json(verses.map(normalizeVerse));
  } catch (err) { next(err); }
}

// ── 특정 책의 구절 전체 ────────────────────────────────────
// GET /api/v1/bible/books/:bookId/verses
export async function listVersesByBook(req: Request, res: Response, next: NextFunction) {
  try {
    const bookId = parseInt(req.params.bookId);
    const verses = await prisma.bibleVerse.findMany({
      where: { bookId },
      include: { book: { select: { nameKo: true, nameHe: true, nameEn: true, orderNo: true } } },
      orderBy: [{ chapter: "asc" }, { verse: "asc" }],
    });
    res.json(verses.map(normalizeVerse));
  } catch (err) { next(err); }
}

// ── 헬퍼: 언리얼 엔진 VaRest용 응답 형식 정규화 ─────────
type VerseWithBook = Awaited<ReturnType<typeof prisma.bibleVerse.findUniqueOrThrow>> & {
  book: { nameKo: string; nameHe: string; nameEn: string; orderNo: number };
};

function normalizeVerse(v: VerseWithBook) {
  return {
    id:         v.id,
    ref:        `${v.book.nameEn.toUpperCase().slice(0, 3)}_${v.chapter}_${v.verse}`,
    book:       { ko: v.book.nameKo, he: v.book.nameHe, en: v.book.nameEn, order: v.book.orderNo },
    chapter:    v.chapter,
    verse:      v.verse,
    // RTL 마커(\u202B) + 히브리어 텍스트: 언리얼 UMG TextBlock에서 올바른 방향으로 표시됨
    hebrewText: `\u202B${v.hebrewText}`,
    koreanText: v.koreanText,
    actorTag:   v.actorTag ?? null,
    createdAt:  v.createdAt,
  };
}
