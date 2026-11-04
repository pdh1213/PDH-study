# pdh study

수행평가와 지필고사 자료를 프로젝트별로 정리하고, 선택한 자료만 친구에게 공유하는 웹사이트입니다.

## 사용

1. `https://pdh-study.vercel.app/?admin=1`에서 **처음이라면 관리자 설정**을 누릅니다.
2. 전달받은 1회용 설정 코드와 직접 정한 비밀번호로 계정을 만듭니다.
3. 로그인해 프로젝트와 자료를 만듭니다. 자료에는 본문, 참고 링크, 암기 문제와 여러 첨부파일을 넣을 수 있습니다.
4. **AI 학습 도우미**에서 본문 또는 이미 저장한 PDF·이미지·TXT 파일 하나(8MB 이하)를 선택해 요약·암기 문제를 만들거나 자료에 질문할 수 있습니다. 새 파일은 자료를 저장한 뒤 AI에서 선택합니다. 반드시 결과를 검토한 뒤 저장합니다.
5. **공유 관리**에서 자료 범위, 퀴즈 가능 여부, 만료일을 정하고 링크를 복사합니다. 친구는 로그인 없이 링크에서 공부할 수 있습니다.

## 구성

- Vercel: 정적 화면과 관리자 전용 AI API (`api/ai.mjs`)
- Supabase: Auth, 자료 데이터베이스, 공유 링크 검사 Edge Function (`study-api.ts`)
- 공개 테이블은 RLS를 켜고 브라우저 역할의 직접 접근을 차단했습니다. 자료 접근은 Edge Function에서 관리자 인증 또는 공유 토큰을 검사합니다.
- 첨부파일은 비공개 Supabase Storage 버킷에 저장됩니다. PDF, 이미지, 문서 파일을 한 자료에 여러 개 올릴 수 있으며 파일당 20MB까지 받습니다. 파일을 열 때 공유 링크의 범위를 다시 검사합니다.
- AI는 관리자 로그인 후 Vercel AI Gateway의 `openai/gpt-4.1-mini`를 사용합니다. Gateway 인증 또는 크레딧이 없거나 사용이 제한되면 AI 요청은 실패할 수 있습니다.

## 소스

`index.html`, `style.css`, `app.js`, `api/ai.mjs`, `package.json`, `vercel.json`은 Vercel 배포 소스입니다. `schema.sql`, `owner-setup.sql`, `attachments.sql`은 Supabase 스키마이고, `study-api.ts`는 배포된 Edge Function 소스입니다. `server.mjs`는 로컬 미리보기용입니다.

로컬 미리보기: `node server.mjs` 후 `http://localhost:5173`을 엽니다. 로컬에서는 Vercel AI API가 실행되지 않습니다.

관리자 설정 코드는 소스에 포함하지 않았습니다.
