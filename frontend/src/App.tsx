import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { EpisodeDetail } from "./pages/EpisodeDetail";
import { BibleBooks } from "./pages/BibleBooks";
import { VideoStudio } from "./pages/VideoStudio";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen bg-ink">
          <Sidebar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/new" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/episodes/:id" element={<EpisodeDetail />} />
            <Route path="/bible" element={<BibleBooks />} />
            <Route path="/video-studio" element={<VideoStudio />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
