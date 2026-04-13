import { api } from "./client";

export interface VerseSearchResult {
  id: string;
  bookId: number;
  bookNameKo: string;
  bookNameHe: string;
  chapter: number;
  verse: number;
  koreanText: string;
  hebrewText: string;
  similarity: number;
}

export interface IngestStatus {
  total: number;
  embedded: number;
}

export const ragApi = {
  search: (q: string, limit = 10, bookId?: number) =>
    api
      .get<VerseSearchResult[]>("/rag/search", { params: { q, limit, bookId } })
      .then((r) => r.data),

  status: () => api.get<IngestStatus>("/rag/status").then((r) => r.data),

  ingestFile: (filename?: string) =>
    api
      .post<{ success: boolean; ingested: number; files: string[] }>(
        "/rag/ingest-file",
        { filename }
      )
      .then((r) => r.data),
};
