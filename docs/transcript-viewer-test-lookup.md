# 테스트 문서: 세션 룩업

## 검증 대상 AC
- LK-AC1 ~ LK-AC4 (PRD: 세션 룩업)

> **AC↔E2E 1:1**: 2026-07-09 기준 LK-AC1~4는 각각 전용 E2E 스펙 파일을 소유한다
> (`lookup-tabs` / `session-id-lookup` / `message-uuid-lookup` / `lookup-failure-feedback`).
> 이전에는 LK-AC4(실패 피드백)가 두 룩업 스펙에 흩어져 있어 두 스펙이 각각 2~3개 AC를 덮었다.

## 테스트 시나리오

### 시나리오 1: 탭 UI와 플로우 완주
- **사전 조건**: seed로 적재된 세션 존재
- **실행 단계**: 메인 페이지 진입 → 탭 확인 → "Session ID" 탭 전환 → 룩업 완료
- **기대 결과**: 룩업 두 탭("Message UUID"·"Session ID") 표시(세 번째 "Sessions" 탭은 SL-AC2 소관),
  "Message UUID" 기본 활성, 탭 전환 시 해당 입력 표시, Session ID 탭에서 룩업 플로우 완료
- **검증 AC**: LK-AC1
- **구현**: `e2e/tests/lookup-tabs.spec.ts`(룩업 두 탭의 표시·기본 활성·전환·플로우를 단정; 탭 개수는 미단정)

### 시나리오 2: Session ID 룩업 정상/보조 동작
- **사전 조건**: 유효한 세션 ID
- **실행 단계**: ID 입력(공백 포함) → Enter 또는 버튼 → 로드 → 다른 ID로 재검색
- **기대 결과**: trim 후 조회, 로딩 상태 표시, 트랜스크립트·메타데이터·서브에이전트 섹션 표시,
  포맷 사전 검증, 재검색 가능
- **검증 AC**: LK-AC2
- **구현**: `e2e/tests/session-id-lookup.spec.ts`(LK-AC2 전용 — 입력·버튼 UI, 정상 조회와 메타데이터·서브에이전트
  표시, 로딩 상태, 빈 입력 시 버튼 비활성, 공백 trim, Enter 제출, 재검색. 실패 피드백은 LK-AC4 소관)

### 시나리오 3: Message UUID 추출 룩업
- **사전 조건**: UUID v4가 포함된 메시지 원문
- **실행 단계**: textarea에 붙여넣기 → "Extract & Search" 또는 Ctrl+Enter
- **기대 결과**: UUID 추출 그린 배지 표시 후 트랜스크립트 로드,
  빈 입력 시 버튼 비활성, placeholder 힌트 표시
- **검증 AC**: LK-AC3
- **구현**: `e2e/tests/message-uuid-lookup.spec.ts`(LK-AC3 전용 — 탭 기본 활성·textarea/placeholder,
  빈 입력 시 버튼 비활성, UUID 추출 → 배지 → 로드, Ctrl+Enter 단축키. 실패 피드백은 LK-AC4 소관)

### 시나리오 4: 실패 피드백
- **사전 조건**: 미등록 세션 ID / UUID 없는 텍스트
- **실행 단계**: 각각 룩업 시도
- **기대 결과**: 미등록 세션 → API 에러 메시지, UUID 없음 → "No UUID found",
  저장된 세션 없음 → 안내 메시지
- **검증 AC**: LK-AC4
- **구현**: `e2e/tests/lookup-failure-feedback.spec.ts`(LK-AC4 전용 — 미존재 세션 ID 에러, 룩업 전 안내 메시지,
  UUID 없는 입력의 "No UUID found", 형식은 맞지만 미매칭인 UUID의 배지 표시 + API 에러. 네 케이스 모두
  트랜스크립트 뷰어가 뜨지 않음을 함께 단정한다)
- **비고**: 미존재 세션의 404 응답 계약 자체는 LC-AC4(`e2e/tests/transcript-not-found.spec.ts`) 소관이고,
  이 시나리오는 그 404를 프론트가 어떻게 보여주는지를 다룬다.
