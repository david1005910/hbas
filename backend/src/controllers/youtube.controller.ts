import { Request, Response, NextFunction } from "express";
import { 
  generateYouTubeAnalysis,
  generateYouTubeContentIdeas,
  generateYouTubeLongFormScript,
  analyzeYouTubeTopicTrends
} from "../services/youtube.service";
import { generateStream } from "../services/gemini.service";

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

interface YouTubeProjectRequest {
  projectContext: {
    title: string;
    description: string;
    niche: string;
    targetAudience: string;
    contentType: "educational" | "entertainment" | "tutorial" | "review" | "vlog";
  };
  topic: string;
  duration?: number;
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

// YouTube 프로젝트 관련 컨트롤러들
export async function generateContentIdeas(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectContext, topic }: YouTubeProjectRequest = req.body;

    if (!projectContext || !topic) {
      return res.status(400).json({ 
        error: "projectContext와 topic이 필요합니다" 
      });
    }

    const ideas = await generateYouTubeContentIdeas(projectContext, topic);

    res.json({
      message: "YouTube 콘텐츠 아이디어 생성 완료",
      topic,
      ideas
    });

  } catch (error) {
    console.error("[YouTube Project] 콘텐츠 아이디어 생성 오류:", error);
    next(error);
  }
}

export async function generateLongFormScript(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectContext, topic, duration = 15 }: YouTubeProjectRequest = req.body;

    if (!projectContext || !topic) {
      return res.status(400).json({ 
        error: "projectContext와 topic이 필요합니다" 
      });
    }

    const script = await generateYouTubeLongFormScript(projectContext, topic, duration);

    res.json({
      message: "YouTube 롱폼 스크립트 생성 완료",
      topic,
      duration,
      script
    });

  } catch (error) {
    console.error("[YouTube Project] 롱폼 스크립트 생성 오류:", error);
    next(error);
  }
}

export async function analyzeTopicTrends(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectContext, topic }: YouTubeProjectRequest = req.body;

    if (!projectContext || !topic) {
      return res.status(400).json({ 
        error: "projectContext와 topic이 필요합니다" 
      });
    }

    const analysis = await analyzeYouTubeTopicTrends(projectContext, topic);

    res.json({
      message: "YouTube 주제 트렌드 분석 완료",
      topic,
      analysis
    });

  } catch (error) {
    console.error("[YouTube Project] 트렌드 분석 오류:", error);
    next(error);
  }
}

// SSE 스트리밍 엔드포인트들
export async function generateContentIdeasStream(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectContext, topic }: YouTubeProjectRequest = req.body;

    if (!projectContext || !topic) {
      return res.status(400).json({ 
        error: "projectContext와 topic이 필요합니다" 
      });
    }

    // SSE 헤더 설정
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const prompt = `
YouTube 콘텐츠 기획 전문가로서 다음 프로젝트에 대한 아이디어를 제안해주세요.

프로젝트 정보:
- 제목: ${projectContext.title}
- 설명: ${projectContext.description || ""}
- 분야: ${projectContext.niche}
- 타겟: ${projectContext.targetAudience}
- 유형: ${projectContext.contentType}

요청 주제: "${topic}"

다음 형식으로 종합적인 콘텐츠 기획을 제안해주세요:

## 🎯 주제 분석 및 트렌드 연구

### 📊 시장 분석
- "${topic}" 관련 현재 트렌드 및 관심도
- ${projectContext.niche} 분야에서의 검색량 및 경쟁도
- 타겟 오디언스(${projectContext.targetAudience})의 관심사 연관성

### 🔍 키워드 리서치
- 메인 키워드: "${topic}" 관련 핵심 키워드 5개
- 롱테일 키워드: 검색 의도 기반 키워드 8개
- SEO 최적화 키워드: 경쟁도 낮은 기회 키워드 5개

## 🎬 영상 콘텐츠 제안

### 📝 메인 영상 (15-20분 롱폼)
**제목**: [클릭률 높은 제목 3가지 옵션]
**썸네일 컨셉**: [시각적 임팩트가 큰 썸네일 아이디어]
**핵심 가치**: [시청자가 얻을 수 있는 구체적 혜택]

실무적이고 구체적인 조언으로 도움을 드리겠습니다!
`;

    console.log(`[YouTube Project] 콘텐츠 아이디어 스트리밍 시작: ${topic}`);
    
    await generateStream(prompt, res);

  } catch (error) {
    console.error("[YouTube Project] 콘텐츠 아이디어 스트리밍 오류:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "스트리밍 중 오류 발생" });
    }
  }
}

export async function generateLongFormScriptStream(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectContext, topic, duration = 15 }: YouTubeProjectRequest = req.body;

    if (!projectContext || !topic) {
      return res.status(400).json({ 
        error: "projectContext와 topic이 필요합니다" 
      });
    }

    // SSE 헤더 설정
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const prompt = `
YouTube 롱폼 스크립트 전문 작가로서 다음 프로젝트의 영상 대본을 작성해주세요.

프로젝트 정보:
- 제목: ${projectContext.title}
- 분야: ${projectContext.niche}
- 타겟: ${projectContext.targetAudience}
- 유형: ${projectContext.contentType}
- 영상 길이: 약 ${duration}분

영상 주제: "${topic}"

${duration}분 길이의 YouTube 영상 스크립트를 작성해주세요. 인트로, 본론, 결론 구조로 작성하고, 각 섹션에 타임스탬프를 포함해주세요.
`;

    console.log(`[YouTube Project] 스크립트 스트리밍 시작: ${topic} (${duration}분)`);
    
    await generateStream(prompt, res);

  } catch (error) {
    console.error("[YouTube Project] 스크립트 스트리밍 오류:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "스트리밍 중 오류 발생" });
    }
  }
}

export async function analyzeTopicTrendsStream(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectContext, topic }: YouTubeProjectRequest = req.body;

    if (!projectContext || !topic) {
      return res.status(400).json({ 
        error: "projectContext와 topic이 필요합니다" 
      });
    }

    // SSE 헤더 설정
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const prompt = `
YouTube 트렌드 분석 전문가로서 다음 주제의 트렌드를 분석해주세요.

프로젝트 정보:
- 분야: ${projectContext.niche}
- 타겟: ${projectContext.targetAudience}
- 콘텐츠 유형: ${projectContext.contentType}

분석 주제: "${topic}"

다음을 포함한 상세한 트렌드 분석을 제공해주세요:

## 📈 트렌드 분석

### 🔥 현재 트렌드 상태
- 관심도 지수 (1-10)
- 검색량 추이
- 경쟁도 분석
- 시장 기회

### 🎯 추천 콘텐츠 방향
- 높은 성과 예상 앵글 3가지
- 피해야 할 접근법
- 최적 업로드 타이밍

실무적인 인사이트를 제공하겠습니다!
`;

    console.log(`[YouTube Project] 트렌드 분석 스트리밍 시작: ${topic}`);
    
    await generateStream(prompt, res);

  } catch (error) {
    console.error("[YouTube Project] 트렌드 분석 스트리밍 오류:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "스트리밍 중 오류 발생" });
    }
  }
}