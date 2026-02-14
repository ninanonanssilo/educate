# 공문 자동 작성 도우미

공문 주제를 입력하면 공문 기본 형식(수신/제목/본문/붙임/끝.)으로 초안을 자동 생성하고 즉시 복사할 수 있는 정적 웹앱입니다.

## 주요 기능
- 공문 주제 입력 시 AI 기반 초안 자동 생성
- 수신/발신/시행일/본문/붙임 항목 커스터마이징
- 클립보드 복사 버튼 제공

## Cloudflare Pages 연동
이 프로젝트는 Cloudflare Pages 정적 사이트로 배포할 수 있도록 설정되어 있습니다.

### 1) 준비
```bash
npm install
npx wrangler login
```

### 2) 로컬 미리보기
```bash
# OPENAI_API_KEY를 먼저 설정한 뒤 실행
export OPENAI_API_KEY="sk-..."
npm run dev
```

### 3) 배포
```bash
npm run deploy:prod
```

`official-letter-helper` 프로젝트 이름이 이미 존재하지 않으면 Cloudflare에서 새 Pages 프로젝트로 생성됩니다.

### 4) AI 연동 환경변수 설정 (필수)
Cloudflare Pages 프로젝트 설정에서 아래 변수를 추가해야 AI 생성이 동작합니다.

- `OPENAI_API_KEY`: OpenAI API 키 (필수)
- `OPENAI_MODEL`(선택): 기본값 `gpt-5.2`

설정 경로:
- Cloudflare Dashboard > `Workers & Pages` > 프로젝트 > `Settings` > `Variables and Secrets`
- `Production`/`Preview` 환경 모두 설정 권장

주의:
- API 키는 브라우저 코드(`index.html`, `main.js`)에 직접 넣지 마세요.
- 키는 반드시 서버 측(Cloudflare Pages Functions의 `env`)에서만 사용해야 합니다.

## API 동작 확인
`npm run dev` 실행 후 아래 요청이 정상 응답하면 AI 연동이 완료된 상태입니다.

```bash
curl -X POST http://127.0.0.1:8788/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "subject":"2026학년도 공개수업 운영 계획",
    "recipient":"내부결재",
    "sender":"판교대장초등학교장",
    "date":"2026. 2. 14.",
    "details":"일시, 장소, 대상, 유의사항",
    "attachments":["운영 계획(안) 1부"]
  }'
```

## GitHub 연동 배포(권장)
Cloudflare 대시보드에서 `Workers & Pages` > `Create application` > `Pages` > `Connect to Git`로 이 저장소를 연결하면, `main` 브랜치 푸시 시 자동 배포됩니다.
