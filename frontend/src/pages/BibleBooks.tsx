import { useQuery } from "@tanstack/react-query";
import { PageWrapper } from "../components/layout/PageWrapper";
import { HebrewText } from "../components/ui/HebrewText";
import { episodesApi } from "../api/episodes";

export function BibleBooks() {
  const { data: books = [], isLoading } = useQuery({
    queryKey: ["bibleBooks"],
    queryFn: episodesApi.listBooks,
  });

  return (
    <PageWrapper title="구약 성경 목록" subtitle="히브리어 마소라 본문 (BHS) 기준 39권">
      {isLoading ? (
        <p className="text-parchment/50 font-body">로딩 중...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {books.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between border border-gold/20 rounded-lg px-4 py-3 bg-ink-light"
            >
              <div>
                <p className="text-parchment font-body font-semibold text-sm">{b.nameKo}</p>
                <p className="text-parchment/50 text-xs font-body">{b.nameEn} · {b.totalChapters}장</p>
              </div>
              <HebrewText className="text-gold/80 text-sm">{b.nameHe}</HebrewText>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
