import { Link, useLocation } from "react-router-dom";
import { BookOpen, FolderOpen, LayoutDashboard, Film } from "lucide-react";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "대시보드" },
  { to: "/projects", icon: FolderOpen, label: "프로젝트" },
  { to: "/bible", icon: BookOpen, label: "성경 목록" },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="w-56 min-h-screen bg-ink flex flex-col border-r border-gold/20">
      <div className="p-5 border-b border-gold/20">
        <div className="flex items-center gap-2">
          <Film className="text-gold" size={22} />
          <div>
            <span className="font-display text-gold text-sm leading-tight">
              Hebrew Bible<br />Animation Studio
            </span>
            <p className="text-parchment/40 font-body mt-0.5" style={{ fontSize: "0.65rem" }}>
              by David HS Kim
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              pathname === to
                ? "bg-gold/20 text-gold"
                : "text-parchment/70 hover:bg-gold/10 hover:text-parchment"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gold/20 text-xs text-parchment/30 font-body">
        v2.0 · Gemini + Veo 3.1
      </div>
    </aside>
  );
}
