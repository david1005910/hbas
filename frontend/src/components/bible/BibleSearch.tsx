import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Database, Loader2, BookOpen } from "lucide-react";
import { ragApi, VerseSearchResult } from "../../api/rag";
import { HebrewText } from "../ui/HebrewText";

export function BibleSearch() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  // 임베딩 현황
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["ragStatus"],
    queryFn: ragApi.status,
    retry: false,
  });

  // 검색
  const { data: results, isFetching } = useQuery({
    queryKey: ["ragSearch", submitted],
    queryFn: () => ragApi.search(submitted, 12),
    enabled: submitted.trim().length > 0,
  });

  // 샘플 데이터 임포트 (창세기)
  const ingestMutation = useMutation({
    mutationFn: () => ragApi.ingestFile("genesis.json"),
    onSuccess: () => refetchStatus(),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) setSubmitted(query.trim());
  }

  const hasData = (status?.embedded ?? 0) > 0;

  return (
    <div className="mb-6 space-y-4">
      {/* 검색바 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment/40"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="한국어 또는 히브리어로 성경 구절 검색… (예: 빛이 있으라, בְּרֵאשִׁית)"
            className="w-full bg-parchment/5 border border-gold/20 rounded-xl pl-9 pr-4 py-2.5 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/50"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || !hasData}
          className="px-5 py-2.5 bg-gold/20 hover:bg-gold/30 disabled:opacity-40 disabled:cursor-not-allowed text-gold border border-gold/30 rounded-xl text-sm font-body transition-colors"
        >
          검색
        </button>
      </form>

      {/* 상태 바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-parchment/40 font-body">
          <Database size={12} />
          {status
            ? `벡터 DB: ${status.embedded.toLocaleString()} / ${status.total.toLocaleString()} 구절 임베딩됨`
            : "벡터 DB 상태 확인 중…"}
        </div>

        {!hasData && (
          <button
            onClick={() => ingestMutation.mutate()}
            disabled={ingestMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-body transition-colors disabled:opacity-50"
          >
            {ingestMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Database size={12} />
            )}
            {ingestMutation.isPending ? "임포트 중…" : "창세기 샘플 데이터 임포트"}
          </button>
        )}

        {ingestMutation.isSuccess && (
          <span className="text-xs text-emerald-400">
            ✓ {ingestMutation.data?.ingested}구절 임포트 완료
          </span>
        )}
        {ingestMutation.isError && (
          <span className="text-xs text-red-400">
            {(ingestMutation.error as Error).message}
          </span>
        )}
      </div>

      {/* 검색 결과 */}
      {submitted && (
        <div className="space-y-2">
          <p className="text-xs text-parchment/40 font-body">
            {isFetching
              ? "검색 중…"
              : `"${submitted}" 검색 결과 ${results?.length ?? 0}건`}
          </p>

          {isFetching && (
            <div className="flex items-center gap-2 text-parchment/40 py-4">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm font-body">의미 기반 검색 중…</span>
            </div>
          )}

          {!isFetching && results && results.length === 0 && (
            <p className="text-sm text-parchment/40 font-body py-4">
              검색 결과가 없습니다. 임포트된 데이터를 확인하세요.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2">
            {results?.map((r) => (
              <VerseCard key={r.id} result={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VerseCard({ result }: { result: VerseSearchResult }) {
  const similarity = Math.round(result.similarity * 100);
  const similarityColor =
    similarity >= 80
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : similarity >= 60
      ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
      : "text-parchment/40 border-parchment/20 bg-parchment/5";

  return (
    <div className="border border-gold/15 rounded-xl p-4 bg-parchment/3 hover:bg-parchment/5 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        {/* 출처 */}
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-gold/60 flex-shrink-0 mt-0.5" />
          <span className="text-gold/80 text-xs font-body font-semibold">
            {result.bookNameKo} {result.chapter}:{result.verse}
          </span>
          <HebrewText className="text-gold/50 text-xs">{result.bookNameHe}</HebrewText>
        </div>
        {/* 유사도 */}
        <span
          className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-body ${similarityColor}`}
        >
          {similarity}%
        </span>
      </div>

      {/* 히브리어 */}
      <p
        dir="rtl"
        className="text-parchment/90 text-sm font-body mb-1.5 text-right leading-relaxed"
        style={{ fontFamily: "'Noto Serif Hebrew', serif" }}
      >
        {result.hebrewText}
      </p>

      {/* 한국어 */}
      <p className="text-parchment/70 text-sm font-body leading-relaxed">
        {result.koreanText}
      </p>
    </div>
  );
}
