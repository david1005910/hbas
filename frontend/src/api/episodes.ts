import { api } from "./client";
import type { Episode, BibleBook } from "../types";

export const episodesApi = {
  create: (data: Partial<Episode>) =>
    api.post<Episode>("/episodes", data).then((r) => r.data),
  get: (id: string) => api.get<Episode>(`/episodes/${id}`).then((r) => r.data),
  update: (id: string, data: Partial<Episode>) =>
    api.put<Episode>(`/episodes/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/episodes/${id}`),
  listBooks: () => api.get<BibleBook[]>("/bible/books").then((r) => r.data),
};
