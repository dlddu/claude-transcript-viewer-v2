# 테스트 문서: 세션 목록

## 검증 대상 AC
- SL-AC1 ~ SL-AC6 (PRD: 세션 목록)

> **구현 상태**: 아래 시나리오는 계획이며, 대응 테스트/구현은 아직 존재하지 않는다.
> SL-AC1~6은 상태 추적 문서에서 미검증 AC(구현·테스트 대기)로 관리한다.
> 구현 시 각 시나리오의 "구현(계획)" 경로에 실제 스펙을 채운다.

## 테스트 시나리오

### 시나리오 1: 목록 조회 API 응답
- **사전 조건**: 서브에이전트 유/무가 섞인 여러 세션을 seed로 적재
- **실행 단계**: `GET /api/transcripts` 호출
- **기대 결과**: 각 항목이 `session_id`, `created_at`, `file_count`(메인 + 서브에이전트)를 포함,
  파일 수가 실제 적재 레이아웃과 일치
- **검증 AC**: SL-AC1
- **구현(계획)**: `backend/server_test.go`(핸들러 응답 스키마), `e2e/tests/session-list.spec.ts`

### 시나리오 2: 목록 렌더링·최신순 정렬·반응형
- **사전 조건**: 업로드 시각이 서로 다른 세션 3개 이상
- **실행 단계**: 메인 페이지 진입 → "Sessions" 탭 전환 → 데스크톱/모바일 뷰포트 확인
- **기대 결과**: 세 번째 탭으로 목록 표시(기본 활성은 여전히 "Message UUID"),
  최신 업로드순 정렬, 각 항목에 ID·날짜·파일 수 표시, 375×667·360×640에서 가로 스크롤 없음
- **검증 AC**: SL-AC2
- **구현(계획)**: `frontend/src/components/SessionList.test.tsx`, `e2e/tests/session-list.spec.ts`

### 시나리오 3: 검색·필터
- **사전 조건**: 세션 여러 개 적재된 목록
- **실행 단계**: 검색 입력에 세션 ID 일부 입력 → 이어서 검색어 비우기 → 일치 없는 문자열 입력
- **기대 결과**: 부분 일치 항목만 실시간 표시, 검색어 초기화 시 전체 복귀,
  일치 없음 시 "일치하는 세션 없음" 안내
- **검증 AC**: SL-AC3
- **구현(계획)**: `frontend/src/components/SessionList.test.tsx`, `e2e/tests/session-list.spec.ts`

### 시나리오 4: 클릭으로 세션 열기
- **사전 조건**: 목록에 표시된 유효한 세션
- **실행 단계**: 목록 항목 클릭
- **기대 결과**: 로딩 상태 표시 후 트랜스크립트 로드·통합 타임라인 뷰 전환,
  트랜스크립트 파일은 presigned URL로 브라우저-S3 직결(백엔드 미경유)
- **검증 AC**: SL-AC4
- **구현(계획)**: `e2e/tests/session-list.spec.ts`(로드 경로는 기존 `loadTranscript.test.ts` 라우팅 검증 재사용)

### 시나리오 5: 목록에서 재시도 안전 삭제
- **사전 조건**: 삭제 대상 세션이 목록에 존재
- **실행 단계**: 항목 삭제 실행 → 확인 → (별도) 삭제 도중 실패 주입 후 재조회
- **기대 결과**: 확인 후 `DELETE /api/transcript/session/{id}` 호출·성공 시 목록에서 제거,
  삭제 중단/실패 시 항목 유지 및 세션 재조회 가능(LC-AC5 객체 → 매핑 순서·재시도 안전 보장 재사용)
- **검증 AC**: SL-AC5
- **구현(계획)**: `e2e/tests/session-list.spec.ts`(UI 흐름), `backend/s3_test.go` 기존
  fault-injection 테스트(`TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe`)가 삭제 안전성 보장

### 시나리오 6: 빈 상태·로딩·실패
- **사전 조건**: (a) 세션 0개 (b) 지연된 목록 응답 (c) 목록 API 500
- **실행 단계**: 각 상태에서 "Sessions" 탭 진입
- **기대 결과**: (a) "저장된 세션이 없습니다" 안내 + 룩업/업로드 힌트, (b) 로딩 상태 표시,
  (c) 조회 실패 에러 메시지
- **검증 AC**: SL-AC6
- **구현(계획)**: `frontend/src/components/SessionList.test.tsx`, `e2e/tests/session-list.spec.ts`
