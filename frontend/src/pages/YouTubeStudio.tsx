import { useState } from "react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { YouTubeSkillSelector } from "../components/youtube/YouTubeSkillSelector";
import { YouTubeChat } from "../components/youtube/YouTubeChat";

export interface YouTubeSkill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  command: string;
}

const YOUTUBE_SKILLS: YouTubeSkill[] = [
  {
    id: "audit",
    name: "채널 감사",
    description: "채널 성장 문제 진단 및 개선사항 분석",
    triggers: ["audit my channel", "channel health", "what's wrong with my channel", "my channel isn't growing"],
    command: "/youtube audit"
  },
  {
    id: "seo", 
    name: "비디오 SEO",
    description: "키워드 최적화 및 검색 순위 개선",
    triggers: ["video SEO", "rank higher", "keyword research", "improve search ranking"],
    command: "/youtube seo"
  },
  {
    id: "script",
    name: "스크립트 작성",
    description: "시청자 리텐션 최적화 스크립트 생성",
    triggers: ["write a script", "script for my video", "help me script"],
    command: "/youtube script"
  },
  {
    id: "hook",
    name: "후킹 작성",
    description: "첫 30초 인트로 및 오프닝 개선",
    triggers: ["write a hook", "improve my intro", "first 30 seconds", "opening"],
    command: "/youtube hook"
  },
  {
    id: "thumbnail",
    name: "썸네일 최적화",
    description: "CTR 개선을 위한 썸네일 브리프",
    triggers: ["thumbnail brief", "improve CTR", "design thumbnail"],
    command: "/youtube thumbnail"
  },
  {
    id: "strategy",
    name: "채널 전략",
    description: "채널 포지셔닝 및 니치 전략 수립",
    triggers: ["channel strategy", "content plan", "positioning", "niche"],
    command: "/youtube strategy"
  },
  {
    id: "calendar",
    name: "콘텐츠 캘린더",
    description: "업로드 스케줄 및 월간 콘텐츠 계획",
    triggers: ["content calendar", "upload schedule", "what should I post this month"],
    command: "/youtube calendar"
  },
  {
    id: "shorts",
    name: "쇼츠 최적화",
    description: "YouTube Shorts 전략 및 최적화",
    triggers: ["Shorts", "short video", "vertical video", "Shorts strategy"],
    command: "/youtube shorts"
  },
  {
    id: "analyze",
    name: "분석 해석",
    description: "YouTube 애널리틱스 메트릭 해석",
    triggers: ["analyze metrics", "why are views dropping", "interpret analytics"],
    command: "/youtube analyze"
  },
  {
    id: "repurpose",
    name: "콘텐츠 재활용",
    description: "크로스플랫폼 콘텐츠 변환 및 클립 추출",
    triggers: ["repurpose video", "turn into Shorts", "cross-platform", "extract clips"],
    command: "/youtube repurpose"
  },
  {
    id: "monetize",
    name: "수익화 계획",
    description: "브랜드 딜, 멤버십 등 수익화 전략",
    triggers: ["monetize", "make money", "revenue", "brand deals", "memberships"],
    command: "/youtube monetize"
  },
  {
    id: "competitor",
    name: "경쟁자 분석",
    description: "경쟁 채널 분석 및 차별화 전략",
    triggers: ["competitor analysis", "spy on channel", "what is [channel] doing"],
    command: "/youtube competitor"
  },
  {
    id: "metadata",
    name: "업로드 메타데이터",
    description: "제목, 설명, 태그 최적화 패키지",
    triggers: ["upload metadata", "title and description", "pre-publish checklist"],
    command: "/youtube metadata"
  },
  {
    id: "ideate",
    name: "아이디어 생성",
    description: "데이터 기반 비디오 아이디어 브레인스토밍",
    triggers: ["video ideas", "what should I make next", "brainstorm", "content ideas"],
    command: "/youtube ideate"
  }
];

export function YouTubeStudio() {
  const [selectedSkill, setSelectedSkill] = useState<YouTubeSkill | null>(null);
  const [chatStarted, setChatStarted] = useState(false);

  const handleSkillSelect = (skill: YouTubeSkill) => {
    setSelectedSkill(skill);
    setChatStarted(false);
  };

  const handleStartChat = () => {
    setChatStarted(true);
  };

  const handleBackToSelection = () => {
    setSelectedSkill(null);
    setChatStarted(false);
  };

  return (
    <PageWrapper
      title="YouTube 크리에이터 스튜디오"
      subtitle="전문가급 YouTube 채널 성장 및 최적화 도구"
    >
      {!selectedSkill ? (
        <YouTubeSkillSelector
          skills={YOUTUBE_SKILLS}
          onSkillSelect={handleSkillSelect}
        />
      ) : !chatStarted ? (
        <div className="space-y-6">
          {/* 선택된 스킬 정보 */}
          <div className="border border-gold/20 rounded-xl p-6 bg-ink-light">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-body font-bold text-gold mb-2">
                  {selectedSkill.name}
                </h2>
                <p className="text-parchment/70 font-body">
                  {selectedSkill.description}
                </p>
              </div>
              <button
                onClick={handleBackToSelection}
                className="px-4 py-2 text-sm font-body text-parchment/60 hover:text-parchment transition-colors"
              >
                ← 뒤로가기
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-body font-semibold text-parchment mb-3">
                이런 때 사용하세요:
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedSkill.triggers.map((trigger, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-gold/10 text-gold text-sm font-body rounded-full border border-gold/30"
                  >
                    "{trigger}"
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleStartChat}
                className="flex-1 bg-gold hover:bg-gold-light text-ink font-body font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {selectedSkill.name} 시작하기
              </button>
              <div className="text-sm font-body text-parchment/50">
                명령어: <code className="bg-ink-dark px-2 py-1 rounded text-gold">
                  {selectedSkill.command}
                </code>
              </div>
            </div>
          </div>

          {/* 컨텍스트 수집 안내 */}
          <div className="border border-blue-500/20 rounded-xl p-6 bg-blue-500/5">
            <h3 className="text-lg font-body font-semibold text-blue-400 mb-3">
              📋 시작하기 전에 준비해주세요
            </h3>
            <div className="space-y-3 text-sm font-body text-parchment/70">
              <div>
                <strong className="text-parchment">1. 채널 니치/주제:</strong> 구체적으로 어떤 채널인지 알려주세요 
                <br />
                <span className="text-xs text-parchment/50">
                  예: "히브리어 성경 3D 애니메이션" (단순히 "종교" X)
                </span>
              </div>
              <div>
                <strong className="text-parchment">2. 채널 크기:</strong>
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• 신규: 1천 구독자 미만</li>
                  <li>• 성장: 1천~1만 구독자</li>
                  <li>• 안정: 1만~10만 구독자</li>
                  <li>• 권위: 10만 구독자 이상</li>
                </ul>
              </div>
              <div>
                <strong className="text-parchment">3. 주요 목표:</strong> 성장 / 수익화 / 브랜드 권위 / 오디언스 참여 중 하나
              </div>
            </div>
          </div>
        </div>
      ) : (
        <YouTubeChat
          selectedSkill={selectedSkill}
          onBackToSkills={handleBackToSelection}
        />
      )}
    </PageWrapper>
  );
}