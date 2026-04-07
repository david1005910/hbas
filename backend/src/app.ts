import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import router from "./routes/index";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);

app.use("/api/v1", router);

// 정적 파일 (생성된 이미지/영상 서빙)
app.use("/storage", express.static("/app/storage"));

app.use(errorHandler);

export default app;
