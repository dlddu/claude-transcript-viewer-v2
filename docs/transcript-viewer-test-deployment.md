# 테스트 문서: 단일 워크로드 배포·운영

## 검증 대상 AC
- DP-AC1 ~ DP-AC4 (PRD: 단일 워크로드 배포·운영)

## 테스트 시나리오

### 시나리오 1: 단일 이미지 빌드와 서빙
- **사전 조건**: 루트 Dockerfile
- **실행 단계**: 이미지 빌드 → 컨테이너 기동 → `/api` 및 정적 경로 요청
- **기대 결과**: 빌드 성공, 하나의 컨테이너가 API와 프론트엔드(SPA fallback 포함)를 모두 서빙
- **검증 AC**: DP-AC1
- **구현**: `e2e/tests/docker-build.spec.ts`, `e2e/tests/docker-publish-workflow.spec.mjs`

### 시나리오 2: 캐시 헤더 정책
- **사전 조건**: 정적 파일 서빙 핸들러(`backend/static.go`)
- **실행 단계**: 해시된 `assets/*`와 `index.html` 요청 후 `Cache-Control` 응답 헤더 확인
- **기대 결과**: 해시 자산은 `public, max-age=31536000, immutable`, `index.html`은 `no-cache`
- **검증 AC**: DP-AC2
- **구현**:
  - E2E: `e2e/tests/static-cache-headers.spec.ts` — 배포 구성(빌드된 `frontend/dist`를 서빙하는 Go 서버, `BASE_URL`)에 실제 HTTP 요청을 보내 `index.html`과 SPA fallback 경로는 `no-cache`, 서빙된 `index.html`에서 발견한 content-hash `/assets/*` 파일은 `public, max-age=31536000, immutable`임을 단정한다(해시 파일명은 매 빌드 달라지므로 셸에서 동적으로 추출).
  - 유닛: `backend/static_test.go` (`TestStatic_ServesIndexAtRoot`가 `index.html`의 no-cache를, `TestStatic_HashedAssetsAreImmutable`가 해시 자산의 immutable을 httptest 서버로 검증; CI의 `go test ./...`로 실행)
- **비고**: 기존엔 캐시 정책이 `static_test.go`(httptest + 합성 디렉토리) 유닛 테스트로만 검증되고, 실제 배포되는 바이너리+빌드 산출물이 헤더를 그대로 내보내는지는 E2E로 확인되지 않았다. 위 E2E로 이 공백을 해소해 DP-AC2가 유닛뿐 아니라 E2E로도 커버된다.

### 시나리오 3: k8s 매니페스트 검증
- **사전 조건**: `k8s/app/`, `k8s/localstack/` 매니페스트
- **실행 단계**: 매니페스트의 replica·maxSurge·PVC·Service 구성 정적 검증
- **기대 결과**: 1 replica, `maxSurge: 0`, RWO PVC `/data` 마운트, Service 80→3000
- **검증 AC**: DP-AC3
- **구현**: `e2e/tests/k8s-manifests.spec.ts`, `e2e/tests/k8s-localstack-manifests.spec.ts`

### 시나리오 4: kind + LocalStack 재현 환경 (매니페스트·스크립트 계약)
- **사전 조건**: kind 클러스터 스크립트와 LocalStack 매니페스트
- **실행 단계**: 로컬 kind 클러스터 기동 → seed로 픽스처 적재 → 앱 동작 확인
- **기대 결과**: CI/로컬에서 동일하게 재현, seed 기반 E2E 통과
- **검증 AC**: DP-AC4 (매니페스트·스크립트·워크플로 존재와 구성)
- **구현**: `e2e/tests/kind-cluster-workflow.spec.ts`, `e2e/tests/local-kind-script.spec.ts`

### 시나리오 4-B: seed 서브커맨드가 서버와 동일한 코드 경로로 환경을 재현 (백엔드 계약)
- **사전 조건**: 픽스처 디렉토리, in-memory S3 목(`mockS3Client`)과 임시 SQLite 스토어(`newTestStore`)로 배선한 서비스
- **실행 단계**: `server seed`가 실행하는 바로 그 함수(`seedDir`)를 픽스처 디렉토리에 대해 호출하고, 적재 결과를 서버 자신의 조회 경로(`GetTranscriptFiles` — `GET /api/transcript/session/{id}`가 호출)로 다시 해석
- **기대 결과**:
  - **매핑·키**: 각 세션이 Hive 파티션 프리픽스(`year=/month=/day=/hour=/session_id=`)로 매핑되고, 메인은 `<prefix><session>.jsonl`에, 서브에이전트는 두 레이아웃(`agent-*.jsonl` 직접 배치, `subagents/*.jsonl` 하위 디렉토리) 모두 정확한 키에 원본 바이트로 업로드된다. 픽스처 외 잉여 객체는 없다.
  - **동일 코드 경로/재현성(핵심)**: 적재 직후 `GetTranscriptFiles`가 각 세션의 메인과 모든 서브에이전트를 그대로 해석한다 — 즉 seed가 실행 중 서버(따라서 CI의 E2E)가 의존하는 상태를 정확히 재현함을 단정한다.
  - **실제 CI 코퍼스**: CI가 넘기는 바로 그 디렉토리(`e2e/fixtures`)를 seed하면 상단 `*.jsonl` 세션 전부가 서버 조회로 해석되고, 서브에이전트를 가진 유일 픽스처(`session-abc123`)가 두 서브에이전트를 노출한다.
  - **CLI 계약**: `--dir` 없이 실행하면 스토어/S3를 건드리기 전에 즉시 실패한다.
- **검증 AC**: DP-AC4 (seed의 업로드·매핑·서브에이전트 발견이 서버 조회 경로와 정합 = 재현성의 근거)
- **구현**: `backend/seed_test.go` (`TestSeedDir_PopulatesStorageForServerReadPath`가 3개 레이아웃과 서버-읽기-경로 해석을, `TestSeedDir_RealFixturesReproduceServerEnvironment`가 실제 `e2e/fixtures` 코퍼스 재현을, `TestRunSeed_RequiresDir`가 CLI 계약을 검증; CI의 `go test ./...`로 실행)
- **비고**: 기존 시나리오 4의 두 스펙은 워크플로 YAML과 `kind-setup.sh` 문자열을 정적으로 검사할 뿐 `seedDir`/`seedSubagents`의 실제 동작은 다루지 않았다. seed는 CI 재현의 핵심 경로임에도(`.github/workflows/test.yml`가 `./backend/server seed --dir e2e/fixtures`를 실행) 결정적 테스트가 전무해, AC 이름 그대로인 DP-AC4의 핵심 보장 — "seed가 서버와 동일한 코드 경로로 업로드·매핑하여 CI가 환경을 재현" — 이 실측 미검증이었다. 위 백엔드 테스트로 이 공백을 해소했다(seed가 메인을 잘못된 키에 올리거나·서브에이전트 레이아웃을 누락하거나·매핑을 건너뛰도록 변조하면 즉시 실패함을 확인).
