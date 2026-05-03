import { useState } from "react";
import { Video, Youtube, Search, BarChart3, Lightbulb, ArrowLeft, PlayCircle, FileText, Users, Database, Zap, List, Subtitles, Captions, VideoIcon, MessageCircle, Scissors } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { YouTubeChat } from "../components/youtube/YouTubeChat";
import { YouTubeClipper } from "../components/youtube/YouTubeClipper";

export interface YouTubeSkill {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface ChannelInfo {
  niche: string;
  size: "new" | "growing" | "established" | "authority";
  goal: "growth" | "monetization" | "authority" | "engagement";
  url?: string;
}

const YOUTUBE_SKILLS: YouTubeSkill[] = [
  {
    id: "audit",
    name: "채널 감사",
    description: "채널 성장 문제 진단 및 개선사항 분석",
    icon: BarChart3
  },
  {
    id: "seo", 
    name: "비디오 SEO",
    description: "키워드 최적화 및 검색 순위 개선",
    icon: Search
  },
  {
    id: "thumbnail",
    name: "썸네일 최적화",
    description: "CTR 개선을 위한 썸네일 브리프",
    icon: Video
  },
  {
    id: "ideate",
    name: "아이디어 생성",
    description: "데이터 기반 비디오 아이디어 브레인스토밍",
    icon: Lightbulb
  },
  {
    id: "youtube-api",
    name: "YouTube API 도구",
    description: "Google API 할당량 없이 YouTube 데이터 접근",
    icon: Database
  },
  {
    id: "youtube-search",
    name: "YouTube 검색",
    description: "주제별 비디오 및 채널 검색 및 발견",
    icon: Search
  },
  {
    id: "transcript",
    name: "비디오 대본 추출",
    description: "YouTube 비디오 대본 및 자막 추출",
    icon: FileText
  },
  {
    id: "youtube-channels",
    name: "채널 관리",
    description: "채널 업로드, 통계 및 콘텐츠 브라우징",
    icon: Users
  },
  {
    id: "youtube-data",
    name: "YouTube 데이터",
    description: "구조화된 YouTube 메타데이터 및 통계",
    icon: Database
  },
  {
    id: "yt",
    name: "빠른 YouTube 조회",
    description: "즉석 비디오 조회 및 요약",
    icon: Zap
  },
  {
    id: "youtube-playlist",
    name: "플레이리스트 관리",
    description: "YouTube 플레이리스트 콘텐츠 및 분석",
    icon: List
  },
  {
    id: "subtitles",
    name: "자막 관리",
    description: "비디오 자막 추출 및 편집",
    icon: Subtitles
  },
  {
    id: "captions",
    name: "캡션 도구",
    description: "자동 생성 캡션 및 접근성 도구",
    icon: Captions
  },
  {
    id: "video-transcript",
    name: "비디오 대본 전문",
    description: "상세 비디오 대본 분석 및 처리",
    icon: VideoIcon
  },
  {
    id: "youtube-clipper",
    name: "YouTube 클리퍼",
    description: "AI 기반 스마트 영상 클리핑 및 자막 처리",
    icon: Scissors
  }
];

type ViewMode = "skills" | "form" | "analysis" | "chat" | "clipper";

export function YouTubeStudioSimple() {
  const [selectedSkill, setSelectedSkill] = useState<YouTubeSkill | null>(null);
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("skills");

  return (
    <PageWrapper
      title="YouTube 크리에이터 스튜디오"
      subtitle="전문가급 YouTube 채널 성장 및 최적화 도구"
    >
      {viewMode === "skills" && (
        <SkillSelector 
          skills={YOUTUBE_SKILLS}
          onSkillSelect={(skill) => {
            setSelectedSkill(skill);
            // YouTube Clipper는 바로 전용 인터페이스로 이동
            if (skill.id === "youtube-clipper") {
              setViewMode("clipper");
            } else {
              setViewMode("form");
            }
          }}
        />
      )}
      
      {viewMode === "form" && selectedSkill && (
        <ChannelInfoForm 
          selectedSkill={selectedSkill}
          onSubmit={(info) => {
            setChannelInfo(info);
            setViewMode("analysis");
          }}
          onChat={(info) => {
            setChannelInfo(info);
            setViewMode("chat");
          }}
          onBack={() => {
            setSelectedSkill(null);
            setViewMode("skills");
          }}
        />
      )}
      
      {viewMode === "analysis" && selectedSkill && channelInfo && (
        <AnalysisResult 
          skill={selectedSkill}
          channelInfo={channelInfo}
          onBack={() => {
            setSelectedSkill(null);
            setChannelInfo(null);
            setViewMode("skills");
          }}
          onStartChat={() => setViewMode("chat")}
        />
      )}
      
      {viewMode === "chat" && selectedSkill && (
        <YouTubeChat 
          selectedSkill={selectedSkill}
          onBackToSkills={() => {
            setSelectedSkill(null);
            setChannelInfo(null);
            setViewMode("skills");
          }}
        />
      )}
      
      {viewMode === "clipper" && selectedSkill && (
        <YouTubeClipper 
          selectedSkill={selectedSkill}
          onBackToSkills={() => {
            setSelectedSkill(null);
            setViewMode("skills");
          }}
        />
      )}
    </PageWrapper>
  );
}

// 스킬 선택기 컴포넌트
interface SkillSelectorProps {
  skills: YouTubeSkill[];
  onSkillSelect: (skill: YouTubeSkill) => void;
}

function SkillSelector({ skills, onSkillSelect }: SkillSelectorProps) {
  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-red-600 rounded-full flex items-center justify-center">
          <Youtube className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-body font-bold text-parchment mb-2">
            YouTube 전문가 도구
          </h2>
          <p className="text-parchment/60 font-body max-w-2xl mx-auto">
            채널 감사부터 수익화까지, 전문 스킬로 YouTube 채널을 다음 단계로 성장시키세요
          </p>
        </div>
      </div>

      {/* 스킬 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => {
          const IconComponent = skill.icon;
          
          return (
            <button
              key={skill.id}
              onClick={() => onSkillSelect(skill)}
              className="border-2 border-gold/30 bg-gold/5 hover:border-gold/50 hover:bg-gold/10 rounded-xl p-4 text-left transition-all duration-200 hover:scale-[1.02]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-ink-dark">
                  <IconComponent size={20} className="text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-body font-semibold text-parchment mb-1 text-sm">
                    {skill.name}
                  </h4>
                  <p className="text-xs text-parchment/60 font-body leading-relaxed">
                    {skill.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 채널 정보 입력 폼 컴포넌트
interface ChannelInfoFormProps {
  selectedSkill: YouTubeSkill;
  onSubmit: (info: ChannelInfo) => void;
  onChat: (info: ChannelInfo) => void;
  onBack: () => void;
}

function ChannelInfoForm({ selectedSkill, onSubmit, onChat, onBack }: ChannelInfoFormProps) {
  const [niche, setNiche] = useState("");
  const [size, setSize] = useState<ChannelInfo["size"]>("new");
  const [goal, setGoal] = useState<ChannelInfo["goal"]>("growth");
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ niche, size, goal, url: url || undefined });
  };

  const handleChatStart = (e: React.FormEvent) => {
    e.preventDefault();
    onChat({ niche, size, goal, url: url || undefined });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="border border-gold/20 rounded-xl p-6 bg-ink-light">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gold/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-parchment/60" />
          </button>
          <div>
            <h3 className="font-body font-bold text-xl text-parchment">
              {selectedSkill.name} - 채널 정보 입력
            </h3>
            <p className="text-sm text-parchment/60 font-body">
              맞춤형 조언을 위해 채널 정보를 알려주세요
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              채널 니치/주제 *
            </label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="예: 히브리어 성경 3D 애니메이션"
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
              required
            />
            <p className="text-xs text-parchment/50 font-body mt-1">
              구체적으로 작성하세요 (단순히 "종교" X)
            </p>
          </div>

          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              채널 크기 *
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as ChannelInfo["size"])}
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
            >
              <option value="new">신규 (1천 구독자 미만)</option>
              <option value="growing">성장 (1천~1만 구독자)</option>
              <option value="established">안정 (1만~10만 구독자)</option>
              <option value="authority">권위 (10만 구독자 이상)</option>
            </select>
          </div>

          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              주요 목표 *
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as ChannelInfo["goal"])}
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
            >
              <option value="growth">구독자 성장</option>
              <option value="monetization">수익화</option>
              <option value="authority">브랜드 권위</option>
              <option value="engagement">오디언스 참여</option>
            </select>
          </div>

          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              채널 URL (선택사항)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@your-channel"
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="submit"
              className="bg-gold hover:bg-gold-light text-ink font-body font-semibold py-3 rounded-lg transition-colors"
            >
              일회성 분석
            </button>
            <button
              type="button"
              onClick={handleChatStart}
              className="bg-blue-600 hover:bg-blue-700 text-white font-body font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} />
              대화 시작
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 분석 결과 컴포넌트
interface AnalysisResultProps {
  skill: YouTubeSkill;
  channelInfo: ChannelInfo;
  onBack: () => void;
  onStartChat: () => void;
}

function AnalysisResult({ skill, channelInfo, onBack, onStartChat }: AnalysisResultProps) {
  const getSizeLabel = (size: string) => {
    switch (size) {
      case "new": return "신규 (1천 미만)";
      case "growing": return "성장 (1천~1만)";
      case "established": return "안정 (1만~10만)";
      case "authority": return "권위 (10만+)";
      default: return size;
    }
  };

  const getGoalLabel = (goal: string) => {
    switch (goal) {
      case "growth": return "구독자 성장";
      case "monetization": return "수익화";
      case "authority": return "브랜드 권위";
      case "engagement": return "오디언스 참여";
      default: return goal;
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="border border-gold/20 rounded-xl p-6 bg-ink-light">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gold/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-parchment/60" />
          </button>
          <div>
            <h3 className="font-body font-bold text-xl text-gold">
              {skill.name} 분석 결과
            </h3>
            <p className="text-sm text-parchment/60 font-body">
              {channelInfo.niche} • {getSizeLabel(channelInfo.size)}
            </p>
          </div>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
          <h4 className="text-green-400 font-body font-semibold mb-2">
            ✅ 분석 완료
          </h4>
          <p className="text-parchment/70 text-sm font-body">
            채널 정보를 바탕으로 {skill.name} 분석을 완료했습니다.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-parchment font-body font-semibold mb-2">채널 정보</h4>
            <div className="bg-ink-dark p-4 rounded-lg text-sm font-body">
              <p><strong>니치:</strong> {channelInfo.niche}</p>
              <p><strong>규모:</strong> {getSizeLabel(channelInfo.size)}</p>
              <p><strong>목표:</strong> {getGoalLabel(channelInfo.goal)}</p>
              {channelInfo.url && <p><strong>URL:</strong> {channelInfo.url}</p>}
            </div>
          </div>

          <div>
            <h4 className="text-parchment font-body font-semibold mb-2">맞춤 조언</h4>
            <div className="bg-ink-dark p-4 rounded-lg text-sm font-body text-parchment/70">
              <p className="mb-2">
                <strong>{channelInfo.niche}</strong> 니치에서 <strong>{getGoalLabel(channelInfo.goal)}</strong>를 목표로 하는 
                <strong> {getSizeLabel(channelInfo.size)}</strong> 채널을 위한 {skill.name} 전략:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>채널 특성에 맞는 맞춤형 전략 수립</li>
                <li>현재 규모에 적합한 실행 계획 제시</li>
                <li>목표 달성을 위한 구체적 액션 아이템</li>
                <li>경쟁 분석 및 차별화 포인트 도출</li>
              </ul>
              
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                <p className="text-blue-300 text-xs">
                  💡 <strong>다음 단계:</strong> 실제 AI 분석 기능이 곧 추가됩니다!
                </p>
              </div>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={onStartChat}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-body font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} />
              {skill.name} 전문가와 대화하기
            </button>
            <button
              onClick={onBack}
              className="px-6 py-3 border border-gold/30 hover:border-gold/50 text-parchment font-body font-semibold rounded-lg transition-colors"
            >
              다른 스킬 선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}