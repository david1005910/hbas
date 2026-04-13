import { Link, useLocation } from "react-router-dom";
import { BookOpen, FolderOpen, LayoutDashboard, Video } from "lucide-react";

function MenorahIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 중앙 기둥 */}
      <line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      {/* 받침대 */}
      <line x1="9" y1="20" x2="15" y2="20" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8" y1="22" x2="16" y2="22" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {/* 좌측 2개 가지 */}
      <path d="M12 10 Q7 10 7 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M12 12 Q4 12 4 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* 우측 2개 가지 */}
      <path d="M12 10 Q17 10 17 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M12 12 Q20 12 20 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* 불꽃 7개 */}
      <circle cx="12" cy="3.5" r="1" fill={color} />
      <circle cx="7"  cy="5"   r="1" fill={color} />
      <circle cx="17" cy="5"   r="1" fill={color} />
      <circle cx="4"  cy="5"   r="1" fill={color} />
      <circle cx="20" cy="5"   r="1" fill={color} />
    </svg>
  );
}

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "대시보드" },
  { to: "/projects", icon: FolderOpen, label: "프로젝트" },
  { to: "/bible", icon: BookOpen, label: "성경 목록" },
  { to: "/video-studio", icon: Video, label: "비디오 스튜디오" },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="w-56 min-h-screen bg-ink flex flex-col border-r border-gold/20">
      <div className="p-5 border-b border-gold/20">
        <div className="flex items-center gap-2">
          <MenorahIcon size={26} color="#d4a017" />
          <div>
            <span className="font-display text-gold text-sm leading-tight">
              Hebrew Bible<br />Animation Studio
            </span>
            <p className="text-parchment/50 font-body mt-1" style={{ fontSize: "0.78rem", letterSpacing: "0.02em" }}>
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
