# 테스트 문서: 단일 워크로드 배포·운영

## 검증 대상 AC
- DP-AC1 ~ DP-AC4 (PRD: 단일 워크로드 배포·운영)

> **AC 없는 테스트 제거(2026-07-09)**: `docker-publish-workflow.spec.mjs`(30 단정)와
> `kind-cluster-workflow.spec.ts`(26 단정)를 삭제했다. 두 스펙은 `.github/workflows/*.yml`을
> 자체 정규식 파서로 읽어 "워크플로 이름이 정의되어 있는가", "jobs 섹션이 있는가", "GHCR 태그
> 규칙이 쓰였는가" 따위를 단정했는데, 이 중 어떤 것도 DP-AC1~4의 문장에 대응하지 않는다.
> AC에 없으면 제품 가치가 아니므로 남길 이유가 없다. (특히 `kind-cluster-workflow.spec.ts`는
> 자신을 실행하는 `test.yml`을 검사하고 있었다.)

## 테스트 시나리오

### 시나리오 1: 단일 이미지 빌드와 서빙
- **사전 조건**: 루트 Dockerfile
- **실행 단계**: 이미지 빌드 → 컨테이너 기동 → `/api` 및 정적 경로 요청
- **기대 결과**: 빌드 성공, 하나의 컨테이너가 API와 프론트엔드(SPA fallback 포함)를 모두 서빙
- **검증 AC**: DP-AC1
- **구현**: `e2e/tests/docker-build.spec.ts`(멀티스테이지 빌드·`VITE_API_URL` 없는 프론트 빌드·
  이미지 빌드 성공·단일 컨테이너의 API + 정적 서빙)

### 시나리오 2: 캐시 헤더 정책
- **사전 조건**: 정적 파일 서빙 핸들러(`backend/static.go`)
- **실행 단계**: 해시된 `assets/*`와 `index.html` 요청 후 `Cache-Control` 응답 헤더 확인
- **기대 결과**: 해시 자산은 `public, max-age=31536000, immutable`, `index.html`은 `no-cache`
- **검증 AC**: DP-AC2
- **구현**: `e2e/tests/static-cache-headers.spec.ts` — 배포 구성(빌드된 `frontend/dist`를 서빙하는 Go 서버, `BASE_URL`)에 실제 HTTP 요청을 보내 `index.html`과 SPA fallback 경로는 `no-cache`, 서빙된 `index.html`에서 발견한 content-hash `/assets/*` 파일은 `public, max-age=31536000, immutable`임을 단정한다(해시 파일명은 매 빌드 달라지므로 셸에서 동적으로 추출).

### 시나리오 3: 앱 매니페스트의 단일 라이터 롤아웃 구성
- **사전 조건**: `k8s/app/` 매니페스트
- **실행 단계**: 매니페스트의 replica·maxSurge·PVC·Service 구성 정적 검증
- **기대 결과**: 1 replica, `maxSurge: 0`, RWO PVC `/data` 마운트, Service 80→3000
- **검증 AC**: DP-AC3
- **구현**: `e2e/tests/k8s-manifests.spec.ts`
- **비고**: `k8s/localstack/` 매니페스트는 DP-AC3(SQLite 단일 라이터 롤아웃)이 아니라
  DP-AC4(kind + LocalStack 재현 환경)의 대상이므로 시나리오 4로 옮겼다.

### 시나리오 4: kind + LocalStack 재현 환경 (매니페스트·스크립트 계약)
- **사전 조건**: kind 클러스터 스크립트와 LocalStack 매니페스트
- **실행 단계**: 로컬 kind 클러스터 기동 → seed로 픽스처 적재 → 앱 동작 확인
- **기대 결과**: CI/로컬에서 동일하게 재현, seed 기반 E2E 통과
- **검증 AC**: DP-AC4 (매니페스트·스크립트의 존재와 구성)
- **구현**: `e2e/tests/kind-localstack-environment.spec.ts`(DP-AC4 전용 — `scripts/kind-setup.sh`·
  `scripts/kind-config.yaml`과 `k8s/localstack/` 매니페스트를 한 파일에서 검증. 이전의
  `local-kind-script.spec.ts` + `k8s-localstack-manifests.spec.ts`를 병합했다)
- **비고**: "CI 파이프라인에서 seed 기반 E2E 통과"는 파이프라인이 실제로 통과하는 것으로 확인되지,
  워크플로 YAML에 특정 문자열이 있는지 단정해서 확인되지 않는다. 그 단정을 하던
  `kind-cluster-workflow.spec.ts`는 삭제했고, seed의 실제 동작은 아래 시나리오 4-B가 덮는다.

### 시나리오 4-B: seed가 채운 환경에서 E2E 스위트가 통과 (CI 파이프라인)
- **사전 조건**: `kind-e2e-tests` 잡이 빌드한 앱 이미지로 kind 클러스터를 구성하고 LocalStack + 앱을 배포한 상태
- **실행 단계**: pod 안에서 앱의 `server seed --dir /tmp/fixtures`(`e2e/fixtures` 복사본)를 실행해 LocalStack S3·SQLite를 채운 뒤, 그 클러스터에 대해 E2E 스위트 전체를 실행
- **기대 결과**: seed가 서버와 동일한 코드 경로로 픽스처를 업로드·매핑했으므로, seeded 환경에 의존하는 E2E들 — `session-abc123`과 두 서브에이전트를 조회하는 lookup·timeline·direct-download 등 — 이 통과한다. seed가 키를 틀리거나·서브에이전트 레이아웃을 누락하거나·매핑을 건너뛰면 이 E2E들이 실패해 재현 실패를 드러낸다.
- **검증 AC**: DP-AC4 (CI 파이프라인에서 seed 기반 E2E 통과 = 환경 재현성)
- **구현**: `.github/workflows/test.yml`의 `kind-e2e-tests` 잡 — step "Seed transcripts into LocalStack and SQLite"가 pod에서 `server seed`를 실행하고, 이어서 `pnpm --filter @claude-transcript-viewer/e2e test`가 E2E 스위트 전체를 실행한다. 개별 스펙은 각자의 AC(LK/VW/LC 등)에 매핑되며, DP-AC4의 검증은 "그 스위트가 seed로 채운 환경에서 통과함" 자체다.
- **비고**: 이 방식은 DP-AC4의 검증 방법("CI 파이프라인에서 seed 기반 E2E 통과 확인")을 그대로 실현한다. seed 로직(`seedDir`/`seedSubagents`)의 결정적 단위 커버리지는 AC↔E2E 매핑 밖의 코드 레벨에서 유지된다.
