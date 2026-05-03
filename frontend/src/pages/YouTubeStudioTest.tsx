import { PageWrapper } from "../components/layout/PageWrapper";

export function YouTubeStudioTest() {
  return (
    <PageWrapper
      title="YouTube 크리에이터 스튜디오 테스트"
      subtitle="테스트 페이지"
    >
      <div className="p-8">
        <h1 className="text-2xl text-gold font-bold mb-4">YouTube Studio 테스트</h1>
        <p className="text-parchment mb-4">
          이 페이지가 보인다면 라우팅은 정상 작동합니다.
        </p>
        <div className="bg-ink-light p-4 rounded-lg">
          <p className="text-parchment/70">
            컴포넌트 로딩 테스트 중...
          </p>
        </div>
      </div>
    </PageWrapper>
  );
}