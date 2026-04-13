import { api } from "./client";

export interface RemotionProps {
  koreanText: string;
  hebrewText: string;
  videoFileName?: string;
  audioFileName?: string;
  episodeId?: string;
}

export interface RenderStatus {
  status: "idle" | "rendering" | "done" | "error";
  error: string | null;
  fileReady: boolean;
}

export const remotionApi = {
  getProps: () => api.get<RemotionProps>("/remotion/props").then((r) => r.data),

  sendProps: (props: RemotionProps) =>
    api.post<{ success: boolean }>("/remotion/props", props).then((r) => r.data),

  render: () =>
    api.post<{ accepted: boolean }>("/remotion/render").then((r) => r.data),

  getRenderStatus: () =>
    api.get<RenderStatus>("/remotion/render/status").then((r) => r.data),

  // 브라우저에서 직접 Remotion 컨테이너에서 다운로드 (포트 3003)
  downloadUrl: () => "http://localhost:3003/download",
};
