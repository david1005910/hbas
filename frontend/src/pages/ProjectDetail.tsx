import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { EpisodeCard } from "../components/episode/EpisodeCard";
import { EpisodeForm } from "../components/episode/EpisodeForm";
import { projectsApi } from "../api/projects";
import { episodesApi } from "../api/episodes";

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.get(id!),
  });

  const { data: episodes = [] } = useQuery({
    queryKey: ["episodes", id],
    queryFn: () => projectsApi.listEpisodes(id!),
  });

  const createEpisodeMut = useMutation({
    mutationFn: episodesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["episodes", id] }); setShowForm(false); },
  });

  if (!project) return null;

  return (
    <PageWrapper
      title={project.name}
      subtitle={project.description}
      action={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <Plus size={14} />
          새 에피소드
        </button>
      }
    >
      {showForm && (
        <div className="border border-gold/30 rounded-xl p-5 mb-6 bg-ink-light">
          <h3 className="text-parchment font-body font-semibold mb-4">새 에피소드</h3>
          <EpisodeForm
            projectId={id!}
            onSubmit={(data) => createEpisodeMut.mutate(data)}
            isLoading={createEpisodeMut.isPending}
          />
        </div>
      )}

      {episodes.length === 0 ? (
        <p className="text-parchment/40 font-body text-sm">에피소드가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {episodes.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
        </div>
      )}
    </PageWrapper>
  );
}
