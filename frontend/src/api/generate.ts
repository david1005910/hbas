const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : "/api/v1";

import { api } from "./client";

async function readSseStream(
  url: string,
  body: object,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  signal: AbortSignal
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    if (err.name !== "AbortError") onError(err.message);
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    onError(`HTTP ${response.status}: ${text}`);
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
          if (data.chunk) onChunk(data.chunk);
          if (data.done) { onDone(); return; }
          if (data.error) { onError(data.error); return; }
        } catch { /* partial JSON, skip */ }
      }
    }
    onDone();
  } catch (err: any) {
    if (err.name !== "AbortError") onError(err.message);
  }
}

export function streamGenerate(
  episodeId: string,
  type: "script" | "anim-prompt",
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
  const controller = new AbortController();
  const url = `${API_BASE}/episodes/${episodeId}/generate/${type}`;
  readSseStream(url, {}, onChunk, onDone, onError, controller.signal);
  return () => controller.abort();
}

export const generateApi = {
  srt: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/generate/srt`).then((r) => r.data),
  narration: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/generate/narration`).then((r) => r.data),
  ytMeta: (episodeId: string) =>
    api.post(`/episodes/${episodeId}/generate/yt-meta`).then((r) => r.data),
};
