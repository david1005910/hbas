import type { Episode, ContentType } from "../../types";

const STEPS: { key: ContentType | "keyframe" | "video"; label: string; emoji: string }[] = [
  { key: "SCRIPT", label: "스크립트", emoji: "📜" },
  { key: "ANIM_PROMPT", label: "프롬프트", emoji: "✍️" },
  { key: "keyframe", label: "키프레임", emoji: "🖼" },
  { key: "video", label: "영상", emoji: "🎬" },
  { key: "SRT_KO", label: "자막", emoji: "💬" },
  { key: "YT_META", label: "메타", emoji: "📊" },
];

interface Props { episode: Episode }

export function PipelineStatus({ episode }: Props) {
  const doneTypes = new Set(episode.contents?.map((c) => c.contentType) ?? []);
  const hasKeyframes = (episode.keyframes?.length ?? 0) > 0;
  const hasVideos = (episode.videoClips?.some((v) => v.status === "COMPLETED")) ?? false;

  function isDone(key: string) {
    if (key === "keyframe") return hasKeyframes;
    if (key === "video") return hasVideos;
    return doneTypes.has(key as ContentType);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((step, i) => {
        const done = isDone(step.key);
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-body border transition-colors ${
                done
                  ? "bg-gold/20 border-gold/50 text-gold"
                  : "bg-ink-light border-parchment/10 text-parchment/40"
              }`}
            >
              <span>{step.emoji}</span>
              <span>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="text-parchment/20 text-xs">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
