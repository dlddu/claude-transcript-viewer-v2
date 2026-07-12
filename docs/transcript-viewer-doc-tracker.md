# Claude Transcript Viewer v2 문서 체계 상태 추적

## 현재 상태 요약
- 정의된 가치: 4개 (V1~V4)
- PRD: 5개 (lifecycle, viewer, lookup, deployment, session-list)
- Acceptance Criteria: 25개 (가치 연결됨: 25개 / 미연결: 0개)
- 테스트 문서: 5개 (AC 커버됨: 25개 / 미커버: 0개 — SL-AC1~6 검증 완료(file_count 제외); file_count는 SL-AC1/AC2의 잔여로 별도 추적)
- AC↔E2E 1:1: **25/25** ✅ (모든 AC가 전용 E2E 스펙 파일 하나를 배타적으로 소유. 1:N·N:1·고아 스펙 모두 0건)
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
- **삭제 완료(2026-07-09)**: `docker-publish-workflow.spec.mjs`(30 단정), `kind-cluster-workflow.spec.ts`(26 단정).
  둘 다 `.github/workflows/*.yml`을 자체 정규식 파서로 읽어 워크플로 이름·트리거·jobs 섹션·GHCR 태그 규칙 등을
  단정했을 뿐, 어떤 AC의 문장에도 대응하지 않았다. DP-AC1/AC4 배지를 달고 있어 이전 감사에서 "고아 없음"으로
  집계됐다.
- **부분 고아 정리(2026-07-09)**: 순수 주석/문서 존재 단정 7개를 삭제했다 — `k8s-manifests`의 Secret
  "usage instructions in comments" 1개, `kind-localstack-environment`(구 kind-script 파트)의 "usage
  instructions"·"prerequisites in comments"·"required tools"·"setup steps description"·프론트/백엔드
  "how to access" 6개. 모두 파일에 특정 단어가 있는지만 보던 것으로 제품 가치가 아니다. 실제 동작을 보던
  단정(스크립트가 kind/kubectl/docker 설치를 체크하는가, AWS 자격증명·엔드포인트·S3 버킷 생성, 클린업
  `kind delete cluster`, port-forward 구성)은 남겼다.
- **부분 고아 제거 완료(2026-07-09)**: 파일 안에 섞여 있던 AC 밖 단정을 두 단계로 정리했다.
  - 순수 주석/문서 존재 단정 7개 삭제(위 항목).
  - "AC엔 없지만 배포 품질을 지키던" 가드레일 단정 19개 삭제 — **삭제로 결정**(AC 승격 안 함).
    - `docker-build`(9): `.dockerignore` 존재 + 내용 5개(node_modules·.git·테스트·README 제외),
      `EXPOSE 3000`, non-root 유저, 이미지 300MB 미만. 남긴 것: 단일 이미지·`VITE_API_URL` 없는 빌드·
      STATIC_DIR 복사·CGO·entrypoint·빌드·런타임 서빙(전부 DP-AC1).
    - `k8s-manifests`(6): ConfigMap credential 평문 금지, Label Consistency 2개(app 라벨·selector 매칭),
      Best Practices 3개(imagePullPolicy·securityContext·namespace).
    - `kind-localstack-environment`(4): LocalStack Label Consistency 2개, 공식 이미지 사용, `:latest` 금지.
  - 근거: 제품이 약속하는 단위는 AC이고, 이 단정들은 어떤 AC에도 대응하지 않는다. 이미지 크기·non-root·
    라벨 정합성 등은 실질적 가드였지만, "AC에 없으면 제품 가치가 아니다"를 끝까지 적용해 삭제했다. 되살리려면
    DP AC에 해당 문장을 추가하고 테스트를 매핑하면 된다.
- **문서 미언급 유닛 테스트 매핑 완료(2026-07-09)**: 7개 유닛 테스트를 해당 AC 시나리오의 구현/단위 라인에 명시했다.
  - `parseUuid.test.ts` → LK-AC3(UUID 추출)·LK-AC4("No UUID found" 근거)
  - `groupMessages.test.ts` → VW-AC1·VW-AC2(타임라인 그룹핑)
  - `enrichMessages.test.ts` → VW-AC1(필터·텍스트·서브에이전트 판정)·VW-AC4(tool_use 집계)
  - `useTranscriptData.test.ts` → LK-AC2(룩업 데이터 로드)·LC-AC3(S3 직결 다운로드)
  - `TranscriptViewer.test.tsx` → VW-AC1/AC2/AC3(뷰어 컴포넌트)
  - `SessionIdLookup.test.tsx` → LK-AC2·LK-AC4
  - `MessageUuidLookup.test.tsx` → LK-AC3·LK-AC4
  - `useTranscriptData`의 `caching` describe(2개)는 삭제했다. 어떤 AC도 클라이언트측 트랜스크립트 캐싱을 요구하지
    않는다(DP-AC2는 정적 자산의 HTTP `Cache-Control` 헤더로 별개). 가드레일 단정과 같은 근거로 정리했다.

### AC↔E2E 1:1 (달성)
모든 AC가 전용 E2E 스펙 파일 하나를 배타적으로 소유한다(양방향 1:1). 스펙 25개 ↔ AC 25개.

- 1:N 0건, N:1 0건, 파일 단위 고아 스펙 0건, 문서에만 존재하는 스펙 0건
- 마지막 4건(DP-AC4, VW-AC4~6)은 AC 문장이 두 보장을 접속사로 묶고 있어 스펙이 갈려 있었다.
  **AC 분할 대신 스펙 병합**을 택했다(2026-07-09). 병합된 파일 안에서 두 보장은 별도 describe
  블록으로 남으므로, 나중에 AC를 쪼개기로 하면 파일도 그 경계에서 다시 갈라진다.
  - DP-AC4 ← `local-kind-script` + `k8s-localstack-manifests` → `kind-localstack-environment`
  - VW-AC4 ← `tool-detail-view` + `task-tool-subagent-type` → `tool-call-display`
  - VW-AC5 ← `text-truncation` + `message-timestamps` → `truncation-and-timestamps`
  - VW-AC6 ← `mobile-layout` + `tool-call-compact` → `mobile-layout`
- 유지 규칙: 새 스펙을 추가할 때는 먼저 어느 AC를 덮는지 정하고, 그 AC가 이미 스펙을 갖고 있으면
  새 파일을 만들지 말고 기존 파일에 describe를 더한다. 덮을 AC가 없으면 그 테스트는 제품 가치가
  아니므로 작성하지 않는다.

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
| 2026-07-09 | AC↔E2E 1:1 정비 2단계 — 복합 스펙 분할: `session-list.spec.ts`(SL-AC1~5 혼재) → `session-list-api`·`session-list-order`·`session-list-search`·`session-list-open`·`session-list-delete` 5개로, `timeline-integration.spec.ts`(VW-AC1~3 혼재) → `timeline-unified`·`timeline-distinction`·`timeline-expand-collapse` 3개로 분리. 공유 픽스처/헬퍼는 `e2e/tests/support/{session-list,timeline}.ts`로 추출(Playwright 기본 testMatch가 `*.spec.ts`만 수집하므로 자동 실행되지 않음). SL-AC6은 E2E가 아예 없던 유일한 AC였는데, `page.route`로 `GET /api/transcripts`만 가로채(빈 배열/응답 보류/500) 빈 상태·로딩·실패를 실제 브라우저에서 단정하는 `session-list-states.spec.ts` 신설로 해소. SL-AC1도 전용 API 계약 스펙을 얻음. 스펙 22개·테스트 106개 수집 확인(`playwright test --list`), 신규 파일 타입 에러 0 | 1:1 달성 3/25 (DP-AC2, LC-AC3, LK-AC1), E2E 없는 AC 1건(SL-AC6) | 1:1 달성 12/25, E2E 없는 AC 0건, 고아 스펙 0건 |
| 2026-07-09 | AC↔E2E 1:1 정비 3단계 — N:1(스펙 하나가 AC 여러 개) 전량 해소: 얽힘의 축이던 LK-AC4(실패 피드백)·LC-AC4(미등록 404)에 전용 스펙 `lookup-failure-feedback.spec.ts`·`transcript-not-found.spec.ts`를 신설하고, `session-id-lookup`(LK-AC2)·`message-uuid-lookup`(LK-AC3)·`transcript-delete-api`(LC-AC5)에서 해당 단정을 걷어냈다. 함께 `transcript-upload-api.spec.ts`(LC-AC1·AC2 혼재)를 LC-AC1 전용으로 좁히고 LC-AC2를 `transcript-session-prefix.spec.ts`로 분리했다. upload/delete 스펙이 복붙하던 S3 클라이언트·업로드 헬퍼는 `e2e/tests/support/transcript-api.ts`로 추출. 스펙 25개·테스트 109개 수집 확인(`playwright test --list`), 신규/수정 파일 타입 에러 0 | 1:1 12/25, N:1 4건(`session-id-lookup`, `message-uuid-lookup`, `transcript-upload-api`, `transcript-delete-api`) | 1:1 19/25, N:1 0건. 남은 6건은 전부 1:N이며 AC 분할이 선행 과제 |
| 2026-07-09 | AC 없는 테스트 제거 — `docker-publish-workflow.spec.mjs`(30 단정)·`kind-cluster-workflow.spec.ts`(26 단정) 삭제. 두 스펙은 워크플로 YAML을 자체 파서로 읽어 "워크플로 이름이 정의됐는가", "jobs 섹션이 있는가" 등을 단정했고 어떤 AC에도 대응하지 않았다(후자는 자신을 실행하는 `test.yml`을 검사). CI의 `workflow-validation-tests` job과 `kind-cluster-validation`의 워크플로 검증 스텝을 함께 제거. `k8s-localstack-manifests.spec.ts`를 DP-AC3 → DP-AC4로 재매핑(내용은 전부 LocalStack 매니페스트). 남은 부분 고아 단정(≈100개)은 파일 단위로 처리할 수 없어 백로그에 명시 | 1:1 19/25, 고아 테스트 0건으로 오집계 | 1:1 21/25, 파일 단위 고아 0건. 남은 4건은 전부 1:N이며 스펙 병합으로 처리 예정 |
| 2026-07-09 | AC↔E2E 1:1 완료 — 마지막 1:N 4건을 스펙 병합으로 해소. `local-kind-script` + `k8s-localstack-manifests` → `kind-localstack-environment`(DP-AC4), `tool-detail-view` + `task-tool-subagent-type` → `tool-call-display`(VW-AC4), `text-truncation` + `message-timestamps` → `truncation-and-timestamps`(VW-AC5), `tool-call-compact` → `mobile-layout`(VW-AC6). AC를 쪼개지 않고 스펙을 합친 이유: AC 문장은 제품이 약속하는 단위이고, 파일 분리는 그 약속을 지키는 수단일 뿐이다. CI는 Playwright가 `workers: 1`이라 병합해도 러닝타임이 같고, `kind-cluster-validation` job은 병합으로 비어 kubectl이 있는 `k8s-manifest-validation` job으로 흡수했다(job 8 → 7). 병합 후 `kind-localstack-environment` 실행 62 tests / 0 fail / 3 skip(kubectl 부재), Playwright 수집 22 파일 109 테스트, 신규 타입 에러 0(잔존 `window` 에러 51건은 main과 동일한 사전 존재분) | 1:1 21/25, 1:N 4건 | **1:1 25/25**, 1:N·N:1·고아 0건 |
