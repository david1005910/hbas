import { useState, useEffect } from "react";
import { Play, RefreshCw, Film, CheckCircle, XCircle, Clock, FileText, Mic2, Trash2 } from "lucide-react";
import { videoClipsApi } from "../../api/videoClips";
import type { SceneKeyframe, SceneVideoClip } from "../../types";

interface Props {
  episodeId: string;
  keyframes: SceneKeyframe[];
  initialClips: SceneVideoClip[];
  onUpdate?: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING: <Clock size={14} style={{ color: "rgba(255,255,255,0.5)" }} />,
  PROCESSING: <RefreshCw size={14} className="animate-spin" style={{ color: "#f0abfc" }} />,
  COMPLETED: <CheckCircle size={14} style={{ color: "#86efac" }} />,
  FAILED: <XCircle size={14} style={{ color: "#fca5a5" }} />,
};

export function VideoClipManager({ episodeId, keyframes, initialClips, onUpdate }: Props) {
  const [clips, setClips] = useState<SceneVideoClip[]>(initialClips);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [confirmScene, setConfirmScene] = useState<number | null>(null);
  const [isBurningSubtitles, setIsBurningSubtitles] = useState(false);
  const [isAddingNarration, setIsAddingNarration] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    const processing = clips.filter((c) => c.status === "PROCESSING");
    if (processing.length === 0) return;

    const interval = setInterval(async () => {
      for (const clip of processing) {
        const updated = await videoClipsApi.status(clip.id);
        setClips((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [clips]);

  async function handleStartGeneration(keyframeId: string, sceneNumber: number, motionPrompt?: string) {
    const clip = await videoClipsApi.start(keyframeId, {
      confirmed: true,
      motionPrompt,
      durationSec: 8,
    });
    setClips((prev) => [...prev, clip]);
    setConfirmScene(null);
  }

  async function handleDeleteClip(clipId: string) {
    try {
      await videoClipsApi.delete(clipId);
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      onUpdate?.();
    } catch (e: any) {
      setActionMsg(`⚠️ 삭제 오류: ${e?.response?.data?.error ?? e.message}`);
    }
  }

  async function handleBurnSubtitles() {
    setIsBurningSubtitles(true);
    setActionMsg("");
    try {
      const res = await videoClipsApi.burnSubtitles(episodeId);
      setActionMsg(`✅ ${res.message}`);
      onUpdate?.();
    } catch (e: any) {
      setActionMsg(`⚠️ 자막 오류: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setIsBurningSubtitles(false);
    }
  }

  async function handleAddNarration() {
    setIsAddingNarration(true);
    setActionMsg("");
    try {
      const res = await videoClipsApi.addNarration(episodeId);
      setActionMsg(`✅ ${res.message}`);
      onUpdate?.();
    } catch (e: any) {
      setActionMsg(`⚠️ 나레이션 오류: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setIsAddingNarration(false);
    }
  }

  async function handleMerge() {
    setIsMerging(true);
    setMergeError("");
    setMergeResult(null);
    try {
      const res = await videoClipsApi.merge(episodeId);
      setMergeResult(res.outputPath ?? "완료");
      onUpdate?.();
    } catch (e: any) {
      setMergeError(e?.response?.data?.error ?? e.message ?? "병합 실패");
    } finally {
      setIsMerging(false);
    }
  }

  const selectedKeyframes = keyframes.filter((k) => k.isSelected);
  const completedCount = clips.filter((c) => c.status === "COMPLETED").length;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "32px",
        padding: "24px",
        background: "linear-gradient(135deg, #f97316 0%, #ec4899 35%, #8b5cf6 65%, #3b82f6 100%)",
        boxShadow: "0px 12px 32px rgba(0,0,0,0.25)",
        overflow: "hidden",
      }}
    >
      {/* SVG gooey filter */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="goo-vcm">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
        </filter>
      </svg>

      {/* Blob decorations */}
      <div style={{
        position: "absolute", top: "-40px", right: "-40px",
        width: "180px", height: "180px",
        background: "radial-gradient(circle, rgba(236,72,153,0.55) 0%, transparent 70%)",
        borderRadius: "60% 40% 70% 30% / 50% 60% 40% 70%",
        filter: "blur(40px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-30px", left: "-30px",
        width: "160px", height: "160px",
        background: "radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)",
        borderRadius: "40% 60% 30% 70% / 70% 30% 60% 40%",
        filter: "blur(40px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "40%", left: "50%",
        width: "120px", height: "120px",
        background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)",
        borderRadius: "50%",
        filter: "blur(35px)",
        pointerEvents: "none",
      }} />

      {/* Glossy main panel */}
      <div
        style={{
          position: "relative",
          borderRadius: "24px",
          background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.3)",
          boxShadow: "inset 0px 1px 2px rgba(255,255,255,0.3), 0px 8px 24px rgba(0,0,0,0.15)",
          padding: "20px",
        }}
      >
        {/* Glossy top highlight */}
        <div style={{
          position: "absolute", top: 0, left: "12px", right: "12px",
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
          borderRadius: "50%",
        }} />

        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3
                style={{
                  color: "#ffffff",
                  fontWeight: 600,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                  margin: 0,
                }}
                className="font-body"
              >
                Veo 2.0 영상 클립
              </h3>
              <p
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "0.75rem",
                  marginTop: "2px",
                  textShadow: "0px 1px 3px rgba(0,0,0,0.25)",
                }}
                className="font-body"
              >
                키프레임 → 8초 영상 변환 (승인 필요 · 고비용)
              </p>
            </div>
            {completedCount >= 2 && (
              <button
                onClick={handleMerge}
                disabled={isMerging}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 18px",
                  borderRadius: "20px",
                  background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.12) 100%)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: isMerging ? "not-allowed" : "pointer",
                  opacity: isMerging ? 0.5 : 1,
                  boxShadow: "0px 4px 16px rgba(0,0,0,0.15), inset 0px 1px 1px rgba(255,255,255,0.3)",
                  textShadow: "0px 1px 3px rgba(0,0,0,0.3)",
                  transition: "all 0.2s ease",
                }}
                className="font-body"
              >
                <Film size={14} />
                {isMerging ? "병합 중..." : "전체 클립 병합"}
              </button>
            )}
          </div>

          {/* Per-clip subtitle & narration action buttons */}
          {completedCount >= 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleBurnSubtitles}
                disabled={isBurningSubtitles}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px", borderRadius: "18px",
                  background: "linear-gradient(135deg, rgba(99,102,241,0.4) 0%, rgba(139,92,246,0.3) 100%)",
                  border: "1px solid rgba(255,255,255,0.3)", color: "#ffffff",
                  fontSize: "0.8rem", fontWeight: 500,
                  cursor: isBurningSubtitles ? "not-allowed" : "pointer",
                  opacity: isBurningSubtitles ? 0.5 : 1,
                  boxShadow: "0px 3px 10px rgba(0,0,0,0.15), inset 0px 1px 1px rgba(255,255,255,0.2)",
                  transition: "all 0.2s ease",
                }}
                className="font-body"
              >
                <FileText size={13} />
                {isBurningSubtitles ? "자막 삽입 중..." : "씬별 자막 삽입"}
              </button>
              <button
                onClick={handleAddNarration}
                disabled={isAddingNarration}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px", borderRadius: "18px",
                  background: "linear-gradient(135deg, rgba(236,72,153,0.4) 0%, rgba(249,115,22,0.3) 100%)",
                  border: "1px solid rgba(255,255,255,0.3)", color: "#ffffff",
                  fontSize: "0.8rem", fontWeight: 500,
                  cursor: isAddingNarration ? "not-allowed" : "pointer",
                  opacity: isAddingNarration ? 0.5 : 1,
                  boxShadow: "0px 3px 10px rgba(0,0,0,0.15), inset 0px 1px 1px rgba(255,255,255,0.2)",
                  transition: "all 0.2s ease",
                }}
                className="font-body"
              >
                <Mic2 size={13} />
                {isAddingNarration ? "나레이션 합성 중..." : "씬별 나레이션 합성"}
              </button>
            </div>
          )}

          {/* Action message */}
          {actionMsg && (
            <div style={{
              borderRadius: "14px", padding: "8px 12px",
              background: actionMsg.startsWith("✅") ? "rgba(134,239,172,0.12)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${actionMsg.startsWith("✅") ? "rgba(134,239,172,0.3)" : "rgba(239,68,68,0.35)"}`,
              color: actionMsg.startsWith("✅") ? "#86efac" : "#fca5a5",
              fontSize: "0.78rem",
            }} className="font-body">
              {actionMsg}
            </div>
          )}

          {/* Merge result / error */}
          {mergeError && (
            <div style={{
              borderRadius: "16px", padding: "10px 14px",
              background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)",
              color: "#fca5a5", fontSize: "0.8rem",
              textShadow: "0px 1px 2px rgba(0,0,0,0.3)",
            }} className="font-body">
              ⚠️ {mergeError}
            </div>
          )}
          {mergeResult && (
            <div style={{
              borderRadius: "16px", padding: "10px 14px",
              background: "rgba(134,239,172,0.15)", border: "1px solid rgba(134,239,172,0.3)",
              color: "#86efac", fontSize: "0.8rem",
              textShadow: "0px 1px 2px rgba(0,0,0,0.3)",
            }} className="font-body">
              ✅ 병합 완료 — <a href={mergeResult} download style={{ color: "#f0abfc", textDecoration: "underline" }}>최종 MP4 다운로드</a>
            </div>
          )}

          {/* Empty state */}
          {selectedKeyframes.length === 0 && (
            <div
              style={{
                borderRadius: "20px",
                padding: "24px",
                textAlign: "center",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.875rem",
                textShadow: "0px 1px 3px rgba(0,0,0,0.2)",
              }}
              className="font-body"
            >
              키프레임 탭에서 Veo 전송할 씬을 선택하세요
            </div>
          )}

          {/* Clip list */}
          <div className="space-y-3">
            {selectedKeyframes.map((kf) => {
              const clip = clips.find((c) => c.keyframeId === kf.id);

              return (
                <div
                  key={kf.id}
                  style={{
                    borderRadius: "20px",
                    padding: "14px 16px",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    boxShadow: "inset 0px 1px 1px rgba(255,255,255,0.2), 0px 4px 12px rgba(0,0,0,0.12)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {kf.imageUrl && (
                        <img
                          src={kf.imageUrl}
                          alt=""
                          style={{
                            width: "64px",
                            height: "36px",
                            objectFit: "cover",
                            borderRadius: "12px",
                            boxShadow: "0px 2px 8px rgba(0,0,0,0.3)",
                          }}
                        />
                      )}
                      <div>
                        <p
                          style={{
                            color: "#ffffff",
                            fontSize: "0.875rem",
                            fontWeight: 600,
                            textShadow: "0px 1px 3px rgba(0,0,0,0.3)",
                          }}
                          className="font-body"
                        >
                          씬 {kf.sceneNumber}
                        </p>
                        {clip && (
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {STATUS_ICON[clip.status]}
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "rgba(255,255,255,0.6)",
                                textShadow: "0px 1px 2px rgba(0,0,0,0.2)",
                              }}
                              className="font-body"
                            >
                              {clip.status}
                            </span>
                            {clip.subClipUrl && (
                              <span style={{ fontSize: "0.7rem", color: "#a5b4fc", background: "rgba(99,102,241,0.2)", padding: "1px 6px", borderRadius: "8px" }}>자막</span>
                            )}
                            {clip.narrClipUrl && (
                              <span style={{ fontSize: "0.7rem", color: "#f9a8d4", background: "rgba(236,72,153,0.2)", padding: "1px 6px", borderRadius: "8px" }}>나레이션</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {clip?.status === "COMPLETED" && clip.clipUrl && (
                        <a
                          href={clip.clipUrl}
                          download
                          style={{
                            fontSize: "0.75rem",
                            color: "#f0abfc",
                            textDecoration: "none",
                            textShadow: "0px 0px 8px rgba(240,171,252,0.6)",
                          }}
                          className="font-body hover:underline"
                        >
                          다운로드
                        </a>
                      )}
                      {clip && (clip.status === "FAILED" || clip.status === "PENDING") && (
                        <button
                          onClick={() => handleDeleteClip(clip.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            padding: "5px 12px", borderRadius: "14px",
                            background: "rgba(239,68,68,0.2)",
                            border: "1px solid rgba(239,68,68,0.4)",
                            color: "#fca5a5", fontSize: "0.75rem",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                          className="font-body"
                          title="클립 삭제"
                        >
                          <Trash2 size={12} />
                          삭제
                        </button>
                      )}
                      {!clip && confirmScene !== kf.sceneNumber && (
                        <button
                          onClick={() => setConfirmScene(kf.sceneNumber)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            borderRadius: "16px",
                            background: "linear-gradient(135deg, rgba(249,115,22,0.4) 0%, rgba(236,72,153,0.3) 100%)",
                            border: "1px solid rgba(255,255,255,0.3)",
                            color: "#ffffff",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            boxShadow: "0px 2px 8px rgba(0,0,0,0.15), inset 0px 1px 1px rgba(255,255,255,0.2)",
                            textShadow: "0px 1px 3px rgba(0,0,0,0.3)",
                            transition: "all 0.2s ease",
                          }}
                          className="font-body"
                        >
                          <Play size={12} />
                          영상 생성
                        </button>
                      )}
                      {confirmScene === kf.sceneNumber && (
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "rgba(255,255,255,0.7)",
                              textShadow: "0px 1px 2px rgba(0,0,0,0.2)",
                            }}
                            className="font-body"
                          >
                            비용 발생. 확인?
                          </span>
                          <button
                            onClick={() => handleStartGeneration(kf.id, kf.sceneNumber)}
                            style={{
                              padding: "5px 14px",
                              borderRadius: "16px",
                              background: "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.2) 100%)",
                              border: "1px solid rgba(255,255,255,0.5)",
                              color: "#ffffff",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0px 2px 8px rgba(0,0,0,0.2), inset 0px 1px 1px rgba(255,255,255,0.4)",
                              textShadow: "0px 1px 3px rgba(0,0,0,0.3)",
                            }}
                            className="font-body"
                          >
                            확인
                          </button>
                          <button
                            onClick={() => setConfirmScene(null)}
                            style={{
                              padding: "5px 14px",
                              borderRadius: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              color: "rgba(255,255,255,0.6)",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                            className="font-body"
                          >
                            취소
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {clip?.status === "COMPLETED" && clip.clipUrl && (
                    <video
                      src={clip.clipUrl}
                      controls
                      style={{
                        width: "100%",
                        marginTop: "12px",
                        borderRadius: "16px",
                        maxHeight: "200px",
                        boxShadow: "0px 4px 16px rgba(0,0,0,0.3)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
