import app from "./app";
import { prisma } from "./config/database";
import { redis } from "./config/redis";

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await prisma.$connect();
    console.log("[DB] PostgreSQL connected");
    await redis.connect();
    console.log("[Redis] connected");

    app.listen(PORT, () => {
      console.log(`[Server] HBAS backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error("[Server] startup failed:", err);
    process.exit(1);
  }
}

start();
