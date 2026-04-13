import { useState, useEffect } from "react";
import { Image, RefreshCw, Check, Zap, RotateCcw, MonitorPlay, ExternalLink, Loader2 } from "lucide-react";
import { keyframesApi, streamKeyframeGeneration } from "../../api/keyframes";
import { remotionApi } from "../../api/remotion";
import type { SceneKeyframe } from "../../types";

interface Props {
  episodeId: string;
  initialKeyframes: SceneKeyframe[];
  onUpdate?: () => void;
}

interface SceneState {
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

const REMOTION_STUDIO_URL =
  (import.meta.env.VITE_REMOTION_URL as string) || "http://localhost:3002";

export function KeyframeGallery({ episodeId, initialKeyframes, onUpdate }: Props) {
  const [keyframes, setKeyframes] = useState<SceneKeyframe[]>(initialKeyframes);
  const [sceneStates, setSceneStates] = useState<Record<number, SceneState>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [studioSending, setStudioSending] = useState<string | null>(null); // keyframe id
  const [studioSent, setStudioSent] = useState<string | null>(null);       // keyframe id

  useEffect(() => {
    setKeyframes(initialKeyframes);
  }, [initialKeyframes]);

  function setSceneState(scene: number, state: SceneState) {
    setSceneStates((prev) => ({ ...prev, [scene]: state }));
  }

  function handleGenerateAll() {
    setIsGeneratingAll(true);
    setGlobalError("");
    streamKeyframeGeneration(
      episodeId,
      (scene, status, imageUrl) => {
        if (status === "generating") setSceneState(scene, { status: "generating" });
        if (status === "done") {
          setSceneState(scene, { status: "done" });
          if (imageUrl) {
            setKeyframes((prev) => {
              const existing = prev.find((k) => k.sceneNumber === scene);
              if (existing) return prev.map((k) => k.sceneNumber === scene ? { ...k, imageUrl } : k);
              return [...prev, {
                id: `temp-${scene}`, episodeId, sceneNumber: scene,
                imageUrl, resolution: "1920x1080", isSelected: false,
                createdAt: new Date().toISOString(),
              }];
            });
          }
        }
        if (status === "error") setSceneState(scene, { status: "error" });
      },
      () => { setIsGeneratingAll(false); onUpdate?.(); },
      (msg) => { setIsGeneratingAll(false); setGlobalError(msg); }
    );
  }

  async function handleRegenerate(sceneNumber: number, latest?: SceneKeyframe) {
    setSceneState(sceneNumber, { status: "generating" });
    try {
      const prompt = latest?.promptUsed ?? `Scene ${sceneNumber}`;
      const updated = await keyframesApi.regenerate(sceneNumber, { episodeId, prompt });
      setKeyframes((prev) => {
        const exists = prev.find((k) => k.sceneNumber === sceneNumber);
        if (exists) return prev.map((k) => k.sceneNumber === sceneNumber ? updated : k);
        return [...prev, updated];
      });
      setSceneState(sceneNumber, { status: "done" });
      onUpdate?.();
    } catch (e: any) {
      setSceneState(sceneNumber, { status: "error", error: e.message });
    }
  }

  async function handleSelect(id: string) {
    const updated = await keyframesApi.select(id);
    setKeyframes((prev) => prev.map((k) => k.id === id ? updated : k));
  }

  async function handleSendToStudio(keyframe: SceneKeyframe) {
    setStudioSending(keyframe.id);
    setStudioSent(null);
    try {
      await remotionApi.sendKeyframe(keyframe.id);
      setStudioSent(keyframe.id);
      // 3초 후 sent 상태 초기화
      setTimeout(() => setStudioSent(null), 3000);
    } catch (e: any) {
      setGlobalError(`스튜디오 전송 실패: ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setStudioSending(null);
    }
  }

  const grouped: Record<number, SceneKeyframe[]> = {};
  keyframes.forEach((k) => {
    if (!grouped[k.sceneNumber]) grouped[k.sceneNumber] = [];
    grouped[k.sceneNumber].push(k);
  });

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-parchment font-body font-semibold">키프레임 갤러리</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">Nano Banana로 씬별 1080p 이미지 생성</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={REMOTION_STUDIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-parchment/10 hover:bg-parchment/20 text-parchment/70 hover:text-parchment border border-parchment/20 text-xs font-body rounded-lg transition-colors"
          >
            <ExternalLink size={12} />
            Remotion Studio
          </a>
          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAll}
            className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            <Image size={14} />
            {isGeneratingAll ? "생성 중..." : "전체 키프레임 생성"}
          </button>
        </div>
      </div>

      {/* 전역 오류 */}
      {globalError && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm font-body">
          ⚠️ {globalError}
          {globalError.includes("유료") && (
            <a
              href="https://aistudio.google.com/app/plan_information"
              target="_blank" rel="noreferrer"
              className="ml-2 underline text-gold"
            >
              결제 활성화 →
            </a>
          )}
        </div>
      )}

      {/* 씬 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([sceneNo, frames]) => {
          const scene = parseInt(sceneNo);
          const state = sceneStates[scene];
          const latest = frames[frames.length - 1];
          const isGenerating = state?.status === "generating";
          const isSending = studioSending === latest?.id;
          const justSent = studioSent === latest?.id;

          return (
            <div key={scene} className="border border-gold/20 rounded-xl overflow-hidden bg-ink-light">
              {/* 이미지 영역 */}
              <div className="relative aspect-video bg-ink">
                {latest?.imageUrl ? (
                  <img
                    src={latest.imageUrl}
                    alt={`Scene ${scene}`}
                    className={`w-full h-full object-cover transition-opacity ${isGenerating ? "opacity-40" : "opacity-100"}`}
                  />
                ) : null}

                {/* 생성 중 오버레이 */}
                {isGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <RefreshCw className="animate-spin mx-auto mb-2 text-gold" size={24} />
                      <p className="text-xs text-gold font-body">생성 중...</p>
                    </div>
                  </div>
                )}

                {/* 빈 상태 */}
                {!latest?.imageUrl && !isGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center text-parchment/20">
                    <Image size={32} />
                  </div>
                )}

                {/* 선택됨 뱃지 */}
                {latest?.isSelected && (
                  <div className="absolute top-2 right-2 bg-gold rounded-full p-1">
                    <Check size={12} className="text-ink" />
                  </div>
                )}

                {/* 스튜디오 전송 완료 오버레이 */}
                {justSent && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="text-center">
                      <MonitorPlay className="mx-auto mb-2 text-emerald-400" size={28} />
                      <p className="text-xs text-emerald-400 font-body font-semibold">스튜디오 전송 완료</p>
                      <a
                        href={REMOTION_STUDIO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-xs text-gold underline font-body"
                      >
                        스튜디오 열기 →
                      </a>
                    </div>
                  </div>
                )}

                {/* 씬 오류 */}
                {state?.status === "error" && (
                  <div className="absolute bottom-0 inset-x-0 bg-red-900/80 text-red-300 text-xs font-body px-2 py-1 text-center">
                    오류: {state.error ?? "생성 실패"}
                  </div>
                )}
              </div>

              {/* 하단 액션 바 */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-parchment/70 text-sm font-body">씬 {scene}</span>
                  <div className="flex gap-1.5">
                    {/* 재생성 버튼 */}
                    {latest && (
                      <button
                        onClick={() => handleRegenerate(scene, latest)}
                        disabled={isGenerating || isGeneratingAll}
                        title="이 씬 재생성"
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-parchment/5 hover:bg-parchment/10 text-parchment/50 hover:text-parchment border border-parchment/10 rounded transition-colors disabled:opacity-30"
                      >
                        <RotateCcw size={10} className={isGenerating ? "animate-spin" : ""} />
                        재생성
                      </button>
                    )}
                    {/* Veo 전송(선택) 버튼 */}
                    {latest && !latest.isSelected && (
                      <button
                        onClick={() => handleSelect(latest.id)}
                        disabled={isGenerating || isGeneratingAll}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded transition-colors disabled:opacity-30"
                      >
                        <Zap size={10} />
                        Veo 전송
                      </button>
                    )}
                    {latest?.isSelected && (
                      <span className="text-xs px-2 py-1 bg-gold/20 text-gold border border-gold/40 rounded font-body">
                        ✓ 선택됨
                      </span>
                    )}
                  </div>
                </div>

                {/* 스튜디오 미리보기 버튼 */}
                {latest?.imageUrl && (
                  <button
                    onClick={() => handleSendToStudio(latest)}
                    disabled={isSending || isGenerating}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-40 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-body transition-colors"
                  >
                    {isSending ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <MonitorPlay size={11} />
                    )}
                    {isSending ? "전송 중..." : "비디오 스튜디오에서 미리보기"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
