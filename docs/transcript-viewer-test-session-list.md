# 테스트 문서: 세션 목록

## 검증 대상 AC
- SL-AC1 ~ SL-AC6 (PRD: 세션 목록)

> **구현 상태**: SL-AC1~6은 **file_count를 제외하고 구현·검증**되었다. 아래 각 시나리오의
> "구현" 경로에 실제 테스트를 명시한다. file_count(세션당 파일 수)는 범위에서 제외되어
> 시나리오 1·2에서 제거했으며, 상태 추적 문서에 SL-AC1/AC2의 잔여로 기록한다.
>
> **AC↔E2E 1:1**: 2026-07-09 기준 각 SL-AC는 전용 E2E 스펙 파일 하나를 소유한다
> (SL-AC1 `session-list-api`, SL-AC2 `session-list-order`, SL-AC3 `session-list-search`,
> SL-AC4 `session-list-open`, SL-AC5 `session-list-delete`, SL-AC6 `session-list-states`).
> 이전에는 `e2e/tests/session-list.spec.ts` 한 파일이 SL-AC1~5를 한꺼번에 덮고 SL-AC6은
> E2E가 없었다. 공유 헬퍼는 `e2e/tests/support/session-list.ts`에 있다(스펙 아님).

## 테스트 시나리오

### 시나리오 1: 목록 조회 API 응답
- **사전 조건**: 여러 세션을 seed로 적재(seed가 픽스처마다 결정적 `created_at` 부여)
- **실행 단계**: `GET /api/transcripts` 호출
- **기대 결과**: 각 항목이 `session_id`·`created_at`을 포함하고, 목록이 `created_at`
  내림차순(최신순)으로 정렬 (file_count는 범위 제외)
- **검증 AC**: SL-AC1
- **구현**: `e2e/tests/session-list-api.spec.ts`(SL-AC1 전용 — 실서버 응답의 `{session_id, created_at}` 스키마·
  RFC3339 파싱·`created_at` DESC·seed 세션 전량 노출·업로드 즉시 목록 반영을 단정)

### 시나리오 2: 목록 렌더링·최신순 정렬·반응형
- **사전 조건**: 업로드 시각이 서로 다른 세션 3개 이상(seed가 결정적 `created_at` 부여)
- **실행 단계**: 메인 페이지 진입 → "Sessions" 탭 전환 → 데스크톱/모바일 뷰포트 확인
- **기대 결과**: 세 번째 탭으로 목록 표시(기본 활성은 여전히 "Message UUID"),
  최신 업로드순 정렬(백엔드 `created_at` DESC → 받은 순 렌더), 각 항목에 ID·날짜 표시(파일 수 제외),
  375×667·360×640에서 가로 스크롤 없음
- **검증 AC**: SL-AC2
- **구현**: `e2e/tests/session-list-order.spec.ts`(SL-AC2 전용 — API가 준 순서를 UI가 보존하는지,
  각 행의 ID·UTC 날짜 표기를 단정. 순서의 출처인 API 계약 자체는 SL-AC1 소관)

### 시나리오 3: 검색·필터
- **사전 조건**: 세션 여러 개 적재된 목록
- **실행 단계**: 검색 입력에 세션 ID 일부 입력 → 이어서 검색어 비우기 → 일치 없는 문자열 입력
- **기대 결과**: 부분 일치 항목만 실시간 표시, 검색어 초기화 시 전체 복귀,
  일치 없음 시 "일치하는 세션 없음" 안내
- **검증 AC**: SL-AC3
- **구현**: `e2e/tests/session-list-search.spec.ts`(SL-AC3 전용 — 부분 일치·대소문자 무관·초기화 복귀·결과 없음)

### 시나리오 4: 클릭으로 세션 열기
- **사전 조건**: 목록에 표시된 유효한 세션
- **실행 단계**: 목록 항목 클릭
- **기대 결과**: 트랜스크립트 로드·통합 타임라인 뷰 전환,
  트랜스크립트 파일은 presigned URL로 브라우저-S3 직결(백엔드 미경유)
- **검증 AC**: SL-AC4
- **구현**: `e2e/tests/session-list-open.spec.ts`(SL-AC4 전용 — 클릭 → 타임라인 뷰 전환 → back 복귀)

### 시나리오 5: 목록에서 재시도 안전 삭제
- **사전 조건**: 삭제 대상 세션이 목록에 존재
- **실행 단계**: 항목 삭제 실행 → 확인 → (별도) 삭제 도중 실패 주입 후 재조회
- **기대 결과**: 확인 후 `DELETE /api/transcript/session/{id}` 호출·성공 시 목록에서 제거,
  삭제 중단/실패 시 항목 유지 및 세션 재조회 가능(LC-AC5 객체 → 매핑 순서·재시도 안전 보장 재사용)
- **검증 AC**: SL-AC5
- **구현**: `e2e/tests/session-list-delete.spec.ts`(SL-AC5 전용 — throwaway 업로드 세션을 확인 후 삭제해
  목록 UI·백엔드 양쪽에서 제거, 확인 취소 시 행·세션 유지)
- **비고**: 삭제 순서(객체→매핑)·재시도 안전성 자체는 LC-AC5 소관이다(목록 UI는 그 삭제 API를 호출할 뿐).

### 시나리오 6: 빈 상태·로딩·실패
- **사전 조건**: (a) 세션 0개 (b) 지연된 목록 응답 (c) 목록 API 500
- **실행 단계**: 각 상태에서 "Sessions" 탭 진입
- **기대 결과**: (a) "저장된 세션이 없습니다"(No sessions stored yet) 안내 + 룩업/업로드 힌트,
  (b) 로딩 상태 표시, (c) 조회 실패 에러 메시지
- **검증 AC**: SL-AC6
- **구현**: `e2e/tests/session-list-states.spec.ts`(SL-AC6 전용 — 빈 상태·로딩·실패 세 상태)
- **비고**: 세 상태는 공유 seeded 백엔드(항상 세션이 있고, 빠르고, 성공한다)에서 강제할 수 없어, E2E가
  `page.route`로 `GET /api/transcripts` 응답만 브라우저 경계에서 가로챈다(빈 배열 / 응답 보류 / 500). 스텁 대상은
  목록 엔드포인트 하나뿐이며, 컴포넌트 상태 머신·마크업·문구는 실물 그대로다.
