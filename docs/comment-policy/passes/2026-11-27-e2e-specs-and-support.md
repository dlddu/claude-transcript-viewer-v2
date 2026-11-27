# 2026-11-27 · e2e spec·support 잔여 주석 판정

범위(줄머리 주석 296줄 → 64줄, 줄 끝 주석 3줄 → 2줄): `e2e/tests/{tool-call-display,truncation-and-timestamps,transcript-direct-download,transcript-upload-api}.spec.ts`·`e2e/tests/support/{backend-instance,empty-backend,session-list,timeline,transcript-api}.ts`. 400줄 예산(299줄 = L 296 + E 3)에 든다. 수동 승인 케이스 경로(MA1~MA3)에 닿지 않는다 — `e2e/tests/**` 는 어느 케이스에도 없다. 열린 PR의 변경 파일은 피했다: #111(`e2e/tests/` spec 16개 + `docs/comment-policy/ledger.md`), #113(`e2e/tests/transcript-delete-api.spec.ts` 50줄 + `e2e/tests/transcript-delete-retry-safety.spec.ts` 신설 + 원장), #114(`backend/cmd/datamodelcheck/`·`docs/data-model/`), #98(`docs/`). **#113 이 `e2e/tests/transcript-delete-api.spec.ts` 50줄을 갖고 있어 그 덩어리는 이번 범위 밖이다** — 정의 「판정 슬라이스」의 "파일이 실제로 겹치는 열린 PR이 있을 때만 그 덩어리를 뺀다". `e2e/tests/support/session-list.ts` 의 `mock-exception:` 주석은 기계가 읽는 지시자라 시험 면제이고 그대로 둔다.

## 제거 목록

| 불필요 유형 | 대상 |
|---|---|
| 코드 재진술 | 4개 spec 파일의 `// Arrange`·`// Act`·`// Assert` 표지와 그 뒤에 붙은 단언 풀이(전 파일), `tool-call-display.spec.ts`의 "Tool indicator should be visible (e.g., badge, icon, or special styling)"·"The message element should have the 'expanded' class"·"JSON should be properly indented/formatted (look for code block or pre element)" 등 단언·셀렉터를 풀어 쓴 주석, `transcript-direct-download.spec.ts`의 "session-abc123 has a main file plus two subagent files"·"Backend is hit exactly once, only for the manifest of this session"·"Only the direct-S3 downloads scale: 3 files vs 1 file", `transcript-upload-api.spec.ts`의 "Response fields of the upload-url contract"·"The object exists in the bucket at exactly the returned key", `support/transcript-api.ts`의 "Everything up to and including \"session_id=<id>/\""·"Issues a presigned PUT URL, uploads `body` to it, and returns the stored key", `support/session-list.ts`의 "The list endpoint the \"Sessions\" tab reads", `support/timeline.ts`의 "The session that exercises the with-/no-subagents paths"·"Loads a session through the Session ID lookup tab", `support/backend-instance.ts`의 `BackendOptions` 필드 JSDoc 2건 |
| 저장소 문서 재진술 | 4개 spec 파일 머리 블록의 AC 조항·Purpose·Fixture 목록(`docs/transcript-viewer-test-*.md`가 말한다), `tool-call-display.spec.ts` 머리의 "Linear: DLD-252 (tool detail view), DLD-356/357/358", `transcript-upload-api.spec.ts` 머리의 "That a session's *later* files reuse one Hive directory is LC-AC2's job", `timeline.ts` 머리의 Fixture Data 목록, `support/*` 머리의 "Shared support for … specs" 표지 |
| 작업 흔적 | 4개 spec 파일 머리의 "Test Status: ACTIVE" 표지(어떤 게이트도 읽지 않는다)·"예전에는 두 스펙 파일로 갈려 있었으나 AC 하나가 스펙 하나를 소유하도록 병합했다" 병합 경위, `truncation-and-timestamps.spec.ts` 머리의 TDD Red 경위와 "스킵된 스펙은 (a) 존재하지 않는 testid와 (b) 실제 truncate 규칙과 어긋나는 기대값을 담고 있었다", `transcript-direct-download.spec.ts` 머리의 "Sibling coverage"과 "This spec adds the missing browser-level assertion", `support/*` 머리의 "Each LC-AC owns exactly one spec file …" 중복 배제 경위 |
| 소감·추측 | 없음 |
| 장식·구분 | 없음 |

더 나은 자리로 옮긴 주석은 하나다 — `truncation-and-timestamps.spec.ts` 머리의 "tool-detail-view 의 tool-input 단정은 'input.csv' 포함 여부만 보는데 …" 설명을 그 단정 바로 위(`not.toContainText('/data/')` 앞)로 옮겼다. 정의 「판정 규칙」의 "더 나은 자리가 있으면 옮긴다"·"옮기는 변경은 같은 PR 에 둔다"를 따른 것이다.

## 유지 목록

| 대상 | 줄 | 필요 사유 |
|---|---|---|
| `tool-call-display.spec.ts` describe별 픽스처 | 1 | 지우면 두 describe가 같은 픽스처를 쓰는 것으로 보고 beforeEach를 하나로 합쳐, 두 번째 describe가 `session-task-subagent` 대신 `session-abc123`을 읽어 Task 툴 단정이 깨진다. |
| `tool-call-display.spec.ts` 툴 ID 절단 | 1 | 지우면 이 단언이 전체 툴 ID를 담는 것으로 오해해 `toolu_01A9B8C7D6E5F4G3H2` 전체로 단정을 강화하고, UI의 8자 프리픽스 + 생략부호 절단 계약을 잃는다. |
| `truncation-and-timestamps.spec.ts` tool-input substring 근거 | 3 | 지우면 `not.toContainText('/data/')` 단정이 왜 있는지를 몰라, `tool-call-display.spec.ts`와 같은 'input.csv' 포함 단정으로 줄여 절단 자체를 검증하지 않게 된다. |
| `truncation-and-timestamps.spec.ts` 픽스처 툴 ID 길이 | 1 | 지우면 픽스처의 DataAnalyzer 툴 ID가 왜 긴 값인지 몰라, 실제 툴 ID처럼 짧게 고쳐 8자 프리픽스 생략부호 절단이 E2E에서 발동하지 않게 된다. |
| `truncation-and-timestamps.spec.ts` 타임스탬프 포맷 | 2 | 지우면 `expect(text).toContain('Feb')`가 왜 2월인지 몰라, 포맷을 바꾸거나 픽스처 타임스탬프(2026-02-01T05:00:00Z)를 임의로 바꿔 단정이 깨진다. |
| `truncation-and-timestamps.spec.ts` 줄 끝 주석 2건(`// day number`·`// HH:MM:SS`) | 2 | 지우면 `\d{1,2}`·`\d{2}:\d{2}:\d{2}` 정규식이 무엇을 보는지 몰라, 날짜 부분을 `\d{2}`로 좁히거나 시간 정규식을 지워 단정 강도를 임의로 바꾼다. |
| `truncation-and-timestamps.spec.ts` 첫·마지막 타임스탬프 비교 | 2 | 지우면 msg-002에 tool_result가 있어 숨을 수 있으므로 비교 대상을 첫 메시지와 마지막 메시지로 정했다는 사실을 몰라, 두 번째 타임스탬프와 비교하도록 고쳐 테스트가 흔들린다. |
| `transcript-direct-download.spec.ts` SigV4 판별 | 2 | 지우면 `X-Amz-Signature`로 '브라우저가 S3에 직접 나간다'와 '백엔드가 바이트를 준다'를 가르는 이유를 몰라, origin 비교만으로 판정하도록 바꿔 LC-AC3의 핵심 보장을 놓친다. |
| `transcript-direct-download.spec.ts` 요청 기록 도우미 | 5 | 지우면 렌더 완료까지 기다려야 모든 다운로드가 끝났다는 사실과, `'/'`로 다시 navigate해야 번들 캐시가 비워진다는 사실을 몰라, 대기·재조회를 줄여 다운로드 개수 단정이 flake 된다. |
| `transcript-direct-download.spec.ts` 서브에이전트 대기 | 1 | 지우면 `subagentLabel` 인자가 왜 필요한지 몰라, 서브에이전트 렌더 대기를 빼 파일이 내려받았다는 증거 없이 개수만 세게 된다. |
| `transcript-direct-download.spec.ts` 금지 위반 정의 | 2 | 지우면 '백엔드 origin이 바이트를 주는 것'이 금지 사항이라는 걸 몰라, 필터를 넓혀 후반 경유까지 허용한다. |
| `transcript-upload-api.spec.ts` Hive 키 규약 | 2 | 지우면 키가 `year=/month=/day=/hour=/session_id=` 규약을 지키고 `S3_PREFIX`가 앞에 올 수 있다는 걸 몰라, 정규식을 고정해 접두사 배포에서 깨진다. |
| `transcript-upload-api.spec.ts` URL 인코딩 | 2 | 지우면 경로의 `=`가 `%3D`로 인코딩되어 비교 전에 `decodeURIComponent`이 필요하다는 걸 몰라, 디코드 없이 비교해 단정이 조용히 실패한다. |
| `transcript-upload-api.spec.ts` 매핑 영속화 관측 | 2 | 지우면 매핑이 SQLite에 있고 다운로드 매니페스트로만 관측된다는 걸 몰라, S3에 매핑 객체를 찾거나 다른 엔드포인트를 검사한다. |
| `transcript-upload-api.spec.ts` 목록 응답 형태 | 2 | 지우면 목록이 `{session_id, created_at}` 요약 객체이고 최신순이라 위치로 집을 수 없다는 걸 몰라, 첫 항목이나 전체 객체를 비교해 단정이 흔들린다. |
| `support/backend-instance.ts` 목킹 정책 근거 | 5 | 지우면 빈 DB·제한된 S3 자격증명 같은 상태를 '요청 가로채기'로 만들어 `docs/e2e-mocking-policy.md`를 위반하게 된다. |
| `support/backend-instance.ts` 기동 중 예외 | 1 | 지우면 빈 catch가 왜 있는지 몰라, 서버 기동 중 연결 거부를 오류로 처리해 헬퍼가 즉시 실패한다. |
| `support/empty-backend.ts` 목킹 정책 근거 | 5 | 지우면 '세션 0개'를 실패가 아니라 데이터 상태로 보고 실제 서버를 빈 DB로 띄우는 이유를 몰라, 목록 응답을 가로채는 구현으로 바꾸고 `docs/e2e-mocking-policy.md`를 위반한다. |
| `support/session-list.ts` spec 아님 | 1 | 지우면 이 파일이 Playwright가 수집하는지 몰라, 여기에 테스트를 추가해도 실행되지 않아 커버리지 공백이 생긴다. |
| `support/session-list.ts` SEEDED_IDS | 4 | 지우면 상대 순서를 목록 배열이 아니라 API 응답에서 얻는다는 걸 몰라, 배열 순서를 최신순으로 고정하거나 임시 세션을 목록에 넣어 다른 spec이 만든 세션에 깨진다. |
| `support/session-list.ts` presigned URL 재작성 | 3 | 지우면 CI에서 presigned URL이 클러스터 내부 S3 호스트를 가리켜 PUT 전에 localhost로 바꾸는 이유를 몰라, CI에서 PUT이 실패한다. |
| `support/session-list.ts` 임시 세션 업로드 | 3 | 지우면 파괴적 spec이 읽기 전용 시드 픽스처를 건드리지 않고 임시 세션을 만드는 이유를 몰라, 정리 없이 시드 세션을 지워 다른 spec이 흔들린다. |
| `support/timeline.ts` spec 아님 | 1 | 지우면 이 파일이 Playwright가 수집하는지 몰라, 여기에 테스트를 추가해도 실행되지 않아 커버리지 공백이 생긴다. |
| `support/timeline.ts` 서브에이전트 그룹 기본 접힘 | 1 | 지우면 서브에이전트 그룹이 접힌 상태가 기본이라는 걸 몰라, 헤더를 클릭해 그룹을 접어 버려 본문이 비어 단정이 조용히 통과하지 않는다. |
| `support/transcript-api.ts` spec 아님 | 1 | 지우면 이 파일이 Playwright가 수집하는지 몰라, 여기에 테스트를 추가해도 실행되지 않아 커버리지 공백이 생긴다. |
| `support/transcript-api.ts` 임시 세션 규칙 | 4 | 지우면 spec마다 고유 id로 임시 세션을 만들고 정리하는 이유를 몰라, 고정 id로 바꿔 CI 재시도 때 충돌하고 공유 백엔드가 오염된다. |
| `support/transcript-api.ts` kind·LocalStack 호스트 재작성 | 6 | 지우면 kind 잡에서 presigned URL이 클러스터 내부 S3 호스트를 가리키고 CI가 그 포트를 포트포워드해 localhost로 바꾸는 이유를 몰라, PUT이 서명 검증이나 연결 단계에서 실패한다. |
| `support/transcript-api.ts` 정리 404 허용 | 1 | 지우면 정리가 '최선 effort'라 404를 삼키는 이유를 몰라, 404를 실패로 다루거나 이미 삭제된 세션을 다시 지우는 경로를 오류로 취급해 spec이 깨진다. |

유지 64줄(L) + 2줄(E)은 위 유지 목록의 28개 항목이 1:1로 덮는다.
