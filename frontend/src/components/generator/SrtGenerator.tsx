import { useState, useEffect } from "react";
import { Lightbulb, Eye, EyeOff, Edit2, Check, X, Save, Loader2, RefreshCw, Mic } from "lucide-react";
import { generateApi } from "../../api/generate";
import { episodesApi } from "../../api/episodes";
import { api } from "../../api/client";
import { remotionApi } from "../../api/remotion";
import { DownloadButton } from "../ui/DownloadButton";
import type { GeneratedContent } from "../../types";

interface Props {
  episodeId: string;
  existing: GeneratedContent[];
  sceneCount?: number;
  verseRange?: string;
  onDone?: () => void;
}

/** SRT 블록 파싱: [{num, time, text}] */
function parseSrt(srtContent: string): Array<{ num: number; time: string; text: string }> {
  const blocks = srtContent
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return null;
      const num = parseInt(lines[0], 10);
      if (isNaN(num)) return null;
      const time = lines[1] || "";
      // 여러 줄 자막 보존 (한국어 히브리어 어휘 정보 등)
      const text = lines.slice(2).join("\n").trim();
      return text ? { num, time, text } : null;
    })
    .filter((b): b is { num: number; time: string; text: string } => b !== null);
}

/** 편집된 씬 텍스트 배열 + 원본 타임코드를 합쳐 SRT 문자열 재생성 */
function rebuildSrt(scenes: Array<{ num: number; time: string; text: string }>, editedTexts: string[]): string {
  return scenes
    .map((s, i) => `${s.num}\n${s.time}\n${editedTexts[i] ?? s.text}`)
    .join("\n\n") + "\n";
}

/** 구절 범위 문자열에서 절 수 추산 */
function estimateVerseCount(verseRange?: string): number {
  if (!verseRange) return 0;
  const chapterVerse = verseRange.match(/^(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)$/);
  if (chapterVerse) {
    const [, startCh, startV, endCh, endV] = chapterVerse.map(Number);
    return (endCh - startCh) * 30 + (endV - startV + 1);
  }
  const simpleRange = verseRange.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (simpleRange) return Number(simpleRange[2]) - Number(simpleRange[1]) + 1;
  const single = verseRange.match(/^\d+$/);
  if (single) return 1;
  return 0;
}

function recommendScenes(verseCount: number, currentScene: number): number {
  if (verseCount <= 0) return currentScene;
  if (verseCount <= 3) return verseCount;
  if (verseCount <= 7) return Math.ceil(verseCount * 0.8);
  if (verseCount <= 15) return Math.ceil(verseCount * 0.6);
  if (verseCount <= 31) return Math.max(8, Math.ceil(verseCount * 0.45));
  return Math.max(10, Math.ceil(verseCount * 0.35));
}

type ViewTab = "table" | "ko" | "he" | "vi";

export function SrtGenerator({ episodeId, existing, sceneCount: initialSceneCount = 5, verseRange, onDone }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(existing.length > 0);
  const [sceneCount, setSceneCount] = useState(initialSceneCount);
  const [savingScene, setSavingScene] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("table");
  const [expanded, setExpanded] = useState(false);

  // 편집 모드
  const [editMode, setEditMode] = useState(false);
  const [editedKo, setEditedKo] = useState<string[]>([]);
  const [editedHe, setEditedHe] = useState<string[]>([]);
  const [editedVi, setEditedVi] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  // 저장 후 Remotion 동기화
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState("");
  // 저장 후 나레이션 재생성
  const [regenStatus, setRegenStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [regenError, setRegenError] = useState("");
  const [koChanged, setKoChanged] = useState(false);

  useEffect(() => { setSceneCount(initialSceneCount); }, [initialSceneCount]);
  useEffect(() => { if (existing.length > 0) setDone(true); }, [existing.length]);

  const verseCount = estimateVerseCount(verseRange);
  const recommended = recommendScenes(verseCount, sceneCount);

  const srtKo = existing.find((c) => c.contentType === "SRT_KO");
  const srtHe = existing.find((c) => c.contentType === "SRT_HE");
  const srtVi = existing.find((c) => c.contentType === "SRT_VI");

  const koScenes = srtKo ? parseSrt(srtKo.content) : [];
  const heScenes = srtHe ? parseSrt(srtHe.content) : [];
  const viScenes = srtVi ? parseSrt(srtVi.content) : [];
  const maxScenes = Math.max(koScenes.length, heScenes.length, viScenes.length);

  // 편집 모드 진입 시 현재 파싱된 텍스트로 초기화
  function enterEditMode() {
    setEditedKo(koScenes.map((s) => s.text));
    setEditedHe(heScenes.map((s) => s.text));
    setEditedVi(viScenes.map((s) => s.text));
    setSaveStatus("idle");
    setSaveError("");
    setSyncStatus("idle");
    setSyncError("");
    setRegenStatus("idle");
    setRegenError("");
    setKoChanged(false);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setSaveStatus("idle");
    setSaveError("");
  }

  async function handleSaveEdits() {
    setSaveStatus("saving");
    setSaveError("");
    setSyncStatus("idle");
    setRegenStatus("idle");

    // 한국어 변경 여부 감지
    const koHasChanges = editedKo.some((t, i) => t !== (koScenes[i]?.text ?? ""));
    setKoChanged(koHasChanges);

    try {
      const saves: Promise<void>[] = [];

      // 글자 수 제한 없이 편집된 내용 그대로 저장 (완전한 절 번역 보존)
      if (srtKo && editedKo.length > 0) {
        const rebuilt = rebuildSrt(koScenes, editedKo);
        saves.push(api.patch(`/contents/${srtKo.id}`, { content: rebuilt }).then(() => {}));
      }
      if (srtHe && editedHe.length > 0) {
        const rebuilt = rebuildSrt(heScenes, editedHe);
        saves.push(api.patch(`/contents/${srtHe.id}`, { content: rebuilt }).then(() => {}));
      }
      if (srtVi && editedVi.length > 0) {
        const rebuilt = rebuildSrt(viScenes, editedVi);
        saves.push(api.patch(`/contents/${srtVi.id}`, { content: rebuilt }).then(() => {}));
      }

      await Promise.all(saves);
      setSaveStatus("saved");
      setEditMode(false);
      onDone?.();

      // DB 저장 후 Remotion subtitles.json 동기화
      await syncToRemotion();
    } catch (e: any) {
      setSaveError(e.message ?? "저장 실패");
      setSaveStatus("error");
    }
  }

  /** DB에 저장된 SRT를 Remotion subtitles.json에 배분 */
  async function syncToRemotion() {
    setSyncStatus("syncing");
    setSyncError("");
    try {
      // 한국어 배분 시도 — subtitles.json 없으면 에러 감지
      let noSubtitleFile = false;
      await remotionApi.autoFillKorean(episodeId).catch((e: any) => {
        const msg: string = e?.response?.data?.error ?? e?.message ?? "";
        if (msg.includes("subtitles.json") || msg.includes("나레이션을 먼저")) {
          noSubtitleFile = true;
        }
      });

      if (noSubtitleFile) {
        // subtitles.json 없음 → 나레이션 먼저 생성해야 함
        setSyncStatus("error");
        setSyncError("나레이션을 먼저 생성해야 화면에 반영됩니다");
        return;
      }

      // 히브리어·영어 배분 (에러 무시)
      await Promise.all([
        remotionApi.autoFillHebrew(episodeId).catch(() => {}),
        remotionApi.autoFillEnglish(episodeId).catch(() => {}),
      ]);
      setSyncStatus("synced");
    } catch (e: any) {
      setSyncError(e.message ?? "동기화 실패");
      setSyncStatus("error");
    }
  }

  /** 한국어 자막 기준으로 나레이션 재생성 */
  async function handleRegenNarration() {
    setRegenStatus("generating");
    setRegenError("");
    try {
      await remotionApi.generateNarration(episodeId);
      setRegenStatus("done");
      // 나레이션 생성 후 자막도 동기화
      await syncToRemotion();
    } catch (e: any) {
      setRegenError(e.message ?? "나레이션 재생성 실패");
      setRegenStatus("error");
    }
  }

  async function applySceneCount(n: number) {
    if (n === initialSceneCount) return;
    setSavingScene(true);
    try { await episodesApi.update(episodeId, { sceneCount: n }); } catch { }
    finally { setSavingScene(false); }
  }

  async function handleGenerate() {
    await applySceneCount(sceneCount);
    setIsLoading(true);
    setError("");
    try {
      await generateApi.srt(episodeId);
      setDone(true);
      setExpanded(true);
      onDone?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-parchment font-body font-semibold">SRT 자막 3종</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">한국어 · 히브리어 (RTL) · 베트남어 — 씬별 정렬 확인 · 직접 편집 가능</p>
        </div>

        {/* 씬 수 선택 + 추천 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-parchment/60 text-sm font-body">씬 수:</span>
          <input
            type="number" min={1} max={50} value={sceneCount}
            onChange={(e) => setSceneCount(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="w-16 text-center rounded-lg px-2 py-1 text-sm text-parchment bg-ink border border-gold/30 focus:outline-none focus:border-gold/60"
          />
          {verseCount > 0 && recommended !== sceneCount && (
            <button
              onClick={() => setSceneCount(recommended)}
              title={`절 수(${verseCount}절) 기반 추천: ${recommended}개 씬`}
              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-300 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors"
            >
              <Lightbulb size={12} /> 추천 {recommended}개
            </button>
          )}
          {verseCount > 0 && <span className="text-parchment/35 text-xs font-body">({verseCount}절)</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {done && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-parchment/70 hover:text-parchment border border-parchment/20 rounded-lg transition-colors"
            >
              {expanded ? <><EyeOff size={12} /> 숨기기</> : <><Eye size={12} /> 자막 보기</>}
            </button>
          )}
          {done && (
            <button
              onClick={syncToRemotion}
              disabled={syncStatus === "syncing"}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-300 border border-blue-400/30 hover:bg-blue-400/10 disabled:opacity-50 rounded-lg transition-colors"
              title="현재 SRT를 Remotion 영상 자막에 반영"
            >
              {syncStatus === "syncing"
                ? <><Loader2 size={12} className="animate-spin" /> 반영 중…</>
                : <><RefreshCw size={12} /> 화면에 반영</>}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isLoading || savingScene}
            className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            {isLoading ? "생성 중..." : savingScene ? "저장 중..." : `자막 생성 (${sceneCount}씬)`}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm font-body">{error}</p>}

      {/* 다운로드 버튼 */}
      {done && (srtKo || srtHe || srtVi) && (
        <div className="flex flex-wrap gap-2">
          {srtKo && <DownloadButton href={`/api/v1/contents/${srtKo.id}/download`} label="KO .srt" />}
          {srtHe && <DownloadButton href={`/api/v1/contents/${srtHe.id}/download`} label="HE .srt" />}
          {srtVi && <DownloadButton href={`/api/v1/contents/${srtVi.id}/download`} label="VI .srt" />}
        </div>
      )}

      {/* SRT 뷰어 */}
      {done && expanded && maxScenes > 0 && (
        <div className="border border-gold/20 rounded-xl overflow-hidden bg-ink-light">
          {/* 탭 + 편집 버튼 행 */}
          <div className="flex items-center border-b border-gold/20 bg-ink">
            <div className="flex flex-1">
              {([
                { key: "table" as ViewTab, label: "씬 정렬 비교" },
                { key: "ko" as ViewTab, label: "🇰🇷 한국어" },
                { key: "he" as ViewTab, label: "🔤 히브리어" },
                { key: "vi" as ViewTab, label: "🇻🇳 베트남어" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setViewTab(key)}
                  className={`px-3 py-2 text-xs font-body transition-colors border-b-2 -mb-px ${
                    viewTab === key
                      ? "border-gold text-gold"
                      : "border-transparent text-parchment/40 hover:text-parchment/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 편집 모드 컨트롤 */}
            <div className="flex items-center gap-2 px-3">
              {editMode ? (
                <>
                  <button
                    onClick={handleSaveEdits}
                    disabled={saveStatus === "saving"}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gold/90 hover:bg-gold text-ink font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saveStatus === "saving" ? (
                      <><Loader2 size={11} className="animate-spin" /> 저장 중…</>
                    ) : (
                      <><Save size={11} /> 저장</>
                    )}
                  </button>
                  <button
                    onClick={cancelEditMode}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs text-parchment/60 hover:text-parchment border border-parchment/20 rounded-lg transition-colors"
                  >
                    <X size={11} /> 취소
                  </button>
                </>
              ) : (
                <button
                  onClick={enterEditMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-300 border border-amber-400/30 hover:bg-amber-400/10 rounded-lg transition-colors"
                >
                  <Edit2 size={11} /> 편집
                </button>
              )}
              {/* 저장 상태 */}
              {saveStatus === "saved" && syncStatus === "idle" && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check size={11} /> 저장됨
                </span>
              )}
              {saveStatus === "error" && (
                <span className="text-xs text-red-400">{saveError}</span>
              )}
              {/* Remotion 동기화 상태 */}
              {syncStatus === "syncing" && (
                <span className="flex items-center gap-1 text-xs text-blue-300">
                  <Loader2 size={11} className="animate-spin" /> 화면 반영 중…
                </span>
              )}
              {syncStatus === "synced" && regenStatus === "idle" && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check size={11} /> 화면 반영됨
                </span>
              )}
              {syncStatus === "error" && (
                <span className="text-xs text-amber-400" title={syncError}>{syncError}</span>
              )}
              {/* 나레이션 재생성 버튼: 한국어 변경됐거나 subtitles.json 없어서 sync 실패한 경우 표시 */}
              {(syncStatus === "synced" || syncStatus === "error") && koChanged && regenStatus === "idle" && (
                <button
                  onClick={handleRegenNarration}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-amber-200 border border-amber-400/40 hover:bg-amber-400/15 rounded-lg transition-colors"
                >
                  <Mic size={11} /> 나레이션 재생성
                </button>
              )}
              {regenStatus === "generating" && (
                <span className="flex items-center gap-1 text-xs text-amber-300">
                  <Loader2 size={11} className="animate-spin" /> 나레이션 생성 중…
                </span>
              )}
              {regenStatus === "done" && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check size={11} /> 나레이션 완료
                </span>
              )}
              {regenStatus === "error" && (
                <span className="text-xs text-red-400" title={regenError}>나레이션 실패</span>
              )}
            </div>
          </div>

          {/* 씬 정렬 비교 */}
          {viewTab === "table" && (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs font-body">
                <thead className="sticky top-0 bg-ink border-b border-gold/20">
                  <tr>
                    <th className="px-3 py-2 text-left text-parchment/50 w-10">씬</th>
                    <th className="px-3 py-2 text-left text-parchment/60">🇰🇷 한국어</th>
                    <th className="px-3 py-2 text-right text-amber-300/60" dir="rtl">🔤 히브리어</th>
                    <th className="px-3 py-2 text-left text-blue-300/60">🇻🇳 베트남어</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxScenes }, (_, i) => {
                    const ko = koScenes[i];
                    const he = heScenes[i];
                    const vi = viScenes[i];
                    return (
                      <tr
                        key={i}
                        className={`border-b border-gold/10 ${i % 2 === 0 ? "bg-ink" : "bg-ink-light"}`}
                      >
                        <td className="px-3 py-2 text-center align-top">
                          <span className="inline-block bg-gold/20 text-gold rounded px-1.5 py-0.5 text-xs font-mono">{i + 1}</span>
                        </td>

                        {/* 한국어 셀 */}
                        <td className="px-3 py-2 text-parchment/80 max-w-[220px] align-top">
                          {editMode && ko ? (
                            <textarea
                              rows={5}
                              className="w-full bg-ink border border-gold/30 focus:border-gold/60 rounded-lg px-2 py-1.5 text-parchment/90 text-xs resize-none focus:outline-none leading-relaxed"
                              value={editedKo[i] ?? ko.text}
                              onChange={(e) => { const next = [...editedKo]; next[i] = e.target.value; setEditedKo(next); }}
                            />
                          ) : (
                            ko ? (
                              <div className="space-y-1">
                                {ko.text.split('\n').map((line, idx) => (
                                  <div key={idx} className={line.startsWith('[') ? 'text-xs text-amber-300/70 italic' : 'text-xs'}>
                                    {line}
                                  </div>
                                ))}
                              </div>
                            ) : <span className="text-red-400/60 italic text-xs">없음</span>
                          )}
                        </td>

                        {/* 히브리어 셀 */}
                        <td className="px-3 py-2 text-amber-200/80 max-w-[220px] align-top" dir="rtl">
                          {editMode && he ? (
                            <textarea
                              rows={4}
                              dir="rtl"
                              className="w-full bg-ink border border-amber-400/30 focus:border-amber-400/60 rounded-lg px-2 py-1.5 text-amber-200/90 text-xs resize-none focus:outline-none font-mono leading-relaxed"
                              value={editedHe[i] ?? he.text}
                              onChange={(e) => { const next = [...editedHe]; next[i] = e.target.value; setEditedHe(next); }}
                            />
                          ) : (
                            he?.text || <span className="text-red-400/60 italic">없음</span>
                          )}
                        </td>

                        {/* 베트남어 셀 */}
                        <td className="px-3 py-2 text-blue-200/70 max-w-[220px] align-top">
                          {editMode && vi ? (
                            <textarea
                              rows={4}
                              className="w-full bg-ink border border-blue-400/30 focus:border-blue-400/60 rounded-lg px-2 py-1.5 text-blue-200/80 text-xs resize-none focus:outline-none leading-relaxed"
                              value={editedVi[i] ?? vi.text}
                              onChange={(e) => { const next = [...editedVi]; next[i] = e.target.value; setEditedVi(next); }}
                            />
                          ) : (
                            vi?.text || <span className="text-parchment/30 italic">없음</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 단일 언어 SRT 전체 보기 */}
          {viewTab !== "table" && (() => {
            const isSrtTab = (tab: ViewTab): tab is "ko" | "he" | "vi" => tab !== "table";
            if (!isSrtTab(viewTab)) return null;

            const content = viewTab === "ko" ? srtKo : viewTab === "he" ? srtHe : srtVi;
            const scenes = viewTab === "ko" ? koScenes : viewTab === "he" ? heScenes : viScenes;
            const editedTexts = viewTab === "ko" ? editedKo : viewTab === "he" ? editedHe : editedVi;
            const setEditedTexts = viewTab === "ko" ? setEditedKo : viewTab === "he" ? setEditedHe : setEditedVi;
            const isRtl = viewTab === "he";
            return (
              <div className="p-3 space-y-1 max-h-[600px] overflow-y-auto">
                {content && (
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-parchment/40 text-xs">{scenes.length}개 씬</span>
                    <DownloadButton href={`/api/v1/contents/${content.id}/download`} label=".srt 다운로드" />
                  </div>
                )}
                {scenes.map((scene, i) => (
                  <div
                    key={scene.num}
                    className="flex gap-2 py-2 border-b border-gold/10 last:border-0"
                    dir={isRtl ? "rtl" : "ltr"}
                  >
                    <span className="flex-shrink-0 text-gold/60 font-mono text-xs w-5 text-right mt-0.5">{scene.num}</span>
                    <div className="flex-1 min-w-0">
                      {editMode ? (
                        <textarea
                          rows={viewTab === "ko" ? 3 : 2}
                          dir={isRtl ? "rtl" : "ltr"}
                          className={`w-full bg-ink border ${isRtl ? "border-amber-400/30 focus:border-amber-400/60 text-amber-200/90 font-mono" : "border-gold/30 focus:border-gold/60 text-parchment/90"} rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none leading-relaxed`}
                          value={editedTexts[i] ?? scene.text}
                          onChange={(e) => {
                            const next = [...editedTexts];
                            next[i] = e.target.value;
                            setEditedTexts(next);
                          }}
                        />
                      ) : (
                        <div>
                          {viewTab === "ko" ? (
                            // Korean subtitles with smaller font
                            scene.text.includes('\n') ? (
                              scene.text.split('\n').map((line, idx) => (
                                <p key={idx} className={`break-words ${line.startsWith('[') ? 'text-amber-300/70 italic text-xs mt-1' : 'text-xs text-parchment/85'}`}>
                                  {line}
                                </p>
                              ))
                            ) : (
                              <p className="text-xs text-parchment/85 break-words">
                                {scene.text}
                              </p>
                            )
                          ) : (
                            <p className={`text-sm ${isRtl ? "text-amber-200/90" : "text-parchment/85"} break-words`}>
                              {scene.text}
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-parchment/25 text-xs font-mono mt-0.5">{scene.time}</p>
                    </div>
                  </div>
                ))}
                {scenes.length === 0 && (
                  <p className="text-parchment/30 text-sm italic text-center py-4">미생성</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
