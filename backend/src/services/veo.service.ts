import axios from "axios";
import { getGcpAccessToken, GCP_PROJECT, GCP_LOCATION, VEO_MODEL, GCS_OUTPUT_BUCKET } from "../config/vertexai";
import { saveVideo } from "../utils/imageStorage";

const BASE_URL = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1`;

/**
 * 키프레임(이미지) → 8초 Veo 영상 생성 시작
 * - Veo 3.1: GCS_OUTPUT_BUCKET 설정 시 storageUri 포함 → GCS URI 응답
 * - Veo 2.0: inline base64 응답 (GCS 불필요)
 */
export async function startVideoGeneration(
  imageBuffer: Buffer,
  motionPrompt: string,
  durationSec: 5 | 6 | 7 | 8 = 8
): Promise<string> {
  const token = await getGcpAccessToken();
  const url = `${BASE_URL}/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;

  console.log(`[Veo] 영상 생성 시작, model=${VEO_MODEL}, duration=${durationSec}s`);

  const parameters: Record<string, any> = {
    durationSeconds: durationSec,
    aspectRatio: "16:9",
    generateAudio: false,
    sampleCount: 1,
  };
  if (GCS_OUTPUT_BUCKET) {
    parameters.storageUri = GCS_OUTPUT_BUCKET;
  }

  let response;
  try {
    response = await axios.post(
      url,
      {
        instances: [{
          image: { bytesBase64Encoded: imageBuffer.toString("base64"), mimeType: "image/png" },
          prompt: motionPrompt,
        }],
        parameters,
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[Veo] 생성 오류 ${err.response?.status}:`, JSON.stringify(err.response?.data).slice(0, 500));
    throw err;
  }

  console.log(`[Veo] 생성 작업 시작 완료, name=${response.data?.name}`);
  return response.data.name; // Long Running Operation ID
}

/**
 * 기존 클립(GCS)을 입력으로 7초 영상 연장
 * Veo 3.1 전용 — GCS_OUTPUT_BUCKET 필수
 */
export async function extendVideo(
  clipGcsUri: string,
  motionPrompt: string
): Promise<string> {
  if (!GCS_OUTPUT_BUCKET) throw new Error("GCS_OUTPUT_BUCKET 설정이 필요합니다 (영상 연장 기능)");

  const token = await getGcpAccessToken();
  const url = `${BASE_URL}/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;

  console.log(`[Veo] 영상 연장 시작, inputGcs=${clipGcsUri}`);

  let response;
  try {
    response = await axios.post(
      url,
      {
        instances: [{
          prompt: motionPrompt,
          video: { gcsUri: clipGcsUri, mimeType: "video/mp4" },
        }],
        parameters: {
          aspectRatio: "16:9",
          generateAudio: false,
          sampleCount: 1,
          storageUri: GCS_OUTPUT_BUCKET,
        },
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[Veo] 연장 오류 ${err.response?.status}:`, JSON.stringify(err.response?.data).slice(0, 500));
    throw err;
  }

  console.log(`[Veo] 연장 작업 시작 완료, name=${response.data?.name}`);
  return response.data.name;
}

/**
 * Long Running Operation 상태 폴링
 * - done=false → processing
 * - done=true, error → failed
 * - done=true, videos[0].bytesBase64Encoded → Veo 2.0 inline base64
 * - done=true, videos[0].gcsUri → Veo 3.1 GCS URI
 */
export async function pollVideoStatus(
  operationName: string
): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  videoGcsUri?: string;
  videoBase64?: string;
}> {
  const token = await getGcpAccessToken();
  const pollUrl = `${BASE_URL}/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:fetchPredictOperation`;

  let response;
  try {
    response = await axios.post(
      pollUrl,
      { operationName },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[Veo] 폴링 오류 ${err.response?.status}:`, JSON.stringify(err.response?.data).slice(0, 500));
    throw err;
  }

  const op = response.data;
  console.log(`[Veo] 폴링 응답 (done=${op.done}):`, JSON.stringify(op).slice(0, 300));

  if (!op.done) return { status: "processing" };
  if (op.error) {
    console.error(`[Veo] 작업 실패:`, JSON.stringify(op.error));
    return { status: "failed" };
  }

  // Veo 2.0 — inline base64
  const b64 = op.response?.videos?.[0]?.bytesBase64Encoded;
  if (b64) return { status: "completed", videoBase64: b64 };

  // Veo 3.1 — GCS URI (videos[0].gcsUri)
  const gcsUri = op.response?.videos?.[0]?.gcsUri;
  if (gcsUri) return { status: "completed", videoGcsUri: gcsUri };

  // fallback (이전 형식)
  const legacyGcsUri = op.response?.predictions?.[0]?.videoGcsUri;
  if (legacyGcsUri) return { status: "completed", videoGcsUri: legacyGcsUri };

  console.warn("[Veo] 완료됐지만 영상 데이터 없음:", JSON.stringify(op.response));
  return { status: "failed" };
}

/**
 * GCS URI → 로컬 파일로 다운로드
 */
export async function downloadVideoFromGcs(
  videoGcsUri: string,
  episodeId: string,
  sceneNumber: number
): Promise<string> {
  const token = await getGcpAccessToken();
  const httpUrl = videoGcsUri.replace("gs://", "https://storage.googleapis.com/");

  const response = await axios.get(httpUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${token}` },
  });

  return saveVideo(episodeId, sceneNumber, Buffer.from(response.data));
}
