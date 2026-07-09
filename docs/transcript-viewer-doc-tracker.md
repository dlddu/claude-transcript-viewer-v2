# Claude Transcript Viewer v2 문서 체계 상태 추적

## 현재 상태 요약
- 정의된 가치: 4개 (V1~V4)
- PRD: 5개 (lifecycle, viewer, lookup, deployment, session-list)
- Acceptance Criteria: 25개 (가치 연결됨: 25개 / 미연결: 0개)
- 테스트 문서: 5개 (AC 커버됨: 25개 / 미커버: 0개 — SL-AC1~6 검증 완료(file_count 제외); file_count는 SL-AC1/AC2의 잔여로 별도 추적)
- **건강 상태**: ⚠️ 위험 있음 — 고아 가치(소유자 미정) 4건 (미검증 AC 0건; session-list의 file_count는 잔여 후속 작업)

## 연결 매트릭스

| 가치 | PRD | AC | 테스트 | 상태 |
|------|-----|-----|--------|------|
| V1: 대화 구조의 시각적 이해 | prd-viewer (+prd-session-list) | VW-AC1~6 (+SL-AC1~2) | test-viewer (+test-session-list) | ✅ 완전 (SL file_count 잔여) |
| V2: 즉각적인 대화 탐색 | prd-lookup, prd-lifecycle (+prd-session-list) | LK-AC1~4, LC-AC4 (+SL-AC1~6) | test-lookup, test-lifecycle (+test-session-list) | ✅ 완전 (SL file_count 잔여) |
| V3: 크기 무관한 가벼움 | prd-lifecycle | LC-AC1, LC-AC2, LC-AC3 | test-lifecycle | ✅ 완전 |
| V4: 운영 부담 최소화 | prd-lifecycle, prd-deployment (+prd-session-list) | LC-AC1, LC-AC5, DP-AC1~4 (+SL-AC5) | test-lifecycle, test-deployment (+test-session-list) | ✅ 완전 |

> `(+...)` 표기는 2026-07-05 추가된 session-list PRD의 기여다. SL-AC1~6은 구현·검증 완료이며
> (파일 수 file_count만 SL-AC1/AC2의 잔여로 후속 작업), 전 가치의 커버리지는 ✅ 완전이다.

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
- (없음 — 전 AC 검증 완료. 아래 잔여 1건과 과거 해소 이력 참조)
- 🟡 **잔여: session-list file_count (SL-AC1/AC2의 "파일 수" 표시)** — 세션당 파일 수(메인 + 서브에이전트)는
  이번 범위에서 제외되어 미구현이다. SL-AC1/AC2의 나머지(ID·`created_at`·최신순·검색·열기·삭제·상태)는
  모두 검증되었고, file_count 표시만 후속 작업으로 분리한다(백엔드 산출 방식 — 세션당 S3 나열 vs 업로드
  시점 저장 — 결정 포함). 별도 작업 착수 시 해소한다.
- 2026-07-05 **SL-AC1~6(session-list, file_count 제외) 해소**: 백엔드 목록 스키마를 `[]string` →
  `[{session_id, created_at}]`(`created_at` DESC)로 확장하고, 시각 주입 seam(`Store.PutSessionAt`)과 seed의
  결정적 `created_at`을 도입했다. 프론트에 `SessionList` 컴포넌트와 세 번째 "Sessions" 탭을 추가하여
  렌더·최신순·검색·클릭 열기·재시도 안전 삭제·빈/로딩/실패를 단위(`store_test`/`s3_test`/`server_test`/
  `seed_test`)·컴포넌트(`SessionList.test.tsx`/`LookupTabs.test.tsx`)·E2E(`session-list.spec.ts`)로 검증했다.
  (상세는 변경 이력 참조.)
- (기존 AC 19개는 모두 검증 완료 — 아래는 과거 해소 이력)
- 2026-07-04 `e2e/tests/transcript-upload-api.spec.ts` 추가로 LC-AC1·LC-AC2 해소
- 2026-07-04 VW-AC5(절단) 실측 공백 해소: `text-truncation.spec.ts`가 전부 `test.skip`(미구현 UI 가정)이라 절단이 실제로 검증되지 않던 상태였음. 스펙을 실제 구현/픽스처에 맞게 활성화하고, 툴 ID·경로 절단을 타임라인 렌더로 단정하는 `frontend/src/components/TranscriptViewer.truncation.test.tsx`를 추가하여 해소.
- 2026-07-05 LC-AC5(재시도 안전 삭제) 실측 공백 해소: `transcript-delete-api.spec.ts`가 정상 삭제·S3 스토리지 제거·404만 단정하고, AC 이름 그대로인 핵심 보장 — 삭제 순서(객체 → 매핑)와 중단 시 재시도 안전성 — 은 검증하지 않던 상태였음. mock S3 `DeleteObject`에 실패를 주입하는 백엔드 테스트 2건(`TestDeleteTranscriptBySessionId_DeletesObjectsBeforeMapping`, `TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe`)을 `backend/s3_test.go`에 추가하여 해소.
- 2026-07-05 LC-AC3(단기 presigned GET 매니페스트) 실측 공백 해소: 매니페스트 구조·단기 TTL은 백엔드 테스트(`backend/s3_test.go`·`backend/s3_integration_test.go`·`backend/server_test.go`)로 이미 검증되고 있었으나 test-lifecycle 문서에는 룩업/타임라인 E2E "경유"로만 매핑돼 있었음(매핑 보정). 더 중요하게, AC 이름 그대로인 핵심 보장 — 브라우저가 각 파일을 자신의 presigned S3 URL에서 직결 다운로드하고 트랜스크립트 바이트가 백엔드를 경유하지 않는다는 것(=V3 "크기 무관한 가벼움"의 근거) — 은 실측 미검증이었음. `frontend/src/utils/loadTranscript.test.ts`에 요청 URL을 백엔드(`/api/*`) vs 직결-S3(`X-Amz-Signature`)로 분류해 "백엔드는 매니페스트 1건만, 트랜스크립트 파일은 전부 presigned URL 직결, 파일 수가 늘어도 백엔드 요청은 1건 고정"을 단정하는 라우팅 테스트 2건을 추가하여 해소(변조 시 즉시 실패 확인).
- 2026-07-05 VW-AC1(서브에이전트 없는 세션 정상 렌더링) 실측 공백 해소: 통합 타임라인 AC의 "서브에이전트가 없는 세션도 정상 렌더링한다" 절반이 실측 미검증이던 상태였음. `timeline-integration.spec.ts`의 'should handle sessions with no subagents gracefully'는 beforeEach가 적재한 서브에이전트 포함 픽스처(session-abc123)를 그대로 쓰면서 에러 미발생만 단정하는 decoy였고(주석: "would need a different fixture without subagents. For now, testing the timeline can handle mixed content"), 컴포넌트 테스트의 'should handle messages without agentId field gracefully'는 메시지 1건 렌더만 확인했음. E2E를 서브에이전트 없는 seed 세션(session-xyz789)을 실제 로드해 서브에이전트 그룹 0개를 단정하도록 보정하고, 서브에이전트 없는 세션이 전 메시지를 시간순으로 렌더+그룹 미생성+`agentId==세션ID` 메인 취급을 단정하는 `frontend/src/components/TranscriptViewer.no-subagents.test.tsx`(4케이스)를 추가하여 해소.
- 2026-07-05 DP-AC4(seed 서브커맨드의 동일 코드 경로 재현) 실측 공백 해소: DP-AC4에 매핑된 `kind-cluster-workflow.spec.ts`·`local-kind-script.spec.ts`는 워크플로 YAML과 `kind-setup.sh` 문자열을 정적 검사할 뿐, AC 이름 그대로인 핵심 보장 — `server seed`가 서버와 동일한 코드 경로로 픽스처를 S3에 업로드·매핑하여 CI가 환경을 재현한다는 것 — 을 검증하지 않았다. seed는 CI 재현의 핵심 경로임에도(`.github/workflows/test.yml`가 `./backend/server seed --dir e2e/fixtures`를 실행) `seedDir`/`seedSubagents`에 결정적 테스트가 전무했다. 3개 서브에이전트 레이아웃 적재 후 서버 조회 경로(`GetTranscriptFiles`)로 메인·서브에이전트 해석을 단정하고, 실제 `e2e/fixtures` 코퍼스 재현과 `--dir` CLI 계약까지 검증하는 백엔드 테스트 3건(`TestSeedDir_PopulatesStorageForServerReadPath`, `TestSeedDir_RealFixturesReproduceServerEnvironment`, `TestRunSeed_RequiresDir`)을 `backend/seed_test.go`에 추가하여 해소(잘못된 키·서브에이전트 레이아웃 누락·매핑 생략으로 변조 시 즉시 실패 확인).

### 고아 테스트 (AC를 참조하지 않는 테스트)
- (없음)

### 문서 정합성 주의 (신규 기능이 기존 문서에 주는 영향)
- ✅ **[해소] LK-AC1 "두 탭 표시" ↔ session-list "Sessions" 탭**: SL-AC2가 `LookupTabs`에 세 번째 탭을
  추가함에 따라 2026-07-05 정합성을 맞췄다. prd-lookup LK-AC1 서술을 "세 탭"으로 갱신(룩업 두 탭 +
  Sessions 탭, 기본 활성 "Message UUID" 유지)하고, test-lookup 시나리오 1의 "두 탭" 기대값을 "룩업 두 탭
  표시(Sessions는 SL-AC2 소관)"로 명확화했다. `e2e/tests/lookup-tabs.spec.ts`는 탭 개수를 단정하지 않고
  두 룩업 탭의 표시·기본 활성·전환만 확인하므로 무변경(그린 유지); 컴포넌트 테스트
  `LookupTabs.test.tsx`의 탭 개수 단정만 2 → 3으로 갱신했다.
- 참고 — V2 서술 범위: 가치 문서 V2 설명은 "세션 ID 또는 메시지 UUID만으로"라는 두 식별자 경로를 열거하지만,
  session-list는 동일 가치(즉각적인 대화 탐색·낮은 입력 마찰)에 브라우징 경로를 더한 것이다. 가치 자체 변경은
  아니며, 원하면 V2 설명에 브라우징 경로를 추가하는 문구 갱신을 선택적으로 진행할 수 있다.

## 변경 이력

| 시점 | 변경 내용 | 이전 상태 | 이후 상태 |
|------|-----------|-----------|-----------|
| 2026-07-04 | 문서 체계 최초 구축: 가치 4개, PRD 4개, AC 19개, 테스트 문서 4개 | 문서 없음 | 위험 2종(고아 가치, 미검증 AC 2건) 포함 초기 상태 |
| 2026-07-04 | 업로드 API 직접 E2E 추가 (transcript-upload-api.spec.ts), test-lifecycle 문서 갱신 | 미검증 AC 2건 (LC-AC1, LC-AC2) | 미검증 AC 0건, 잔여 위험: 고아 가치만 |
| 2026-07-04 | 전 AC 커버리지 실측 검증 완료. DP-AC2 검증처 매핑 오류 수정(docker-build.spec.ts → backend/static_test.go) | 미검증 AC 0건(문서 매핑 1건 오류) | 미검증 AC 0건, 매핑 정합, 잔여 위험: 고아 가치만 |
| 2026-07-04 | VW-AC5 절단 실측 공백 해소: `text-truncation.spec.ts`가 전부 `test.skip`(미구현 UI 가정, 실제 truncate 규칙과 어긋난 기대값)이라 절단이 검증되지 않던 상태 발견. 스펙을 실제 구현·seed 픽스처에 맞게 활성화(파일 경로 절단 시 원본 디렉토리 미노출까지 단정)하고, 타임라인 렌더로 긴 툴 ID·깊은/얕은 경로 절단을 단정하는 컴포넌트 통합 테스트 추가 | VW-AC5 절단 실측 미검증(E2E 전량 skip) | VW-AC5 절단 실측 검증(컴포넌트 통합 3케이스 그린 + E2E 활성), 잔여 위험: 고아 가치만 |
| 2026-07-05 | LC-AC5 재시도 안전 삭제 실측 공백 해소: 매핑된 `transcript-delete-api.spec.ts`가 happy-path(정상 삭제·스토리지 제거·404)만 단정하고 AC의 핵심인 삭제 순서(객체 → 매핑)·중단 시 재시도 안전성은 검증하지 않던 상태 발견. mock S3 `DeleteObject`에 실패 주입 훅을 도입하고, 스윕 도중 실패 시 매핑 잔존·재시도 완결을 단정하는 백엔드 테스트 2건을 `backend/s3_test.go`에 추가 | LC-AC5 순서·재시도 안전성 실측 미검증(happy-path만 단정) | LC-AC5 순서·재시도 안전성 실측 검증(백엔드 fault-injection 2케이스 그린), 잔여 위험: 고아 가치만 |
| 2026-07-05 | LC-AC3 브라우저-S3 직결·백엔드 미경유 실측 공백 해소: 매니페스트 구조·단기 TTL은 백엔드 테스트로 이미 검증되나 문서 매핑은 E2E "경유"로만 돼 있었고(보정), AC의 핵심인 "트랜스크립트 바이트 백엔드 미경유·파일별 presigned URL 직결"은 미검증이던 상태 발견. `frontend/src/utils/loadTranscript.test.ts`에 fetch URL을 백엔드 vs S3로 분류해 백엔드 요청이 매니페스트 1건으로 고정되고 파일 바이트는 전부 S3 직결임을 단정하는 라우팅 테스트 2건 추가 | LC-AC3 브라우저 직결·백엔드 미경유 실측 미검증(happy-path 렌더만) | LC-AC3 직결·미경유 실측 검증(프론트 라우팅 2케이스 그린) + 문서 매핑 보정, 잔여 위험: 고아 가치만 |
| 2026-07-05 | VW-AC1 서브에이전트 없는 세션 렌더링 실측 공백 해소: `timeline-integration.spec.ts`의 no-subagent 테스트가 서브에이전트 포함 픽스처(session-abc123)를 쓰던 decoy이고 컴포넌트 테스트도 메시지 1건 렌더만 확인하던 상태 발견. E2E를 session-xyz789(서브에이전트 없는 seed 세션) 실제 로드 + 서브에이전트 그룹 0개 단정으로 보정하고, no-subagent 렌더링(전 메시지 시간순 렌더·그룹 미생성·agentId==세션ID 메인 취급)을 결정적으로 단정하는 컴포넌트 테스트 4케이스 추가 | VW-AC1 no-subagent 렌더링 실측 미검증(E2E decoy + 컴포넌트 단건 렌더) | VW-AC1 no-subagent 렌더링 실측 검증(컴포넌트 4케이스 그린 + E2E 정직화), 잔여 위험: 고아 가치만 |
| 2026-07-05 | DP-AC4 seed 동일 코드 경로 재현 실측 공백 해소: DP-AC4 매핑 스펙 2건이 워크플로/스크립트 문자열만 정적 검사하고 `server seed`의 실제 업로드·매핑 동작(=CI 재현의 핵심 경로)은 결정적 테스트가 전무하던 상태 발견. 3개 서브에이전트 레이아웃 적재 후 서버 조회 경로(`GetTranscriptFiles`)로 해석을 단정하고 실제 `e2e/fixtures` 재현·CLI 계약을 검증하는 백엔드 테스트 3건을 `backend/seed_test.go`에 추가 | DP-AC4 seed 동일 코드 경로·재현성 실측 미검증(정적 문자열 검사만) | DP-AC4 seed 재현성 실측 검증(백엔드 3케이스 그린, `go test ./...`), 잔여 위험: 고아 가치만 |
| 2026-07-05 | session-list 기능 문서 추가: PRD(`prd-session-list`, SL-AC1~6)·테스트 문서(`test-session-list`) 생성, V2(+V1/V4)에 연결. 백엔드 `GET /api/transcripts`(세션 ID 배열)는 이미 존재하나 응답 스키마 확장·프론트 UI·테스트는 미구현이라 SL-AC1~6을 미검증 AC로 등록. LK-AC1 "두 탭"↔Sessions 탭 정합성 주의 기록 | PRD 4개·AC 19개·테스트 4개, 잔여 위험: 고아 가치만 | PRD 5개·AC 25개·테스트 5개, 잔여 위험: 고아 가치 4건 + 미검증 AC 6건(session-list) |
| 2026-07-05 | session-list 기능 구현(file_count 제외): 백엔드 목록 스키마 `[]string` → `[{session_id, created_at}]`(`created_at` DESC), 시각 주입 seam(`Store.PutSessionAt`)·seed 결정적 `created_at` 도입. 프론트 `SessionList` 컴포넌트 + 세 번째 "Sessions" 탭 추가(렌더·최신순·검색·클릭 열기·재시도 안전 삭제·빈/로딩/실패). 단위(`store_test`/`s3_test`/`server_test`/`seed_test`)·컴포넌트(`SessionList.test.tsx`/`LookupTabs.test.tsx`)·E2E(`session-list.spec.ts`) 검증, upload/delete E2E를 객체 배열 스키마로 갱신, LK-AC1 "두 탭"→"세 탭" 정합성 해소 | 미검증 AC 6건(SL-AC1~6, 구현·테스트 대기), 잔여 위험: 고아 가치 4건 + session-list 미검증 | 미검증 AC 0건(SL-AC1~6 검증 완료; file_count는 SL-AC1/AC2의 잔여로 후속), 잔여 위험: 고아 가치 4건 + file_count 후속 |
| 2026-07-07 | AC↔E2E 1:1 정비 시작 — LC-AC3 전용 E2E 추가: 브라우저-S3 직결·백엔드 미경유를 실제 브라우저에서 분류·단정하는 `e2e/tests/transcript-direct-download.spec.ts` 신설. 기존 LC-AC3의 E2E 커버리지는 룩업/타임라인 스펙의 실사용 "경유"뿐이었고 핵심 보장은 프론트 유닛(`loadTranscript.test.ts`)에만 있었음. test-lifecycle 시나리오 3-B 구현/비고 갱신 | LC-AC3 전용 E2E 부재(프론트 유닛 + 간접 경유만) | LC-AC3 전용 E2E 보유(E2E 2케이스 그린 대기: CI 풀스택) |
| 2026-07-07 | DP-AC2 전용 E2E 추가: 배포 구성의 실제 Go 서버 응답 헤더를 검증하는 `e2e/tests/static-cache-headers.spec.ts` 신설(`index.html`·SPA fallback=no-cache, `/assets/*` 해시 파일=immutable). 기존엔 `static_test.go` httptest 유닛만 존재. 실제 서버 기동+`curl`로 헤더 3종을 사전 실측 확인. test-deployment 시나리오 2 구현/비고 갱신 | DP-AC2 전용 E2E 부재(백엔드 유닛만) | DP-AC2 전용 E2E 보유(실서버 헤더 실측 통과, 3케이스) |
