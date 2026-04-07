import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { PipelineStatus } from "../components/ui/PipelineStatus";
import { ScriptGenerator } from "../components/generator/ScriptGenerator";
import { AnimPromptGenerator } from "../components/generator/AnimPromptGenerator";
import { KeyframeGallery } from "../components/generator/KeyframeGallery";
import { VideoClipManager } from "../components/generator/VideoClipManager";
import { SrtGenerator } from "../components/generator/SrtGenerator";
import { NarrationGenerator } from "../components/generator/NarrationGenerator";
import { YtMetaGenerator } from "../components/generator/YtMetaGenerator";
import { episodesApi } from "../api/episodes";

type Tab = "script" | "prompt" | "keyframes" | "video" | "narration" | "srt" | "meta";

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "script", label: "스크립트", emoji: "📜" },
  { key: "prompt", label: "프롬프트", emoji: "✍️" },
  { key: "keyframes", label: "키프레임", emoji: "🖼" },
  { key: "video", label: "영상 클립", emoji: "🎬" },
  { key: "narration", label: "나레이션", emoji: "🎙" },
  { key: "srt", label: "자막 SRT", emoji: "💬" },
  { key: "meta", label: "YT 메타", emoji: "📊" },
];

export function EpisodeDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("script");

  const { data: episode, isLoading } = useQuery({
    queryKey: ["episode", id],
    queryFn: () => episodesApi.get(id!),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["episode", id] });
  }

  if (isLoading || !episode) {
    return <div className="p-8 text-parchment/50 font-body">로딩 중...</div>;
  }

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const finalVideoUrl = `${apiBase}/storage/videos/${id}/episode_final.mp4`;

  const getContent = (type: string) =>
    episode.contents?.find((c) => c.contentType === type);

  const getSrtContents = () =>
    episode.contents?.filter((c) => ["SRT_KO", "SRT_HE"].includes(c.contentType)) ?? [];

  return (
    <PageWrapper
      title={episode.titleKo}
      subtitle={`${episode.bibleBook.nameKo} ${episode.verseRange || ""} · 씬 ${episode.sceneCount}개 · ${episode.animStyle || "Epic 3D Cinematic"}`}
      action={
        <a
          href={`/api/v1/episodes/${id}/download/all`}
          download
          className="flex items-center gap-2 px-4 py-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <Download size={14} />
          전체 ZIP
        </a>
      }
    >
      <div className="mb-6">
        <PipelineStatus episode={episode} />
      </div>

      {/* 최종 영상 뷰어 (COMPLETE 상태일 때만) */}
      {episode.status === "COMPLETE" && (
        <div
          style={{
            marginBottom: "24px",
            borderRadius: "24px",
            overflow: "hidden",
            background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
            border: "1px solid rgba(251,191,36,0.35)",
            boxShadow: "0 0 40px rgba(251,191,36,0.12), 0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* 헤더 */}
          <div style={{
            padding: "16px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderBottom: "1px solid rgba(251,191,36,0.2)",
            background: "rgba(251,191,36,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Play size={14} fill="white" color="white" />
              </div>
              <div>
                <p style={{ color: "#fbbf24", fontWeight: 700, fontSize: "0.95rem", margin: 0 }} className="font-body">
                  🎬 최종 완성 영상
                </p>
                <p style={{ color: "rgba(251,191,36,0.55)", fontSize: "0.72rem", margin: 0 }} className="font-body">
                  자막 · 나레이션 · 그레고리안 성가 BGM 포함
                </p>
              </div>
            </div>
            <a
              href={finalVideoUrl}
              download="episode_final.mp4"
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "8px 18px", borderRadius: "20px",
                background: "linear-gradient(135deg, rgba(251,191,36,0.3) 0%, rgba(239,68,68,0.25) 100%)",
                border: "1px solid rgba(251,191,36,0.5)",
                color: "#fbbf24", fontWeight: 700, fontSize: "0.85rem",
                textDecoration: "none",
                boxShadow: "0 4px 16px rgba(251,191,36,0.2)",
                transition: "all 0.2s ease",
              }}
              className="font-body"
            >
              <Download size={14} />
              MP4 다운로드
            </a>
          </div>

          {/* 비디오 플레이어 */}
          <video
            src={finalVideoUrl}
            controls
            style={{
              width: "100%",
              maxHeight: "480px",
              display: "block",
              background: "#000",
            }}
          />
        </div>
      )}

      {/* 탭 바 */}
      <div className="flex gap-1 mb-6 border-b border-gold/20 pb-0">
        {TABS.map(({ key, label, emoji }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-body transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? "border-gold text-gold"
                : "border-transparent text-parchment/50 hover:text-parchment"
            }`}
          >
            <span>{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="border border-gold/20 rounded-xl p-5 bg-ink-light">
        {activeTab === "script" && (
          <ScriptGenerator
            episodeId={id!}
            existing={getContent("SCRIPT")}
            onDone={refresh}
          />
        )}
        {activeTab === "prompt" && (
          <AnimPromptGenerator
            episodeId={id!}
            existing={getContent("ANIM_PROMPT")}
            onDone={refresh}
          />
        )}
        {activeTab === "keyframes" && (
          <KeyframeGallery
            episodeId={id!}
            initialKeyframes={episode.keyframes ?? []}
            onUpdate={refresh}
          />
        )}
        {activeTab === "video" && (
          <VideoClipManager
            episodeId={id!}
            keyframes={episode.keyframes ?? []}
            initialClips={episode.videoClips ?? []}
            onUpdate={refresh}
          />
        )}
        {activeTab === "narration" && (
          <NarrationGenerator
            episodeId={id!}
            initialNarrationUrl={episode.narrationUrl}
            onDone={refresh}
          />
        )}
        {activeTab === "srt" && (
          <SrtGenerator
            episodeId={id!}
            existing={getSrtContents()}
            onDone={refresh}
          />
        )}
        {activeTab === "meta" && (
          <YtMetaGenerator
            episodeId={id!}
            existing={getContent("YT_META")}
            onDone={refresh}
          />
        )}
      </div>
    </PageWrapper>
  );
}
