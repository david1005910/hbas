import { Link } from "react-router-dom";
import { BookOpen, Clock } from "lucide-react";
import type { Episode } from "../../types";
import { PipelineStatus } from "../ui/PipelineStatus";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안", IN_PROGRESS: "진행 중", COMPLETE: "완료",
};

interface Props { episode: Episode }

export function EpisodeCard({ episode }: Props) {
  return (
    <Link
      to={`/episodes/${episode.id}`}
      className="block bg-ink-light border border-gold/20 hover:border-gold/50 rounded-xl p-4 transition-colors group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-body text-parchment font-semibold group-hover:text-gold transition-colors">
          {episode.titleKo}
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${
          episode.status === "COMPLETE"
            ? "border-green-500/50 text-green-400 bg-green-500/10"
            : episode.status === "IN_PROGRESS"
            ? "border-gold/50 text-gold bg-gold/10"
            : "border-parchment/20 text-parchment/50"
        }`}>
          {STATUS_LABEL[episode.status]}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-parchment/50 font-body mb-3">
        <span className="flex items-center gap-1">
          <BookOpen size={11} />
          {episode.bibleBook.nameKo} {episode.verseRange}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          씬 {episode.sceneCount}개
        </span>
      </div>
      <PipelineStatus episode={episode} />
    </Link>
  );
}
