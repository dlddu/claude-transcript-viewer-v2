# 테스트 문서: 세션 룩업

## 검증 대상 AC
- LK-AC1 ~ LK-AC4 (PRD: 세션 룩업)

## 테스트 시나리오

### 시나리오 1: 탭 UI와 플로우 완주
- **사전 조건**: seed로 적재된 세션 존재
- **실행 단계**: 메인 페이지 진입 → 탭 확인 → "Session ID" 탭 전환 → 룩업 완료
- **기대 결과**: 두 탭 표시, "Message UUID" 기본 활성, 탭 전환 시 해당 입력 표시,
  Session ID 탭에서 룩업 플로우 완료
- **검증 AC**: LK-AC1
- **구현**: `e2e/tests/lookup-tabs.spec.ts`

### 시나리오 2: Session ID 룩업 정상/보조 동작
- **사전 조건**: 유효한 세션 ID
- **실행 단계**: ID 입력(공백 포함) → Enter 또는 버튼 → 로드 → 다른 ID로 재검색
- **기대 결과**: trim 후 조회, 로딩 상태 표시, 트랜스크립트·메타데이터·서브에이전트 섹션 표시,
  포맷 사전 검증, 재검색 가능
- **검증 AC**: LK-AC2
- **구현**: `e2e/tests/session-id-lookup.spec.ts`

### 시나리오 3: Message UUID 추출 룩업
- **사전 조건**: UUID v4가 포함된 메시지 원문
- **실행 단계**: textarea에 붙여넣기 → "Extract & Search" 또는 Ctrl+Enter
- **기대 결과**: UUID 추출 그린 배지 표시 후 트랜스크립트 로드,
  빈 입력 시 버튼 비활성, placeholder 힌트 표시
- **검증 AC**: LK-AC3
- **구현**: `e2e/tests/message-uuid-lookup.spec.ts`

### 시나리오 4: 실패 피드백
- **사전 조건**: 미등록 세션 ID / UUID 없는 텍스트
- **실행 단계**: 각각 룩업 시도
- **기대 결과**: 미등록 세션 → API 에러 메시지, UUID 없음 → "No UUID found",
  저장된 세션 없음 → 안내 메시지
- **검증 AC**: LK-AC4
- **구현**: `e2e/tests/session-id-lookup.spec.ts`, `e2e/tests/message-uuid-lookup.spec.ts`
