import { useState } from "react";
import { Mic, CheckCircle, Volume2 } from "lucide-react";

interface Props {
  episodeId: string;
  initialNarrationUrl?: string | null;
  onDone?: () => void;
}

export function NarrationGenerator({ episodeId, initialNarrationUrl, onDone }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [narrationUrl, setNarrationUrl] = useState<string | null>(initialNarrationUrl ?? null);

  async function handleGenerate() {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/episodes/${episodeId}/generate/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "나레이션 생성 실패");
      }
      const data = await res.json();
      setNarrationUrl(data.narrationUrl);
      onDone?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">나레이션 음성</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">
            중년 남성 · 부드러운 한국어 (ko-KR-Neural2-C) — 영상 병합 시 자동 합성
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <Mic size={14} />
          {isLoading ? "생성 중..." : narrationUrl ? "재생성" : "나레이션 생성"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm font-body">{error}</p>}

      {narrationUrl && (
        <div className="border border-gold/20 rounded-xl p-4 bg-ink-light">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-parchment/70 text-sm font-body">나레이션 생성 완료</span>
            <Volume2 size={12} className="text-gold ml-auto" />
            <span className="text-xs text-parchment/50 font-body">영상 병합 시 자동 포함</span>
          </div>
          <audio
            src={narrationUrl}
            controls
            className="w-full"
            style={{ accentColor: "#c8a96e" }}
          />
        </div>
      )}
    </div>
  );
}
