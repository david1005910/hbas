import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (existing?.content) {
      setContent(existing.content);
    }
  }, [existing?.content]);

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
  if (content && content.trim()) {
    try {
      // Try to parse as JSON directly first
      parsed = JSON.parse(content);
    } catch {
      // If direct parsing fails, try to fix common issues
      try {
        let fixedContent = content;
        
        // Extract JSON if wrapped in other text
        const jsonMatch = fixedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          fixedContent = jsonMatch[0];
        }
        
        // Fix unescaped quotes in Hebrew text (common biblical references)
        fixedContent = fixedContent.replace(/כ"ג/g, 'כ\\"ג');
        fixedContent = fixedContent.replace(/ב"ש/g, 'ב\\"ש');
        fixedContent = fixedContent.replace(/ב'/g, 'ב\\\'');
        fixedContent = fixedContent.replace(/ג'/g, 'ג\\\'');
        fixedContent = fixedContent.replace(/ד'/g, 'ד\\\'');
        
        parsed = JSON.parse(fixedContent);
        
      } catch (parseError) {
        // Parsing failed completely, will show raw content with warning
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">유튜브 메타데이터</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">한국어·히브리어·베트남어 제목·설명·태그 (SEO 최적화)</p>
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

      {/* 디버깅: raw 콘텐츠 표시 */}
      {content && !parsed && (
        <div className="border border-yellow-500/20 rounded-lg p-3 bg-yellow-500/5">
          <p className="text-yellow-400 text-xs font-body mb-2">⚠️ JSON 파싱 실패 - Raw 데이터:</p>
          <pre className="text-xs text-parchment/70 font-mono whitespace-pre-wrap overflow-auto max-h-32">{content}</pre>
        </div>
      )}

      {!content && !isLoading && (
        <div className="border border-gold/20 rounded-xl p-8 text-center bg-ink-light">
          <div className="text-parchment/50 text-sm font-body mb-2">📊 아직 메타데이터가 생성되지 않았습니다</div>
          <div className="text-parchment/30 text-xs font-body">
            "메타데이터 생성" 버튼을 클릭하여 유튜브 제목, 설명, 태그를 생성하세요
          </div>
        </div>
      )}

      {parsed && (
        <div className="grid grid-cols-3 gap-3">
          {(["ko", "he", "vi"] as const).map((lang) => {
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
