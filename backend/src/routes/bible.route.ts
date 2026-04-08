import { Router } from "express";
import {
  listBooks,
  listVerses,
  getVerse,
  getVerseByActorTag,
  listVersesByBook,
} from "../controllers/bible.controller";

const router = Router();

// 책 목록
router.get("/books", listBooks);

// 책별 구절 목록
router.get("/books/:bookId/verses", listVersesByBook);

// 구절 검색 (쿼리: bookId, chapter, actorTag)
router.get("/verses", listVerses);

// actorTag로 구절 조회 (언리얼 엔진 카메라 이동용) — :id보다 먼저 등록
router.get("/verses/by-tag/:actorTag", getVerseByActorTag);

// 단일 구절
router.get("/verses/:id", getVerse);

export default router;
