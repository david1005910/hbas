import { api } from "./client";
import type { Project, Episode } from "../types";

export const projectsApi = {
  list: () => api.get<Project[]>("/projects").then((r) => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post<Project>("/projects", data).then((r) => r.data),
  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  listEpisodes: (id: string) =>
    api.get<Episode[]>(`/projects/${id}/episodes`).then((r) => r.data),
};
