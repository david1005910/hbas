# Hebrew Bible Animation Studio (HBAS) v2

구약 히브리 성경을 원천 소재로, 한국어·히브리어 이중 언어 3D 애니메이션 유튜브 콘텐츠를 제작하는 풀스택 웹 플랫폼.

## 사전 요구사항

- Docker Desktop 설치
- Google AI Studio API Key ([aistudio.google.com](https://aistudio.google.com/app/apikey))
- GCP 프로젝트 (Veo 3.1 사용 시)

## 빠른 시작

```bash
# 1. 저장소 클론
git clone <repo> && cd hbas

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에서 GOOGLE_AI_API_KEY, DB_PASSWORD 등 입력

# 3. Vertex AI 사용 시 서비스 계정 키 설정 (선택)
cp service-account.json.example service-account.json
# 실제 GCP 서비스 계정 JSON 내용으로 교체

# 4. 실행
docker-compose up --build

# 5. 브라우저 접속
open http://localhost:3000
```

## DB 초기화 (최초 1회)

```bash
docker-compose exec backend npx prisma migrate dev --name init
docker-compose exec backend npx ts-node src/prisma/seed/bibleBooks.ts
```

## AI 연결 테스트

```bash
# Gemini 텍스트
docker-compose exec backend npx ts-node src/scripts/testGemini.ts

# Nano Banana 이미지
docker-compose exec backend npx ts-node src/scripts/testNanoBanana.ts

# Veo 3.1 영상 (GCP 서비스 계정 필요)
docker-compose exec backend npx ts-node src/scripts/testVeo.ts
```

## 사용 흐름

1. 프로젝트 생성 → 에피소드 생성 (성경 책, 절 범위, 씬 수, 스타일 선택)
2. **스크립트** 탭 → 한국어+히브리어 대본 생성 (Gemini SSE 스트리밍)
3. **프롬프트** 탭 → Nano Banana·Veo용 영문 프롬프트 생성
4. **키프레임** 탭 → 씬별 1080p 이미지 생성 → Veo 전송 선택
5. **영상 클립** 탭 → 씬별 4초 클립 생성 (비용 확인 후) → 전체 병합
6. **자막 SRT** 탭 → 한국어·히브리어·영어 SRT 생성
7. **YT 메타** 탭 → 3개 언어 유튜브 메타데이터 생성
8. 우측 상단 **전체 ZIP** → 모든 결과물 일괄 다운로드

## 환경변수 요약

| 변수 | 설명 |
|------|------|
| `GOOGLE_AI_API_KEY` | Google AI Studio API Key (필수) |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `NANO_BANANA_MODEL` | `gemini-2.5-flash-preview-04-17` |
| `GOOGLE_CLOUD_PROJECT` | GCP 프로젝트 ID (Veo 사용 시) |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` |
| `DB_PASSWORD` | PostgreSQL 비밀번호 |

## 기술 스택

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query
- **Backend**: Node.js 20 + Express + TypeScript + Prisma 5
- **AI**: Gemini 2.5 Flash (텍스트) · Nano Banana (이미지) · Veo 3.1 (영상)
- **Infra**: PostgreSQL 15 · Redis 7 · Docker · FFmpeg · Nginx (프로덕션)
