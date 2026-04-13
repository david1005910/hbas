import app from "./app";
import { prisma } from "./config/database";
import { redis } from "./config/redis";

const PORT = process.env.PORT || 4000;

async function setupPgVector() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE bible_verses
      ADD COLUMN IF NOT EXISTS embedding vector(768)
    `);
    console.log("[pgvector] extension + embedding column ready");
  } catch (err: any) {
    // bible_verses 테이블이 아직 없으면 db push 후 자동 재시도 불필요 (컬럼은 push 후 추가됨)
    console.warn("[pgvector] setup skipped (table may not exist yet):", err.message);
  }
}

async function start() {
  try {
    await prisma.$connect();
    console.log("[DB] PostgreSQL connected");
    await redis.connect();
    console.log("[Redis] connected");

    // pgvector 확장 및 embedding 컬럼 초기화
    await setupPgVector();

    app.listen(PORT, () => {
      console.log(`[Server] HBAS backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error("[Server] startup failed:", err);
    process.exit(1);
  }
}

start();
