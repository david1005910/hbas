import axios, { AxiosError } from "axios";
import * as fs from "fs";
import { getGcpAccessToken, GCP_PROJECT, GCP_LOCATION, VEO_MODEL } from "../config/vertexai";
import { saveVideo } from "../utils/imageStorage";

const BASE_URL = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1`;

export async function startVideoGeneration(
  imageBuffer: Buffer,
  motionPrompt: string,
  durationSec: 5 | 6 | 7 | 8 = 5
): Promise<string> {
  const token = await getGcpAccessToken();
  const url = `${BASE_URL}/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;

  console.log(`[Veo] starting generation, model=${VEO_MODEL}, duration=${durationSec}s`);
  console.log(`[Veo] URL: ${url}`);

  let response;
  try {
    response = await axios.post(
      url,
      {
        instances: [{
          image: { bytesBase64Encoded: imageBuffer.toString("base64"), mimeType: "image/png" },
          prompt: motionPrompt,
        }],
        parameters: { durationSeconds: durationSec, aspectRatio: "16:9", generateAudio: false },
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[Veo] start error ${err.response?.status}:`, JSON.stringify(err.response?.data).slice(0, 500));
    throw err;
  }
  console.log(`[Veo] start response status=${response.status}, name=${response.data?.name}`);
  return response.data.name; // Long Running Operation ID
}

export async function pollVideoStatus(
  operationName: string
): Promise<{ status: "pending" | "processing" | "completed" | "failed"; videoGcsUri?: string; videoBase64?: string }> {
  const token = await getGcpAccessToken();
  // Veo 전용 폴링 엔드포인트: fetchPredictOperation (POST)
  const pollUrl = `${BASE_URL}/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:fetchPredictOperation`;
  console.log(`[Veo] polling: ${pollUrl}`);
  let response;
  try {
    response = await axios.post(
      pollUrl,
      { operationName },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const data = err.response?.data;
    console.error(`[Veo] poll error ${err.response?.status}:`, JSON.stringify(data).slice(0, 500));
    throw err;
  }

  const op = response.data;
  console.log(`[Veo] poll response:`, JSON.stringify(op).slice(0, 300));
  if (!op.done) return { status: "processing" };
  if (op.error) {
    console.error(`[Veo] operation failed:`, JSON.stringify(op.error));
    return { status: "failed" };
  }

  // Veo 2.0: inline base64 video bytes
  const b64 = op.response?.videos?.[0]?.bytesBase64Encoded;
  if (b64) return { status: "completed", videoBase64: b64 };

  // fallback: GCS URI (Veo 3+)
  const videoGcsUri = op.response?.predictions?.[0]?.videoGcsUri;
  return { status: "completed", videoGcsUri };
}

export async function downloadVideoFromGcs(
  videoGcsUri: string,
  episodeId: string,
  sceneNumber: number
): Promise<string> {
  // GCS URI를 서명된 URL로 변환하여 다운로드
  const token = await getGcpAccessToken();
  const httpUrl = videoGcsUri.replace("gs://", "https://storage.googleapis.com/");

  const response = await axios.get(httpUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${token}` },
  });

  return saveVideo(episodeId, sceneNumber, Buffer.from(response.data));
}
