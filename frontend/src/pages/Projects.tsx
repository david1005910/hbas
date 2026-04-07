import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { projectsApi } from "../api/projects";

export function Projects() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });

  const createMut = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setShowForm(false); setNewName(""); setNewDesc(""); },
  });

  const deleteMut = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <PageWrapper
      title="프로젝트 목록"
      action={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <Plus size={14} />
          새 프로젝트
        </button>
      }
    >
      {showForm && (
        <div className="border border-gold/30 rounded-xl p-4 mb-6 bg-ink-light space-y-3">
          <h3 className="text-parchment font-body font-semibold">새 프로젝트</h3>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="프로젝트 이름"
            className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="설명 (선택)"
            className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
          />
          <button
            onClick={() => createMut.mutate({ name: newName, description: newDesc })}
            disabled={!newName || createMut.isPending}
            className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg"
          >
            생성
          </button>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="flex items-center justify-between border border-gold/20 rounded-xl px-4 py-3 bg-ink-light">
            <Link to={`/projects/${p.id}`} className="flex-1 hover:text-gold transition-colors">
              <p className="text-parchment font-body font-semibold">{p.name}</p>
              {p.description && <p className="text-parchment/50 text-sm font-body">{p.description}</p>}
            </Link>
            <button
              onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMut.mutate(p.id); }}
              className="p-2 text-parchment/30 hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}
