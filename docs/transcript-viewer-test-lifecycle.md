# 테스트 문서: 트랜스크립트 라이프사이클

## 검증 대상 AC
- LC-AC3: 단기 presigned GET 매니페스트 다운로드 (PRD: 트랜스크립트 라이프사이클)
- LC-AC4: 미등록 세션 404 (PRD: 트랜스크립트 라이프사이클)
- LC-AC5: 재시도 안전 삭제 (PRD: 트랜스크립트 라이프사이클)

> ⚠️ LC-AC1(업로드 URL 발급), LC-AC2(단일 디렉토리 공유)는 현재 직접 E2E가 없다.
> seed 서브커맨드가 동일 코드 경로를 사용하므로 간접 검증만 존재한다. (상태 추적 문서의 미검증 AC 참조)

## 테스트 시나리오

### 시나리오 1: 삭제 API 전체 플로우
- **사전 조건**: seed로 메인 + 서브에이전트 파일이 적재된 세션 존재
- **실행 단계**: `DELETE /api/transcript/session/{id}` 호출
- **기대 결과**: `{"status":"deleted"}` 응답, 세션 Hive 디렉토리의 전 객체 제거,
  이후 동일 세션 GET 시 404
- **검증 AC**: LC-AC5, LC-AC4
- **구현**: `e2e/tests/transcript-delete-api.spec.ts`

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
