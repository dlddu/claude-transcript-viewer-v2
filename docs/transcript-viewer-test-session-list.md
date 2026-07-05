# 테스트 문서: 세션 목록

## 검증 대상 AC
- SL-AC1 ~ SL-AC6 (PRD: 세션 목록)

> **구현 상태**: SL-AC1~6은 **file_count를 제외하고 구현·검증**되었다. 아래 각 시나리오의
> "구현" 경로에 실제 테스트를 명시한다. file_count(세션당 파일 수)는 범위에서 제외되어
> 시나리오 1·2에서 제거했으며, 상태 추적 문서에 SL-AC1/AC2의 잔여로 기록한다.

## 테스트 시나리오

### 시나리오 1: 목록 조회 API 응답
- **사전 조건**: 여러 세션을 seed로 적재(seed가 픽스처마다 결정적 `created_at` 부여)
- **실행 단계**: `GET /api/transcripts` 호출
- **기대 결과**: 각 항목이 `session_id`·`created_at`을 포함하고, 목록이 `created_at`
  내림차순(최신순)으로 정렬 (file_count는 범위 제외)
- **검증 AC**: SL-AC1
- **구현**: `backend/server_test.go`(`TestHandleList_ReturnsSessionSummaries` — 응답 스키마·순서 보존),
  `backend/store_test.go`(`TestStore_ListSessionsOrdersByCreatedAtDesc`),
  `backend/s3_test.go`(`TestListTranscripts_OrderedNewestFirst`), `e2e/tests/session-list.spec.ts`

### 시나리오 2: 목록 렌더링·최신순 정렬·반응형
- **사전 조건**: 업로드 시각이 서로 다른 세션 3개 이상(seed가 결정적 `created_at` 부여)
- **실행 단계**: 메인 페이지 진입 → "Sessions" 탭 전환 → 데스크톱/모바일 뷰포트 확인
- **기대 결과**: 세 번째 탭으로 목록 표시(기본 활성은 여전히 "Message UUID"),
  최신 업로드순 정렬(백엔드 `created_at` DESC → 받은 순 렌더), 각 항목에 ID·날짜 표시(파일 수 제외),
  375×667·360×640에서 가로 스크롤 없음
- **검증 AC**: SL-AC2
- **구현**: `frontend/src/components/SessionList.test.tsx`(렌더·순서·UTC 날짜 포맷),
  `frontend/src/components/LookupTabs.test.tsx`(세 탭 렌더·전환), `e2e/tests/session-list.spec.ts`(최신순 관계·반응형)

### 시나리오 3: 검색·필터
- **사전 조건**: 세션 여러 개 적재된 목록
- **실행 단계**: 검색 입력에 세션 ID 일부 입력 → 이어서 검색어 비우기 → 일치 없는 문자열 입력
- **기대 결과**: 부분 일치 항목만 실시간 표시, 검색어 초기화 시 전체 복귀,
  일치 없음 시 "일치하는 세션 없음" 안내
- **검증 AC**: SL-AC3
- **구현**: `frontend/src/components/SessionList.test.tsx`(대소문자 무관 필터·결과 없음·초기화 복귀),
  `e2e/tests/session-list.spec.ts`

### 시나리오 4: 클릭으로 세션 열기
- **사전 조건**: 목록에 표시된 유효한 세션
- **실행 단계**: 목록 항목 클릭
- **기대 결과**: 트랜스크립트 로드·통합 타임라인 뷰 전환,
  트랜스크립트 파일은 presigned URL로 브라우저-S3 직결(백엔드 미경유)
- **검증 AC**: SL-AC4
- **구현**: `frontend/src/components/SessionList.test.tsx`(행 클릭 시 `onSessionLookup(id)` 호출),
  `e2e/tests/session-list.spec.ts`(클릭 → 타임라인 뷰 표시); 브라우저-S3 직결은
  기존 `frontend/src/utils/loadTranscript.test.ts` 라우팅 검증(LC-AC3) 재사용

### 시나리오 5: 목록에서 재시도 안전 삭제
- **사전 조건**: 삭제 대상 세션이 목록에 존재
- **실행 단계**: 항목 삭제 실행 → 확인 → (별도) 삭제 도중 실패 주입 후 재조회
- **기대 결과**: 확인 후 `DELETE /api/transcript/session/{id}` 호출·성공 시 목록에서 제거,
  삭제 중단/실패 시 항목 유지 및 세션 재조회 가능(LC-AC5 객체 → 매핑 순서·재시도 안전 보장 재사용)
- **검증 AC**: SL-AC5
- **구현**: `frontend/src/components/SessionList.test.tsx`(확인 → 삭제 → 행 제거, 취소 시 미호출,
  실패 시 행 유지 + 에러), `e2e/tests/session-list.spec.ts`(fresh 업로드 세션 삭제 → 목록 제거),
  `backend/s3_test.go` 기존 fault-injection 테스트
  (`TestDeleteTranscriptBySessionId_InterruptedDeleteIsRetrySafe`)가 삭제 순서·재시도 안전성 보장

### 시나리오 6: 빈 상태·로딩·실패
- **사전 조건**: (a) 세션 0개 (b) 지연된 목록 응답 (c) 목록 API 500
- **실행 단계**: 각 상태에서 "Sessions" 탭 진입
- **기대 결과**: (a) "저장된 세션이 없습니다"(No sessions stored yet) 안내 + 룩업/업로드 힌트,
  (b) 로딩 상태 표시, (c) 조회 실패 에러 메시지
- **검증 AC**: SL-AC6
- **구현**: `frontend/src/components/SessionList.test.tsx`(빈 상태·로딩 중·목록 API 실패 세 상태를
  결정적으로 단정). 세 상태 모두 공유 seeded 백엔드에서 E2E로 강제하기 어려워 컴포넌트 테스트로 검증한다.
