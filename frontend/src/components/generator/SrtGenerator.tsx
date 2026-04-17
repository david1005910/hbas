import { useState, useEffect } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
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

/** SRT 블록 파싱: [{num, time, text}] */
function parseSrt(srtContent: string): Array<{ num: number; time: string; text: string }> {
  const blocks = srtContent
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return null;
      const num = parseInt(lines[0], 10);
      if (isNaN(num)) return null;
      const time = lines[1] || "";
      const text = lines.slice(2).join(" ").trim();
      return text ? { num, time, text } : null;
    })
    .filter((b): b is { num: number; time: string; text: string } => b !== null);
}

/** 구절 범위 문자열에서 절 수 추산: "1-31", "1:1-2:25", "3-7" 등 */
function estimateVerseCount(verseRange?: string): number {
  if (!verseRange) return 0;
  const chapterVerse = verseRange.match(/^(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)$/);
  if (chapterVerse) {
    const [, startCh, startV, endCh, endV] = chapterVerse.map(Number);
    return (endCh - startCh) * 30 + (endV - startV + 1);
  }
  const simpleRange = verseRange.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (simpleRange) return Number(simpleRange[2]) - Number(simpleRange[1]) + 1;
  const single = verseRange.match(/^\d+$/);
  if (single) return 1;
  return 0;
}

function recommendScenes(verseCount: number, currentScene: number): number {
  if (verseCount <= 0) return currentScene;
  if (verseCount <= 3) return verseCount;
  if (verseCount <= 7) return Math.ceil(verseCount * 0.8);
  if (verseCount <= 15) return Math.ceil(verseCount * 0.6);
  if (verseCount <= 31) return Math.max(8, Math.ceil(verseCount * 0.45));
  return Math.max(10, Math.ceil(verseCount * 0.35));
}

type ViewTab = "table" | "ko" | "he" | "en";

export function SrtGenerator({ episodeId, existing, sceneCount: initialSceneCount = 5, verseRange, onDone }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(existing.length > 0);
  const [sceneCount, setSceneCount] = useState(initialSceneCount);
  const [savingScene, setSavingScene] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("table");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setSceneCount(initialSceneCount); }, [initialSceneCount]);
  useEffect(() => { if (existing.length > 0) setDone(true); }, [existing.length]);

  const verseCount = estimateVerseCount(verseRange);
  const recommended = recommendScenes(verseCount, sceneCount);

  async function applySceneCount(n: number) {
    if (n === initialSceneCount) return;
    setSavingScene(true);
    try { await episodesApi.update(episodeId, { sceneCount: n }); } catch { }
    finally { setSavingScene(false); }
  }

  async function handleGenerate() {
    await applySceneCount(sceneCount);
    setIsLoading(true);
    setError("");
    try {
      await generateApi.srt(episodeId);
      setDone(true);
      setExpanded(true);
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

  const koScenes = srtKo ? parseSrt(srtKo.content) : [];
  const heScenes = srtHe ? parseSrt(srtHe.content) : [];
  const enScenes = srtEn ? parseSrt(srtEn.content) : [];
  const maxScenes = Math.max(koScenes.length, heScenes.length, enScenes.length);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-parchment font-body font-semibold">SRT 자막 3종</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">한국어 · 히브리어 (RTL) · 영어 — 씬별 정렬 확인 가능</p>
        </div>

        {/* 씬 수 선택 + 추천 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-parchment/60 text-sm font-body">씬 수:</span>
          <input
            type="number" min={1} max={50} value={sceneCount}
            onChange={(e) => setSceneCount(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="w-16 text-center rounded-lg px-2 py-1 text-sm text-parchment bg-ink border border-gold/30 focus:outline-none focus:border-gold/60"
          />
          {verseCount > 0 && recommended !== sceneCount && (
            <button
              onClick={() => setSceneCount(recommended)}
              title={`절 수(${verseCount}절) 기반 추천: ${recommended}개 씬`}
              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-300 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors"
            >
              <Lightbulb size={12} /> 추천 {recommended}개
            </button>
          )}
          {verseCount > 0 && <span className="text-parchment/35 text-xs font-body">({verseCount}절)</span>}
        </div>

        <div className="flex items-center gap-2">
          {done && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-parchment/70 hover:text-parchment border border-parchment/20 rounded-lg transition-colors"
            >
              {expanded ? <><EyeOff size={12} /> 숨기기</> : <><Eye size={12} /> 자막 보기</>}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isLoading || savingScene}
            className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            {isLoading ? "생성 중..." : savingScene ? "저장 중..." : `자막 생성 (${sceneCount}씬)`}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm font-body">{error}</p>}

      {/* 다운로드 버튼 */}
      {done && (srtKo || srtHe || srtEn) && (
        <div className="flex flex-wrap gap-2">
          {srtKo && <DownloadButton href={`/api/v1/contents/${srtKo.id}/download`} label="KO .srt" />}
          {srtHe && <DownloadButton href={`/api/v1/contents/${srtHe.id}/download`} label="HE .srt" />}
          {srtEn && <DownloadButton href={`/api/v1/contents/${srtEn.id}/download`} label="EN .srt" />}
        </div>
      )}

      {/* SRT 뷰어 */}
      {done && expanded && maxScenes > 0 && (
        <div className="border border-gold/20 rounded-xl overflow-hidden bg-ink-light">
          {/* 탭 */}
          <div className="flex border-b border-gold/20 bg-ink">
            {([
              { key: "table" as ViewTab, label: "씬 정렬 비교" },
              { key: "ko" as ViewTab, label: "🇰🇷 한국어" },
              { key: "he" as ViewTab, label: "🔤 히브리어" },
              { key: "en" as ViewTab, label: "🇺🇸 영어" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewTab(key)}
                className={`px-3 py-2 text-xs font-body transition-colors border-b-2 -mb-px ${
                  viewTab === key
                    ? "border-gold text-gold"
                    : "border-transparent text-parchment/40 hover:text-parchment/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 씬 정렬 비교 */}
          {viewTab === "table" && (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs font-body">
                <thead className="sticky top-0 bg-ink border-b border-gold/20">
                  <tr>
                    <th className="px-3 py-2 text-left text-parchment/50 w-10">씬</th>
                    <th className="px-3 py-2 text-left text-parchment/60">🇰🇷 한국어</th>
                    <th className="px-3 py-2 text-right text-amber-300/60" dir="rtl">🔤 히브리어</th>
                    <th className="px-3 py-2 text-left text-blue-300/60">🇺🇸 영어</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxScenes }, (_, i) => {
                    const ko = koScenes[i];
                    const he = heScenes[i];
                    const en = enScenes[i];
                    return (
                      <tr
                        key={i}
                        className={`border-b border-gold/10 ${i % 2 === 0 ? "bg-ink" : "bg-ink-light"}`}
                      >
                        <td className="px-3 py-2 text-center">
                          <span className="inline-block bg-gold/20 text-gold rounded px-1.5 py-0.5 text-xs font-mono">{i + 1}</span>
                        </td>
                        <td className="px-3 py-2 text-parchment/80 max-w-[200px]">
                          {ko?.text || <span className="text-red-400/60 italic">없음</span>}
                        </td>
                        <td className="px-3 py-2 text-amber-200/80 max-w-[200px]" dir="rtl">
                          {he?.text || <span className="text-red-400/60 italic">없음</span>}
                        </td>
                        <td className="px-3 py-2 text-blue-200/70 max-w-[200px]">
                          {en?.text || <span className="text-parchment/30 italic">없음</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 단일 언어 SRT 전체 보기 */}
          {viewTab !== "table" && (() => {
            const content = viewTab === "ko" ? srtKo : viewTab === "he" ? srtHe : srtEn;
            const scenes = viewTab === "ko" ? koScenes : viewTab === "he" ? heScenes : enScenes;
            const isRtl = viewTab === "he";
            return (
              <div className="p-3 space-y-1 max-h-[500px] overflow-y-auto">
                {content && (
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-parchment/40 text-xs">{scenes.length}개 씬</span>
                    <DownloadButton href={`/api/v1/contents/${content.id}/download`} label=".srt 다운로드" />
                  </div>
                )}
                {scenes.map((scene) => (
                  <div
                    key={scene.num}
                    className="flex gap-2 py-2 border-b border-gold/10 last:border-0"
                    dir={isRtl ? "rtl" : "ltr"}
                  >
                    <span className="flex-shrink-0 text-gold/60 font-mono text-xs w-5 text-right mt-0.5">{scene.num}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${isRtl ? "text-amber-200/90" : "text-parchment/85"} break-words`}>
                        {scene.text}
                      </p>
                      <p className="text-parchment/25 text-xs font-mono mt-0.5">{scene.time}</p>
                    </div>
                  </div>
                ))}
                {scenes.length === 0 && (
                  <p className="text-parchment/30 text-sm italic text-center py-4">미생성</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
