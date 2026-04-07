import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";

export async function listBooks(_req: Request, res: Response, next: NextFunction) {
  try {
    const books = await prisma.bibleBook.findMany({ orderBy: { orderNo: "asc" } });
    res.json(books);
  } catch (err) {
    next(err);
  }
}
