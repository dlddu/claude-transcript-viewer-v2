# 테스트 문서: 트랜스크립트 라이프사이클

## 검증 대상 AC
- LC-AC1: presigned PUT URL 업로드 (PRD: 트랜스크립트 라이프사이클)
- LC-AC2: 세션 파일의 단일 디렉토리 공유 (PRD: 트랜스크립트 라이프사이클)
- LC-AC3: 단기 presigned GET 매니페스트 다운로드 (PRD: 트랜스크립트 라이프사이클)
- LC-AC4: 미등록 세션 404 (PRD: 트랜스크립트 라이프사이클)
- LC-AC5: 재시도 안전 삭제 (PRD: 트랜스크립트 라이프사이클)

> **AC↔E2E 1:1**: 2026-07-09 기준 LC-AC1~5는 각각 전용 E2E 스펙 파일을 소유한다
> (`transcript-upload-api` / `transcript-session-prefix` / `transcript-direct-download` /
> `transcript-not-found` / `transcript-delete-api`). 이전에는 업로드 스펙이 LC-AC1·AC2를,
> 삭제 스펙이 LC-AC4·AC5를 함께 덮었다. 공유 헬퍼는 `e2e/tests/support/transcript-api.ts`에 있다(스펙 아님).

## 테스트 시나리오

### 시나리오 0-A: 업로드 URL 발급 계약
- **사전 조건**: 실행 중인 백엔드 + S3
- **실행 단계**: `POST /api/transcripts/upload-url/{sessionId}` 호출 → presigned URL로 PUT
- **기대 결과**: 응답에 `url`(presigned)·`method: PUT`·`key`·`session_id`·`expires_in` 포함,
  key가 Hive 규칙(`year=/month=/day=/hour=/session_id=<id>/<id>.jsonl`) 준수,
  객체가 반환된 key 그대로 버킷에 저장, 매니페스트가 SQLite 매핑으로 동일 key 해석,
  잘못된 `file_name`·세션 ID는 400
- **검증 AC**: LC-AC1
- **구현**: `e2e/tests/transcript-upload-api.spec.ts`(LC-AC1 전용 — 발급 계약·Hive key·객체 저장·매핑 영속·400 거부.
  세션 파일의 프리픽스 재사용은 LC-AC2 소관)

### 시나리오 0-B: 세션 파일 프리픽스 공유
- **사전 조건**: 시나리오 0-A와 동일
- **실행 단계**: 메인 업로드 후 `?file_name=subagents/<name>.jsonl`, `?file_name=agent-<name>.jsonl`,
  메인 URL 재발급 각각 호출
- **기대 결과**: 모든 key가 동일 Hive 디렉토리 공유, 재발급 key는 최초와 동일(시계가 아닌
  영속 매핑에서 프리픽스 재사용), 매니페스트에 서브에이전트 파일 전부 노출
- **검증 AC**: LC-AC2
- **구현**: `e2e/tests/transcript-session-prefix.spec.ts`(LC-AC2 전용 — subagents/·bare agent-*.jsonl·메인 재발급이
  모두 최초 Hive 디렉토리를 재사용하고, 재발급 key가 시계가 아닌 영속 매핑에서 나오며, 매니페스트가 서브에이전트
  전량을 노출)

### 시나리오 1: 삭제 API 전체 플로우
- **사전 조건**: seed로 메인 + 서브에이전트 파일이 적재된 세션 존재
- **실행 단계**: `DELETE /api/transcript/session/{id}` 호출
- **기대 결과**: `{"status":"deleted"}` 응답, 세션 Hive 디렉토리의 전 객체 제거,
  이후 동일 세션 GET 시 404(매핑이 마지막에 제거됐다는 증거), 목록에서 제외, 다른 세션 무영향
- **검증 AC**: LC-AC5
- **구현**: `e2e/tests/transcript-delete-api.spec.ts`(LC-AC5 전용)
- **비고**: 미등록 세션의 404 응답 계약 자체는 LC-AC4(`transcript-not-found.spec.ts`) 소관이다. 여기서 단정하는
  404는 "매핑이 실제로 제거됐다"는 증거로 읽는다.

### 시나리오 1-B: 삭제 순서와 재시도 안전성 (재시도 안전 삭제)
- **사전 조건**: 메인 + 서브에이전트가 적재된 세션, S3 `DeleteObject`에 실패를 주입할 수 있는 mock 클라이언트
- **실행 단계**: 객체 스윕 도중(마지막 객체인 메인 / 첫 객체)에 삭제 실패를 주입해 `DeleteTranscriptBySessionId`를 호출하고, 이후 실패를 해제하고 다시 호출
- **기대 결과**:
  - **순서(객체 → 매핑)**: 세션 Hive 디렉토리의 모든 객체를 먼저 삭제한 뒤 SQLite 매핑을 마지막에 제거한다(메인 객체가 스윕의 마지막). 스윕 도중 실패하면 이미 삭제된 앞선 객체와 무관하게 매핑은 그대로 남는다.
  - **재시도 안전성**: 중단된 삭제는 세션을 여전히 조회 가능한 상태로 남긴다(매핑 유지 + 매니페스트가 메인·서브에이전트 전량 해석). 실패가 해소된 뒤 동일 삭제를 재시도하면 객체와 매핑이 모두 제거된다.
- **검증 AC**: LC-AC5 (삭제 순서 객체→매핑, 중단 시 재시도 안전)
- **구현**: `backend/s3_test.go` (`TestDeleteTranscriptBySessionId_DeletesObjectsBeforeMapping`가 객체→매핑 순서와 스윕 실패 시 매핑 잔존을, `TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe`가 중단 후 세션 조회 가능성과 재시도 완결성을 검증; CI의 `go test ./...`로 실행)
- **비고**: 기존 `transcript-delete-api.spec.ts`(시나리오 1)는 정상 삭제 성공·S3 스토리지 제거·404만 단정하고 삭제 순서와 재시도 안전성은 다루지 않았다. AC 이름 그대로인 LC-AC5의 핵심 보장("재시도 안전 삭제")이 실측 미검증이던 공백을 이 백엔드 fault-injection 테스트로 해소했다.

### 시나리오 2: 미등록 세션 조회
- **사전 조건**: SQLite에 매핑이 없는 세션 ID
- **실행 단계**: `GET /api/transcript/session/{id}` 호출
- **기대 결과**: 404 응답, 프론트엔드에서 에러 메시지 표시
- **검증 AC**: LC-AC4
- **구현**: `e2e/tests/transcript-not-found.spec.ts`(LC-AC4 전용 — 미업로드 세션의 GET·DELETE 404와 not-found 에러
  본문, 두 base path(`/api/transcript`·`/api/transcripts`) 모두 404, 삭제 후 미등록 전이)
- **비고**: 이 404를 프론트가 에러 메시지로 보여주는 부분은 LK-AC4(`lookup-failure-feedback.spec.ts`) 소관이다.

### 시나리오 3: 매니페스트 구조와 단기 presigned GET (백엔드 계약)
- **사전 조건**: 실행 중인 백엔드 + S3, 또는 mock presigner/store
- **실행 단계**: `GET /api/transcript/session/{id}` 호출 → 매니페스트 응답 검사, presigned URL로 직접 다운로드
- **기대 결과**: 매니페스트에 `session_id`·`expires_in`·`main`(id/name/key/url)·`subagents[]` 포함,
  각 URL이 presigned GET(서명 포함), TTL이 기본 5분(`DOWNLOAD_URL_TTL_SECONDS`로 조정), 서브에이전트 전량 노출
- **검증 AC**: LC-AC3 (매니페스트 구조·단기 TTL)
- **구현**: `backend/s3_test.go`(`TestGetTranscriptFiles_ReturnsPresignedMain`가 main ref·presigned URL을, `TestGetTranscriptFiles_UsesShortDownloadTTL`가 기본 300초·커스텀 TTL을, `TestGetTranscriptFiles_DiscoversSubagentsInSessionDir`가 서브에이전트 노출을 단정), `backend/s3_integration_test.go`(`X-Amz-Expires` 쿼리·presigned URL 실다운로드), `backend/server_test.go`(`TestHandleGetBySession_ReturnsFileManifest`가 매니페스트 JSON 형태를 단정); 룩업·타임라인 E2E가 이 경로를 실사용으로 경유

### 시나리오 3-B: 브라우저-S3 직결 다운로드·백엔드 미경유 (프론트 로더)
- **사전 조건**: 매니페스트(presigned S3 URL)와 각 파일 응답을 주입할 수 있는 `fetch` 목
- **실행 단계**: `loadTranscript(sessionId)` 호출 후 발생한 모든 `fetch` URL을 수집해 백엔드(`/api/*`) vs 직결-S3(`X-Amz-Signature`)로 분류
- **기대 결과**:
  - **백엔드 미경유**: 백엔드는 매니페스트 1건만 호출되고(`/api/transcript/session/{id}`), 트랜스크립트 바이트를 서빙하는 백엔드 요청이 없다(백엔드 요청 중 `.jsonl`·presigned 서명 URL 없음).
  - **S3 직결**: main과 모든 서브에이전트가 매니페스트의 각 presigned S3 URL 그대로에서 다운로드되며(파일당 정확히 1건), 그 URL은 백엔드 오리진이 아니다.
  - **크기 무관(V3)**: 파일 수가 늘어도 백엔드 요청은 매니페스트 1건으로 일정하고, 직결-S3 다운로드만 파일 수에 비례한다.
- **검증 AC**: LC-AC3 (브라우저-S3 직결, 백엔드 미경유)
- **구현**:
  - E2E: `e2e/tests/transcript-direct-download.spec.ts` — 실제 브라우저에서 세션을 로드하며 발생한 모든 요청을 백엔드(`/api/*`) vs presigned S3(`X-Amz-Signature`)로 분류해, ⓐ 백엔드는 해당 세션 매니페스트 1건만 GET되고 ⓑ 백엔드 오리진이 트랜스크립트 바이트(presigned·`.jsonl`)를 서빙하지 않으며 ⓒ main·서브에이전트가 각자의 presigned S3 URL에서 직결 다운로드되고(파일당 1건) ⓓ 파일 수가 늘어도(main+2 서브에이전트 vs main-only) 백엔드 매니페스트 요청은 1건으로 고정임을 단정한다.
  - 컴포넌트/유닛: `frontend/src/utils/loadTranscript.test.ts`(`describe('loadTranscript')` 내 라우팅 2케이스; CI의 `pnpm --filter @claude-transcript-viewer/frontend test:unit`로 실행)
- **비고**: 기존 `loadTranscript.test.ts`는 파일이 로드·파싱되는 happy-path와 presigned URL이 "하나라도" 쓰였음만 단정하고, AC 이름 그대로인 LC-AC3의 핵심 보장 — 트랜스크립트 바이트가 백엔드를 경유하지 않고 각 파일이 자신의 presigned URL에서 직결 다운로드된다는 것(=V3 "크기 무관한 가벼움"의 근거) — 은 실측 검증되지 않았다. 요청 URL을 백엔드 vs S3로 분류해 단정하는 위 2케이스로 이 공백을 해소했다. (소스를 서브에이전트 다운로드가 백엔드를 경유하도록 변조하면 두 케이스가 즉시 실패함을 확인.) 이후 동일한 백엔드-vs-S3 분류를 **실제 브라우저**에서 수행하는 전용 E2E(`transcript-direct-download.spec.ts`)를 추가해, LC-AC3가 프론트 유닛뿐 아니라 E2E로도 직접 커버되도록 했다(기존에는 룩업/타임라인 E2E의 실사용 경유만 있었다).
