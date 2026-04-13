import { api } from "./client";

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
}

export const remotionApi = {
  getProps: () => api.get<RemotionProps>("/remotion/props").then((r) => r.data),
  sendProps: (props: RemotionProps) =>
    api.post<{ success: boolean }>("/remotion/props", props).then((r) => r.data),
  render: () =>
    api.post<{ success: boolean; file: string }>("/remotion/render").then((r) => r.data),
  downloadUrl: () => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
    return `${base}/api/v1/remotion/download`;
  },
};
