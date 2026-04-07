import { Router } from "express";
import { listBooks } from "../controllers/bible.controller";

const router = Router();
router.get("/books", listBooks);
export default router;
