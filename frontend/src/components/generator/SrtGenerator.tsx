import { useState, useEffect } from "react";
import { Lightbulb } from "lucide-react";
import { generateApi } from "../../api/generate";
import { episodesApi } from "../../api/episodes";
import { DownloadButton } from "../ui/DownloadButton";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing: GeneratedContent[];
  sceneCount?: number;
  verseRange?: string;
  onDone?: () => void;
}

/** 구절 범위 문자열에서 절 수 추산: "1-31", "1:1-2:25", "3-7" 등 */
function estimateVerseCount(verseRange?: string): number {
  if (!verseRange) return 0;
  // "장:절-장:절" 형식
  const chapterVerse = verseRange.match(/^(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)$/);
  if (chapterVerse) {
    const [, startCh, startV, endCh, endV] = chapterVerse.map(Number);
    // 단순 절 수 추산 (장 당 평균 30절 가정)
    return (endCh - startCh) * 30 + (endV - startV + 1);
  }
  // "절-절" 형식
  const simpleRange = verseRange.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (simpleRange) {
    return Number(simpleRange[2]) - Number(simpleRange[1]) + 1;
  }
  // 단일 절
  const single = verseRange.match(/^\d+$/);
  if (single) return 1;
  return 0;
}

/** 절 수 기반 씬 수 추천 */
function recommendScenes(verseCount: number, currentScene: number): number {
  if (verseCount <= 0) return currentScene;
  if (verseCount <= 3) return verseCount;
  if (verseCount <= 7) return Math.ceil(verseCount * 0.8);
  if (verseCount <= 15) return Math.ceil(verseCount * 0.6);
  if (verseCount <= 31) return Math.max(8, Math.ceil(verseCount * 0.45));
  return Math.max(10, Math.ceil(verseCount * 0.35));
}

export function SrtGenerator({ episodeId, existing, sceneCount: initialSceneCount = 5, verseRange, onDone }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(existing.length > 0);
  const [sceneCount, setSceneCount] = useState(initialSceneCount);
  const [savingScene, setSavingScene] = useState(false);

  useEffect(() => {
    setSceneCount(initialSceneCount);
  }, [initialSceneCount]);

  const verseCount = estimateVerseCount(verseRange);
  const recommended = recommendScenes(verseCount, sceneCount);

  async function applySceneCount(n: number) {
    if (n === initialSceneCount) return;
    setSavingScene(true);
    try {
      await episodesApi.update(episodeId, { sceneCount: n });
    } catch {
      // ignore — proceed anyway
    } finally {
      setSavingScene(false);
    }
  }

  async function handleGenerate() {
    await applySceneCount(sceneCount);
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-parchment font-body font-semibold">SRT 자막 3종</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">한국어 · 히브리어 (RTL) · 영어 — 유튜브 호환 UTF-8 BOM</p>
        </div>

        {/* 씬 수 선택 + 추천 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-parchment/60 text-sm font-body">씬 수:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={sceneCount}
            onChange={(e) => setSceneCount(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="w-16 text-center rounded-lg px-2 py-1 text-sm text-parchment bg-ink border border-gold/30 focus:outline-none focus:border-gold/60"
          />
          {verseCount > 0 && recommended !== sceneCount && (
            <button
              onClick={() => setSceneCount(recommended)}
              title={`절 수(${verseCount}절) 기반 추천: ${recommended}개 씬`}
              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-300 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors"
            >
              <Lightbulb size={12} />
              추천 {recommended}개
            </button>
          )}
          {verseCount > 0 && (
            <span className="text-parchment/35 text-xs font-body">({verseCount}절)</span>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading || savingScene}
          className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          {isLoading ? "생성 중..." : savingScene ? "저장 중..." : `자막 생성 (${sceneCount}씬)`}
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
