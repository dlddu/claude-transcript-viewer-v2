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
- **구현**: `backend/static_test.go` (`TestStatic_ServesIndexAtRoot`가 `index.html`의 no-cache를, `TestStatic_HashedAssetsAreImmutable`가 해시 자산의 immutable을 검증; CI의 `go test ./...`로 실행)

### 시나리오 3: k8s 매니페스트 검증
- **사전 조건**: `k8s/app/`, `k8s/localstack/` 매니페스트
- **실행 단계**: 매니페스트의 replica·maxSurge·PVC·Service 구성 정적 검증
- **기대 결과**: 1 replica, `maxSurge: 0`, RWO PVC `/data` 마운트, Service 80→3000
- **검증 AC**: DP-AC3
- **구현**: `e2e/tests/k8s-manifests.spec.ts`, `e2e/tests/k8s-localstack-manifests.spec.ts`

### 시나리오 4: kind + LocalStack 재현 환경
- **사전 조건**: kind 클러스터 스크립트와 LocalStack 매니페스트
- **실행 단계**: 로컬 kind 클러스터 기동 → seed로 픽스처 적재 → 앱 동작 확인
- **기대 결과**: CI/로컬에서 동일하게 재현, seed 기반 E2E 통과
- **검증 AC**: DP-AC4
- **구현**: `e2e/tests/kind-cluster-workflow.spec.ts`, `e2e/tests/local-kind-script.spec.ts`
