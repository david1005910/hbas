import { Search, Users, Video, BarChart3, Lightbulb, DollarSign, Target, Calendar, Zap, Eye, Repeat, TrendingUp, Upload, Wrench } from "lucide-react";
import { YouTubeSkill } from "../../pages/YouTubeStudio";

interface Props {
  skills: YouTubeSkill[];
  onSkillSelect: (skill: YouTubeSkill) => void;
}

const SKILL_ICONS: Record<string, any> = {
  audit: Wrench,
  seo: Search,
  script: Video,
  hook: Zap,
  thumbnail: Eye,
  strategy: Target,
  calendar: Calendar,
  shorts: TrendingUp,
  analyze: BarChart3,
  repurpose: Repeat,
  monetize: DollarSign,
  competitor: Users,
  metadata: Upload,
  ideate: Lightbulb
};

const SKILL_COLORS: Record<string, string> = {
  audit: "border-red-500/30 bg-red-500/5 hover:border-red-500/50",
  seo: "border-green-500/30 bg-green-500/5 hover:border-green-500/50", 
  script: "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50",
  hook: "border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50",
  thumbnail: "border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50",
  strategy: "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50",
  calendar: "border-pink-500/30 bg-pink-500/5 hover:border-pink-500/50",
  shorts: "border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/50",
  analyze: "border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/50",
  repurpose: "border-teal-500/30 bg-teal-500/5 hover:border-teal-500/50",
  monetize: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50",
  competitor: "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50",
  metadata: "border-lime-500/30 bg-lime-500/5 hover:border-lime-500/50",
  ideate: "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50"
};

const SKILL_CATEGORIES = [
  {
    title: "분석 & 진단",
    skills: ["audit", "analyze", "competitor"]
  },
  {
    title: "콘텐츠 제작",
    skills: ["script", "hook", "thumbnail", "ideate"]
  },
  {
    title: "최적화 & SEO",
    skills: ["seo", "metadata", "shorts"]
  },
  {
    title: "전략 & 계획",
    skills: ["strategy", "calendar", "monetize", "repurpose"]
  }
];

export function YouTubeSkillSelector({ skills, onSkillSelect }: Props) {
  const getSkillById = (id: string) => skills.find(skill => skill.id === id);

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-red-600 rounded-full flex items-center justify-center">
          <Video className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-body font-bold text-parchment mb-2">
            YouTube 전문가 도구
          </h2>
          <p className="text-parchment/60 font-body max-w-2xl mx-auto">
            채널 감사부터 수익화까지, 14개 전문 스킬로 YouTube 채널을 다음 단계로 성장시키세요
          </p>
        </div>
      </div>

      {/* 스킬 카테고리별 그리드 */}
      {SKILL_CATEGORIES.map((category) => (
        <div key={category.title} className="space-y-4">
          <h3 className="text-lg font-body font-semibold text-gold flex items-center gap-2">
            <div className="w-2 h-2 bg-gold rounded-full"></div>
            {category.title}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {category.skills.map((skillId) => {
              const skill = getSkillById(skillId);
              if (!skill) return null;
              
              const IconComponent = SKILL_ICONS[skill.id];
              const colorClass = SKILL_COLORS[skill.id];
              
              return (
                <button
                  key={skill.id}
                  onClick={() => onSkillSelect(skill)}
                  className={`border-2 rounded-xl p-6 text-left transition-all duration-200 hover:scale-[1.02] ${colorClass}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-ink-dark">
                      <IconComponent size={20} className="text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-body font-semibold text-parchment mb-1">
                        {skill.name}
                      </h4>
                      <p className="text-sm text-parchment/60 font-body leading-relaxed">
                        {skill.description}
                      </p>
                      <div className="mt-3">
                        <code className="text-xs bg-ink-dark px-2 py-1 rounded text-gold/80 font-mono">
                          {skill.command}
                        </code>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* 통합 도움말 */}
      <div className="border border-gold/20 rounded-xl p-6 bg-gold/5">
        <h3 className="text-lg font-body font-semibold text-gold mb-3">
          💡 효과적인 사용법
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-body text-parchment/70">
          <div>
            <strong className="text-parchment">새 채널이라면:</strong>
            <br />감사 → 전략 → 스크립트 → 썸네일 순으로 시작
          </div>
          <div>
            <strong className="text-parchment">기존 채널이라면:</strong>
            <br />분석 → 경쟁자 → SEO → 수익화 순으로 최적화
          </div>
          <div>
            <strong className="text-parchment">콘텐츠 제작 시:</strong>
            <br />아이디어 → 스크립트 → 후킹 → 썸네일 → 메타데이터
          </div>
          <div>
            <strong className="text-parchment">성장 정체 시:</strong>
            <br />감사 → 경쟁자 분석 → 전략 재수립 → 쇼츠 도입
          </div>
        </div>
      </div>
    </div>
  );
}