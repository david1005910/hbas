import { api } from "./client";

export interface BgmInfo {
  bgmUrl: string | null;
  isCustom: boolean;
  defaultBgmExists: boolean;
  activeFileExists: boolean;
  activeFileSizeKb: number | null;
}

export const bgmApi = {
  info: (episodeId: string) =>
    api.get<BgmInfo>(`/episodes/${episodeId}/bgm`).then((r) => r.data),

  upload: (episodeId: string, file: File) => {
    const form = new FormData();
    form.append("bgm", file);
    return api.post<{ message: string; bgmUrl: string; filename: string; sizeKb: number }>(
      `/episodes/${episodeId}/bgm`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data);
  },

  delete: (episodeId: string) =>
    api.delete(`/episodes/${episodeId}/bgm`).then((r) => r.data),
};
