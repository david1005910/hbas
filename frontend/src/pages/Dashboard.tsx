import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, FolderOpen } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { projectsApi } from "../api/projects";

export function Dashboard() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });

  return (
    <PageWrapper
      title="Hebrew Bible Animation Studio"
      subtitle="구약 성경 이중 언어 3D 애니메이션 제작 파이프라인"
      action={
        <Link
          to="/projects/new"
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <Plus size={14} />
          새 프로젝트
        </Link>
      }
    >
      {isLoading ? (
        <div className="text-parchment/50 font-body">로딩 중...</div>
      ) : projects.length === 0 ? (
        <div className="border border-gold/20 rounded-xl p-12 text-center">
          <FolderOpen className="mx-auto mb-3 text-parchment/20" size={40} />
          <p className="text-parchment/50 font-body">프로젝트가 없습니다. 새 프로젝트를 만들어 시작하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="border border-gold/20 hover:border-gold/50 rounded-xl p-4 bg-ink-light transition-colors group"
            >
              <h3 className="font-body text-parchment font-semibold group-hover:text-gold transition-colors mb-1">
                {p.name}
              </h3>
              {p.description && (
                <p className="text-parchment/50 text-sm font-body line-clamp-2">{p.description}</p>
              )}
              <p className="text-parchment/30 text-xs font-body mt-3">
                에피소드 {p._count?.episodes ?? 0}개
              </p>
            </Link>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
