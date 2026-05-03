import { generateOnce } from "./gemini.service";

interface ChannelContext {
  niche: string;
  size: "new" | "growing" | "established" | "authority";
  goal: "growth" | "monetization" | "authority" | "engagement";
  url?: string;
}

interface YouTubeProjectContext {
  title: string;
  description: string;
  niche: string;
  targetAudience: string;
  contentType: "educational" | "entertainment" | "tutorial" | "review" | "vlog";
}

export async function generateYouTubeAnalysis(
  skillId: string,
  query: string,
  channelContext: ChannelContext
): Promise<string> {
  const prompt = buildYouTubeSkillPrompt(skillId, query, channelContext);
  
  console.log(`[YouTube] ${skillId} 스킬 분석 시작: ${channelContext.niche}`);
  
  const analysis = await generateOnce(prompt);
  
  console.log(`[YouTube] ${skillId} 스킬 분석 완료`);
  
  return analysis;
}

function buildYouTubeSkillPrompt(
  skillId: string, 
  query: string, 
  channelContext: ChannelContext
): string {
  const baseContext = `
채널 정보:
- 니치: ${channelContext.niche}
- 규모: ${getSizeDescription(channelContext.size)}
- 목표: ${getGoalDescription(channelContext.goal)}
${channelContext.url ? `- URL: ${channelContext.url}` : ""}

사용자 질문: "${query}"
`;

  const skillPrompts = {
    audit: `
YouTube 채널 감사 전문가로서 다음 채널을 분석해주세요.

${baseContext}

다음 형식으로 종합적인 채널 감사 보고서를 작성해주세요:

## 🔍 채널 감사 보고서

### 📊 현재 상태 분석
- 채널 헬스 스코어 (100점 만점)
- 주요 강점 3가지
- 개선 필요 영역 3가지

### 🎯 니치 적합성 평가
- 현재 포지셔닝의 명확성
- 타겟 오디언스 매칭도
- 경쟁 우위 요소

### 📈 성장 잠재력 분석
- ${getSizeDescription(channelContext.size)} 채널의 일반적 성장 패턴
- 예상 성장 시나리오 (6개월, 1년)
- 성장 제약 요인

### 🔧 즉시 실행 가능한 개선사항
1. 우선순위 1 (즉시 시행)
2. 우선순위 2 (1주일 내)
3. 우선순위 3 (1개월 내)

### 📋 다음 단계 권장사항
가장 중요한 다음 액션 3가지를 구체적으로 제시해주세요.
`,

    seo: `
YouTube SEO 전문가로서 다음 키워드와 채널을 분석해주세요.

${baseContext}

다음 형식으로 SEO 최적화 가이드를 작성해주세요:

## 🔍 YouTube SEO 최적화 가이드

### 🎯 키워드 분석
- 메인 키워드: "${query}"
- 관련 롱테일 키워드 5개
- 경쟁도 분석 (높음/중간/낮음)
- 검색 의도 분석

### 📝 제목 최적화
- 현재 키워드에 대한 최적화된 제목 3가지
- 클릭률(CTR) 향상 요소 포함
- ${channelContext.niche} 니치에 특화된 제목 공식

### 📖 설명 최적화 전략
- 첫 125자 내 핵심 키워드 배치
- 타임스탬프 활용법
- 관련 영상 연결 전략

### 🏷️ 태그 전략
- 핵심 태그 10개 (중요도 순)
- 니치 특화 태그
- 경쟁 회피 태그

### 📊 SEO 성과 측정
- 추적해야 할 지표
- 개선 주기 권장사항
`,

    script: `
YouTube 스크립트 작성 전문가로서 다음 주제에 대한 스크립트를 작성해주세요.

${baseContext}

다음 형식으로 리텐션 최적화 스크립트를 작성해주세요:

## 📜 리텐션 최적화 스크립트

### 🎣 후킹 (0-15초)
강력한 오프닝으로 시청자의 주의를 즉시 끌어주세요.

### 🎯 문제 제시 (15-45초)
시청자가 공감할 수 있는 문제나 궁금증을 제시해주세요.

### 📖 본문 구성 (45초-80%)
- 핵심 포인트 3-5가지
- 각 포인트별 스토리텔링 요소
- 시각적 자료 활용 지점 표시

### 🔄 패턴 인터럽트 (중간중간)
시청자 이탈을 방지하는 패턴 브레이크 지점 3곳

### 🎬 마무리 & CTA (마지막 20%)
- 핵심 내용 요약
- 명확한 Call-to-Action
- 다음 영상 티저

### 📊 예상 리텐션 그래프
각 구간별 예상 시청 유지율과 개선 포인트

${channelContext.niche} 니치와 ${getGoalDescription(channelContext.goal)} 목표에 최적화된 톤앤매너로 작성해주세요.
`,

    thumbnail: `
YouTube 썸네일 최적화 전문가로서 다음을 분석해주세요.

${baseContext}

다음 형식으로 썸네일 CTR 최적화 가이드를 작성해주세요:

## 🎨 썸네일 CTR 최적화 가이드

### 📊 니치별 CTR 벤치마크
- ${channelContext.niche} 니치 평균 CTR
- ${getSizeDescription(channelContext.size)} 채널 목표 CTR
- 상위 10% 채널 CTR 기준

### 🎯 "${query}" 최적화 썸네일 전략
- 핵심 메시지 전달 방법
- 텍스트 오버레이 전략
- 색상 팔레트 추천

### 👤 인물/캐릭터 활용법
- 얼굴 표정 및 감정 표현
- 시선 처리 및 포즈
- 의상/배경 조화

### 📝 텍스트 디자인 가이드
- 가독성 최적화
- 폰트 선택 및 크기
- 모바일 최적화 고려사항

### 🔄 A/B 테스트 변형안
3가지 다른 컨셉의 썸네일 변형안 제시

### 📱 플랫폼별 최적화
- YouTube 메인 피드용
- 모바일 환경 고려사항
- 검색 결과 페이지 최적화

현재 채널의 ${getGoalDescription(channelContext.goal)} 목표에 맞는 썸네일 전략을 제시해주세요.
`,

    strategy: `
YouTube 채널 전략 전문가로서 다음 채널의 전략을 수립해주세요.

${baseContext}

다음 형식으로 채널 성장 전략을 작성해주세요:

## 🎯 채널 성장 전략

### 🔍 니치 포지셔닝
- ${channelContext.niche}에서의 독특한 포지셔닝
- 경쟁 우위 요소 3가지
- 타겟 오디언스 페르소나

### 📈 성장 로드맵
- ${getSizeDescription(channelContext.size)}에서 다음 단계로의 성장 경로
- 6개월, 1년, 2년 마일스톤
- 단계별 핵심 지표

### 🎬 콘텐츠 전략
- 핵심 콘텐츠 카테고리 3-4가지
- Hero-Hub-Help 콘텐츠 비율
- 시즌제/시리즈 기획 아이디어

### 👥 오디언스 구축 전략
- 커뮤니티 참여 유도 방법
- 충성도 높은 구독자 확보 전략
- 크로스 플랫폼 활용 계획

### 💰 수익화 전략 (${getGoalDescription(channelContext.goal)} 중심)
- 단계별 수익화 방법
- 다각화된 수익원 개발
- 브랜딩 및 파트너십 기회

### 📊 성과 측정 및 개선
- 핵심 성과 지표 (KPI)
- 정기 검토 및 전략 수정 주기
`,

    "youtube-api": `
YouTube API 전문가로서 TranscriptAPI를 활용한 데이터 분석을 도와드리겠습니다.

${baseContext}

다음 형식으로 YouTube API 활용 가이드를 제공해주세요:

## 🛠️ YouTube API 데이터 활용 가이드

### 📊 채널 데이터 분석
- 최신 업로드 동영상 분석 (15개)
- 조회수 및 참여도 트렌드 분석
- 업로드 패턴 및 최적 타이밍

### 🔍 경쟁사 분석
- "${channelContext.niche}" 니치 상위 채널 분석
- 벤치마킹할 콘텐츠 유형
- 차별화 포인트 발굴

### 📈 성과 최적화
- 고성과 영상의 공통점 분석
- 개선이 필요한 영상 식별
- 태그 및 메타데이터 최적화

"${query}"에 대한 구체적인 API 활용 방안을 제시해주세요.
`,

    "youtube-search": `
YouTube 검색 최적화 전문가로서 다음을 분석해주세요.

${baseContext}

다음 형식으로 YouTube 검색 전략을 작성해주세요:

## 🔍 YouTube 검색 최적화 전략

### 🎯 키워드 발굴
- "${query}" 관련 핵심 키워드 10개
- ${channelContext.niche} 니치 특화 키워드
- 경쟁도 및 검색량 분석

### 📊 경쟁사 연구
- 상위 랭킹 채널 분석
- 콘텐츠 갭 발견
- 진입 가능한 키워드 영역

### 🎬 콘텐츠 아이디어
- 검색 기반 영상 주제 5개
- 시즌별 트렌드 키워드
- 롱테일 키워드 활용법

### 📈 검색 노출 최적화
- 제목 최적화 공식
- 설명란 구조화
- 썸네일 검색 최적화

"${query}"에 대한 맞춤 검색 전략을 제공해주세요.
`,

    "transcript": `
YouTube 비디오 대본 분석 전문가로서 다음을 도와드리겠습니다.

${baseContext}

다음 형식으로 대본 활용 가이드를 제공해주세요:

## 📜 비디오 대본 분석 및 활용

### 🎯 대본 분석 포인트
- "${query}" 관련 핵심 메시지 추출
- 스크립트 구조 및 흐름 분석
- 시청자 참여 유도 지점 파악

### ✍️ 개선된 스크립트 제안
- 더 강력한 오프닝 후크
- 리텐션 향상 구간
- 명확한 CTA 배치

### 📊 대본 기반 최적화
- 자막 SEO 최적화
- 핵심 키워드 자연스러운 삽입
- 접근성 향상 방안

### 🔄 콘텐츠 재활용
- 대본 기반 블로그 포스트
- 소셜 미디어 클립 제작
- 팟캐스트 변환 가이드

"${query}"와 관련된 대본 분석 및 활용 방안을 제시해주세요.
`,

    "youtube-channels": `
YouTube 채널 관리 전문가로서 다음을 분석해주세요.

${baseContext}

다음 형식으로 채널 최적화 가이드를 제공해주세요:

## 🏠 채널 최적화 및 관리 전략

### 🎨 채널 아트 & 브랜딩
- ${channelContext.niche} 니치에 적합한 비주얼
- 브랜드 일관성 유지 방법
- 구독 유도 요소 배치

### 📋 채널 섹션 구성
- 신규 방문자를 위한 플레이리스트
- 인기 콘텐츠 하이라이트
- 카테고리별 동영상 분류

### 👥 커뮤니티 관리
- 댓글 관리 전략
- 커뮤니티 탭 활용법
- 구독자와의 소통 방안

### 📊 채널 분석 및 개선
- 중요 지표 모니터링
- 업로드 스케줄 최적화
- 콘텐츠 성과 분석

"${query}"에 대한 채널 관리 조언을 제공해주세요.
`,

    "youtube-data": `
YouTube 데이터 분석 전문가로서 다음을 분석해주세요.

${baseContext}

다음 형식으로 데이터 활용 전략을 제공해주세요:

## 📊 YouTube 데이터 분석 및 활용

### 📈 핵심 지표 분석
- 조회수, 시청 시간, 구독자 증가율
- 클릭률(CTR) 및 시청 유지율
- 댓글, 좋아요, 공유 지표

### 🎯 오디언스 인사이트
- 시청자 인구통계 분석
- 시청 패턴 및 선호도
- 유입 경로 및 발견 방법

### 📊 콘텐츠 성과 분석
- 최고/최저 성과 영상 비교
- 주제별 성과 차이
- 최적 업로드 시간 분석

### 🔮 예측 및 계획
- 성장 예측 모델링
- 콘텐츠 전략 데이터 기반 조정
- 목표 KPI 설정 및 추적

"${query}"에 대한 데이터 기반 인사이트를 제공해주세요.
`,

    "yt": `
YouTube 종합 컨설턴트로서 "${query}"에 대한 즉석 분석을 제공해드리겠습니다.

${baseContext}

## ⚡ 빠른 YouTube 분석

### 🎯 즉시 실행 가능한 조언
- "${query}" 관련 핵심 포인트 3가지
- ${channelContext.niche} 니치에서의 적용 방법
- ${getSizeDescription(channelContext.size)}에 최적화된 접근법

### 📊 핵심 지표 포커스
- 우선적으로 개선할 지표
- 빠른 성과를 위한 액션 아이템
- 측정 및 모니터링 방법

### 🚀 성장 가속화 팁
- 현재 상황에서 가장 효과적인 전략
- 리소스 대비 임팩트가 높은 활동
- 다음 주에 시작할 수 있는 구체적 행동

간단하고 실행하기 쉬운 조언으로 도움을 드리겠습니다.
`,

    "youtube-playlist": `
YouTube 플레이리스트 최적화 전문가로서 다음을 분석해주세요.

${baseContext}

## 📋 플레이리스트 전략 및 최적화

### 🎯 플레이리스트 기획
- "${query}" 주제의 플레이리스트 구성
- ${channelContext.niche} 니치 특화 시리즈
- 시청자 여정 기반 플레이리스트

### 📊 시청 시간 극대화
- 자동재생 최적화 순서
- 관련 동영상 연결 전략
- 세션 시간 증가 방법

### 🔍 SEO 및 발견성
- 플레이리스트 제목 최적화
- 설명 및 태그 활용
- 검색 노출 증대 방안

### 📈 성과 분석 및 개선
- 플레이리스트 성과 지표
- 시청자 이탈 지점 분석
- 지속적 개선 방법

"${query}"와 관련된 플레이리스트 전략을 제공해드리겠습니다.
`,

    subtitles: `
YouTube 자막 최적화 전문가로서 다음을 분석해주세요.

${baseContext}

## 📝 자막 최적화 및 접근성 향상

### 🎯 자막 품질 향상
- "${query}" 콘텐츠의 자막 최적화
- 정확도 및 가독성 개선
- 타이밍 및 동기화 최적화

### 🌍 다국어 자막 전략
- ${channelContext.niche} 니치의 타겟 언어
- 번역 품질 관리
- 문화적 맥락 고려사항

### 🔍 SEO 및 검색성
- 자막 기반 키워드 최적화
- 검색 엔진 크롤링 개선
- 발견성 증대 방안

### ♿ 접근성 및 포용성
- 청각 장애인 접근성
- 자막 스타일링 베스트 프랙티스
- 포괄적 콘텐츠 제작

"${query}"에 대한 자막 전략을 제공해드리겠습니다.
`,

    captions: `
YouTube 캡션 및 접근성 전문가로서 다음을 분석해주세요.

${baseContext}

## 📺 캡션 최적화 및 접근성 개선

### 🎯 자동 캡션 개선
- "${query}" 콘텐츠의 캡션 정확도 향상
- 음성 인식 최적화 팁
- 수동 편집 포인트 식별

### 🎨 캡션 디자인 최적화
- 가독성 향상 스타일링
- 브랜드 일관성 유지
- 모바일 최적화 고려사항

### 🌐 다양성 및 포용성
- 다문화 오디언스 고려
- 언어적 접근성 향상
- 포괄적 콘텐츠 제작

### 📊 캡션 성과 분석
- 시청자 참여도 영향 분석
- 접근성 지표 추적
- 개선 효과 측정

"${query}"에 대한 캡션 최적화 방안을 제공해드리겠습니다.
`,

    "video-transcript": `
비디오 대본 전문 분석가로서 다음을 도와드리겠습니다.

${baseContext}

## 📖 전문 비디오 대본 분석 및 최적화

### 🎯 대본 구조 분석
- "${query}" 콘텐츠의 내러티브 구조
- 스토리텔링 요소 평가
- 정보 전달 효율성 분석

### ✍️ 스크립트 개선 방안
- 더 매력적인 오프닝 제안
- 중간 이탈 방지 전략
- 강력한 마무리 및 CTA

### 📊 언어학적 최적화
- 타겟 오디언스 언어 수준
- 키워드 밀도 최적화
- 감정적 호소력 강화

### 🔄 멀티미디어 활용
- 대본 기반 콘텐츠 확장
- 크로스 플랫폼 적용
- 재사용 가능한 콘텐츠 추출

"${query}"의 전문적인 대본 분석과 개선 방안을 제공해드리겠습니다.
`,

    "youtube-clipper": `
YouTube 클리핑 전문가로서 AI 기반 스마트 영상 클리핑을 도와드리겠습니다.

${baseContext}

## 🎬 YouTube 스마트 클리핑 전문가

### 🤖 AI 챕터 분석
- "${query}" 영상의 자막 분석을 통한 의미 있는 챕터 생성
- 2-5분 단위의 정밀한 구간 분할
- 주제별 자연스러운 전환점 식별
- 각 챕터의 핵심 내용과 키워드 추출

### ✂️ 스마트 클리핑 전략
- 바이럴 가능성이 높은 구간 식별
- 플랫폼별 최적 길이 추천 (TikTok, Instagram, YouTube Shorts)
- 시청자 몰입도를 고려한 클립 포인트 선정
- 완결성 있는 스토리 아크 보장

### 🌐 이중언어 자막 최적화
- 영어 원문과 한국어 번역의 자연스러운 조화
- 플랫폼별 자막 스타일 최적화
- 기술 용어와 전문 용어의 정확한 번역
- 입말 특성을 살린 구어체 번역

### 📝 소셜미디어 콘텐츠 생성
- 클립별 맞춤형 제목과 설명 생성
- 플랫폼별 해시태그 전략
- 썸네일 최적화 가이드
- 바이럴 요소 강화 방안

### 🎯 타겟 최적화
- ${channelContext.niche} 니치에 특화된 클리핑 전략
- ${getSizeDescription(channelContext.size)} 채널 규모에 적합한 접근법
- ${getGoalDescription(channelContext.goal)} 목표 달성을 위한 클립 활용법

"${query}"에 대한 전문적인 클리핑 분석과 실행 계획을 제공해드리겠습니다.
`,

    default: `
YouTube ${getSkillName(skillId)} 전문가로서 다음을 분석해주세요.

${baseContext}

"${query}"에 대한 전문적인 분석과 실행 가능한 조언을 제공해주세요.

${channelContext.niche} 니치와 ${getSizeDescription(channelContext.size)} 규모, ${getGoalDescription(channelContext.goal)} 목표에 특화된 맞춤 조언을 제공해주세요.
`
  };

  return skillPrompts[skillId as keyof typeof skillPrompts] || skillPrompts.default;
}

function getSizeDescription(size: string): string {
  switch (size) {
    case "new": return "신규 채널 (1천 구독자 미만)";
    case "growing": return "성장 채널 (1천~1만 구독자)";
    case "established": return "안정 채널 (1만~10만 구독자)";
    case "authority": return "권위 채널 (10만 구독자 이상)";
    default: return size;
  }
}

function getGoalDescription(goal: string): string {
  switch (goal) {
    case "growth": return "구독자 성장";
    case "monetization": return "수익화";
    case "authority": return "브랜드 권위";
    case "engagement": return "오디언스 참여";
    default: return goal;
  }
}

function getSkillName(skillId: string): string {
  const skillNames: Record<string, string> = {
    audit: "채널 감사",
    seo: "SEO 최적화", 
    script: "스크립트 작성",
    hook: "후킹 작성",
    thumbnail: "썸네일 최적화",
    strategy: "채널 전략",
    calendar: "콘텐츠 캘린더",
    shorts: "쇼츠 최적화",
    analyze: "분석 해석",
    repurpose: "콘텐츠 재활용",
    monetize: "수익화 계획",
    competitor: "경쟁자 분석",
    metadata: "메타데이터 최적화",
    ideate: "아이디어 생성",
    "youtube-api": "YouTube API 도구",
    "youtube-search": "YouTube 검색",
    transcript: "비디오 대본 추출",
    "youtube-channels": "채널 관리",
    "youtube-data": "YouTube 데이터",
    yt: "빠른 YouTube 조회",
    "youtube-playlist": "플레이리스트 관리",
    subtitles: "자막 관리",
    captions: "캡션 도구",
    "video-transcript": "비디오 대본 전문",
    "youtube-clipper": "YouTube 클리퍼"
  };
  
  return skillNames[skillId] || "YouTube 분석";
}

// YouTube 프로젝트 기능들
export async function generateYouTubeContentIdeas(
  projectContext: YouTubeProjectContext,
  topic: string
): Promise<string> {
  const prompt = `
YouTube 콘텐츠 기획 전문가로서 다음 프로젝트에 대한 아이디어를 제안해주세요.

프로젝트 정보:
- 제목: ${projectContext.title}
- 설명: ${projectContext.description}
- 분야: ${projectContext.niche}
- 타겟: ${projectContext.targetAudience}
- 유형: ${getContentTypeLabel(projectContext.contentType)}

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
**설명**: 영상의 핵심 가치 제안 및 시청자 혜택
**타겟팅**: ${projectContext.targetAudience}를 위한 맞춤 각도

### 🗂️ 영상 구조 (${getContentTypeLabel(projectContext.contentType)} 최적화)
1. **인트로 (0-30초)**
   - 강력한 훅: 시청자의 즉각적인 관심 끌기
   - 문제/호기심 제기
   - 영상 미리보기 (예고편 스타일)

2. **문제 설정/배경 (30초-2분)**
   - "${topic}"가 중요한 이유
   - 시청자가 겪는 문제 공감대 형성
   - 영상을 끝까지 봐야 하는 이유

3. **메인 콘텐츠 (2-15분)**
   - 핵심 정보 3-5가지 세그먼트로 구분
   - 각 섹션별 시각적 요소/예시 포함
   - 실용적이고 즉시 적용 가능한 팁

4. **마무리 및 CTA (15-20분)**
   - 핵심 내용 요약 (3가지 포인트)
   - 구독/좋아요/알림설정 유도
   - 다음 영상 예고 및 연관 콘텐츠 추천

### 🎨 썸네일 컨셉
- **메인 비주얼**: "${topic}" 관련 임팩트 있는 이미지
- **텍스트 오버레이**: 궁금증 유발 문구 (최대 6단어)
- **색상 스킴**: ${projectContext.niche} 분야에 적합한 브랜드 컬러
- **표정/감정**: 타겟 오디언스 반응 유도하는 표현

### 📱 숏폼 파생 콘텐츠 (3-5개)
- 메인 영상의 핵심 포인트별 60초 숏츠
- "이것만 기억하세요" 스타일 요약본
- Q&A 형식의 빠른 팁
- 비하인드/메이킹 영상

## 🎯 SEO 및 최적화 전략

### 📋 메타데이터 최적화
**제목**: [60자 이내, 키워드 포함 3가지 옵션]
**설명**: 첫 125자에 핵심 키워드 포함한 매력적인 요약
**태그**: 관련성 높은 태그 20개 (메인/롱테일/브랜딩 태그 조합)

### 🔗 연관 콘텐츠 시리즈화 기회
- "${topic}" 심화편 (Part 2, 3 등)
- 관련 주제로 확장 가능한 시리즈 아이디어 5개
- 플레이리스트 구성 전략

### 📈 성과 예측 및 목표 설정
- 예상 조회수 범위 (첫 1주/1개월)
- 주요 성과 지표 (CTR, 평균 시청률, 구독 전환률)
- A/B 테스트 요소 (썸네일, 제목, 인트로 등)

실무적이고 구체적인 조언으로 도움을 드리겠습니다!
`;

  console.log(`[YouTube Project] 콘텐츠 아이디어 생성 시작: ${topic}`);
  
  const ideas = await generateOnce(prompt);
  
  console.log(`[YouTube Project] 콘텐츠 아이디어 생성 완료`);
  
  return ideas;
}

export async function generateYouTubeLongFormScript(
  projectContext: YouTubeProjectContext,
  topic: string,
  duration: number = 15 // 분 단위
): Promise<string> {
  const prompt = `
YouTube 롱폼 스크립트 전문 작가로서 다음 프로젝트의 영상 대본을 작성해주세요.

프로젝트 정보:
- 제목: ${projectContext.title}
- 분야: ${projectContext.niche}
- 타겟: ${projectContext.targetAudience}
- 유형: ${getContentTypeLabel(projectContext.contentType)}
- 영상 길이: 약 ${duration}분

영상 주제: "${topic}"

다음 형식으로 완성된 YouTube 롱폼 스크립트를 작성해주세요:

## 🎬 YouTube 롱폼 스크립트: "${topic}"

### 📊 영상 개요
**예상 길이**: ${duration}분
**타겟 오디언스**: ${projectContext.targetAudience}
**핵심 메시지**: [이 영상에서 전달하고자 하는 한 가지 핵심 메시지]

---

### 🎭 인트로 (0:00 - 0:30)

**[화면]**: [썸네일과 연결되는 첫 화면 설명]

**[대사]**:
"안녕하세요! [채널명]입니다. 
혹시 [타겟 오디언스가 겪는 구체적인 문제]로 고민하고 계신가요? 
오늘은 [핵심 혜택/해결책]에 대해 자세히 알아보겠습니다.

[미리보기 멘트: 영상의 하이라이트 3가지]

그럼 바로 시작해볼까요?"

**[화면 전환]**: [로고/브랜딩 화면 2-3초]

---

### 🔍 문제 설정 및 배경 (0:30 - 2:00)

**[화면]**: [문제 상황을 보여주는 비주얼]

**[대사]**:
"먼저 많은 분들이 [구체적인 문제 상황] 때문에 어려움을 겪고 있습니다.

[통계나 사례 1-2개 제시]

실제로 [구체적인 예시나 경험담]

그렇다면 이 문제를 어떻게 해결할 수 있을까요?"

---

### 📚 메인 콘텐츠 Part 1 (2:00 - 6:00)

**[화면]**: [첫 번째 핵심 내용 관련 비주얼]

**[대사]**:
"첫 번째로 알아볼 것은 [첫 번째 핵심 포인트]입니다.

[상세 설명 with 구체적인 예시]
- [세부 포인트 1]
- [세부 포인트 2] 
- [세부 포인트 3]

여기서 중요한 건 [핵심 인사이트]라는 점입니다.

실제로 이렇게 해보시면...
[실용적인 팁이나 액션 아이템]"

**[화면]**: [예시나 데모 화면]

---

### 📊 메인 콘텐츠 Part 2 (6:00 - 10:00)

**[화면]**: [두 번째 핵심 내용 관련 비주얼]

**[대사]**:
"두 번째로 중요한 건 [두 번째 핵심 포인트]입니다.

많은 분들이 [흔한 실수나 오해]라고 생각하시는데,
사실은 [정확한 정보나 새로운 관점]입니다.

[구체적인 설명과 근거]
- [세부 설명 1]
- [세부 설명 2]
- [실제 적용 방법]

이렇게 하면 [기대 효과나 혜택]을 얻을 수 있습니다."

---

### 🎯 메인 콘텐츠 Part 3 (10:00 - 13:00)

**[화면]**: [세 번째 핵심 내용 관련 비주얼]

**[대사]**:
"마지막으로 [세 번째 핵심 포인트]에 대해 말씀드릴게요.

이 부분이 정말 중요한데요,
[왜 중요한지 이유와 배경 설명]

[단계별 설명]
1. [첫 번째 단계]
2. [두 번째 단계] 
3. [세 번째 단계]

주의할 점은 [주의사항이나 팁]입니다."

---

### 💡 실용적 팁 및 추가 조언 (13:00 - 14:30)

**[화면]**: [정리 화면 또는 체크리스트]

**[대사]**:
"그럼 정리해서 오늘 배운 내용을 실제로 적용하는 방법을 알려드릴게요.

[실행 가능한 액션 플랜]
- [즉시 실행 가능한 팁 1]
- [중장기적으로 할 수 있는 것]
- [추가로 알아보면 좋은 것]

특히 [타겟 오디언스 특성]분들께는 [맞춤형 조언]을 추천드립니다."

---

### 🎬 마무리 및 CTA (14:30 - 15:00)

**[화면]**: [요약 화면, 구독 버튼 강조]

**[대사]**:
"오늘은 [주제]에 대해 알아봤습니다.

핵심은:
1. [핵심 포인트 1 요약]
2. [핵심 포인트 2 요약] 
3. [핵심 포인트 3 요약]

이 영상이 도움되셨다면 좋아요와 구독 꼭 눌러주시고,
댓글로 [구체적인 질문이나 경험] 남겨주세요!

다음 영상에서는 [다음 영상 예고]에 대해 다뤄보겠습니다.
그럼 다음에 만나요!"

**[화면]**: [구독 및 다음 영상 썸네일]

---

### 📝 추가 제작 노트

#### 🎬 촬영/편집 가이드
- **컷 전환**: 3-4분마다 화면 전환으로 시각적 피로 방지
- **자막**: 핵심 키워드와 숫자는 강조 자막 처리
- **BGM**: [콘텐츠 유형]에 적합한 배경음악 (저작권 프리)
- **그래픽**: 통계나 리스트는 그래픽으로 시각화

#### 📱 숏폼 활용 포인트  
- 0:30-2:00 문제 설정 부분 → 60초 숏츠
- 각 메인 포인트별 → 개별 숏츠 콘텐츠
- 마무리 요약 → "3가지만 기억하세요" 숏츠

#### 🔍 SEO 최적화 요소
- **타임스탬프**: 각 섹션별 챕터 마킹
- **핵심 키워드**: "${topic}" 관련 키워드를 자연스럽게 반복
- **호출어**: "댓글에 남겨주세요", "구독해주세요" 등 명확한 CTA

이렇게 완성된 스크립트로 ${projectContext.targetAudience}에게 가치 있는 ${duration}분 콘텐츠를 제작하실 수 있습니다!
`;

  console.log(`[YouTube Project] 롱폼 스크립트 생성 시작: ${topic} (${duration}분)`);
  
  const script = await generateOnce(prompt);
  
  console.log(`[YouTube Project] 롱폼 스크립트 생성 완료`);
  
  return script;
}

export async function analyzeYouTubeTopicTrends(
  projectContext: YouTubeProjectContext,
  topic: string
): Promise<string> {
  const prompt = `
YouTube 트렌드 분석 전문가로서 다음 주제의 트렌드를 분석해주세요.

프로젝트 정보:
- 분야: ${projectContext.niche}
- 타겟: ${projectContext.targetAudience}
- 콘텐츠 유형: ${getContentTypeLabel(projectContext.contentType)}

분석 주제: "${topic}"

다음 형식으로 상세한 트렌드 분석을 제공해주세요:

## 📈 "${topic}" 트렌드 분석 리포트

### 🔥 현재 트렌드 상태
- **관심도 지수**: [1-10 스케일로 평가]
- **검색 증가율**: [최근 3개월 대비]
- **경쟁도**: [1-10 스케일로 평가]
- **시장 기회**: [높음/중간/낮음과 이유]

### 📊 ${projectContext.niche} 분야에서의 위치
- 니치 내 주제 관련성 및 적합도
- 타겟 오디언스(${projectContext.targetAudience})의 관심도
- 기존 콘텐츠 포화도 분석
- 차별화 가능 포인트 3가지

### 🎯 추천 콘텐츠 방향성
**높은 성과 예상 앵글 3가지:**
1. [앵글명]: [설명 및 예상 효과]
2. [앵글명]: [설명 및 예상 효과] 
3. [앵글명]: [설명 및 예상 효과]

**피해야 할 접근법:**
- [포화된 앵글이나 접근법과 이유]

### 🚀 최적 업로드 타이밍
- **시기**: [언제 업로드하면 좋을지]
- **이유**: [트렌드 곡선상 위치와 근거]
- **지속가능성**: [트렌드 지속 예상 기간]

이 분석을 바탕으로 "${topic}"에 대한 콘텐츠 제작을 진행하시기 바랍니다.
`;

  console.log(`[YouTube Project] 트렌드 분석 시작: ${topic}`);
  
  const analysis = await generateOnce(prompt);
  
  console.log(`[YouTube Project] 트렌드 분석 완료`);
  
  return analysis;
}

function getContentTypeLabel(type: YouTubeProjectContext["contentType"]): string {
  switch (type) {
    case "educational": return "교육/강의";
    case "tutorial": return "튜토리얼/가이드";
    case "review": return "리뷰/분석";
    case "entertainment": return "엔터테인먼트";
    case "vlog": return "브이로그/일상";
    default: return type;
  }
}