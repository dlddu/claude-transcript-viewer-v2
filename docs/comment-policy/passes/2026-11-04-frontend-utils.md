# 2026-11-04 · frontend 유틸·훅·타입·일부 컴포넌트

범위(줄머리 주석 394줄 → 36줄): `frontend/src/utils/{truncate,parseUuid,loadTranscript,enrichMessages,jsonHighlight}.ts(x)`와 각 테스트, `frontend/src/hooks/useTranscriptData{,.test}.ts`, `frontend/src/types/transcript.ts`, `frontend/src/components/{LookupTabs,MessageUuidLookup,SessionIdLookup,TruncatedText}.tsx`, `frontend/src/test/setup.ts`, `frontend/src/App.css`. 줄 끝 주석 3건(`truncate.ts` 1, `types/transcript.ts` 2)도 함께 판정했다. 새로 들인 `scripts/comment-policy/` 파일의 주석 2줄도 이 패스에서 판정했다.

## 제거 목록

| 불필요 유형 | 대상 |
|---|---|
| 코드 재진술 | 테스트의 `// Arrange`·`// Act`·`// Assert` 표지(`truncate.test.ts`·`parseUuid.test.ts`·`enrichMessages.test.ts`·`useTranscriptData.test.ts`, 뒤에 붙은 설명 포함), `truncate.ts`·`jsonHighlight.tsx`·`SessionIdLookup.tsx`·`TruncatedText.tsx`·`MessageUuidLookup.tsx`·`enrichMessages.ts`·`loadTranscript.ts`의 한 줄 동작 설명, `types/transcript.ts` 필드 뒤 설명, 비공개 함수 `isFilePath`의 이름 재진술 doc |
| 시그니처 재진술 | JSDoc `@param`·`@returns`와 둘째 줄 이후 설명(요약 1줄만 남김), `jsonHighlight.tsx`의 CSS 클래스 나열 |
| 저장소 문서 재진술 | `loadTranscript.test.ts`의 LC-AC3 머리 블록(PRD·가치 V3 재진술)과 단언마다 붙은 풀이 |
| 장식·구분 | `App.css`의 섹션 머리 3줄, 목록 열기 레이아웃 설명 블록(클래스 이름과 PRD가 말한다) |

더 나은 자리로 옮긴 주석은 없다.

## 유지 목록

| 대상 | 줄 | 필요 사유 |
|---|---|---|
| `LookupTabs.tsx` 세션 열기 prop 설명 | 3 | 지우면 prop을 생략했을 때의 기본 동작과, 목록 열기가 인라인 조회와 달리 전체 화면 master-detail로 가는 이유를 모른 채 두 콜백을 합치기 쉽다. |
| `useTranscriptData.ts` 캐시 설명 | 2 | 지우면 공유 캐시의 요청 중복 제거가 StrictMode 이중 마운트 때문임을 몰라, 캐시를 우회하는 단순화로 매니페스트·다운로드가 두 번 나간다. |
| `useTranscriptData.test.ts` Cleanup | 1 | 지우면 지연 Promise를 풀어 주는 줄이 불필요해 보여, 로드가 끝나지 않은 채 테스트가 끝난다. |
| `types/transcript.ts` S3 객체 `id`, 응답 형태, 목록 항목 계약 | 8 | 지우면 `id`가 세션 id인지 agent id(확장자 뺀 파일명)인지, 서버가 키 나열·서명만 하고 파싱은 브라우저가 한다는 분업, 목록이 snake_case·RFC3339 UTC·최신순이라 받은 순서대로 그린다는 계약을 코드에서 역추적해야 한다. |
| `loadTranscript.ts` 매니페스트 설계, 동일 origin·`VITE_API_URL`, 안정 정렬, 원문 텍스트 생략, 서브에이전트 누락 처리 | 11 | 지우면 (a) 대화록 바이트가 백엔드 파드를 지나지 않는다는 제약을 모르고 백엔드 경유로 단순화하고, (b) 기본 동일 origin과 분리 배포 override를 찾아 다녀야 하고, (c) 정렬 안정성에 기대는 순서 보존·메모리 이중 보유 회피·누락 파일 건너뛰기 같은 동작 계약을 깨뜨린다. |
| `loadTranscript.test.ts` 요청 분류 | 4 | 지우면 이어지는 단언이 세는 "백엔드 요청"과 "S3 직접 요청"의 정의(`/api/*` vs 서명 URL)를 알 수 없다. |
| `truncate.ts`·`parseUuid.ts`·`jsonHighlight.tsx` JSDoc 요약 | 6 | 사유 면제 — 정책의 TS doc 주석 수준(export 함수의 요약 1줄). `parseUuids` 요약은 소문자·중복 제거·먼저 나온 순이라는 반환 계약을 담는다. |
| `scripts/comment-policy/extract.sh` 머리 | 1 | 지우면 이 파일이 모델 스크립트의 사본이라 모델이 개정되면 함께 맞춰야 한다는 사실을 놓쳐 게이트의 범위가 모델 지문과 갈라진다. |
| `scripts/comment-policy/ledger_gate.py` docstring | 1 | 지우면 게이트가 실패했을 때 어느 정책 문서를 보고 고쳐야 하는지 찾아야 한다. |
