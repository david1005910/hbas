import { useState, useEffect } from "react";
import { Wand2, Pencil, Save, X, CheckCircle2 } from "lucide-react";
import { streamGenerate } from "../../api/generate";
import { StreamingOutput } from "../ui/StreamingOutput";
import { DownloadButton } from "../ui/DownloadButton";
import { api } from "../../api/client";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing?: GeneratedContent;
  onDone?: () => void;
}

type Mode = "view" | "edit";

export function ScriptGenerator({ episodeId, existing, onDone }: Props) {
  const [content, setContent] = useState(existing?.content ?? "");
  const [editContent, setEditContent] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedOk, setSavedOk] = useState(false);
  const [streamError, setStreamError] = useState("");

  // existing이 바뀌면(부모 새로고침) content 동기화
  useEffect(() => {
    if (existing?.content && !isStreaming) {
      setContent(existing.content);
    }
  }, [existing?.content]);

  function handleGenerate() {
    setContent("");
    setStreamError("");
    setSaveError("");
    setSavedOk(false);
    setMode("view");
    setIsStreaming(true);
    const stop = streamGenerate(
      episodeId,
      "script",
      (chunk) => setContent((prev) => prev + chunk),
      () => { setIsStreaming(false); onDone?.(); },
      (msg) => { setStreamError(msg); setIsStreaming(false); }
    );
    return stop;
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">한국어·히브리어 대본</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">
            Gemini 2.5 Flash로 씬별 이중 언어 대본 생성
          </p>
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
