import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Download, Play, Send, RefreshCw, ExternalLink, Loader2, Upload, Film, Mic, AlignLeft, ChevronLeft, Save, Clock, Replace, Plus, Trash2, ToggleLeft, ToggleRight, Music, Zap, ChevronDown, ChevronUp, Check, AlertCircle, MessageSquare, Bot, User } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { projectsApi } from "../api/projects";
import { remotionApi, RemotionProps, RenderStatus, SubEntry, WordReplacement, ChatMessage } from "../api/remotion";

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
  const [language, setLanguage] = useState<"ko" | "en">(incomingProps?.language ?? "ko");
  const [englishText, setEnglishText] = useState(incomingProps?.englishText ?? "");
  const [iframeSrc, setIframeSrc] = useState(REMOTION_STUDIO_URL);
  const [renderStatus, setRenderStatus] = useState<RenderStatus | null>(null);
  const [fromKeyframeNotice, setFromKeyframeNotice] = useState(!!incomingProps?.fromKeyframe);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [narrationStatus, setNarrationStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [narrationError, setNarrationError] = useState("");
  const [narrationDuration, setNarrationDuration] = useState<number | null>(null);
  const [enNarrationStatus, setEnNarrationStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [enNarrationError, setEnNarrationError] = useState("");
  const [enNarrationDuration, setEnNarrationDuration] = useState<number | null>(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [activeView, setActiveView] = useState<"studio" | "subtitles">("studio");
  const [subtitles, setSubtitles] = useState<SubEntry[]>([]);
  const [subtitleSaveStatus, setSubtitleSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [subtitleSaveError, setSubtitleSaveError] = useState("");
  const [subtitleLoadError, setSubtitleLoadError] = useState("");
  const [wordReplacements, setWordReplacements] = useState<WordReplacement[]>([]);
  const [wordReplSaveStatus, setWordReplSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [wordReplSaveError, setWordReplSaveError] = useState("");
  const [showWordRepl, setShowWordRepl] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(null);
  const [audioUploadError, setAudioUploadError] = useState("");
  const [audioUploadDone, setAudioUploadDone] = useState("");
  // ElevenLabs
  const [showElevenLabs, setShowElevenLabs] = useState(false);
  const [elVoiceId, setElVoiceId] = useState("");
  const [elModel, setElModel] = useState("eleven_multilingual_v2");
  const [elStability, setElStability] = useState(0.5);
  const [elSimilarity, setElSimilarity] = useState(0.75);
  const [elStatus, setElStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [elError, setElError] = useState("");
  const [elDuration, setElDuration] = useState<number | null>(null);
  // Gemini 채팅
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 키프레임 갤러리에서 넘어온 경우 — 자동으로 Remotion 스튜디오로 전송
  useEffect(() => {
    if (!incomingProps?.fromKeyframe) return;
    remotionApi.sendProps({
      koreanText: incomingProps.koreanText ?? "",
      hebrewText: incomingProps.hebrewText ?? "",
      englishText: incomingProps.englishText ?? "",
      language: incomingProps.language ?? "ko",
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

  // ElevenLabs 음성 목록 (패널 열릴 때 fetch)
  const { data: elVoices = [], isLoading: elVoicesLoading, error: elVoicesError } = useQuery({
    queryKey: ["elevenLabsVoices"],
    queryFn: remotionApi.getElevenLabsVoices,
    enabled: showElevenLabs,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ElevenLabs 크레딧 정보 (패널 열릴 때 fetch)
  const { data: elUserInfo } = useQuery({
    queryKey: ["elevenLabsUser"],
    queryFn: remotionApi.getElevenLabsUser,
    enabled: showElevenLabs,
    staleTime: 60 * 1000,
    retry: false,
  });

  // public/ 동영상 파일 목록
  const { data: videoFiles = [], refetch: refetchVideos } = useQuery({
    queryKey: ["remotionVideos"],
    queryFn: remotionApi.listVideos,
  });

  // public/ 오디오 파일 목록
  const { data: audioFiles = [], refetch: refetchAudios } = useQuery({
    queryKey: ["remotionAudios"],
    queryFn: remotionApi.listAudios,
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
      refetchAudios();
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
  function updateSubtitle(index: number, field: "text" | "heText" | "enText", value: string) {
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
        { from: "여호와 하나님", to: "엘로힘", enabled: true },
        { from: "주 하나님", to: "엘로힘", enabled: true },
        { from: "하나님", to: "엘로힘", enabled: true },
      ]);
    }
  }

  // 단어 치환 규칙 저장
  async function handleSaveWordReplacements() {
    setWordReplSaveStatus("saving");
    setWordReplSaveError("");
    // from이 비어 있는 규칙은 저장하지 않음
    const valid = wordReplacements.filter((r) => r.from.trim() !== "");
    try {
      await remotionApi.saveWordReplacements(valid);
      setWordReplacements(valid);
      setWordReplSaveStatus("saved");
      setTimeout(() => setWordReplSaveStatus("idle"), 3000);
    } catch (e: any) {
      setWordReplSaveError(e?.message ?? "저장 실패");
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

  // ElevenLabs TTS 생성 핸들러
  async function handleElevenLabsGenerate() {
    if (!selectedEpisodeId || !elVoiceId) return;
    setElStatus("generating");
    setElError("");
    setElDuration(null);
    try {
      const result = await remotionApi.generateElevenLabsNarration({
        episodeId: selectedEpisodeId,
        voiceId: elVoiceId,
        modelId: elModel,
        stability: elStability,
        similarityBoost: elSimilarity,
        language,
      });
      setAudioFileName(result.fileName ?? "narration.mp3");
      setElDuration(result.durationSec);
      setElStatus("done");
      refetchAudios();
      // Remotion Studio 반영
      sendMutation.mutate({
        koreanText,
        hebrewText,
        videoFileName,
        audioFileName: "narration.mp3",
        episodeId: selectedEpisodeId || undefined,
      });
      setTimeout(() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`), 500);
    } catch (err: any) {
      setElError(err?.response?.data?.error ?? err.message);
      setElStatus("error");
    }
  }

  // 나레이션 오디오 업로드 → narration.mp3 교체
  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUploadError("");
    setAudioUploadDone("");
    setAudioUploadProgress(0);
    try {
      const result = await remotionApi.uploadAudio(file, setAudioUploadProgress);
      setAudioFileName(result.fileName);
      setAudioUploadDone(result.originalName);
      refetchAudios();
      // Remotion Studio에 즉시 반영
      sendMutation.mutate({
        koreanText,
        hebrewText,
        videoFileName,
        audioFileName: result.fileName,
        episodeId: selectedEpisodeId || undefined,
      });
    } catch (err: any) {
      setAudioUploadError(err?.response?.data?.error ?? err.message);
    } finally {
      setAudioUploadProgress(null);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  }

  // Gemini 채팅 전송
  async function handleChatSend() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const context = {
        koreanText, hebrewText, englishText, language,
        videoFileName, audioFileName,
        subtitleCount: subtitles.length,
      };
      const result = await remotionApi.chat(msg, context, chatMessages);
      const assistantMsg: ChatMessage = { role: "assistant", content: result.message };
      setChatMessages([...newHistory, assistantMsg]);

      // action이면 props 즉시 반영
      if (result.type === "action" && result.props) {
        if (result.props.koreanText !== undefined) setKoreanText(result.props.koreanText);
        if (result.props.hebrewText !== undefined) setHebrewText(result.props.hebrewText);
        if (result.props.englishText !== undefined) setEnglishText(result.props.englishText);
        if (result.props.language !== undefined) setLanguage(result.props.language as "ko" | "en");
        if (result.props.videoFileName !== undefined) setVideoFileName(result.props.videoFileName);
        if (result.props.audioFileName !== undefined) setAudioFileName(result.props.audioFileName);
        // Remotion Studio 즉시 갱신
        sendMutation.mutate({
          koreanText:    result.props.koreanText    ?? koreanText,
          hebrewText:    result.props.hebrewText    ?? hebrewText,
          englishText:   result.props.englishText   ?? englishText,
          language:      result.props.language      ?? language,
          videoFileName: result.props.videoFileName ?? videoFileName,
          audioFileName: result.props.audioFileName ?? audioFileName,
          episodeId: selectedEpisodeId || undefined,
        });
        setTimeout(() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`), 400);
      }
    } catch (err: any) {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `⚠️ 오류: ${err?.response?.data?.error ?? err.message}`,
      };
      setChatMessages([...newHistory, errMsg]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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
      if (texts.englishText) setEnglishText(texts.englishText);
    } catch {
      // fetch 실패 시 제목 fallback 유지
    } finally {
      setSubtitleLoading(false);
    }
  }

  // 영어 나레이션 TTS 생성
  async function handleGenerateEnglishNarration() {
    if (!selectedEpisodeId) return;
    setEnNarrationStatus("generating");
    setEnNarrationError("");
    try {
      const result = await remotionApi.generateEnglishNarration(selectedEpisodeId);
      setAudioFileName(result.fileName);
      if (result.durationSec) setEnNarrationDuration(result.durationSec);
      if (result.subtitlesJson) {
        try {
          const parsed = JSON.parse(result.subtitlesJson) as SubEntry[];
          setSubtitles(parsed.map((s) => ({ ...s, heText: s.heText ?? "" })));
        } catch {}
      }
      setEnNarrationStatus("done");
      refetchAudios();
      sendMutation.mutate({
        koreanText, hebrewText, englishText, language: "en",
        videoFileName, audioFileName: result.fileName,
        episodeId: selectedEpisodeId || undefined,
      });
      setTimeout(() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`), 500);
    } catch (err: any) {
      setEnNarrationError(err?.response?.data?.error ?? err.message);
      setEnNarrationStatus("error");
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

  // 렌더 완료 폴링 (최대 15분)
  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    const deadline = Date.now() + 15 * 60 * 1000;
    let failCount = 0;
    pollRef.current = setInterval(async () => {
      // 타임아웃
      if (Date.now() > deadline) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setRenderStatus({ status: "error", error: "렌더링 시간 초과 (15분)", fileReady: false });
        return;
      }
      try {
        const status = await remotionApi.getRenderStatus();
        failCount = 0;
        setRenderStatus(status);
        if (status.status === "done" || status.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch {
        failCount++;
        // 연속 5회 실패 시 렌더 서버 연결 불가로 처리
        if (failCount >= 5) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setRenderStatus({ status: "error", error: "렌더 서버 연결 실패", fileReady: false });
        }
      }
    }, 3000);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const canSend = (language === "ko" ? koreanText.trim() : englishText.trim()) && hebrewText.trim();
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
          className="flex items-center gap-2 px-3 py-1.5 text-xs border border-white/30 rounded-xl text-white/80 hover:bg-white/10 backdrop-blur-sm transition-colors shadow-[0px_2px_8px_rgba(0,0,0,0.20)]"
          style={{ background: "rgba(255,255,255,0.10)" }}
        >
          <ExternalLink size={14} />
          Remotion Studio 새 창
        </a>
      }
    >
      {/* 글래스모피즘 그라디언트 배경 */}
      <div
        className="fixed inset-0 pointer-events-none -z-10"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(120,40,180,0.55) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 70%, rgba(30,80,200,0.50) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 50% 10%, rgba(0,160,160,0.35) 0%, transparent 50%)",
        }}
      />

      {/* 키프레임 갤러리에서 넘어온 경우 알림 배너 */}
      {fromKeyframeNotice && (
        <div
          className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-2xl text-white/90 text-sm font-body border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20)]"
          style={{ background: "rgba(59,130,246,0.18)", backdropFilter: "blur(14px)" }}
        >
          <span className="text-base">🖼</span>
          <span>키프레임 미리보기 로드됨 — Remotion Studio에 자동 전송되었습니다.</span>
          <button onClick={() => setFromKeyframeNotice(false)} className="ml-auto text-white/50 hover:text-white">✕</button>
        </div>
      )}

      <div className="flex gap-5 h-[calc(100vh-160px)]">
        {/* 좌측: 컨트롤 패널 */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* 에피소드 연동 */}
          <section className="rounded-2xl p-4 space-y-3 border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20),inset_0px_0px_12px_rgba(255,255,255,0.10)]" style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(14px)" }}>
            <h3 className="font-display text-amber-200 text-sm" style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}>에피소드 연동</h3>
            <div>
              <label className="block text-xs text-white/60 mb-1">프로젝트</label>
              <select
                className="w-full rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
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
                <label className="block text-xs text-white/60 mb-1">에피소드</label>
                <select
                  className="w-full rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
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

          {/* 언어 선택 */}
          <section className="rounded-2xl p-3 border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20)]" style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(14px)" }}>
            <h3 className="font-display text-amber-200 text-xs mb-2" style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}>나레이션 언어</h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLanguage("ko");
                  sendMutation.mutate({ koreanText, hebrewText, englishText, language: "ko", videoFileName, audioFileName, episodeId: selectedEpisodeId || undefined });
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-body border transition-all ${language === "ko" ? "border-amber-400/60 text-amber-200" : "border-white/20 text-white/50 hover:text-white/80"}`}
                style={{ background: language === "ko" ? "rgba(180,120,0,0.28)" : "rgba(255,255,255,0.07)" }}
              >
                🇰🇷 한국어
              </button>
              <button
                onClick={() => {
                  setLanguage("en");
                  sendMutation.mutate({ koreanText, hebrewText, englishText, language: "en", videoFileName, audioFileName, episodeId: selectedEpisodeId || undefined });
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-body border transition-all ${language === "en" ? "border-blue-400/60 text-blue-200" : "border-white/20 text-white/50 hover:text-white/80"}`}
                style={{ background: language === "en" ? "rgba(30,80,200,0.28)" : "rgba(255,255,255,0.07)" }}
              >
                🇺🇸 English
              </button>
            </div>
          </section>

          {/* 자막 텍스트 */}
          <section className="rounded-2xl p-4 space-y-3 border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20),inset_0px_0px_12px_rgba(255,255,255,0.10)]" style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(14px)" }}>
            <h3 className="font-display text-amber-200 text-sm flex items-center gap-2" style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}>
              자막 텍스트
              {subtitleLoading && <Loader2 size={12} className="animate-spin text-amber-300/60" />}
            </h3>
            {language === "ko" ? (
              <div>
                <label className="block text-xs text-white/60 mb-1">한국어</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white/90 resize-none focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                  placeholder="예: 태초에 하나님이 천지를 창조하시니라"
                  value={koreanText}
                  onChange={(e) => setKoreanText(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-white/60 mb-1">English</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white/90 resize-none focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                  placeholder="e.g. In the beginning God created the heavens and the earth."
                  value={englishText}
                  onChange={(e) => setEnglishText(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-white/60 mb-1">히브리어</label>
              <textarea
                rows={3}
                dir="rtl"
                className="w-full rounded-xl px-3 py-2 text-sm text-white/90 resize-none focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                placeholder="בְּרֵאשִׁית בָּרָא אֱלֹהִים"
                value={hebrewText}
                onChange={(e) => setHebrewText(e.target.value)}
              />
            </div>
          </section>

          {/* 파일 설정 */}
          <section className="rounded-2xl p-4 space-y-3 border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20),inset_0px_0px_12px_rgba(255,255,255,0.10)]" style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(14px)" }}>
            <h3 className="font-display text-amber-200 text-sm" style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}>
              파일 설정 <span className="text-white/45 font-body text-xs">(public/ 내)</span>
            </h3>

            {/* 배경 동영상 업로드 */}
            <div>
              <label className="block text-xs text-white/60 mb-1">
                배경 동영상 <span className="text-white/35">(비워두면 그라데이션)</span>
              </label>

              {/* 업로드 버튼 */}
              <input ref={fileInputRef} type="file" accept=".mp4,.webm,.mov,.avi,.mkv" className="hidden" onChange={handleVideoUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProgress !== null}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-white/70 hover:text-white text-xs font-body rounded-xl transition-all border border-white/20 hover:border-white/35 disabled:opacity-40 shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
              style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
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
                  className="w-full mt-2 rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
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
                className="w-full mt-2 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                placeholder="파일명 직접 입력 (예: video.mp4)"
                value={videoFileName}
                onChange={(e) => setVideoFileName(e.target.value)}
              />
              {videoFileName && (
                <p className="text-xs text-amber-300/70 mt-1 flex items-center gap-1">
                  <Film size={10} /> {videoFileName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-1">나레이션 오디오</label>

              {/* 저장된 오디오 파일 선택 드롭다운 */}
              {audioFiles.length > 0 && (
                <select
                  className="w-full mb-2 rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors"
                  style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                  value={audioFileName}
                  onChange={(e) => {
                    setAudioFileName(e.target.value);
                    if (e.target.value) {
                      sendMutation.mutate({
                        koreanText,
                        hebrewText,
                        videoFileName,
                        audioFileName: e.target.value,
                        episodeId: selectedEpisodeId || undefined,
                      });
                    }
                  }}
                >
                  <option value="">— 저장된 음성 파일 선택 —</option>
                  {audioFiles.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}

              <input
                className="w-full rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors mb-2" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                placeholder="파일명 직접 입력 (예: narration.mp3)"
                value={audioFileName}
                onChange={(e) => setAudioFileName(e.target.value)}
              />
              {/* 나레이션 TTS 생성 버튼 — 언어별 분기 */}
              {language === "ko" ? (
                <>
                  <button
                    onClick={handleGenerateNarration}
                    disabled={narrationStatus === "generating" || !selectedEpisodeId}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-300/35 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
                    style={{ background: "rgba(180,120,0,0.18)", backdropFilter: "blur(12px)" }}
                    title={!selectedEpisodeId ? "에피소드를 먼저 선택하세요" : ""}
                  >
                    {narrationStatus === "generating" ? (
                      <><Loader2 size={12} className="animate-spin" /> 한국어 나레이션 생성 중…</>
                    ) : (
                      <><Mic size={12} /> 🇰🇷 한국어 나레이션 생성 (TTS)</>
                    )}
                  </button>
                  {narrationStatus === "done" && (
                    <p className="text-xs text-emerald-400 mt-1">
                      ✓ narration.mp3 생성 완료
                      {narrationDuration && ` (${narrationDuration.toFixed(1)}초)`}
                    </p>
                  )}
                  {narrationStatus === "error" && <p className="text-xs text-red-400 mt-1">⚠ {narrationError}</p>}
                </>
              ) : (
                <>
                  <button
                    onClick={handleGenerateEnglishNarration}
                    disabled={enNarrationStatus === "generating" || !selectedEpisodeId}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed text-blue-200 border border-blue-400/35 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
                    style={{ background: "rgba(30,80,200,0.18)", backdropFilter: "blur(12px)" }}
                    title={!selectedEpisodeId ? "에피소드를 먼저 선택하세요" : ""}
                  >
                    {enNarrationStatus === "generating" ? (
                      <><Loader2 size={12} className="animate-spin" /> English 나레이션 생성 중…</>
                    ) : (
                      <><Mic size={12} /> 🇺🇸 English Narration (TTS)</>
                    )}
                  </button>
                  {enNarrationStatus === "done" && (
                    <p className="text-xs text-emerald-400 mt-1">
                      ✓ narration_en.mp3 generated
                      {enNarrationDuration && ` (${enNarrationDuration.toFixed(1)}s)`}
                    </p>
                  )}
                  {enNarrationStatus === "error" && <p className="text-xs text-red-400 mt-1">⚠ {enNarrationError}</p>}
                </>
              )}

              {/* ── ElevenLabs TTS ── */}
              <div className="mt-2 pt-2 border-t border-white/15">
                <button
                  className="w-full flex items-center justify-between text-xs font-body"
                  onClick={() => setShowElevenLabs((v) => !v)}
                >
                  <span className="flex items-center gap-1.5 text-purple-300">
                    <Zap size={12} /> ElevenLabs TTS
                    {elUserInfo?.keyValid && (
                      <span className="flex items-center gap-0.5 text-emerald-400 text-[10px]">
                        <Check size={9} /> 연결됨
                        {elUserInfo.characterCount >= 0 && (
                          <span className="text-white/40 ml-1">
                            {elUserInfo.characterCount.toLocaleString()} / {elUserInfo.characterLimit.toLocaleString()}자
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {showElevenLabs ? <ChevronUp size={12} className="text-white/40" /> : <ChevronDown size={12} className="text-white/40" />}
                </button>

                {showElevenLabs && (
                  <div className="mt-2 space-y-2">
                    {/* API 키 미설정 또는 네트워크 오류 */}
                    {elVoicesError && !elUserInfo?.keyValid && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-300 p-2 rounded-lg border border-amber-400/25"
                        style={{ background: "rgba(180,120,0,0.15)" }}>
                        <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                        <span>
                          API 키 필요 — <code className="text-white/60">.env</code>의{" "}
                          <code className="text-amber-200">ELEVENLABS_API_KEY</code>를 설정하고 백엔드를 재시작하세요.
                        </span>
                      </div>
                    )}

                    {/* 음성 선택 */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">음성 선택</label>
                      {elVoicesLoading ? (
                        <div className="flex items-center gap-1.5 text-xs text-white/40">
                          <Loader2 size={11} className="animate-spin" /> 음성 목록 로딩 중…
                        </div>
                      ) : (
                        <select
                          className="w-full rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none border border-white/25 focus:border-purple-400/50 transition-colors"
                          style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                          value={elVoiceId}
                          onChange={(e) => setElVoiceId(e.target.value)}
                        >
                          <option value="">— 음성 선택 —</option>
                          {elVoices.map((v) => (
                            <option key={v.voice_id} value={v.voice_id}>
                              {v.name}
                              {v.labels?.language ? ` (${v.labels.language})` : ""}
                              {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
                              {v.category === "cloned" ? " 🔖" : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 모델 선택 */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">모델</label>
                      <select
                        className="w-full rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none border border-white/25 focus:border-purple-400/50 transition-colors"
                        style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                        value={elModel}
                        onChange={(e) => setElModel(e.target.value)}
                      >
                        <option value="eleven_multilingual_v2">Multilingual v2 (권장 · 한국어)</option>
                        <option value="eleven_turbo_v2_5">Turbo v2.5 (빠름 · 다국어)</option>
                        <option value="eleven_turbo_v2">Turbo v2 (빠름 · 영어)</option>
                        <option value="eleven_monolingual_v1">Monolingual v1 (영어 전용)</option>
                      </select>
                    </div>

                    {/* 파라미터 슬라이더 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-white/50 mb-1">
                          안정성 <span className="text-white/35">{elStability.toFixed(2)}</span>
                        </label>
                        <input type="range" min="0" max="1" step="0.05"
                          value={elStability}
                          onChange={(e) => setElStability(Number(e.target.value))}
                          className="w-full accent-purple-400 h-1.5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/50 mb-1">
                          유사도 <span className="text-white/35">{elSimilarity.toFixed(2)}</span>
                        </label>
                        <input type="range" min="0" max="1" step="0.05"
                          value={elSimilarity}
                          onChange={(e) => setElSimilarity(Number(e.target.value))}
                          className="w-full accent-purple-400 h-1.5"
                        />
                      </div>
                    </div>

                    {/* 생성 버튼 */}
                    <button
                      onClick={handleElevenLabsGenerate}
                      disabled={elStatus === "generating" || !elVoiceId || !selectedEpisodeId}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed text-purple-200 border border-purple-400/40 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
                      style={{ background: "rgba(120,60,200,0.22)", backdropFilter: "blur(12px)" }}
                      title={!selectedEpisodeId ? "에피소드를 먼저 선택하세요" : !elVoiceId ? "음성을 선택하세요" : ""}
                    >
                      {elStatus === "generating" ? (
                        <><Loader2 size={12} className="animate-spin" /> ElevenLabs 생성 중…</>
                      ) : (
                        <><Zap size={12} /> ElevenLabs로 나레이션 생성</>
                      )}
                    </button>

                    {/* 결과 메시지 */}
                    {elStatus === "done" && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check size={11} /> 완료 {elDuration && `(${elDuration.toFixed(1)}초)`}
                        {audioFileName && <span className="text-white/40 truncate ml-1">— {audioFileName}</span>}
                      </p>
                    )}
                    {elStatus === "error" && (
                      <p className="text-xs text-red-400 break-all">⚠ {elError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* 나레이션 TTS 파일 직접 업로드 → narration.mp3 교체 */}
              <div className="mt-2 pt-2 border-t border-white/15">
                <label className="block text-xs text-white/55 mb-1.5">
                  또는 TTS 파일 업로드 <span className="text-white/35">(→ narration.mp3 교체)</span>
                </label>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept=".mp3,.wav,.aac,.m4a,.ogg,.flac"
                  className="hidden"
                  onChange={handleAudioUpload}
                />
                <button
                  onClick={() => audioInputRef.current?.click()}
                  disabled={audioUploadProgress !== null}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-white/70 hover:text-white text-xs font-body rounded-xl transition-all border border-white/20 hover:border-white/35 disabled:opacity-40 shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
                  style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
                >
                  {audioUploadProgress !== null ? (
                    <><Loader2 size={12} className="animate-spin" /> 업로드 중 {audioUploadProgress}%</>
                  ) : (
                    <><Music size={12} /> 나레이션 파일 업로드 (MP3/WAV…)</>
                  )}
                </button>
                {audioUploadDone && (
                  <p className="text-xs text-emerald-400 mt-1">
                    ✓ narration.mp3 교체 완료 <span className="text-white/40">({audioUploadDone})</span>
                  </p>
                )}
                {audioUploadError && <p className="text-xs text-red-400 mt-1">⚠ {audioUploadError}</p>}
              </div>
            </div>
          </section>

          {/* 자막 편집 */}
          <section className="rounded-2xl p-4 space-y-2 border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20),inset_0px_0px_12px_rgba(255,255,255,0.10)]" style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(14px)" }}>
            <h3 className="font-display text-amber-200 text-sm" style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}>자막 편집</h3>
            <p className="text-xs text-white/55">나레이션 생성 후 각 자막 라인을 직접 수정할 수 있습니다.</p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setActiveView("subtitles");
                  // 이미 로드된 자막이 있으면 다시 불러오지 않음 (편집 내용 보존)
                  if (subtitles.length === 0) {
                    await handleLoadSubtitles();
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-amber-200 border border-amber-300/35 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
                style={{ background: "rgba(180,120,0,0.18)", backdropFilter: "blur(12px)" }}
              >
                <AlignLeft size={12} />
                {subtitles.length > 0 ? `자막 편집 열기 (${subtitles.length}개)` : "자막 불러오기 / 편집"}
              </button>
            </div>
            {subtitleLoadError && <p className="text-xs text-red-400">{subtitleLoadError}</p>}
          </section>

          {/* 단어 치환 */}
          <section className="rounded-2xl p-4 space-y-2 border border-white/30 shadow-[0px_4px_24px_rgba(0,0,0,0.20),inset_0px_0px_12px_rgba(255,255,255,0.10)]" style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(14px)" }}>
            <button
              className="w-full flex items-center justify-between text-sm font-display text-amber-200"
              style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}
              onClick={() => {
                setShowWordRepl((v) => !v);
                if (wordReplacements.length === 0) handleLoadWordReplacements();
              }}
            >
              <span className="flex items-center gap-2"><Replace size={14} /> 단어 치환 규칙</span>
              <span className="text-xs text-white/45">{showWordRepl ? "▲" : "▼"}</span>
            </button>

            {showWordRepl && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-white/55">나레이션 TTS 및 자막에 자동 적용됩니다.</p>

                {wordReplacements.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {/* 활성/비활성 토글 */}
                    <button
                      onClick={() => setWordReplacements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, enabled: !r.enabled } : r)
                      )}
                      className={rule.enabled ? "text-amber-300" : "text-white/30"}
                      title={rule.enabled ? "비활성화" : "활성화"}
                    >
                      {rule.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    {/* from */}
                    <input
                      className="flex-1 rounded-lg px-2 py-1 text-xs text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                      value={rule.from}
                      placeholder="원본 단어"
                      onChange={(e) => setWordReplacements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, from: e.target.value } : r)
                      )}
                    />
                    <span className="text-white/35 text-xs">→</span>
                    {/* to */}
                    <input
                      className="flex-1 rounded-lg px-2 py-1 text-xs text-white/90 focus:outline-none border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                      value={rule.to}
                      placeholder="치환 단어"
                      onChange={(e) => setWordReplacements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, to: e.target.value } : r)
                      )}
                    />
                    {/* 삭제 */}
                    <button
                      onClick={() => setWordReplacements((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-white/30 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

                {/* 규칙 추가 */}
                <button
                  onClick={() => setWordReplacements((prev) => [...prev, { from: "", to: "", enabled: true }])}
                  className="flex items-center gap-1 text-xs text-white/50 hover:text-amber-200 transition-colors"
                >
                  <Plus size={12} /> 규칙 추가
                </button>

                {/* 저장 버튼 */}
                <button
                  onClick={handleSaveWordReplacements}
                  disabled={wordReplSaveStatus === "saving"}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 disabled:opacity-40 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.15)] ${
                    wordReplSaveStatus === "error"
                      ? "text-red-300 border border-red-400/35"
                      : "text-amber-200 border border-amber-300/35"
                  }`}
                  style={{
                    background: wordReplSaveStatus === "error" ? "rgba(200,30,30,0.18)" : "rgba(180,120,0,0.18)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  {wordReplSaveStatus === "saving" ? (
                    <><Loader2 size={11} className="animate-spin" /> 저장 중…</>
                  ) : wordReplSaveStatus === "saved" ? (
                    <>✓ 저장됨</>
                  ) : wordReplSaveStatus === "error" ? (
                    <>⚠ 저장 실패 — 재시도</>
                  ) : (
                    <><Save size={11} /> 치환 규칙 저장</>
                  )}
                </button>
                {wordReplSaveStatus === "error" && wordReplSaveError && (
                  <p className="text-xs text-red-400 break-all">{wordReplSaveError}</p>
                )}
              </div>
            )}
          </section>

          {/* 액션 버튼 */}
          <div className="space-y-2">
            {/* 스튜디오 전송 */}
            <button
              onClick={() => sendMutation.mutate({ koreanText, hebrewText, englishText, language, videoFileName, audioFileName, episodeId: selectedEpisodeId || undefined })}
              disabled={!canSend || sendMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-300/40 rounded-2xl text-sm font-body transition-all shadow-[0px_4px_24px_rgba(0,0,0,0.20)] hover:shadow-[0px_4px_32px_rgba(180,120,0,0.30)]"
              style={{ background: "rgba(180,120,0,0.22)", backdropFilter: "blur(14px)" }}
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

            {/* 렌더 상태 */}
            {renderStatus && (
              <div
                className={`text-xs text-center rounded-xl px-3 py-2 border shadow-[0px_2px_12px_rgba(0,0,0,0.18)] ${
                  renderStatus.status === "done" ? "text-emerald-200 border-emerald-400/35" :
                  renderStatus.status === "error" ? "text-red-300 border-red-400/35" :
                  "text-cyan-200 border-cyan-400/35"
                }`}
                style={{
                  background: renderStatus.status === "done" ? "rgba(0,140,80,0.18)" :
                    renderStatus.status === "error" ? "rgba(200,30,30,0.18)" :
                    "rgba(0,120,200,0.18)",
                  backdropFilter: "blur(12px)",
                }}
              >
                {renderStatus.status === "rendering" && "렌더링 진행 중… Chrome Headless 사용"}
                {renderStatus.status === "done" && "✓ 렌더링 완료!"}
                {renderStatus.status === "error" && `오류: ${renderStatus.error}`}
              </div>
            )}

            {/* 다운로드 */}
            {renderStatus?.status === "done" && (
              <a
                href={remotionApi.downloadUrl()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-emerald-200 border border-emerald-400/40 rounded-2xl text-sm font-body transition-all shadow-[0px_4px_24px_rgba(0,0,0,0.20)] hover:shadow-[0px_4px_32px_rgba(0,200,120,0.25)]"
                style={{ background: "rgba(0,140,80,0.22)", backdropFilter: "blur(14px)" }}
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
                <p className="text-xs text-white/45 font-body">
                  Remotion Studio — 실시간 미리보기 (<span className="text-amber-300/60">{REMOTION_STUDIO_URL}</span>)
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowChat((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all ${showChat ? "text-emerald-200 border-emerald-400/40" : "text-white/55 border-white/20 hover:text-white"}`}
                    style={{ background: showChat ? "rgba(0,160,80,0.20)" : "rgba(255,255,255,0.07)", backdropFilter: "blur(8px)" }}
                  >
                    <Bot size={12} />
                    Gemini AI
                  </button>
                  <button
                    onClick={() => setIframeSrc(`${REMOTION_STUDIO_URL}?t=${Date.now()}`)}
                    className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                  >
                    <RefreshCw size={12} />
                    새로고침
                  </button>
                </div>
              </div>

              <div className="flex-1 flex gap-3 min-h-0">
                {/* Remotion Preview */}
                <div className={`${showChat ? "flex-1" : "flex-1"} rounded-2xl overflow-hidden border border-white/25 shadow-[0px_4px_24px_rgba(0,0,0,0.25)]`}>
                  <iframe
                    key={iframeSrc}
                    src={iframeSrc}
                    className="w-full h-full bg-zinc-900"
                    title="Remotion Studio"
                    allow="autoplay"
                  />
                </div>

                {/* Gemini 채팅 패널 */}
                {showChat && (
                  <div
                    className="w-80 flex-shrink-0 flex flex-col rounded-2xl border border-white/25 overflow-hidden shadow-[0px_4px_24px_rgba(0,0,0,0.25)]"
                    style={{ background: "rgba(10,15,30,0.80)", backdropFilter: "blur(16px)" }}
                  >
                    {/* 헤더 */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 flex-shrink-0"
                      style={{ background: "rgba(0,160,80,0.15)" }}>
                      <Bot size={14} className="text-emerald-400" />
                      <span className="text-sm font-display text-emerald-200">Gemini AI 편집 어시스턴트</span>
                      <button onClick={() => setShowChat(false)} className="ml-auto text-white/30 hover:text-white text-xs">✕</button>
                    </div>

                    {/* 메시지 목록 */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                      {chatMessages.length === 0 && (
                        <div className="text-xs text-white/35 text-center py-6 space-y-2">
                          <Bot size={28} className="mx-auto text-emerald-400/40" />
                          <p>Gemini에게 명령하세요</p>
                          <div className="space-y-1 text-left">
                            {[
                              "한국어 자막을 바꿔줘",
                              "영어로 전환해줘",
                              "히브리어 텍스트를 수정해줘",
                              "배경 영상을 Test.mp4로 변경해줘",
                            ].map((ex) => (
                              <button
                                key={ex}
                                onClick={() => setChatInput(ex)}
                                className="block w-full text-left px-2 py-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                              >
                                💬 {ex}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {chatMessages.map((m, i) => (
                        <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${m.role === "user" ? "bg-blue-500/40" : "bg-emerald-500/40"}`}>
                            {m.role === "user" ? <User size={11} /> : <Bot size={11} />}
                          </div>
                          <div
                            className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                              m.role === "user"
                                ? "text-blue-100 border border-blue-400/20"
                                : "text-white/85 border border-white/10"
                            }`}
                            style={{
                              background: m.role === "user" ? "rgba(30,80,200,0.25)" : "rgba(255,255,255,0.07)",
                            }}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-emerald-500/40">
                            <Bot size={11} />
                          </div>
                          <div className="px-3 py-2 rounded-xl border border-white/10 text-xs text-white/40"
                            style={{ background: "rgba(255,255,255,0.07)" }}>
                            <Loader2 size={11} className="animate-spin inline mr-1" />
                            생각 중…
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* 입력창 */}
                    <div className="flex-shrink-0 p-3 border-t border-white/10">
                      <div className="flex gap-2">
                        <input
                          className="flex-1 rounded-xl px-3 py-2 text-xs text-white/90 focus:outline-none border border-white/20 focus:border-emerald-400/50 transition-colors"
                          style={{ background: "rgba(255,255,255,0.08)" }}
                          placeholder="명령을 입력하세요…"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                          disabled={chatLoading}
                        />
                        <button
                          onClick={handleChatSend}
                          disabled={!chatInput.trim() || chatLoading}
                          className="px-3 py-2 rounded-xl text-emerald-200 border border-emerald-400/35 disabled:opacity-40 transition-all"
                          style={{ background: "rgba(0,160,80,0.22)" }}
                        >
                          <Send size={12} />
                        </button>
                      </div>
                      {chatMessages.length > 0 && (
                        <button
                          onClick={() => setChatMessages([])}
                          className="mt-1.5 text-[10px] text-white/25 hover:text-white/50 transition-colors"
                        >
                          대화 초기화
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── 자막 편집 뷰 ─────────────────────────────────────────── */
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {/* 헤더 */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => setActiveView("studio")}
                  className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
                >
                  <ChevronLeft size={14} />
                  스튜디오로 돌아가기
                </button>
                <span className="text-white/35 text-xs">|</span>
                <span className="text-sm font-display text-amber-200" style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.30)" }}>자막 편집</span>
                <span className="text-xs text-white/45">{subtitles.length}개 항목</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={handleLoadSubtitles}
                    title="서버에서 다시 불러오기"
                    className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors px-2 py-1.5"
                  >
                    <RefreshCw size={12} />
                    새로고침
                  </button>
                  <button
                    onClick={handleSaveSubtitles}
                    disabled={subtitleSaveStatus === "saving"}
                    className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-40 text-amber-200 border border-amber-300/40 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.18)]"
                    style={{ background: "rgba(180,120,0,0.22)", backdropFilter: "blur(12px)" }}
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
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/45 text-sm">
                  <span>자막 데이터가 없습니다.</span>
                  <button
                    onClick={handleLoadSubtitles}
                    className="flex items-center gap-2 px-4 py-2 text-amber-200 border border-amber-300/35 rounded-xl text-xs font-body transition-all shadow-[0px_2px_12px_rgba(0,0,0,0.15)]"
                    style={{ background: "rgba(180,120,0,0.18)", backdropFilter: "blur(12px)" }}
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
                      className="rounded-2xl p-3 space-y-2 transition-all border border-white/25 hover:border-white/40 shadow-[0px_2px_12px_rgba(0,0,0,0.18)]"
                      style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(12px)" }}
                    >
                      {/* 번호 + 시간 */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-amber-200 px-2 py-0.5 rounded-md border border-amber-300/25" style={{ background: "rgba(180,120,0,0.18)" }}>
                          #{i + 1}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-white/40 font-mono">
                          <Clock size={10} />
                          {formatSec(sub.startSec)} → {formatSec(sub.endSec)}
                          <span className="text-white/30 ml-1">({(sub.endSec - sub.startSec).toFixed(1)}s)</span>
                        </span>
                      </div>

                      {/* 히브리어 */}
                      <div>
                        <label className="block text-xs text-white/45 mb-1">히브리어</label>
                        <textarea
                          rows={2}
                          dir="rtl"
                          className="w-full rounded-xl px-3 py-1.5 text-sm text-amber-200 resize-none focus:outline-none font-mono leading-relaxed border border-white/25 focus:border-amber-300/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                          value={sub.heText ?? ""}
                          onChange={(e) => updateSubtitle(i, "heText", e.target.value)}
                          placeholder="히브리어 입력"
                        />
                      </div>

                      {/* 한국어 */}
                      <div>
                        <label className="block text-xs text-white/45 mb-1">한국어</label>
                        <textarea
                          rows={2}
                          className="w-full rounded-xl px-3 py-1.5 text-sm text-white/90 resize-none focus:outline-none leading-relaxed border border-white/25 focus:border-white/50 transition-colors" style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)" }}
                          value={sub.text}
                          onChange={(e) => updateSubtitle(i, "text", e.target.value)}
                        />
                      </div>

                      {/* 영어 */}
                      <div>
                        <label className="block text-xs text-blue-300/60 mb-1">🇺🇸 English</label>
                        <textarea
                          rows={2}
                          className="w-full rounded-xl px-3 py-1.5 text-sm text-blue-100/80 resize-none focus:outline-none leading-relaxed border border-blue-400/20 focus:border-blue-400/50 transition-colors" style={{ background: "rgba(30,80,200,0.10)", backdropFilter: "blur(8px)" }}
                          value={sub.enText ?? ""}
                          onChange={(e) => updateSubtitle(i, "enText", e.target.value)}
                          placeholder="English subtitle"
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
