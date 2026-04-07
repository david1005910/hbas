import { api } from "./client";
import type { SceneKeyframe } from "../types";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : "/api/v1";

export const keyframesApi = {
  list: (episodeId: string) =>
    api.get<SceneKeyframe[]>(`/episodes/${episodeId}/keyframes`).then((r) => r.data),
  select: (id: string) =>
    api.put<SceneKeyframe>(`/keyframes/${id}/select`).then((r) => r.data),
  regenerate: (sceneNo: number, data: { episodeId: string; prompt: string; animStyle?: string }) =>
    api.post<SceneKeyframe>(`/keyframes/${sceneNo}/keyframe`, data).then((r) => r.data),
};

export function streamKeyframeGeneration(
  episodeId: string,
  onProgress: (scene: number, status: string, imageUrl?: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
  const controller = new AbortController();
  const url = `${API_BASE}/episodes/${episodeId}/generate/keyframes`;

  (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name !== "AbortError") onError(err.message);
      return;
    }

    if (!response.ok) {
      onError(`HTTP ${response.status}`);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.allDone) { onDone(); return; }
            if (data.error && !data.scene) { onError(data.error); return; }
            if (data.scene) onProgress(data.scene, data.status, data.imageUrl);
          } catch { /* skip */ }
        }
      }
      onDone();
    } catch (err: any) {
      if (err.name !== "AbortError") onError(err.message);
    }
  })();

  return () => controller.abort();
}
