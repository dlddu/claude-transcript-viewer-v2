# Claude Transcript Viewer v2 문서 체계 상태 추적

## 현재 상태 요약
- 정의된 가치: 4개 (V1~V4)
- PRD: 4개 (lifecycle, viewer, lookup, deployment)
- Acceptance Criteria: 19개 (가치 연결됨: 19개 / 미연결: 0개)
- 테스트 문서: 4개 (AC 커버됨: 19개 / 미커버: 0개)
- **건강 상태**: ⚠️ 위험 있음 — 고아 가치(소유자 미정) 4건

## 연결 매트릭스

| 가치 | PRD | AC | 테스트 | 상태 |
|------|-----|-----|--------|------|
| V1: 대화 구조의 시각적 이해 | prd-viewer | VW-AC1~6 | test-viewer | ✅ 완전 |
| V2: 즉각적인 대화 탐색 | prd-lookup, prd-lifecycle | LK-AC1~4, LC-AC4 | test-lookup, test-lifecycle | ✅ 완전 |
| V3: 크기 무관한 가벼움 | prd-lifecycle | LC-AC1, LC-AC2, LC-AC3 | test-lifecycle | ✅ 완전 |
| V4: 운영 부담 최소화 | prd-lifecycle, prd-deployment | LC-AC1, LC-AC5, DP-AC1~4 | test-lifecycle, test-deployment | ✅ 완전 |

## 위험 진단

### 고아 가치 (소유자 없는 가치)
- 🔴 V1, V2, V3, V4 전체 — 제품 소유자 미정. 소유자 확정 시 가치 문서의 소유자 항목을 갱신하고 이 항목을 해소할 것.

### 미정렬 문서 (가치 참조 없는 문서)
- (없음)

### 무가치 PRD (가치를 달성하지 않는 PRD)
- (없음)

### AC 없는 PRD
- (없음)

### 미연결 AC (가치와 연결되지 않은 AC)
- (없음)

### 미검증 AC (테스트 없는 AC)
- (없음) — 2026-07-04 `e2e/tests/transcript-upload-api.spec.ts` 추가로 LC-AC1·LC-AC2 해소
- 2026-07-04 VW-AC5(절단) 실측 공백 해소: `text-truncation.spec.ts`가 전부 `test.skip`(미구현 UI 가정)이라 절단이 실제로 검증되지 않던 상태였음. 스펙을 실제 구현/픽스처에 맞게 활성화하고, 툴 ID·경로 절단을 타임라인 렌더로 단정하는 `frontend/src/components/TranscriptViewer.truncation.test.tsx`를 추가하여 해소.
- 2026-07-05 LC-AC5(재시도 안전 삭제) 실측 공백 해소: `transcript-delete-api.spec.ts`가 정상 삭제·S3 스토리지 제거·404만 단정하고, AC 이름 그대로인 핵심 보장 — 삭제 순서(객체 → 매핑)와 중단 시 재시도 안전성 — 은 검증하지 않던 상태였음. mock S3 `DeleteObject`에 실패를 주입하는 백엔드 테스트 2건(`TestDeleteTranscriptBySessionId_DeletesObjectsBeforeMapping`, `TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe`)을 `backend/s3_test.go`에 추가하여 해소.
- 2026-07-05 LC-AC3(단기 presigned GET 매니페스트) 실측 공백 해소: 매니페스트 구조·단기 TTL은 백엔드 테스트(`backend/s3_test.go`·`backend/s3_integration_test.go`·`backend/server_test.go`)로 이미 검증되고 있었으나 test-lifecycle 문서에는 룩업/타임라인 E2E "경유"로만 매핑돼 있었음(매핑 보정). 더 중요하게, AC 이름 그대로인 핵심 보장 — 브라우저가 각 파일을 자신의 presigned S3 URL에서 직결 다운로드하고 트랜스크립트 바이트가 백엔드를 경유하지 않는다는 것(=V3 "크기 무관한 가벼움"의 근거) — 은 실측 미검증이었음. `frontend/src/utils/loadTranscript.test.ts`에 요청 URL을 백엔드(`/api/*`) vs 직결-S3(`X-Amz-Signature`)로 분류해 "백엔드는 매니페스트 1건만, 트랜스크립트 파일은 전부 presigned URL 직결, 파일 수가 늘어도 백엔드 요청은 1건 고정"을 단정하는 라우팅 테스트 2건을 추가하여 해소(변조 시 즉시 실패 확인).

### 고아 테스트 (AC를 참조하지 않는 테스트)
- (없음)

## 변경 이력

| 시점 | 변경 내용 | 이전 상태 | 이후 상태 |
|------|-----------|-----------|-----------|
| 2026-07-04 | 문서 체계 최초 구축: 가치 4개, PRD 4개, AC 19개, 테스트 문서 4개 | 문서 없음 | 위험 2종(고아 가치, 미검증 AC 2건) 포함 초기 상태 |
| 2026-07-04 | 업로드 API 직접 E2E 추가 (transcript-upload-api.spec.ts), test-lifecycle 문서 갱신 | 미검증 AC 2건 (LC-AC1, LC-AC2) | 미검증 AC 0건, 잔여 위험: 고아 가치만 |
| 2026-07-04 | 전 AC 커버리지 실측 검증 완료. DP-AC2 검증처 매핑 오류 수정(docker-build.spec.ts → backend/static_test.go) | 미검증 AC 0건(문서 매핑 1건 오류) | 미검증 AC 0건, 매핑 정합, 잔여 위험: 고아 가치만 |
| 2026-07-04 | VW-AC5 절단 실측 공백 해소: `text-truncation.spec.ts`가 전부 `test.skip`(미구현 UI 가정, 실제 truncate 규칙과 어긋난 기대값)이라 절단이 검증되지 않던 상태 발견. 스펙을 실제 구현·seed 픽스처에 맞게 활성화(파일 경로 절단 시 원본 디렉토리 미노출까지 단정)하고, 타임라인 렌더로 긴 툴 ID·깊은/얕은 경로 절단을 단정하는 컴포넌트 통합 테스트 추가 | VW-AC5 절단 실측 미검증(E2E 전량 skip) | VW-AC5 절단 실측 검증(컴포넌트 통합 3케이스 그린 + E2E 활성), 잔여 위험: 고아 가치만 |
| 2026-07-05 | LC-AC5 재시도 안전 삭제 실측 공백 해소: 매핑된 `transcript-delete-api.spec.ts`가 happy-path(정상 삭제·스토리지 제거·404)만 단정하고 AC의 핵심인 삭제 순서(객체 → 매핑)·중단 시 재시도 안전성은 검증하지 않던 상태 발견. mock S3 `DeleteObject`에 실패 주입 훅을 도입하고, 스윕 도중 실패 시 매핑 잔존·재시도 완결을 단정하는 백엔드 테스트 2건을 `backend/s3_test.go`에 추가 | LC-AC5 순서·재시도 안전성 실측 미검증(happy-path만 단정) | LC-AC5 순서·재시도 안전성 실측 검증(백엔드 fault-injection 2케이스 그린), 잔여 위험: 고아 가치만 |
| 2026-07-05 | LC-AC3 브라우저-S3 직결·백엔드 미경유 실측 공백 해소: 매니페스트 구조·단기 TTL은 백엔드 테스트로 이미 검증되나 문서 매핑은 E2E "경유"로만 돼 있었고(보정), AC의 핵심인 "트랜스크립트 바이트 백엔드 미경유·파일별 presigned URL 직결"은 미검증이던 상태 발견. `frontend/src/utils/loadTranscript.test.ts`에 fetch URL을 백엔드 vs S3로 분류해 백엔드 요청이 매니페스트 1건으로 고정되고 파일 바이트는 전부 S3 직결임을 단정하는 라우팅 테스트 2건 추가 | LC-AC3 브라우저 직결·백엔드 미경유 실측 미검증(happy-path 렌더만) | LC-AC3 직결·미경유 실측 검증(프론트 라우팅 2케이스 그린) + 문서 매핑 보정, 잔여 위험: 고아 가치만 |
