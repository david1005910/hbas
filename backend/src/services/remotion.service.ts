import fs from "fs";
import path from "path";
import http from "http";
import { prisma } from "../config/database";

const PROJECT_PATH =
  process.env.REMOTION_PROJECT_PATH || "/app/remotion-project";

// Remotion 컨테이너 내부의 렌더 서버 주소 (Docker 서비스명 사용)
const RENDER_SERVER =
  process.env.REMOTION_RENDER_URL || "http://remotion:3003";

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
}

// ─── data.json 읽기/쓰기 ─────────────────────────────────────────────────────

export function writeProps(props: RemotionProps): void {
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  const payload = {
    koreanText: props.koreanText,
    hebrewText: props.hebrewText,
    videoFileName: props.videoFileName ?? "",
    audioFileName: props.audioFileName ?? "narration.mp3",
  };
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2), "utf-8");
}

export function readProps(): RemotionProps | null {
  const dataPath = path.join(PROJECT_PATH, "public", "data.json");
  if (!fs.existsSync(dataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  } catch {
    return null;
  }
}

// ─── 렌더 서버 호출 헬퍼 ─────────────────────────────────────────────────────

function httpRequest(
  url: string,
  method: "GET" | "POST",
  body?: object
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── 키프레임 → Remotion 스튜디오 전송 ──────────────────────────────────────

export async function sendKeyframeToStudio(keyframeId: string): Promise<RemotionProps> {
  const keyframe = await prisma.sceneKeyframe.findUnique({
    where: { id: keyframeId },
    include: { episode: { include: { contents: { orderBy: { createdAt: "desc" } } } } },
  });
  if (!keyframe) throw new Error("Keyframe not found");
  if (!keyframe.imageUrl) throw new Error("Keyframe image not available");

  // 1. 키프레임 이미지를 Remotion public 폴더로 복사
  const srcPath = `/app${keyframe.imageUrl}`;
  const destDir = path.join(PROJECT_PATH, "public");
  const destFile = `preview_keyframe_${keyframe.sceneNumber}.png`;
  const destPath = path.join(destDir, destFile);

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcPath, destPath);

  // 2. SCRIPT 콘텐츠에서 씬별 한/히브리어 텍스트 추출 (없으면 에피소드 제목 사용)
  const scriptContent = keyframe.episode.contents.find((c) => c.contentType === "SCRIPT");
  const { koreanText, hebrewText } = extractSceneText(
    scriptContent?.content ?? "",
    keyframe.sceneNumber,
    keyframe.episode.titleKo,
    keyframe.episode.titleHe ?? ""
  );

  // 3. data.json 업데이트
  const props: RemotionProps = {
    koreanText,
    hebrewText,
    videoFileName: destFile,
    audioFileName: "narration.mp3",
    episodeId: keyframe.episodeId,
  };
  writeProps(props);
  return props;
}

/** SCRIPT 텍스트에서 씬별 나레이션 추출 */
function extractSceneText(
  script: string,
  sceneNumber: number,
  fallbackKo: string,
  fallbackHe: string
): { koreanText: string; hebrewText: string } {
  if (!script) return { koreanText: fallbackKo, hebrewText: fallbackHe };

  // "씬 N:" 블록 찾기
  const sceneRegex = new RegExp(
    `씬\\s*${sceneNumber}[:\\s]([\\s\\S]*?)(?=씬\\s*\\d+[:\\s]|$)`,
    "i"
  );
  const sceneBlock = script.match(sceneRegex)?.[1] ?? "";

  const koMatch = sceneBlock.match(/나레이션\s*[\(（]KO[\)）]\s*:\s*(.+)/);
  const heMatch = sceneBlock.match(/나레이션\s*[\(（]HE[\)）]\s*:\s*(.+)/);

  return {
    koreanText: koMatch?.[1]?.trim() || fallbackKo,
    hebrewText: heMatch?.[1]?.trim() || fallbackHe,
  };
}

// ─── 렌더링 시작 (비동기) ────────────────────────────────────────────────────

export async function renderVideo(): Promise<void> {
  await httpRequest(`${RENDER_SERVER}/render`, "POST");
  // 렌더는 비동기로 진행됨 — 완료는 /status 폴링으로 확인
}

// ─── 렌더 상태 확인 ──────────────────────────────────────────────────────────

export async function getRenderStatus(): Promise<{
  status: "idle" | "rendering" | "done" | "error";
  error: string | null;
  fileReady: boolean;
}> {
  return httpRequest(`${RENDER_SERVER}/status`, "GET");
}

// ─── 다운로드 URL ─────────────────────────────────────────────────────────────

export function getDownloadUrl(): string {
  // 브라우저에서 직접 접근 가능한 URL (호스트 포트 3003)
  return "http://localhost:3003/download";
}
