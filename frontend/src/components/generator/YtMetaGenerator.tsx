import { useState } from "react";
import { generateApi } from "../../api/generate";
import { DownloadButton } from "../ui/DownloadButton";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing?: GeneratedContent;
  onDone?: () => void;
}

export function YtMetaGenerator({ episodeId, existing, onDone }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState(existing?.content ?? "");
  const [generatedContentId, setGeneratedContentId] = useState<string | null>(null);

  async function handleGenerate() {
    setIsLoading(true);
    setError("");
    try {
      const result = await generateApi.ytMeta(episodeId);
      setContent(result.content ?? "");
      if (result.contentId) setGeneratedContentId(result.contentId);
      onDone?.();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? "메타데이터 생성 실패");
    } finally {
      setIsLoading(false);
    }
  }

  // 다운로드용 content ID: 방금 생성된 것 > 기존 저장본 순
  const downloadContentId = generatedContentId ?? existing?.id ?? null;

  let parsed: any = null;
  try { parsed = content ? JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || "") : null; } catch {}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">유튜브 메타데이터</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">한국어·히브리어·영어 제목·설명·태그 (SEO 최적화)</p>
        </div>
        <div className="flex gap-2">
          {downloadContentId && <DownloadButton href={`/api/v1/contents/${downloadContentId}/download`} label="JSON 저장" />}
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            {isLoading ? "생성 중..." : "메타데이터 생성"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm font-body">{error}</p>}

      {parsed && (
        <div className="grid grid-cols-3 gap-3">
          {(["ko", "he", "en"] as const).map((lang) => {
            const meta = parsed[lang];
            if (!meta) return null;
            return (
              <div key={lang} className="border border-gold/20 rounded-xl p-3 bg-ink-light" dir={lang === "he" ? "rtl" : "ltr"}>
                <p className="text-gold text-xs font-body uppercase mb-2">{lang}</p>
                <p className="text-parchment text-sm font-body font-semibold mb-1">{meta.title}</p>
                <p className="text-parchment/50 text-xs font-body line-clamp-3">{meta.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {meta.hashtags?.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="text-xs bg-gold/10 text-gold/80 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
