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

export function AnimPromptGenerator({ episodeId, existing, onDone }: Props) {
  const [content, setContent] = useState(existing?.content ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");

  function handleGenerate() {
    setContent("");
    setError("");
    setIsStreaming(true);
    streamGenerate(
      episodeId,
      "anim-prompt",
      (chunk) => setContent((prev) => prev + chunk),
      () => { setIsStreaming(false); onDone?.(); },
      (msg) => { setError(msg); setIsStreaming(false); }
    );
  }

  const downloadUrl = existing ? `/api/v1/contents/${existing.id}/download` : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">애니메이션 프롬프트</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">씬별 이미지·영상 프롬프트 (Nano Banana / Veo용)</p>
        </div>
        <div className="flex gap-2">
          {downloadUrl && <DownloadButton href={downloadUrl} label="TXT 저장" />}
          <button
            onClick={handleGenerate}
            disabled={isStreaming}
            className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            <Wand2 size={14} />
            {isStreaming ? "생성 중..." : "프롬프트 생성"}
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm font-body">{error}</p>}
      <StreamingOutput content={content} isStreaming={isStreaming} placeholder="Nano Banana·Veo 프롬프트가 씬별로 생성됩니다..." />
    </div>
  );
}
