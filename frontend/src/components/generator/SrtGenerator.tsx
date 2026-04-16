import { useState } from "react";
import { generateApi } from "../../api/generate";
import { DownloadButton } from "../ui/DownloadButton";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing: GeneratedContent[];
  onDone?: () => void;
}

export function SrtGenerator({ episodeId, existing, onDone }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(existing.length > 0);

  async function handleGenerate() {
    setIsLoading(true);
    setError("");
    try {
      await generateApi.srt(episodeId);
      setDone(true);
      onDone?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  const srtKo = existing.find((c) => c.contentType === "SRT_KO");
  const srtHe = existing.find((c) => c.contentType === "SRT_HE");
  const srtEn = existing.find((c) => c.contentType === "SRT_EN");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">SRT 자막 3종</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">한국어 · 히브리어 (RTL) · 영어 — 유튜브 호환 UTF-8 BOM</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          {isLoading ? "생성 중..." : "자막 생성"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm font-body">{error}</p>}

      {done && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "🇰🇷 한국어 (KO)", content: srtKo, lang: "ko" },
            { label: "🔤 히브리어 (HE)", content: srtHe, lang: "he" },
            { label: "🇺🇸 영어 (EN)", content: srtEn, lang: "en" },
          ].map(({ label, content, lang }) => (
            <div key={lang} className="border border-gold/20 rounded-xl p-3 bg-ink-light">
              <div className="flex items-center justify-between mb-2">
                <span className="text-parchment/70 text-sm font-body">{label}</span>
                {content && <DownloadButton href={`/api/v1/contents/${content.id}/download`} label=".srt" />}
              </div>
              {content ? (
                <pre className="text-xs text-parchment/50 font-body overflow-hidden" style={{ maxHeight: 80, direction: lang === "he" ? "rtl" : "ltr" }}>
                  {content.content.slice(0, 150)}...
                </pre>
              ) : (
                <p className="text-xs text-parchment/30 font-body italic">미생성</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
