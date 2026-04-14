import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Download, Play, Send, RefreshCw, ExternalLink, Loader2, Upload, Film, Mic, AlignLeft, ChevronLeft, Save, Clock, Replace, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { projectsApi } from "../api/projects";
import { remotionApi, RemotionProps, RenderStatus, SubEntry, WordReplacement } from "../api/remotion";

const REMOTION_STUDIO_URL =
  (import.meta.env.VITE_REMOTION_URL as string) || "http://localhost:3002";

export function VideoStudio() {
  const location = useLocation();
  const incomingProps = location.state as (RemotionProps & { fromKeyframe?: boolean }) | null;

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(incomingProps?.episodeId ?? "");
  const [koreanText, setKoreanText] = useState(incomingProps?.koreanText ?? "");
  const [hebrewText, setHebrewText] = useState(incomingProps?.hebrewText ?? "");
  const [videoFileName, setVideoFileName] = useState(incomingProps?.videoFileName ?? "");
  const [audioFileName, setAudioFileName] = useState(incomingProps?.audioFileName ?? "narration.mp3");
  const [iframeSrc, setIframeSrc] = useState(REMOTION_STUDIO_URL);
  const [renderStatus, setRenderStatus] = useState<RenderStatus | null>(null);
  const [fromKeyframeNotice, setFromKeyframeNotice] = useState(!!incomingProps?.fromKeyframe);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [narrationStatus, setNarrationStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [narrationError, setNarrationError] = useState("");
  const [narrationDuration, setNarrationDuration] = useState<number | null>(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [activeView, setActiveView] = useState<"studio" | "subtitles">("studio");
  const [subtitles, setSubtitles] = useState<SubEntry[]>([]);
  const [subtitleSaveStatus, setSubtitleSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [subtitleSaveError, setSubtitleSaveError] = useState("");
  const [subtitleLoadError, setSubtitleLoadError] = useState("");
  const [wordReplacements, setWordReplacements] = useState<WordReplacement[]>([]);
  const [wordReplSaveStatus, setWordReplSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showWordRepl, setShowWordRepl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 키프레임 갤러리에서 넘어온 경우 — 자동으로 Remotion 스튜디오로 전송
  useEffect(() => {
    if (!incomingProps?.fromKeyframe) return;
    remotionApi.sendProps({
      koreanText: incomingProps.koreanText ?? "",
      hebrewText: incomingProps.hebrewText ?? "",
      videoFileName: incomingProps.videoFileName ?? "",
      audioFileName: incomingProps.audioFileName ?? "narration.mp3",
      episodeId: incomingProps.episodeId,
    }).then(() => {
      // data.json 쓰기 완료 후 iframe 새로고침 — calculateMetadata가 최신값을 읽도록 300ms 여유
      setTimeout(() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`), 300);
    }).catch(() => {});
    // 5초 후 알림 배너 숨김
    const t = setTimeout(() => setFromKeyframeNotice(false), 5000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 프로젝트 목록
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });

  // public/ 동영상 파일 목록
  const { data: videoFiles = [], refetch: refetchVideos } = useQuery({
    queryKey: ["remotionVideos"],
    queryFn: remotionApi.listVideos,
  });

  // 나레이션 TTS 생성 핸들러
  async function handleGenerateNarration() {
    const epId = selectedEpisodeId;
    if (!epId) return;
    setNarrationStatus("generating");
    setNarrationError("");
    try {
      const result = await remotionApi.generateNarration(epId);
      setAudioFileName(result.fileName);
      if (result.durationSec) setNarrationDuration(result.durationSec);
      // 생성된 자막 파싱 → 편집기에 로드
      if (result.subtitlesJson) {
        try {
          const parsed = JSON.parse(result.subtitlesJson) as SubEntry[];
          setSubtitles(parsed.map((s) => ({ ...s, heText: s.heText ?? "" })));
        } catch {}
      }
      setNarrationStatus("done");
      // Remotion 미리보기 갱신
      setTimeout(() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`), 500);
    } catch (err: any) {
      setNarrationError(err?.response?.data?.error ?? err.message);
      setNarrationStatus("error");
    }
  }

  // 자막 불러오기 (저장된 subtitles.json에서)
  async function handleLoadSubtitles() {
    setSubtitleLoadError("");
    try {
      let loaded = await remotionApi.getSubtitles();
      if (loaded.length === 0) {
        setSubtitleLoadError("자막 파일이 없습니다. 나레이션을 먼저 생성해 주세요.");
        return;
      }

      // heText 없는 항목이 있고 에피소드가 선택된 경우 → 자동 배분
      const hasNoHeText = loaded.every((s) => !s.heText);
      if (hasNoHeText && selectedEpisodeId) {
        try {
          const filled = await remotionApi.autoFillHebrew(selectedEpisodeId);
          if (filled.length > 0) loaded = filled;
        } catch {
          // 배분 실패해도 한국어만으로 편집 가능
        }
      }

      setSubtitles(loaded.map((s) => ({ ...s, heText: s.heText ?? "" })));
    } catch (err: any) {
      setSubtitleLoadError(err?.response?.data?.error ?? "자막 불러오기 실패");
    }
  }

  // 자막 저장 → Remotion 즉시 반영
  async function handleSaveSubtitles() {
    setSubtitleSaveStatus("saving");
    setSubtitleSaveError("");
    try {
      // 1. 자막 저장 (subtitles.json + Root.tsx + data.json 업데이트)
      await remotionApi.updateSubtitles(subtitles);
      setSubtitleSaveStatus("saved");
      // 2. Remotion HMR 적용 후 미리보기 갱신 (1.5초 여유)
      setTimeout(() => {
        setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`);
      }, 1500);
      setTimeout(() => setSubtitleSaveStatus("idle"), 5000);
    } catch (err: any) {
      setSubtitleSaveError(err?.response?.data?.error ?? err.message);
      setSubtitleSaveStatus("error");
    }
  }

  // 자막 항목 필드 수정
  function updateSubtitle(index: number, field: "text" | "heText", value: string) {
    setSubtitles((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  // 단어 치환 규칙 로드
  async function handleLoadWordReplacements() {
    try {
      const list = await remotionApi.getWordReplacements();
      setWordReplacements(list);
    } catch {
      // 로드 실패 시 기본값
      setWordReplacements([
        { from: "주 하나님", to: "엘로힘", enabled: true },
        { from: "하나님", to: "엘로힘", enabled: true },
      ]);
    }
  }

  // 단어 치환 규칙 저장
  async function handleSaveWordReplacements() {
    setWordReplSaveStatus("saving");
    try {
      await remotionApi.saveWordReplacements(wordReplacements);
      setWordReplSaveStatus("saved");
      setTimeout(() => setWordReplSaveStatus("idle"), 3000);
    } catch {
      setWordReplSaveStatus("error");
    }
  }

  // 초 → "0:00.0" 형식
  function formatSec(s: number): string {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  }

  // 동영상 업로드 핸들러
  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploadProgress(0);
    try {
      const result = await remotionApi.uploadVideo(file, setUploadProgress);
      setVideoFileName(result.fileName);
      refetchVideos();
      // 업로드 완료 즉시 Remotion Studio 배경 교체
      sendMutation.mutate({
        koreanText,
        hebrewText,
        videoFileName: result.fileName,
        audioFileName,
        episodeId: selectedEpisodeId || undefined,
      });
    } catch (err: any) {
      setUploadError(err?.response?.data?.error ?? err.message);
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // 에피소드 목록
  const { data: episodes } = useQuery({
    queryKey: ["projectEpisodes", selectedProjectId],
    queryFn: () => projectsApi.listEpisodes(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  // 에피소드 선택 시 텍스트 자동 채우기 (SCRIPT 나레이션 → SRT → 제목 순)
  async function handleSelectEpisode(episodeId: string) {
    setSelectedEpisodeId(episodeId);
    if (!episodeId) return;

    // 우선 제목으로 즉시 채우기 (로딩 중 fallback)
    if (episodes) {
      const ep = episodes.find((e) => e.id === episodeId);
      if (ep) {
        setKoreanText(ep.titleKo || "");
        setHebrewText(ep.titleHe || "");
      }
    }

    // SCRIPT/SRT에서 실제 나레이션 텍스트 fetch
    setSubtitleLoading(true);
    try {
      const texts = await remotionApi.getEpisodeSubtitle(episodeId);
      if (texts.koreanText) setKoreanText(texts.koreanText);
      if (texts.hebrewText) setHebrewText(texts.hebrewText);
    } catch {
      // fetch 실패 시 제목 fallback 유지
    } finally {
      setSubtitleLoading(false);
    }
  }

  // 스튜디오로 전송
  const sendMutation = useMutation({
    mutationFn: (props: RemotionProps) => remotionApi.sendProps(props),
    onSuccess: () => {
      setTimeout(() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`), 300);
    },
  });

  // 렌더링 시작
  const renderMutation = useMutation({
    mutationFn: () => remotionApi.render(),
    onSuccess: () => {
      setRenderStatus({ status: "rendering", error: null, fileReady: false });
      startPolling();
    },
    onError: (err: Error) => {
      setRenderStatus({ status: "error", error: err.message, fileReady: false });
    },
  });

  // 렌더 완료 폴링
  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await remotionApi.getRenderStatus();
        setRenderStatus(status);
        if (status.status === "done" || status.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch {
        // 일시적 연결 오류 무시
      }
    }, 3000);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const canSend = koreanText.trim() && hebrewText.trim();
  const isRendering = renderStatus?.status === "rendering" || renderMutation.isPending;

  return (
    <PageWrapper
      title="비디오 스튜디오"
      subtitle={incomingProps?.fromKeyframe
        ? `키프레임 씬 미리보기 — ${incomingProps.videoFileName ?? ""}`
        : "에피소드 데이터를 Remotion으로 전송하고 영상을 렌더링합니다"}
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
      {/* 키프레임 갤러리에서 넘어온 경우 알림 배너 */}
      {fromKeyframeNotice && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-blue-500/15 border border-blue-500/30 rounded-xl text-blue-300 text-sm font-body">
          <span className="text-base">🖼</span>
          <span>키프레임 미리보기 로드됨 — Remotion Studio에 자동 전송되었습니다.</span>
          <button onClick={() => setFromKeyframeNotice(false)} className="ml-auto text-blue-400/60 hover:text-blue-300">✕</button>
        </div>
      )}

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
                onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedEpisodeId(""); }}
              >
                <option value="">— 프로젝트 선택 —</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
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

          {/* 자막 텍스트 */}
          <section className="bg-parchment/5 border border-gold/15 rounded-xl p-4 space-y-3">
            <h3 className="font-display text-gold text-sm flex items-center gap-2">
              자막 텍스트
              {subtitleLoading && <Loader2 size={12} className="animate-spin text-gold/60" />}
            </h3>
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
              파일 설정 <span className="text-parchment/40 font-body text-xs">(public/ 내)</span>
            </h3>

            {/* 배경 동영상 업로드 */}
            <div>
              <label className="block text-xs text-parchment/60 mb-1">
                배경 동영상 <span className="text-parchment/30">(비워두면 그라데이션)</span>
              </label>

              {/* 업로드 버튼 */}
              <input ref={fileInputRef} type="file" accept=".mp4,.webm,.mov,.avi,.mkv" className="hidden" onChange={handleVideoUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProgress !== null}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-parchment/5 hover:bg-parchment/10 border border-parchment/20 hover:border-gold/30 text-parchment/60 hover:text-parchment text-xs font-body rounded-lg transition-colors disabled:opacity-40"
              >
                {uploadProgress !== null ? (
                  <><Loader2 size={12} className="animate-spin" /> 업로드 중 {uploadProgress}%</>
                ) : (
                  <><Upload size={12} /> 동영상 파일 업로드</>
                )}
              </button>
              {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}

              {/* 업로드된 파일 선택 드롭다운 */}
              {videoFiles.length > 0 && (
                <select
                  className="w-full mt-2 bg-ink border border-gold/20 rounded-lg px-3 py-2 text-xs text-parchment focus:outline-none focus:border-gold/50"
                  value={videoFileName}
                  onChange={(e) => setVideoFileName(e.target.value)}
                >
                  <option value="">— 파일 선택 (또는 직접 입력) —</option>
                  {videoFiles.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}

              {/* 직접 입력 */}
              <input
                className="w-full mt-2 bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                placeholder="파일명 직접 입력 (예: video.mp4)"
                value={videoFileName}
                onChange={(e) => setVideoFileName(e.target.value)}
              />
              {videoFileName && (
                <p className="text-xs text-gold/60 mt-1 flex items-center gap-1">
                  <Film size={10} /> {videoFileName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">나레이션 오디오</label>
              <input
                className="w-full bg-ink border border-gold/20 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50 mb-2"
                value={audioFileName}
                onChange={(e) => setAudioFileName(e.target.value)}
              />
              {/* 나레이션 TTS 생성 버튼 — 에피소드 선택 시 항상 표시 */}
              <button
                onClick={handleGenerateNarration}
                disabled={narrationStatus === "generating" || !selectedEpisodeId}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gold/10 hover:bg-gold/20 disabled:opacity-40 disabled:cursor-not-allowed text-gold border border-gold/30 rounded-lg text-xs font-body transition-colors"
                title={!selectedEpisodeId ? "에피소드를 먼저 선택하세요" : ""}
              >
                {narrationStatus === "generating" ? (
                  <><Loader2 size={12} className="animate-spin" /> 나레이션 생성 중…</>
                ) : (
                  <><Mic size={12} /> 한국어 나레이션 생성 (TTS){!selectedEpisodeId && " (에피소드 선택 필요)"}</>
                )}
              </button>
              {narrationStatus === "done" && (
                <p className="text-xs text-emerald-400 mt-1">
                  ✓ narration.mp3 생성 완료
                  {narrationDuration && ` (${narrationDuration.toFixed(1)}초 → 비디오 ${(narrationDuration + 1).toFixed(0)}초)`}
                </p>
              )}
              {narrationStatus === "error" && (
                <p className="text-xs text-red-400 mt-1">⚠ {narrationError}</p>
              )}
            </div>
          </section>

          {/* 자막 편집 */}
          <section className="bg-parchment/5 border border-gold/15 rounded-xl p-4 space-y-2">
            <h3 className="font-display text-gold text-sm">자막 편집</h3>
            <p className="text-xs text-parchment/50">나레이션 생성 후 각 자막 라인을 직접 수정할 수 있습니다.</p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setActiveView("subtitles");
                  // 이미 로드된 자막이 있으면 다시 불러오지 않음 (편집 내용 보존)
                  if (subtitles.length === 0) {
                    await handleLoadSubtitles();
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg text-xs font-body transition-colors"
              >
                <AlignLeft size={12} />
                {subtitles.length > 0 ? `자막 편집 열기 (${subtitles.length}개)` : "자막 불러오기 / 편집"}
              </button>
            </div>
            {subtitleLoadError && <p className="text-xs text-red-400">{subtitleLoadError}</p>}
          </section>

          {/* 단어 치환 */}
          <section className="bg-parchment/5 border border-gold/15 rounded-xl p-4 space-y-2">
            <button
              className="w-full flex items-center justify-between text-sm font-display text-gold"
              onClick={() => {
                setShowWordRepl((v) => !v);
                if (wordReplacements.length === 0) handleLoadWordReplacements();
              }}
            >
              <span className="flex items-center gap-2"><Replace size={14} /> 단어 치환 규칙</span>
              <span className="text-xs text-parchment/40">{showWordRepl ? "▲" : "▼"}</span>
            </button>

            {showWordRepl && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-parchment/50">나레이션 TTS 및 자막에 자동 적용됩니다.</p>

                {wordReplacements.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {/* 활성/비활성 토글 */}
                    <button
                      onClick={() => setWordReplacements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, enabled: !r.enabled } : r)
                      )}
                      className={rule.enabled ? "text-gold" : "text-parchment/30"}
                      title={rule.enabled ? "비활성화" : "활성화"}
                    >
                      {rule.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    {/* from */}
                    <input
                      className="flex-1 bg-ink border border-gold/20 rounded px-2 py-1 text-xs text-parchment focus:outline-none focus:border-gold/50"
                      value={rule.from}
                      placeholder="원본 단어"
                      onChange={(e) => setWordReplacements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, from: e.target.value } : r)
                      )}
                    />
                    <span className="text-parchment/30 text-xs">→</span>
                    {/* to */}
                    <input
                      className="flex-1 bg-ink border border-gold/20 rounded px-2 py-1 text-xs text-parchment focus:outline-none focus:border-gold/50"
                      value={rule.to}
                      placeholder="치환 단어"
                      onChange={(e) => setWordReplacements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, to: e.target.value } : r)
                      )}
                    />
                    {/* 삭제 */}
                    <button
                      onClick={() => setWordReplacements((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-parchment/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

                {/* 규칙 추가 */}
                <button
                  onClick={() => setWordReplacements((prev) => [...prev, { from: "", to: "", enabled: true }])}
                  className="flex items-center gap-1 text-xs text-parchment/50 hover:text-gold transition-colors"
                >
                  <Plus size={12} /> 규칙 추가
                </button>

                {/* 저장 버튼 */}
                <button
                  onClick={handleSaveWordReplacements}
                  disabled={wordReplSaveStatus === "saving"}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gold/10 hover:bg-gold/20 disabled:opacity-40 text-gold border border-gold/30 rounded-lg text-xs font-body transition-colors"
                >
                  {wordReplSaveStatus === "saving" ? (
                    <><Loader2 size={11} className="animate-spin" /> 저장 중…</>
                  ) : wordReplSaveStatus === "saved" ? (
                    <>✓ 저장됨</>
                  ) : (
                    <><Save size={11} /> 치환 규칙 저장</>
                  )}
                </button>
              </div>
            )}
          </section>

          {/* 액션 버튼 */}
          <div className="space-y-2">
            {/* 스튜디오 전송 */}
            <button
              onClick={() => sendMutation.mutate({ koreanText, hebrewText, videoFileName, audioFileName, episodeId: selectedEpisodeId || undefined })}
              disabled={!canSend || sendMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gold/20 hover:bg-gold/30 disabled:opacity-40 disabled:cursor-not-allowed text-gold border border-gold/30 rounded-lg text-sm font-body transition-colors"
            >
              {sendMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              스튜디오로 전송
            </button>
            {sendMutation.isSuccess && (
              <p className="text-xs text-emerald-400 text-center">✓ 전송 완료</p>
            )}
            {sendMutation.isError && (
              <p className="text-xs text-red-400 text-center">{(sendMutation.error as Error).message}</p>
            )}

            {/* 렌더링 */}
            <button
              onClick={() => renderMutation.mutate()}
              disabled={!canSend || isRendering}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300 border border-blue-500/30 rounded-lg text-sm font-body transition-colors"
            >
              {isRendering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {isRendering ? "렌더링 중… (수분 소요)" : "영상 렌더링"}
            </button>

            {/* 렌더 상태 */}
            {renderStatus && (
              <div className={`text-xs text-center rounded-lg px-3 py-2 ${
                renderStatus.status === "done" ? "text-emerald-400 bg-emerald-500/10" :
                renderStatus.status === "error" ? "text-red-400 bg-red-500/10" :
                "text-blue-300 bg-blue-500/10"
              }`}>
                {renderStatus.status === "rendering" && "렌더링 진행 중… Chrome Headless 사용"}
                {renderStatus.status === "done" && "✓ 렌더링 완료!"}
                {renderStatus.status === "error" && `오류: ${renderStatus.error}`}
              </div>
            )}

            {/* 다운로드 */}
            {renderStatus?.status === "done" && (
              <a
                href={remotionApi.downloadUrl()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm font-body transition-colors"
              >
                <Download size={14} />
                MP4 다운로드
              </a>
            )}
          </div>
        </div>

        {/* 우측: 스튜디오 / 자막 편집 탭 */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">

          {activeView === "studio" ? (
            <>
              <div className="flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-parchment/40 font-body">
                  Remotion Studio — 실시간 미리보기 (<span className="text-gold/60">{REMOTION_STUDIO_URL}</span>)
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
            </>
          ) : (
            /* ── 자막 편집 뷰 ─────────────────────────────────────────── */
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {/* 헤더 */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => setActiveView("studio")}
                  className="flex items-center gap-1 text-xs text-parchment/60 hover:text-parchment transition-colors"
                >
                  <ChevronLeft size={14} />
                  스튜디오로 돌아가기
                </button>
                <span className="text-parchment/30 text-xs">|</span>
                <span className="text-sm font-display text-gold">자막 편집</span>
                <span className="text-xs text-parchment/40">{subtitles.length}개 항목</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={handleLoadSubtitles}
                    title="서버에서 다시 불러오기"
                    className="flex items-center gap-1 text-xs text-parchment/50 hover:text-parchment transition-colors px-2 py-1.5"
                  >
                    <RefreshCw size={12} />
                    새로고침
                  </button>
                  <button
                    onClick={handleSaveSubtitles}
                    disabled={subtitleSaveStatus === "saving"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/20 hover:bg-gold/30 disabled:opacity-40 text-gold border border-gold/30 rounded-lg text-xs font-body transition-colors"
                  >
                    {subtitleSaveStatus === "saving" ? (
                      <><Loader2 size={12} className="animate-spin" /> 저장 중…</>
                    ) : (
                      <><Save size={12} /> 저장 및 미리보기 반영</>
                    )}
                  </button>
                  {subtitleSaveStatus === "saved" && (
                    <button
                      onClick={() => setActiveView("studio")}
                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      ✓ 저장됨 — 미리보기 확인 →
                    </button>
                  )}
                  {subtitleSaveStatus === "error" && (
                    <span className="text-xs text-red-400">⚠ {subtitleSaveError}</span>
                  )}
                </div>
              </div>

              {/* 자막 항목 리스트 */}
              {subtitles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-parchment/40 text-sm">
                  <span>자막 데이터가 없습니다.</span>
                  <button
                    onClick={handleLoadSubtitles}
                    className="flex items-center gap-2 px-4 py-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg text-xs font-body transition-colors"
                  >
                    <AlignLeft size={12} /> 다시 불러오기
                  </button>
                  {subtitleLoadError && <p className="text-xs text-red-400">{subtitleLoadError}</p>}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {subtitles.map((sub, i) => (
                    <div
                      key={i}
                      className="bg-parchment/5 border border-gold/15 hover:border-gold/30 rounded-xl p-3 space-y-2 transition-colors"
                    >
                      {/* 번호 + 시간 */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gold/10 text-gold px-2 py-0.5 rounded-md">
                          #{i + 1}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-parchment/40 font-mono">
                          <Clock size={10} />
                          {formatSec(sub.startSec)} → {formatSec(sub.endSec)}
                          <span className="text-parchment/25 ml-1">({(sub.endSec - sub.startSec).toFixed(1)}s)</span>
                        </span>
                      </div>

                      {/* 히브리어 */}
                      <div>
                        <label className="block text-xs text-parchment/40 mb-1">히브리어</label>
                        <textarea
                          rows={2}
                          dir="rtl"
                          className="w-full bg-ink border border-gold/20 focus:border-gold/50 rounded-lg px-3 py-1.5 text-sm text-gold/90 resize-none focus:outline-none font-mono leading-relaxed"
                          value={sub.heText ?? ""}
                          onChange={(e) => updateSubtitle(i, "heText", e.target.value)}
                          placeholder="히브리어 입력"
                        />
                      </div>

                      {/* 한국어 */}
                      <div>
                        <label className="block text-xs text-parchment/40 mb-1">한국어</label>
                        <textarea
                          rows={2}
                          className="w-full bg-ink border border-gold/20 focus:border-gold/50 rounded-lg px-3 py-1.5 text-sm text-parchment resize-none focus:outline-none leading-relaxed"
                          value={sub.text}
                          onChange={(e) => updateSubtitle(i, "text", e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
