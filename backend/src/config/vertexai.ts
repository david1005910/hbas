import { GoogleAuth } from "google-auth-library";

export const VEO_MODEL = process.env.VEO_MODEL || "veo-3.1-generate-001";
export const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "";
export const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

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
