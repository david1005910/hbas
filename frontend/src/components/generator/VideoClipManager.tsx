import { useState, useEffect, useRef } from "react";
import { Play, RefreshCw, Film, CheckCircle, XCircle, Clock, FileText, Mic2, Trash2, RotateCcw, Music, Upload, Volume2, X } from "lucide-react";
import { videoClipsApi } from "../../api/videoClips";
import { bgmApi } from "../../api/bgm";
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

function clipStatusLabel(clip: import("../../types").SceneVideoClip): string {
  if (clip.status === "PROCESSING") {
    if (clip.seqOrder > 0 && clip.seqTotal > 0) {
      return `연속 생성 중 (${clip.seqOrder}/${clip.seqTotal})`;
    }
    if (clip.extendCount > 0) {
      const currentSec = 8 + clip.extendCount * 7;
      return `연장 중 (${clip.extendCount}회 완료 · ${currentSec}s)`;
    }
  }
  if (clip.status === "COMPLETED") {
    return `완료 (${clip.durationSec}초)`;
  }
  return clip.status;
}

export function VideoClipManager({ episodeId, keyframes, initialClips, onUpdate }: Props) {
  const [clips, setClips] = useState<SceneVideoClip[]>(initialClips);

  // 부모에서 클립 목록이 새로 갱신되면 동기화 (탭 전환 후 재진입 시)
  useEffect(() => {
    setClips(initialClips);
  }, [initialClips]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [confirmScene, setConfirmScene] = useState<number | null>(null);
  const [isBurningSubtitles, setIsBurningSubtitles] = useState(false);
  const [isAddingNarration, setIsAddingNarration] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [isProducing, setIsProducing] = useState(false);
  const [produceLog, setProduceLog] = useState<string[]>([]);
  const [finalOutputUrl, setFinalOutputUrl] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [clipActionState, setClipActionState] = useState<Record<string, { sub?: boolean; narr?: boolean }>>({});

  useEffect(() => {
    // clips 변경 시마다 현재 PROCESSING 목록으로 갱신된 interval 재생성
    const processing = clips.filter((c) => c.status === "PROCESSING");
    if (processing.length === 0) return;

    const interval = setInterval(async () => {
      // 최신 clips state가 아닌 effect 시점의 processing 목록을 사용하므로
      // setState 콜백으로 최신 prev를 사용해 안전하게 업데이트
      for (const clip of processing) {
        try {
          const updated = await videoClipsApi.status(clip.id);
          setClips((prev) => {
            let next = prev.map((c) => c.id === updated.id ? updated : c);
            // 연속 체인: 다음 클립이 생성됐으면 목록에 추가
            if (updated.nextClip && !next.find((c) => c.id === updated.nextClip!.id)) {
              next = [...next, updated.nextClip];
            }
            return next;
          });
        } catch {
          // 폴링 오류는 무시 (다음 interval에 재시도)
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [clips]);

  const CLIPS_PER_SCENE = 5; // 씬당 생성할 클립 수

  async function handleStartGeneration(keyframeId: string, sceneNumber: number, motionPrompt?: string) {
    try {
      const clip = await videoClipsApi.start(keyframeId, {
        confirmed: true,
        motionPrompt,
        durationSec: 8,
      });
      setClips((prev) => [...prev, clip]);
      setConfirmScene(null);
    } catch (e: any) {
      setConfirmScene(null);
      setActionMsg(`⚠️ 씬 ${sceneNumber} 생성 오류: ${e?.response?.data?.error ?? e.message}`);
    }
  }

  async function handleGenerateSceneClips(sceneNumber: number) {
    setConfirmScene(null);
    setActionMsg(`씬 ${sceneNumber}: ${CLIPS_PER_SCENE}개 클립 생성 요청 중...`);
    try {
      const res = await videoClipsApi.generateSceneClips(episodeId, sceneNumber, CLIPS_PER_SCENE);
      setClips((prev) => [...prev, ...res.clips]);
      setActionMsg(`✅ 씬 ${sceneNumber}: ${res.totalTarget}개 연속 클립 생성 시작 — 각 클립 완료 후 자동으로 다음 클립 생성 (약 ${res.totalTarget * 2}~${res.totalTarget * 3}분)`);
    } catch (e: any) {
      setActionMsg(`⚠️ 씬 ${sceneNumber} 생성 오류: ${e?.response?.data?.error ?? e.message}`);
    }
  }

  async function handleResetClips() {
    setIsResetting(true);
    setActionMsg("");
    try {
      const res = await videoClipsApi.resetClips(episodeId);
      setActionMsg(`✅ ${res.message}`);
      setProduceLog([]);
      setFinalOutputUrl(null);
      onUpdate?.();
    } catch (e: any) {
      setActionMsg(`⚠️ 초기화 오류: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setIsResetting(false);
    }
  }

  async function handleProduceFinal() {
    setIsProducing(true);
    setProduceLog([]);
    setFinalOutputUrl(null);
    setMergeError("");

    const url = `${videoClipsApi.produceFinalUrl(episodeId)}?bgmVolume=${(bgmVolume / 100).toFixed(2)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.step === "result") {
        setFinalOutputUrl(data.outputUrl);
        onUpdate?.();
      } else if (data.msg) {
        setProduceLog((prev) => [...prev, data.msg]);
      }
      if (data.done) {
        es.close();
        setIsProducing(false);
      }
      if (data.error && data.step === "error") {
        setMergeError(data.msg);
        es.close();
        setIsProducing(false);
      }
    };

    es.onerror = () => {
      setMergeError("연결 오류 — 백엔드 로그를 확인하세요");
      es.close();
      setIsProducing(false);
    };
  }

  async function handleDeleteClip(clipId: string) {
    try {
      await videoClipsApi.delete(clipId);
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      setConfirmDeleteId(null);
      onUpdate?.();
    } catch (e: any) {
      setConfirmDeleteId(null);
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

  async function handleBurnSubtitleOne(clipId: string, sceneNumber: number) {
    setClipActionState((prev) => ({ ...prev, [clipId]: { ...prev[clipId], sub: true } }));
    setActionMsg("");
    try {
      const res = await videoClipsApi.burnSubtitleOne(clipId);
      setClips((prev) => prev.map((c) => c.id === clipId ? res.clip : c));
      setActionMsg(`✅ 씬 ${sceneNumber} 자막 삽입 완료`);
    } catch (e: any) {
      setActionMsg(`⚠️ 씬 ${sceneNumber} 자막 오류: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setClipActionState((prev) => ({ ...prev, [clipId]: { ...prev[clipId], sub: false } }));
    }
  }

  async function handleAddNarrationOne(clipId: string, sceneNumber: number) {
    setClipActionState((prev) => ({ ...prev, [clipId]: { ...prev[clipId], narr: true } }));
    setActionMsg("");
    try {
      const res = await videoClipsApi.addNarrationOne(clipId);
      setClips((prev) => prev.map((c) => c.id === clipId ? res.clip : c));
      setActionMsg(`✅ 씬 ${sceneNumber} 나레이션 합성 완료`);
    } catch (e: any) {
      setActionMsg(`⚠️ 씬 ${sceneNumber} 나레이션 오류: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setClipActionState((prev) => ({ ...prev, [clipId]: { ...prev[clipId], narr: false } }));
    }
  }

  async function handleMerge() {
    setIsMerging(true);
    setMergeError("");
    setMergeResult(null);
    try {
      const res = await videoClipsApi.merge(episodeId, bgmVolume / 100);
      setMergeResult(res.outputPath ?? "완료");
      onUpdate?.();
    } catch (e: any) {
      setMergeError(e?.response?.data?.error ?? e.message ?? "병합 실패");
    } finally {
      setIsMerging(false);
    }
  }

  const [bgmInfo, setBgmInfo] = useState<{ bgmUrl: string | null; isCustom: boolean; activeFileExists: boolean; activeFileSizeKb: number | null } | null>(null);
  const [bgmVolume, setBgmVolume] = useState(10); // 0~100 (%)
  const [bgmUploading, setBgmUploading] = useState(false);
  const [bgmMsg, setBgmMsg] = useState("");
  const bgmInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bgmApi.info(episodeId).then(setBgmInfo).catch(() => {});
  }, [episodeId]);

  async function handleBgmUpload(file: File) {
    setBgmUploading(true);
    setBgmMsg("");
    try {
      const res = await bgmApi.upload(episodeId, file);
      setBgmMsg(`✅ ${res.filename} (${res.sizeKb}KB) 업로드 완료`);
      const info = await bgmApi.info(episodeId);
      setBgmInfo(info);
    } catch (e: any) {
      setBgmMsg(`⚠️ ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setBgmUploading(false);
    }
  }

  async function handleBgmDelete() {
    try {
      await bgmApi.delete(episodeId);
      setBgmMsg("🔄 기본 그레고리안 성가로 되돌림");
      const info = await bgmApi.info(episodeId);
      setBgmInfo(info);
    } catch (e: any) {
      setBgmMsg(`⚠️ ${e?.response?.data?.error ?? e.message}`);
    }
  }

  const [mergingScene, setMergingScene] = useState<number | null>(null);
  // 자동 병합이 이미 실행됐거나 진행 중인 씬 번호 추적 (중복 방지)
  const autoMergedScenes = useRef<Set<number>>(new Set());

  async function handleMergeScene(sceneNo: number) {
    setMergingScene(sceneNo);
    setActionMsg("");
    try {
      const res = await videoClipsApi.mergeScene(episodeId, sceneNo);
      setActionMsg(`✅ 씬 ${sceneNo} 병합 완료 (${res.totalDurationSec}초)`);
      // 병합 후 서버에서 최신 클립 목록 재조회 (병합된 단일 클립으로 갱신)
      const updated = await videoClipsApi.list(episodeId);
      setClips(updated);
      onUpdate?.();
    } catch (e: any) {
      // 자동 병합 실패 시 Set에서 제거 → 재시도 가능
      autoMergedScenes.current.delete(sceneNo);
      setActionMsg(`⚠️ 씬 ${sceneNo} 병합 실패: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setMergingScene(null);
    }
  }

  const selectedKeyframes = keyframes.filter((k) => k.isSelected);
  const completedCount = clips.filter((c) => c.status === "COMPLETED").length;
  // 씬별 완료 클립 수 집계
  const sceneClipCount = clips.reduce<Record<number, number>>((acc, c) => {
    if (c.status === "COMPLETED") acc[c.sceneNumber] = (acc[c.sceneNumber] ?? 0) + 1;
    return acc;
  }, {});

  // 씬의 완료 클립이 CLIPS_PER_SCENE개 되면 자동 병합
  // deps: clips — 클립 상태 변경(PROCESSING→COMPLETED) 시마다 체크
  useEffect(() => {
    for (const clip of clips) {
      if (clip.status !== "COMPLETED") continue;
      const sceneNo = clip.sceneNumber;
      const count = clips.filter((c) => c.sceneNumber === sceneNo && c.status === "COMPLETED").length;
      if (count >= CLIPS_PER_SCENE && !autoMergedScenes.current.has(sceneNo) && mergingScene !== sceneNo) {
        autoMergedScenes.current.add(sceneNo);
        handleMergeScene(sceneNo);
      }
    }
  // handleMergeScene은 렌더마다 재생성되지만 deps에 넣으면 무한루프 위험 → clips만 명시
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

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

          {/* ── BGM 업로드 + 음량 조절 패널 ── */}
          <div style={{
            borderRadius: "20px", padding: "16px 18px",
            background: "linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(217,70,239,0.15) 100%)",
            border: "1px solid rgba(139,92,246,0.4)",
          }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Music size={16} style={{ color: "#c084fc" }} />
                <div>
                  <p style={{ color: "#c084fc", fontWeight: 700, fontSize: "0.88rem", margin: 0 }} className="font-body">
                    배경음악 (BGM)
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.72rem", marginTop: "1px" }} className="font-body">
                    {bgmInfo?.isCustom
                      ? `커스텀 BGM (${bgmInfo.activeFileSizeKb ?? "?"}KB)`
                      : "기본: 그레고리안 성가"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* BGM 삭제 (커스텀일 때만) */}
                {bgmInfo?.isCustom && (
                  <button
                    onClick={handleBgmDelete}
                    title="기본 BGM으로 되돌림"
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      padding: "5px 10px", borderRadius: "12px",
                      background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)",
                      color: "#fca5a5", fontSize: "0.72rem", cursor: "pointer",
                    }}
                    className="font-body"
                  >
                    <X size={11} /> 삭제
                  </button>
                )}
                {/* BGM 업로드 버튼 */}
                <input
                  ref={bgmInputRef}
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/flac,.mp3,.wav,.ogg,.aac,.flac,.m4a"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBgmUpload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => bgmInputRef.current?.click()}
                  disabled={bgmUploading}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "7px 16px", borderRadius: "14px",
                    background: bgmUploading ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.35)",
                    border: "1px solid rgba(139,92,246,0.6)",
                    color: "#c084fc", fontWeight: 600, fontSize: "0.8rem",
                    cursor: bgmUploading ? "not-allowed" : "pointer",
                    opacity: bgmUploading ? 0.6 : 1,
                    transition: "all 0.2s",
                  }}
                  className="font-body"
                >
                  <Upload size={13} />
                  {bgmUploading ? "업로드 중..." : "파일 선택"}
                </button>
              </div>
            </div>

            {/* 음량 슬라이더 */}
            <div style={{ marginTop: "14px" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: "6px" }}>
                <div className="flex items-center gap-1.5">
                  <Volume2 size={13} style={{ color: "rgba(192,132,252,0.8)" }} />
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.75rem" }} className="font-body">
                    BGM 음량
                  </span>
                </div>
                <span style={{
                  color: "#c084fc", fontWeight: 700, fontSize: "0.85rem",
                  minWidth: "40px", textAlign: "right",
                }} className="font-body">
                  {bgmVolume}%
                </span>
              </div>
              <input
                type="range"
                min={0} max={100} step={5}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(Number(e.target.value))}
                style={{
                  width: "100%", accentColor: "#a855f7",
                  height: "6px", cursor: "pointer",
                }}
              />
              <div className="flex justify-between" style={{ marginTop: "3px" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.65rem" }} className="font-body">0% (무음)</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.65rem" }} className="font-body">50% (보통)</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.65rem" }} className="font-body">100%</span>
              </div>
            </div>

            {bgmMsg && (
              <p style={{ color: "rgba(192,132,252,0.9)", fontSize: "0.75rem", marginTop: "8px" }} className="font-body">
                {bgmMsg}
              </p>
            )}
          </div>

          {/* 최종 영상 생성 (자막+나레이션+BGM 통합) */}
          {completedCount >= 1 && (
            <div style={{
              borderRadius: "20px", padding: "16px 18px",
              background: "linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(59,130,246,0.15) 100%)",
              border: "1px solid rgba(16,185,129,0.4)",
            }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p style={{ color: "#6ee7b7", fontWeight: 700, fontSize: "0.9rem", margin: 0 }} className="font-body">
                    🎬 최종 영상 생성
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem", marginTop: "2px" }} className="font-body">
                    자막 삽입 → 나레이션 합성 → 병합 → BGM 자동 처리
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleProduceFinal}
                    disabled={isProducing || isResetting}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "10px 22px", borderRadius: "20px",
                      background: isProducing
                        ? "rgba(255,255,255,0.1)"
                        : "linear-gradient(135deg, rgba(16,185,129,0.5) 0%, rgba(59,130,246,0.4) 100%)",
                      border: "1px solid rgba(16,185,129,0.6)",
                      color: "#ffffff", fontWeight: 700, fontSize: "0.875rem",
                      cursor: (isProducing || isResetting) ? "not-allowed" : "pointer",
                      opacity: (isProducing || isResetting) ? 0.6 : 1,
                      boxShadow: "0px 4px 16px rgba(16,185,129,0.3), inset 0px 1px 1px rgba(255,255,255,0.3)",
                      transition: "all 0.2s ease",
                    }}
                    className="font-body"
                  >
                    {isProducing
                      ? <><RefreshCw size={14} className="animate-spin" /> 처리 중...</>
                      : <><Film size={14} /> 최종 영상 생성</>}
                  </button>
                  <button
                    onClick={handleResetClips}
                    disabled={isProducing || isResetting}
                    title="기존 자막/나레이션 처리 초기화 후 재처리"
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "10px 14px", borderRadius: "20px",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "rgba(255,255,255,0.6)", fontSize: "0.8rem",
                      cursor: (isProducing || isResetting) ? "not-allowed" : "pointer",
                      opacity: (isProducing || isResetting) ? 0.5 : 1,
                      transition: "all 0.2s ease",
                    }}
                    className="font-body"
                  >
                    <RotateCcw size={13} className={isResetting ? "animate-spin" : ""} />
                    초기화
                  </button>
                </div>
              </div>

              {/* 진행 로그 */}
              {produceLog.length > 0 && (
                <div style={{
                  marginTop: "12px", padding: "10px 12px", borderRadius: "12px",
                  background: "rgba(0,0,0,0.25)", fontFamily: "monospace",
                  fontSize: "0.75rem", color: "rgba(255,255,255,0.75)",
                  maxHeight: "140px", overflowY: "auto",
                }}>
                  {produceLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}

              {/* 최종 결과 */}
              {finalOutputUrl && (
                <div style={{
                  marginTop: "12px", padding: "10px 14px", borderRadius: "14px",
                  background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)",
                  color: "#6ee7b7", fontSize: "0.82rem",
                }} className="font-body">
                  ✅ 생성 완료 —{" "}
                  <a href={finalOutputUrl} download style={{ color: "#f0abfc", textDecoration: "underline" }}>
                    최종 MP4 다운로드
                  </a>
                </div>
              )}
            </div>
          )}

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

          {/* Clip list — 씬별 그룹 */}
          <div className="space-y-3">
            {selectedKeyframes.map((kf) => {
              // 이 씬의 모든 클립
              const sceneClips = clips.filter((c) => c.sceneNumber === kf.sceneNumber);
              const completed = sceneClips.filter((c) => c.status === "COMPLETED");
              const processing = sceneClips.filter((c) => c.status === "PROCESSING");
              const failed = sceneClips.filter((c) => c.status === "FAILED");
              // 대표 완료 클립 (병합 후 1개 남거나 나레이션/자막 있는 것 우선)
              const repClip = completed.find((c) => c.narrClipUrl) ?? completed.find((c) => c.subClipUrl) ?? completed[0];
              const isAutoMerging = mergingScene === kf.sceneNumber;
              const allDone = completed.length >= CLIPS_PER_SCENE;

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
                        {/* 상태 표시 */}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {sceneClips.length === 0 && (
                            <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }} className="font-body">
                              영상 없음
                            </span>
                          )}
                          {processing.length > 0 && (
                            <>
                              <RefreshCw size={13} className="animate-spin" style={{ color: "#f0abfc" }} />
                              <span style={{ fontSize: "0.72rem", color: "#f0abfc" }} className="font-body">
                                {(() => {
                                  const proc = processing[0];
                                  if (proc?.seqOrder > 0 && proc?.seqTotal > 0) {
                                    return `연속 생성 중 (${proc.seqOrder}/${proc.seqTotal})`;
                                  }
                                  return `생성 중 (${completed.length + processing.length}/${CLIPS_PER_SCENE})`;
                                })()}
                              </span>
                            </>
                          )}
                          {isAutoMerging && (
                            <>
                              <Film size={13} style={{ color: "#fbbf24" }} className="animate-pulse" />
                              <span style={{ fontSize: "0.72rem", color: "#fbbf24" }} className="font-body">
                                자동 병합 중…
                              </span>
                            </>
                          )}
                          {!isAutoMerging && completed.length > 0 && processing.length === 0 && (
                            <>
                              <CheckCircle size={13} style={{ color: "#86efac" }} />
                              <span style={{ fontSize: "0.72rem", color: "#86efac" }} className="font-body">
                                완료 ({completed.length}개 · {completed.reduce((s, c) => s + (c.durationSec ?? 8), 0)}초)
                              </span>
                            </>
                          )}
                          {failed.length > 0 && (
                            <span style={{ fontSize: "0.7rem", color: "#fca5a5", background: "rgba(239,68,68,0.15)", padding: "1px 6px", borderRadius: "8px" }} className="font-body">
                              실패 {failed.length}개
                            </span>
                          )}
                          {repClip?.subClipUrl && (
                            <span style={{ fontSize: "0.7rem", color: "#a5b4fc", background: "rgba(99,102,241,0.2)", padding: "1px 6px", borderRadius: "8px" }}>자막</span>
                          )}
                          {repClip?.narrClipUrl && (
                            <span style={{ fontSize: "0.7rem", color: "#f9a8d4", background: "rgba(236,72,153,0.2)", padding: "1px 6px", borderRadius: "8px" }}>나레이션</span>
                          )}
                        </div>
                        {/* 진행 바 (생성 중일 때) */}
                        {(processing.length > 0 || (completed.length > 0 && completed.length < CLIPS_PER_SCENE && processing.length === 0)) && (
                          <div style={{ marginTop: "6px", width: "160px" }}>
                            <div style={{ height: "4px", borderRadius: "4px", background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${(() => {
                                  const proc = processing[0];
                                  if (proc?.seqOrder > 0 && proc?.seqTotal > 0) {
                                    // 연속 모드: 이전 완료분 + 현재 진행 중 (0.5로 표현)
                                    return ((proc.seqOrder - 1 + 0.5) / proc.seqTotal) * 100;
                                  }
                                  return (completed.length / CLIPS_PER_SCENE) * 100;
                                })()}%`,
                                background: "linear-gradient(90deg, #a855f7, #ec4899)",
                                transition: "width 0.5s ease",
                                borderRadius: "4px",
                              }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {repClip?.clipUrl && (
                        <a
                          href={repClip.clipUrl}
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
                      {repClip && confirmDeleteId !== repClip.id && (
                        <button
                          onClick={() => setConfirmDeleteId(repClip.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            padding: "5px 10px", borderRadius: "14px",
                            background: "rgba(239,68,68,0.15)",
                            border: "1px solid rgba(239,68,68,0.3)",
                            color: "#fca5a5", fontSize: "0.72rem",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                          className="font-body"
                          title="클립 삭제"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                      {repClip && confirmDeleteId === repClip.id && (
                        <div className="flex items-center gap-1.5">
                          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }} className="font-body">
                            삭제?
                          </span>
                          <button
                            onClick={() => handleDeleteClip(repClip.id)}
                            style={{
                              padding: "4px 10px", borderRadius: "12px",
                              background: "rgba(239,68,68,0.4)",
                              border: "1px solid rgba(239,68,68,0.6)",
                              color: "#fca5a5", fontSize: "0.72rem",
                              fontWeight: 700, cursor: "pointer",
                            }}
                            className="font-body"
                          >
                            확인
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: "4px 10px", borderRadius: "12px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              color: "rgba(255,255,255,0.5)", fontSize: "0.72rem",
                              cursor: "pointer",
                            }}
                            className="font-body"
                          >
                            취소
                          </button>
                        </div>
                      )}
                      {/* 씬 영상 생성 버튼 (클립 없거나 전부 실패한 경우) */}
                      {sceneClips.length === 0 || (completed.length === 0 && processing.length === 0) ? (
                        confirmScene !== kf.sceneNumber ? (
                          <button
                            onClick={() => setConfirmScene(kf.sceneNumber)}
                            style={{
                              display: "flex", alignItems: "center", gap: "6px",
                              padding: "7px 14px", borderRadius: "16px",
                              background: "linear-gradient(135deg, rgba(249,115,22,0.45) 0%, rgba(236,72,153,0.35) 100%)",
                              border: "1px solid rgba(255,255,255,0.35)",
                              color: "#ffffff", fontSize: "0.78rem", fontWeight: 600,
                              cursor: "pointer",
                              boxShadow: "0px 3px 10px rgba(0,0,0,0.2), inset 0px 1px 1px rgba(255,255,255,0.2)",
                              transition: "all 0.2s ease",
                            }}
                            className="font-body"
                          >
                            <Play size={13} />
                            씬 영상 생성 ({CLIPS_PER_SCENE}×8s)
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.8)" }} className="font-body">
                              Veo {CLIPS_PER_SCENE}회 비용 발생. 확인?
                            </span>
                            <button
                              onClick={() => handleGenerateSceneClips(kf.sceneNumber)}
                              style={{
                                padding: "5px 14px", borderRadius: "14px",
                                background: "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.2) 100%)",
                                border: "1px solid rgba(255,255,255,0.5)",
                                color: "#ffffff", fontSize: "0.75rem", fontWeight: 700,
                                cursor: "pointer",
                              }}
                              className="font-body"
                            >
                              확인
                            </button>
                            <button
                              onClick={() => setConfirmScene(null)}
                              style={{
                                padding: "5px 12px", borderRadius: "14px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                color: "rgba(255,255,255,0.6)", fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                              className="font-body"
                            >
                              취소
                            </button>
                          </div>
                        )
                      ) : null}

                      {/* 수동 병합 버튼 (2개 이상 완료, 자동 병합 대기/실패 시) */}
                      {completed.length >= 2 && !isAutoMerging && !autoMergedScenes.current.has(kf.sceneNumber) && (
                        <button
                          onClick={() => handleMergeScene(kf.sceneNumber)}
                          style={{
                            display: "flex", alignItems: "center", gap: "5px",
                            padding: "5px 12px", borderRadius: "14px",
                            background: "rgba(251,191,36,0.2)",
                            border: "1px solid rgba(251,191,36,0.45)",
                            color: "#fbbf24", fontSize: "0.72rem", fontWeight: 600,
                            cursor: "pointer",
                          }}
                          className="font-body"
                        >
                          <Film size={12} />
                          {allDone ? `자동 병합 (${completed.length}개)` : `지금 병합 (${completed.length}개)`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 완료 클립 액션 버튼 (자막/나레이션) */}
                  {repClip && completed.length > 0 && processing.length === 0 && (
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: "10px" }}>
                      <button
                        onClick={() => handleBurnSubtitleOne(repClip.id, kf.sceneNumber)}
                        disabled={!!clipActionState[repClip.id]?.sub}
                        style={{
                          display: "flex", alignItems: "center", gap: "5px",
                          padding: "4px 11px", borderRadius: "14px",
                          background: repClip.subClipUrl ? "rgba(99,102,241,0.35)" : "rgba(99,102,241,0.18)",
                          border: `1px solid ${repClip.subClipUrl ? "rgba(165,180,252,0.6)" : "rgba(99,102,241,0.3)"}`,
                          color: repClip.subClipUrl ? "#a5b4fc" : "rgba(165,180,252,0.7)",
                          fontSize: "0.72rem", fontWeight: 500,
                          cursor: clipActionState[repClip.id]?.sub ? "not-allowed" : "pointer",
                          opacity: clipActionState[repClip.id]?.sub ? 0.5 : 1,
                          transition: "all 0.2s ease",
                        }}
                        className="font-body"
                      >
                        <FileText size={11} />
                        {clipActionState[repClip.id]?.sub ? "삽입 중..." : repClip.subClipUrl ? "자막 재삽입" : "자막 삽입"}
                      </button>
                      <button
                        onClick={() => handleAddNarrationOne(repClip.id, kf.sceneNumber)}
                        disabled={!!clipActionState[repClip.id]?.narr}
                        style={{
                          display: "flex", alignItems: "center", gap: "5px",
                          padding: "4px 11px", borderRadius: "14px",
                          background: repClip.narrClipUrl ? "rgba(236,72,153,0.35)" : "rgba(236,72,153,0.18)",
                          border: `1px solid ${repClip.narrClipUrl ? "rgba(249,168,212,0.6)" : "rgba(236,72,153,0.3)"}`,
                          color: repClip.narrClipUrl ? "#f9a8d4" : "rgba(249,168,212,0.7)",
                          fontSize: "0.72rem", fontWeight: 500,
                          cursor: clipActionState[repClip.id]?.narr ? "not-allowed" : "pointer",
                          opacity: clipActionState[repClip.id]?.narr ? 0.5 : 1,
                          transition: "all 0.2s ease",
                        }}
                        className="font-body"
                      >
                        <Mic2 size={11} />
                        {clipActionState[repClip.id]?.narr ? "합성 중..." : repClip.narrClipUrl ? "나레이션 재합성" : "나레이션 합성"}
                      </button>
                    </div>
                  )}

                  {/* 비디오 미리보기 */}
                  {repClip?.clipUrl && processing.length === 0 && (
                    <div style={{ marginTop: "12px" }}>
                      {(repClip.narrClipUrl || repClip.subClipUrl) && (
                        <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }} className="font-body">
                          {repClip.narrClipUrl ? "▶ 나레이션 합성본 미리보기" : "▶ 자막 삽입본 미리보기"}
                        </p>
                      )}
                      <video
                        key={repClip.narrClipUrl ?? repClip.subClipUrl ?? repClip.clipUrl}
                        src={repClip.narrClipUrl ?? repClip.subClipUrl ?? repClip.clipUrl ?? ""}
                        controls
                        style={{
                          width: "100%",
                          borderRadius: "16px",
                          maxHeight: "200px",
                          boxShadow: "0px 4px 16px rgba(0,0,0,0.3)",
                        }}
                      />
                    </div>
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
