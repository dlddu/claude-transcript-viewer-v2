# PRD: 단일 워크로드 배포·운영

## 달성 가치
- V4: 운영 부담 최소화 — 하나의 이미지, 하나의 워크로드, SQLite 인덱스, 재현 가능한 로컬/CI 환경

## Acceptance Criteria

### DP-AC1: 단일 이미지·단일 워크로드
- **설명**: 루트 Dockerfile이 프론트엔드 빌드 → Go 빌드 → 런타임을 하나의 이미지로 만든다.
  Go 서버가 유일한 워크로드로서 `/api/*`는 JSON API를, 그 외 경로는 `STATIC_DIR`의
  정적 프론트엔드 번들을 SPA fallback(`index.html`)과 함께 서빙한다.
  프론트엔드는 `VITE_API_URL` 없이 빌드되어 자신을 서빙한 동일 오리진의 API를 호출한다.
- **달성 가치**: V4
- **검증 방법**: 이미지 빌드 성공, 단일 컨테이너에서 API·정적 서빙·SPA fallback 동작 확인

### DP-AC2: 정적 자산 캐시 정책
- **설명**: 해시된 `assets/*`는 immutable 캐시 헤더로, `index.html`은 `no-cache`로 서빙하여
  배포 시 stale 프론트엔드 문제 없이 CDN/브라우저 캐시를 활용한다.
- **달성 가치**: V4
- **검증 방법**: 두 경로의 Cache-Control 응답 헤더 확인

### DP-AC3: SQLite 단일 라이터 안전 롤아웃
- **설명**: SQLite는 단일 라이터만 허용하므로 Deployment는 1 replica, `maxSurge: 0`으로
  구성되어 롤아웃 시 이전 파드가 ReadWriteOnce PVC(`/data`)를 해제한 뒤 새 파드가 마운트한다.
- **달성 가치**: V4
- **검증 방법**: k8s 매니페스트의 replica/maxSurge/PVC 설정 검증

### DP-AC4: 재현 가능한 로컬·CI 환경
- **설명**: kind 클러스터 + LocalStack(S3 에뮬레이션) 매니페스트와 로컬 실행 스크립트를 제공하고,
  `server seed --dir <fixtures>` 서브커맨드가 서버와 동일한 코드 경로로 픽스처를
  S3에 업로드하고 매핑을 기록하여 CI가 환경을 재현한다.
- **달성 가치**: V4
- **검증 방법**: 매니페스트·스크립트 검증 및 CI 파이프라인에서 seed 기반 E2E 통과 확인
