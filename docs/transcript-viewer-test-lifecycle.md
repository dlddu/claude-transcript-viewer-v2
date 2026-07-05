# 테스트 문서: 트랜스크립트 라이프사이클

## 검증 대상 AC
- LC-AC1: presigned PUT URL 업로드 (PRD: 트랜스크립트 라이프사이클)
- LC-AC2: 세션 파일의 단일 디렉토리 공유 (PRD: 트랜스크립트 라이프사이클)
- LC-AC3: 단기 presigned GET 매니페스트 다운로드 (PRD: 트랜스크립트 라이프사이클)
- LC-AC4: 미등록 세션 404 (PRD: 트랜스크립트 라이프사이클)
- LC-AC5: 재시도 안전 삭제 (PRD: 트랜스크립트 라이프사이클)

## 테스트 시나리오

### 시나리오 0-A: 업로드 URL 발급 계약
- **사전 조건**: 실행 중인 백엔드 + S3
- **실행 단계**: `POST /api/transcripts/upload-url/{sessionId}` 호출 → presigned URL로 PUT
- **기대 결과**: 응답에 `url`(presigned)·`method: PUT`·`key`·`session_id`·`expires_in` 포함,
  key가 Hive 규칙(`year=/month=/day=/hour=/session_id=<id>/<id>.jsonl`) 준수,
  객체가 반환된 key 그대로 버킷에 저장, 매니페스트가 SQLite 매핑으로 동일 key 해석,
  잘못된 `file_name`·세션 ID는 400
- **검증 AC**: LC-AC1
- **구현**: `e2e/tests/transcript-upload-api.spec.ts`

### 시나리오 0-B: 세션 파일 프리픽스 공유
- **사전 조건**: 시나리오 0-A와 동일
- **실행 단계**: 메인 업로드 후 `?file_name=subagents/<name>.jsonl`, `?file_name=agent-<name>.jsonl`,
  메인 URL 재발급 각각 호출
- **기대 결과**: 모든 key가 동일 Hive 디렉토리 공유, 재발급 key는 최초와 동일(시계가 아닌
  영속 매핑에서 프리픽스 재사용), 매니페스트에 서브에이전트 파일 전부 노출
- **검증 AC**: LC-AC2
- **구현**: `e2e/tests/transcript-upload-api.spec.ts`

### 시나리오 1: 삭제 API 전체 플로우
- **사전 조건**: seed로 메인 + 서브에이전트 파일이 적재된 세션 존재
- **실행 단계**: `DELETE /api/transcript/session/{id}` 호출
- **기대 결과**: `{"status":"deleted"}` 응답, 세션 Hive 디렉토리의 전 객체 제거,
  이후 동일 세션 GET 시 404
- **검증 AC**: LC-AC5, LC-AC4
- **구현**: `e2e/tests/transcript-delete-api.spec.ts`

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
- **구현**: `e2e/tests/session-id-lookup.spec.ts` (error 케이스)

### 시나리오 3: 매니페스트 기반 브라우저 직접 다운로드
- **사전 조건**: seed로 적재된 세션(서브에이전트 포함)
- **실행 단계**: 프론트엔드에서 세션 룩업 → 매니페스트 수신 → 브라우저가 S3에서 직접 JSONL 다운로드·파싱
- **기대 결과**: main + subagents presigned URL이 포함된 매니페스트, 트랜스크립트 정상 렌더링
- **검증 AC**: LC-AC3
- **구현**: `e2e/tests/session-id-lookup.spec.ts`, `e2e/tests/timeline-integration.spec.ts` (룩업·타임라인 테스트가 이 경로를 경유)
