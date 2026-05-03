import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, FolderOpen, Video, Youtube, ChevronDown } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { projectsApi } from "../api/projects";
import { useState, useRef, useEffect } from "react";

export function Dashboard() {
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <PageWrapper
      title="Hebrew Bible Animation Studio"
      subtitle="구약 성경 이중 언어 3D 애니메이션 제작 파이프라인"
      action={
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowProjectMenu(!showProjectMenu)}
            className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light text-ink text-sm font-body font-semibold rounded-lg transition-colors"
          >
            <Plus size={14} />
            새 프로젝트
            <ChevronDown size={14} />
          </button>
          
          {showProjectMenu && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-ink-light border border-gold/20 rounded-xl shadow-xl z-10">
              <div className="p-2">
                <Link
                  to="/projects/new"
                  className="flex items-center gap-3 p-3 hover:bg-gold/10 rounded-lg transition-colors group"
                  onClick={() => setShowProjectMenu(false)}
                >
                  <div className="p-2 rounded-lg bg-gold/20">
                    <Video size={16} className="text-gold" />
                  </div>
                  <div>
                    <h4 className="font-body font-semibold text-parchment group-hover:text-gold transition-colors text-sm">
                      성경 애니메이션
                    </h4>
                    <p className="text-xs text-parchment/60 font-body">
                      히브리어 성경 3D 애니메이션 제작
                    </p>
                  </div>
                </Link>
                
                <Link
                  to="/youtube/projects/new"
                  className="flex items-center gap-3 p-3 hover:bg-gold/10 rounded-lg transition-colors group"
                  onClick={() => setShowProjectMenu(false)}
                >
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <Youtube size={16} className="text-red-500" />
                  </div>
                  <div>
                    <h4 className="font-body font-semibold text-parchment group-hover:text-gold transition-colors text-sm">
                      YouTube 영상
                    </h4>
                    <p className="text-xs text-parchment/60 font-body">
                      롱폼 YouTube 영상 콘텐츠 제작
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          )}
        </div>
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
          {projects.map((p) => {
            const isYouTube = p.type === "youtube";
            const projectPath = isYouTube ? `/youtube/projects/${p.id}` : `/projects/${p.id}`;
            
            return (
              <Link
                key={p.id}
                to={projectPath}
                className="border border-gold/20 hover:border-gold/50 rounded-xl p-4 bg-ink-light transition-colors group relative"
              >
                {/* 프로젝트 타입 아이콘 */}
                <div className="absolute top-4 right-4">
                  {isYouTube ? (
                    <div className="p-2 rounded-lg bg-red-500/20">
                      <Youtube size={16} className="text-red-500" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-gold/20">
                      <Video size={16} className="text-gold" />
                    </div>
                  )}
                </div>
                
                <h3 className="font-body text-parchment font-semibold group-hover:text-gold transition-colors mb-1 pr-12">
                  {p.name}
                </h3>
                
                {p.description && (
                  <p className="text-parchment/50 text-sm font-body line-clamp-2 mb-2">
                    {p.description}
                  </p>
                )}
                
                {/* YouTube 프로젝트 추가 정보 */}
                {isYouTube && p.niche && (
                  <div className="text-xs text-parchment/40 font-body space-y-1">
                    <p>분야: {p.niche}</p>
                    {p.targetAudience && <p>타겟: {p.targetAudience}</p>}
                  </div>
                )}
                
                <p className="text-parchment/30 text-xs font-body mt-3">
                  {isYouTube ? (
                    <span className="flex items-center gap-1">
                      <Youtube size={12} /> YouTube 콘텐츠
                    </span>
                  ) : (
                    <span>에피소드 {p._count?.episodes ?? 0}개</span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}
