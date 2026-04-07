import { useState } from "react";
import { Wand2 } from "lucide-react";
import { streamGenerate } from "../../api/generate";
import { StreamingOutput } from "../ui/StreamingOutput";
import { DownloadButton } from "../ui/DownloadButton";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing?: GeneratedContent;
  onDone?: () => void;
}

export function ScriptGenerator({ episodeId, existing, onDone }: Props) {
  const [content, setContent] = useState(existing?.content ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");

  function handleGenerate() {
    setContent("");
    setError("");
    setIsStreaming(true);
    const stop = streamGenerate(
      episodeId,
      "script",
      (chunk) => setContent((prev) => prev + chunk),
      () => { setIsStreaming(false); onDone?.(); },
      (msg) => { setError(msg); setIsStreaming(false); }
    );
    return stop;
  }

  const downloadUrl = existing
    ? `/api/v1/contents/${existing.id}/download`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">한국어·히브리어 대본</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">Gemini 2.5 Flash로 씬별 이중 언어 대본 생성</p>
        </div>
        <div className="flex gap-2">
          {downloadUrl && <DownloadButton href={downloadUrl} label="TXT 저장" />}
          <button
            onClick={handleGenerate}
            disabled={isStreaming}
            className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            <Wand2 size={14} />
            {isStreaming ? "생성 중..." : "대본 생성"}
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm font-body">{error}</p>}
      <StreamingOutput content={content} isStreaming={isStreaming} placeholder="대본이 여기에 스트리밍됩니다..." />
    </div>
  );
}
