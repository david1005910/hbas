import { create } from "zustand";
import type { Project, Episode } from "../types";

interface AppState {
  currentProject: Project | null;
  currentEpisode: Episode | null;
  setCurrentProject: (p: Project | null) => void;
  setCurrentEpisode: (e: Episode | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProject: null,
  currentEpisode: null,
  setCurrentProject: (p) => set({ currentProject: p }),
  setCurrentEpisode: (e) => set({ currentEpisode: e }),
}));
