import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { PipelineStatus } from "../components/ui/PipelineStatus";
import { ScriptGenerator } from "../components/generator/ScriptGenerator";
import { AnimPromptGenerator } from "../components/generator/AnimPromptGenerator";
import { KeyframeGallery } from "../components/generator/KeyframeGallery";
import { VideoClipManager } from "../components/generator/VideoClipManager";
import { SrtGenerator } from "../components/generator/SrtGenerator";
import { YtMetaGenerator } from "../components/generator/YtMetaGenerator";
import { episodesApi } from "../api/episodes";

type Tab = "script" | "prompt" | "keyframes" | "video" | "srt" | "meta";

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "script", label: "스크립트", emoji: "📜" },
  { key: "prompt", label: "프롬프트", emoji: "✍️" },
  { key: "keyframes", label: "키프레임", emoji: "🖼" },
  { key: "video", label: "영상 클립", emoji: "🎬" },
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

  const getContent = (type: string) =>
    episode.contents?.find((c) => c.contentType === type);

  const getSrtContents = () =>
    episode.contents?.filter((c) => ["SRT_KO", "SRT_HE", "SRT_EN"].includes(c.contentType)) ?? [];

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
