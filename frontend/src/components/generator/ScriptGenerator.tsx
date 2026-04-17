import { useState, useEffect } from "react";
import { Wand2, Pencil, Save, X, CheckCircle2, Lightbulb } from "lucide-react";
import { streamGenerate } from "../../api/generate";
import { episodesApi } from "../../api/episodes";
import { StreamingOutput } from "../ui/StreamingOutput";
import { DownloadButton } from "../ui/DownloadButton";
import { api } from "../../api/client";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing?: GeneratedContent;
  sceneCount?: number;
  verseRange?: string;
  onDone?: () => void;
}

/** 구절 범위 문자열에서 절 수 추산 */
function estimateVerseCount(verseRange?: string): number {
  if (!verseRange) return 0;
  const chapterVerse = verseRange.match(/^(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)$/);
  if (chapterVerse) {
    const [, startCh, , endCh, endV] = chapterVerse.map(Number);
    return (endCh - startCh) * 30 + endV;
  }
  const simpleRange = verseRange.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (simpleRange) return Number(simpleRange[2]) - Number(simpleRange[1]) + 1;
  return 0;
}

function recommendScenes(verseCount: number, current: number): number {
  if (verseCount <= 0) return current;
  if (verseCount <= 3) return verseCount;
  if (verseCount <= 7) return Math.ceil(verseCount * 0.8);
  if (verseCount <= 15) return Math.ceil(verseCount * 0.6);
  if (verseCount <= 31) return Math.max(8, Math.ceil(verseCount * 0.45));
  return Math.max(10, Math.ceil(verseCount * 0.35));
}

type Mode = "view" | "edit";

export function ScriptGenerator({ episodeId, existing, sceneCount: initialSceneCount = 5, verseRange, onDone }: Props) {
  const [content, setContent] = useState(existing?.content ?? "");
  const [editContent, setEditContent] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedOk, setSavedOk] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [sceneCount, setSceneCount] = useState(initialSceneCount);

  useEffect(() => { setSceneCount(initialSceneCount); }, [initialSceneCount]);

  const verseCount = estimateVerseCount(verseRange);
  const recommended = recommendScenes(verseCount, sceneCount);

  // existing이 바뀌면(부모 새로고침) content 동기화
  useEffect(() => {
    if (existing?.content && !isStreaming) {
      setContent(existing.content);
    }
  }, [existing?.content]);

  async function handleGenerate() {
    // 씬 수가 바뀌었으면 먼저 에피소드에 저장
    if (sceneCount !== initialSceneCount) {
      try { await episodesApi.update(episodeId, { sceneCount }); } catch {}
    }
    setContent("");
    setStreamError("");
    setSaveError("");
    setSavedOk(false);
    setMode("view");
    setIsStreaming(true);
    streamGenerate(
      episodeId,
      "script",
      (chunk) => setContent((prev) => prev + chunk),
      () => { setIsStreaming(false); onDone?.(); },
      (msg) => { setStreamError(msg); setIsStreaming(false); }
    );
  }

  function handleEditStart() {
    setEditContent(content);
    setSaveError("");
    setSavedOk(false);
    setMode("edit");
  }

  function handleEditCancel() {
    setMode("view");
    setSaveError("");
  }

  async function handleSave() {
    if (!existing?.id) {
      setSaveError("저장하려면 먼저 대본을 생성해주세요.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await api.patch(`/contents/${existing.id}`, { content: editContent });
      setContent(editContent);
      setMode("view");
      setSavedOk(true);
      onDone?.();
    } catch (err: any) {
      setSaveError(err.response?.data?.error ?? err.message ?? "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }

  const hasContent = content.trim().length > 0;
  const downloadUrl = existing ? `/api/v1/contents/${existing.id}/download` : undefined;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-parchment font-body font-semibold">한국어·히브리어 대본</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">
            Gemini 2.5 Flash로 씬별 이중 언어 대본 생성
          </p>
        </div>

        {/* 씬 수 선택 + 추천 */}
        <div className="flex items-center gap-2">
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

        <div className="flex items-center gap-2">
          {savedOk && mode === "view" && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-body">
              <CheckCircle2 size={13} />
              저장 완료
            </span>
          )}

          {/* 편집 모드 버튼 */}
          {mode === "view" && hasContent && !isStreaming && (
            <button
              onClick={handleEditStart}
              className="flex items-center gap-1.5 px-3 py-2 bg-parchment/10 hover:bg-parchment/20 text-parchment/70 hover:text-parchment border border-parchment/20 text-sm font-body rounded-lg transition-colors"
            >
              <Pencil size={13} />
              편집
            </button>
          )}

          {/* 편집 모드: 저장 / 취소 */}
          {mode === "edit" && (
            <>
              <button
                onClick={handleEditCancel}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-2 bg-parchment/10 hover:bg-parchment/20 disabled:opacity-40 text-parchment/70 border border-parchment/20 text-sm font-body rounded-lg transition-colors"
              >
                <X size={13} />
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-body font-semibold rounded-lg transition-colors"
              >
                <Save size={13} />
                {isSaving ? "저장 중..." : "저장하기"}
              </button>
            </>
          )}

          {downloadUrl && mode === "view" && (
            <DownloadButton href={downloadUrl} label="TXT 저장" />
          )}

          <button
            onClick={handleGenerate}
            disabled={isStreaming}
            className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            <Wand2 size={14} />
            {isStreaming ? "생성 중..." : (hasContent ? "재생성" : "대본 생성")}
          </button>
        </div>
      </div>

      {/* 에러 */}
      {streamError && <p className="text-red-400 text-sm font-body">{streamError}</p>}
      {saveError && <p className="text-red-400 text-sm font-body">{saveError}</p>}

      {/* 콘텐츠 영역 */}
      {mode === "view" ? (
        <StreamingOutput
          content={content}
          isStreaming={isStreaming}
          placeholder="대본이 여기에 스트리밍됩니다..."
        />
      ) : (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full bg-ink-light border border-gold/30 focus:border-gold/60 rounded-lg p-4 text-parchment font-body text-sm whitespace-pre-wrap leading-relaxed resize-y outline-none transition-colors"
            style={{ minHeight: "400px" }}
            placeholder="대본을 편집하세요..."
          />
          <p className="text-xs text-parchment/40 font-body text-right">
            {editContent.length.toLocaleString()}자
          </p>
        </div>
      )}
    </div>
  );
}
