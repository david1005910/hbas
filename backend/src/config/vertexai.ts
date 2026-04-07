import { GoogleAuth } from "google-auth-library";

export const VEO_MODEL       = process.env.VEO_MODEL            || "veo-3.1-generate-preview";
export const GCP_PROJECT     = process.env.GOOGLE_CLOUD_PROJECT  || "";
export const GCP_LOCATION    = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
export const GCS_OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET  || "";   // "gs://bucket-name/"
// 씬당 목표 영상 길이: 초기 8초 + 7초 × N 회 연장 (기본 22초 = 2회 연장)
export const TARGET_SCENE_DURATION = parseInt(process.env.TARGET_SCENE_DURATION || "22", 10);

if (!GCP_PROJECT || GCP_PROJECT === "YOUR_GCP_PROJECT") {
  console.warn("[VertexAI] GOOGLE_CLOUD_PROJECT not set — Veo generation will fail at runtime");
}

export async function getGcpAccessToken(): Promise<string> {
  const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const auth = new GoogleAuth({
    ...(credFile ? { keyFile: credFile } : {}),
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error("Failed to get GCP access token");
  return tokenResponse.token;
}
