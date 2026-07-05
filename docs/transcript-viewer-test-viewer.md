# 테스트 문서: 트랜스크립트 뷰어

## 검증 대상 AC
- VW-AC1 ~ VW-AC6 (PRD: 트랜스크립트 뷰어)

## 테스트 시나리오

### 시나리오 1: 통합 타임라인 렌더링
- **사전 조건**: 서브에이전트를 포함한 세션 픽스처 적재
- **실행 단계**: 세션 로드 후 타임라인 렌더링
- **기대 결과**: 서브에이전트 메시지가 호출 지점에 인라인 삽입, 항목이 시간순 정렬,
  서브에이전트 없는 세션도 정상 처리
- **검증 AC**: VW-AC1
- **구현**: `e2e/tests/timeline-integration.spec.ts`

### 시나리오 2: 메인/서브에이전트 구분과 메타데이터
- **사전 조건**: 시나리오 1과 동일
- **실행 단계**: 타임라인에서 두 메시지 유형의 스타일과 메타데이터 확인
- **기대 결과**: 시각적 구분 스타일 적용, 서브에이전트 메타데이터 인라인 표시
- **검증 AC**: VW-AC2
- **구현**: `e2e/tests/timeline-integration.spec.ts`

### 시나리오 3: 확장/축소와 키보드 내비게이션
- **사전 조건**: 시나리오 1과 동일
- **실행 단계**: 항목 확장/축소, 키보드로 항목 이동
- **기대 결과**: 확장/축소 시 타임라인·스크롤 위치 유지, 키보드 내비게이션 동작
- **검증 AC**: VW-AC3
- **구현**: `e2e/tests/timeline-integration.spec.ts`

### 시나리오 4: 툴 호출 인라인·상세 표기
- **사전 조건**: Task(subagent_type 유/무)·비-Task 툴 호출이 포함된 픽스처
- **실행 단계**: 인라인 표기 확인 → 클릭으로 상세 확장 → 재클릭으로 축소
- **기대 결과**: `Task [code]` / `Task` / 툴 이름만 각각 올바르게 표기,
  상세 뷰에 포맷된 JSON 입력 표시
- **검증 AC**: VW-AC4
- **구현**: `e2e/tests/task-tool-subagent-type.spec.ts`, `e2e/tests/tool-detail-view.spec.ts`

### 시나리오 5: 절단과 타임스탬프
- **사전 조건**: 장문 메시지 포함 픽스처
- **실행 단계**: 타임라인 렌더링 확인
- **기대 결과**: 긴 텍스트 절단 표시(툴 입력의 파일 경로가 디렉토리 없이 파일명으로, 긴 툴 ID가 8자 프리픽스+생략부호로 절단), 메시지별 타임스탬프 렌더링
- **검증 AC**: VW-AC5
- **구현**:
  - E2E: `e2e/tests/text-truncation.spec.ts`(툴 입력 파일 경로 절단 — 원본 디렉토리 미노출까지 단정), `e2e/tests/message-timestamps.spec.ts`(타임스탬프)
  - 컴포넌트/유닛: `frontend/src/components/TranscriptViewer.truncation.test.tsx`(긴 툴 ID 생략부호 절단·깊은/얕은 경로 절단을 타임라인 렌더로 단정), `frontend/src/utils/truncate.test.ts`, `frontend/src/components/TruncatedText.test.tsx`
  - 비고: seed 픽스처(session-abc123)의 툴 ID는 모두 8자 이하라 E2E에서는 생략부호 절단이 발생하지 않아 툴 ID 절단은 컴포넌트/유닛 테스트로 검증한다. 과거 `text-truncation.spec.ts`는 미구현 UI를 가정한 채 전부 `test.skip` 이어서 절단이 실측 검증되지 않았다.

### 시나리오 6: 모바일/데스크톱 레이아웃
- **사전 조건**: 툴 블록 다수 포함 픽스처
- **실행 단계**: 375×667, 360×640, 641px, 1024px 뷰포트에서 렌더링·리사이즈
- **기대 결과**: 모바일에서 컴팩트 패딩·11px 폰트·pre-wrap·가로 스크롤 없음,
  데스크톱에서 기본 패딩·14px 폰트 유지, 리사이즈 시 일관성
- **검증 AC**: VW-AC6
- **구현**: `e2e/tests/tool-call-compact.spec.ts`, `e2e/tests/mobile-layout.spec.ts`
