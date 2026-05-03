import { Request, Response, NextFunction } from "express";
import { generateYouTubeAnalysis } from "../services/youtube.service";

interface YouTubeSkillRequest {
  skillId: string;
  query: string;
  channelContext: {
    niche: string;
    size: "new" | "growing" | "established" | "authority";
    goal: "growth" | "monetization" | "authority" | "engagement";
    url?: string;
  };
}

export async function processYouTubeSkill(req: Request, res: Response, next: NextFunction) {
  try {
    const { skillId, query, channelContext }: YouTubeSkillRequest = req.body;

    if (!skillId || !query || !channelContext) {
      return res.status(400).json({ 
        error: "skillId, query, channelContext가 필요합니다" 
      });
    }

    const analysis = await generateYouTubeAnalysis(skillId, query, channelContext);

    res.json({
      message: "YouTube 스킬 분석 완료",
      skillId,
      analysis
    });

  } catch (error) {
    console.error("[YouTube] 스킬 처리 오류:", error);
    next(error);
  }
}

export async function getYouTubeSkills(req: Request, res: Response, next: NextFunction) {
  try {
    const skills = [
      {
        id: "audit",
        name: "채널 감사",
        description: "채널 성장 문제 진단 및 개선사항 분석",
        category: "analysis"
      },
      {
        id: "seo", 
        name: "비디오 SEO",
        description: "키워드 최적화 및 검색 순위 개선",
        category: "optimization"
      },
      {
        id: "script",
        name: "스크립트 작성",
        description: "시청자 리텐션 최적화 스크립트 생성",
        category: "content"
      },
      {
        id: "hook",
        name: "후킹 작성",
        description: "첫 30초 인트로 및 오프닝 개선",
        category: "content"
      },
      {
        id: "thumbnail",
        name: "썸네일 최적화",
        description: "CTR 개선을 위한 썸네일 브리프",
        category: "content"
      },
      {
        id: "strategy",
        name: "채널 전략",
        description: "채널 포지셔닝 및 니치 전략 수립",
        category: "strategy"
      },
      {
        id: "calendar",
        name: "콘텐츠 캘린더",
        description: "업로드 스케줄 및 월간 콘텐츠 계획",
        category: "strategy"
      },
      {
        id: "shorts",
        name: "쇼츠 최적화",
        description: "YouTube Shorts 전략 및 최적화",
        category: "optimization"
      },
      {
        id: "analyze",
        name: "분석 해석",
        description: "YouTube 애널리틱스 메트릭 해석",
        category: "analysis"
      },
      {
        id: "repurpose",
        name: "콘텐츠 재활용",
        description: "크로스플랫폼 콘텐츠 변환 및 클립 추출",
        category: "strategy"
      },
      {
        id: "monetize",
        name: "수익화 계획",
        description: "브랜드 딜, 멤버십 등 수익화 전략",
        category: "strategy"
      },
      {
        id: "competitor",
        name: "경쟁자 분석",
        description: "경쟁 채널 분석 및 차별화 전략",
        category: "analysis"
      },
      {
        id: "metadata",
        name: "업로드 메타데이터",
        description: "제목, 설명, 태그 최적화 패키지",
        category: "optimization"
      },
      {
        id: "ideate",
        name: "아이디어 생성",
        description: "데이터 기반 비디오 아이디어 브레인스토밍",
        category: "content"
      }
    ];

    res.json({ skills });

  } catch (error) {
    console.error("[YouTube] 스킬 목록 조회 오류:", error);
    next(error);
  }
}