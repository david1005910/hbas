import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, Play, X, Download } from "lucide-react";
import type { Episode } from "../../types";
import { PipelineStatus } from "../ui/PipelineStatus";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안", IN_PROGRESS: "진행 중", COMPLETE: "완료",
};

interface Props { episode: Episode }

export function EpisodeCard({ episode }: Props) {
  const [showVideo, setShowVideo] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const finalVideoUrl = `${apiBase}/storage/videos/${episode.id}/episode_final.mp4`;

  return (
    <>
      <div className="relative bg-ink-light border border-gold/20 hover:border-gold/50 rounded-xl p-4 transition-colors group">
        <Link to={`/episodes/${episode.id}`} className="block">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-body text-parchment font-semibold group-hover:text-gold transition-colors pr-2">
              {episode.titleKo}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${
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

        {/* 최종 영상 보기 버튼 — COMPLETE 상태만 */}
        {episode.status === "COMPLETE" && (
          <button
            onClick={(e) => { e.preventDefault(); setShowVideo(true); }}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg font-body text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(239,68,68,0.15) 100%)",
              border: "1px solid rgba(251,191,36,0.4)",
              color: "#fbbf24",
              boxShadow: "0 2px 8px rgba(251,191,36,0.1)",
            }}
          >
            <Play size={13} fill="#fbbf24" />
            최종 영상 보기
          </button>
        )}
      </div>

      {/* 영상 모달 */}
      {showVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setShowVideo(false)}
        >
          <div
            className="relative w-full max-w-3xl rounded-2xl overflow-hidden"
            style={{
              background: "#0f172a",
              border: "1px solid rgba(251,191,36,0.3)",
              boxShadow: "0 0 60px rgba(251,191,36,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: "1px solid rgba(251,191,36,0.2)" }}
            >
              <div>
                <p className="font-body text-gold font-semibold text-sm">{episode.titleKo}</p>
                <p className="font-body text-parchment/40 text-xs mt-0.5">
                  {episode.bibleBook.nameKo} {episode.verseRange}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={finalVideoUrl}
                  download="episode_final.mp4"
                  className="flex items-center gap-1.5 font-body text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{
                    background: "rgba(251,191,36,0.15)",
                    border: "1px solid rgba(251,191,36,0.4)",
                    color: "#fbbf24",
                  }}
                >
                  <Download size={12} />
                  다운로드
                </a>
                <button
                  onClick={() => setShowVideo(false)}
                  className="text-parchment/40 hover:text-parchment transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 비디오 플레이어 */}
            <video
              src={finalVideoUrl}
              controls
              autoPlay
              style={{ width: "100%", display: "block", background: "#000", maxHeight: "60vh" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
