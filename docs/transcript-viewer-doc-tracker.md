# Claude Transcript Viewer v2 문서 체계 상태 추적

## 현재 상태 요약
- 정의된 가치: 4개 (V1~V4)
- PRD: 4개 (lifecycle, viewer, lookup, deployment)
- Acceptance Criteria: 19개 (가치 연결됨: 19개 / 미연결: 0개)
- 테스트 문서: 4개 (AC 커버됨: 17개 / 미커버: 2개)
- **건강 상태**: ⚠️ 위험 있음 — 고아 가치(소유자 미정) 4건, 미검증 AC 2건

## 연결 매트릭스

| 가치 | PRD | AC | 테스트 | 상태 |
|------|-----|-----|--------|------|
| V1: 대화 구조의 시각적 이해 | prd-viewer | VW-AC1~6 | test-viewer | ✅ 완전 |
| V2: 즉각적인 대화 탐색 | prd-lookup, prd-lifecycle | LK-AC1~4, LC-AC4 | test-lookup, test-lifecycle | ✅ 완전 |
| V3: 크기 무관한 가벼움 | prd-lifecycle | LC-AC1, LC-AC2, LC-AC3 | test-lifecycle (LC-AC3만) | ⚠️ LC-AC1·2 미검증 |
| V4: 운영 부담 최소화 | prd-lifecycle, prd-deployment | LC-AC1, LC-AC5, DP-AC1~4 | test-lifecycle, test-deployment | ⚠️ LC-AC1 미검증 |

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
- 🟢 LC-AC1 (presigned PUT URL 업로드) — 업로드 URL 발급 API에 대한 직접 E2E 없음. seed 서브커맨드가 동일 코드 경로를 사용해 간접 검증만 존재. 권장: `POST /api/transcripts/upload-url/{sessionId}` 응답과 SQLite 매핑을 검증하는 E2E 추가.
- 🟢 LC-AC2 (세션 파일 단일 디렉토리 공유) — `?file_name=` 후속 업로드의 프리픽스 재사용에 대한 직접 E2E 없음. 권장: 메인 + 서브에이전트 업로드 후 키 프리픽스 일치 검증 E2E 추가.

### 고아 테스트 (AC를 참조하지 않는 테스트)
- (없음)

## 변경 이력

| 시점 | 변경 내용 | 이전 상태 | 이후 상태 |
|------|-----------|-----------|-----------|
| 2026-07-04 | 문서 체계 최초 구축: 가치 4개, PRD 4개, AC 19개, 테스트 문서 4개 | 문서 없음 | 위험 2종(고아 가치, 미검증 AC 2건) 포함 초기 상태 |
