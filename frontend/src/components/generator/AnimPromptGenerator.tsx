import { useState, useEffect } from "react";
import { Wand2, Pencil, Save, X, CheckCircle2, ArrowRight } from "lucide-react";
import { streamGenerate } from "../../api/generate";
import { StreamingOutput } from "../ui/StreamingOutput";
import { DownloadButton } from "../ui/DownloadButton";
import { api } from "../../api/client";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing?: GeneratedContent;
  onDone?: () => void;
  onNextStep?: () => void;   // 키프레임 탭으로 이동
}

type Mode = "view" | "edit";

export function AnimPromptGenerator({ episodeId, existing, onDone, onNextStep }: Props) {
  const [content, setContent] = useState(existing?.content ?? "");
  const [editContent, setEditContent] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedOk, setSavedOk] = useState(false);
  const [streamError, setStreamError] = useState("");

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
    streamGenerate(
      episodeId,
      "anim-prompt",
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
      setSaveError("저장하려면 먼저 프롬프트를 생성해주세요.");
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
          <h3 className="text-parchment font-body font-semibold">애니메이션 프롬프트</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">
            씬별 이미지·영상 프롬프트 (Nano Banana / Veo용)
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
            {isStreaming ? "생성 중..." : (hasContent ? "재생성" : "프롬프트 생성")}
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
          placeholder="Nano Banana·Veo 프롬프트가 씬별로 생성됩니다..."
        />
      ) : (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full bg-ink-light border border-gold/30 focus:border-gold/60 rounded-lg p-4 text-parchment font-body text-sm leading-relaxed resize-y outline-none transition-colors"
            style={{ minHeight: "400px" }}
            placeholder="프롬프트를 편집하세요..."
          />
          <p className="text-xs text-parchment/40 font-body text-right">
            {editContent.length.toLocaleString()}자
          </p>
        </div>
      )}

      {/* 다음 단계: 키프레임 생성으로 */}
      {hasContent && !isStreaming && mode === "view" && onNextStep && (
        <div className="flex justify-end pt-2 border-t border-gold/10">
          <button
            onClick={onNextStep}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600/80 hover:bg-blue-600 text-white text-sm font-body font-semibold rounded-lg transition-colors"
          >
            키프레임 생성으로
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
