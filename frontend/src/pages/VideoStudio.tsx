import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, Play, Send, RefreshCw, ExternalLink } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { projectsApi } from "../api/projects";
import { remotionApi, RemotionProps } from "../api/remotion";

type RenderStatus = "idle" | "rendering" | "done" | "error";

const REMOTION_STUDIO_URL =
  (import.meta.env.VITE_REMOTION_URL as string) || "http://localhost:3002";

export function VideoStudio() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");
  const [koreanText, setKoreanText] = useState("");
  const [hebrewText, setHebrewText] = useState("");
  const [videoFileName, setVideoFileName] = useState("background_video.mp4");
  const [audioFileName, setAudioFileName] = useState("narration.mp3");
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [renderError, setRenderError] = useState("");
  const [iframeSrc, setIframeSrc] = useState(REMOTION_STUDIO_URL);

  // 프로젝트 목록
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });

  // 선택된 프로젝트의 에피소드 목록
  const { data: episodes } = useQuery({
    queryKey: ["projectEpisodes", selectedProjectId],
    queryFn: () => projectsApi.listEpisodes(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  // 에피소드 선택 시 텍스트 자동 채우기
  function handleSelectEpisode(episodeId: string) {
    setSelectedEpisodeId(episodeId);
    if (!episodes) return;
    const ep = episodes.find((e) => e.id === episodeId);
    if (!ep) return;
    setKoreanText(ep.titleKo || "");
    setHebrewText(ep.titleHe || "");
  }

  // 스튜디오 전송
  const sendMutation = useMutation({
    mutationFn: (props: RemotionProps) => remotionApi.sendProps(props),
    onSuccess: () => {
      // iframe 강제 새로고침 (캐시 bust)
      setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`);
    },
  });

  function handleSendToStudio() {
    sendMutation.mutate({
      koreanText,
      hebrewText,
      videoFileName,
      audioFileName,
      episodeId: selectedEpisodeId || undefined,
    });
  }

  // 렌더링
  async function handleRender() {
    setRenderStatus("rendering");
    setRenderError("");
    try {
      await remotionApi.render();
      setRenderStatus("done");
    } catch (err: any) {
      setRenderStatus("error");
      setRenderError(err.message || "렌더링 실패");
    }
  }

  const canSend = koreanText.trim() && hebrewText.trim();

  return (
    <PageWrapper
      title="비디오 스튜디오"
      subtitle="에피소드 데이터를 Remotion으로 전송하고 영상을 렌더링합니다"
      action={
        <a
          href={REMOTION_STUDIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gold/30 rounded-lg text-gold hover:bg-gold/10 transition-colors"
        >
          <ExternalLink size={14} />
          Remotion Studio 새 창
        </a>
      }
    >
      <div className="flex gap-5 h-[calc(100vh-160px)]">
        {/* 좌측: 컨트롤 패널 */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* 에피소드 연동 */}
          <section className="bg-parchment/5 border border-gold/15 rounded-xl p-4 space-y-3">
            <h3 className="font-display text-gold text-sm">에피소드 연동</h3>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">프로젝트</label>
              <select
                className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedEpisodeId("");
                }}
              >
                <option value="">— 프로젝트 선택 —</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedProjectId && (
              <div>
                <label className="block text-xs text-parchment/60 mb-1">에피소드</label>
                <select
                  className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                  value={selectedEpisodeId}
                  onChange={(e) => handleSelectEpisode(e.target.value)}
                >
                  <option value="">— 에피소드 선택 —</option>
                  {episodes?.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.bibleBook.nameKo} {ep.verseRange} — {ep.titleKo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* 텍스트 편집 */}
          <section className="bg-parchment/5 border border-gold/15 rounded-xl p-4 space-y-3">
            <h3 className="font-display text-gold text-sm">자막 텍스트</h3>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">한국어</label>
              <textarea
                rows={3}
                className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment resize-none focus:outline-none focus:border-gold/50"
                placeholder="예: 태초에 하나님이 천지를 창조하시니라"
                value={koreanText}
                onChange={(e) => setKoreanText(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">히브리어</label>
              <textarea
                rows={3}
                dir="rtl"
                className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment resize-none focus:outline-none focus:border-gold/50"
                placeholder="בְּרֵאשִׁית בָּרָא אֱלֹהִים"
                value={hebrewText}
                onChange={(e) => setHebrewText(e.target.value)}
              />
            </div>
          </section>

          {/* 파일 설정 */}
          <section className="bg-parchment/5 border border-gold/15 rounded-xl p-4 space-y-3">
            <h3 className="font-display text-gold text-sm">
              파일 설정{" "}
              <span className="text-parchment/40 font-body text-xs">(public/ 내)</span>
            </h3>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">배경 영상</label>
              <input
                className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                value={videoFileName}
                onChange={(e) => setVideoFileName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">나레이션 오디오</label>
              <input
                className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                value={audioFileName}
                onChange={(e) => setAudioFileName(e.target.value)}
              />
            </div>
          </section>

          {/* 액션 버튼 */}
          <div className="space-y-2">
            <button
              onClick={handleSendToStudio}
              disabled={!canSend || sendMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gold/20 hover:bg-gold/30 disabled:opacity-40 disabled:cursor-not-allowed text-gold border border-gold/30 rounded-lg text-sm font-body transition-colors"
            >
              {sendMutation.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              스튜디오로 전송
            </button>

            {sendMutation.isSuccess && (
              <p className="text-xs text-emerald-400 text-center">
                ✓ 전송 완료 — Remotion Studio가 자동 반영됩니다
              </p>
            )}
            {sendMutation.isError && (
              <p className="text-xs text-red-400 text-center">
                {(sendMutation.error as Error).message}
              </p>
            )}

            <button
              onClick={handleRender}
              disabled={!canSend || renderStatus === "rendering"}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300 border border-blue-500/30 rounded-lg text-sm font-body transition-colors"
            >
              {renderStatus === "rendering" ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              {renderStatus === "rendering" ? "렌더링 중..." : "영상 렌더링"}
            </button>

            {renderStatus === "done" && (
              <a
                href={remotionApi.downloadUrl()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm font-body transition-colors"
              >
                <Download size={14} />
                MP4 다운로드
              </a>
            )}

            {renderStatus === "error" && (
              <p className="text-xs text-red-400 break-words">{renderError}</p>
            )}
          </div>
        </div>

        {/* 우측: Remotion Studio iframe */}
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-parchment/40 font-body">
              Remotion Studio — 실시간 미리보기 (
              <span className="text-gold/60">{REMOTION_STUDIO_URL}</span>)
            </p>
            <button
              onClick={() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`)}
              className="flex items-center gap-1 text-xs text-parchment/50 hover:text-parchment transition-colors"
            >
              <RefreshCw size={12} />
              새로고침
            </button>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-gold/15">
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              className="w-full h-full bg-zinc-900"
              title="Remotion Studio"
              allow="autoplay"
            />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
