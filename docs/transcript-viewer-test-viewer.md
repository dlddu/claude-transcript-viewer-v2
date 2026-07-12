# 테스트 문서: 트랜스크립트 뷰어

## 검증 대상 AC
- VW-AC1 ~ VW-AC6 (PRD: 트랜스크립트 뷰어)

> **AC↔E2E 1:1**: 2026-07-09 기준 VW-AC1~AC6이 각각 전용 E2E 스펙 파일을 소유한다.
> VW-AC4/AC5/AC6은 AC 문장이 두 보장을 접속사로 묶고 있어 스펙이 둘로 갈려 있었는데,
> AC를 쪼개는 대신 스펙을 병합했다(`tool-call-display`, `truncation-and-timestamps`,
> `mobile-layout`). 각 파일 안에서 두 보장은 별도 describe 블록으로 남는다.
>
> VW-AC1/AC2/AC3은 각각 전용 E2E 스펙 파일을 소유한다
> (`timeline-unified` / `timeline-distinction` / `timeline-expand-collapse`). 이전에는
> `e2e/tests/timeline-integration.spec.ts` 한 파일이 세 AC를 함께 덮었다. 공유 헬퍼는
> `e2e/tests/support/timeline.ts`에 있다(스펙 아님).

## 테스트 시나리오

### 시나리오 1: 통합 타임라인 렌더링
- **사전 조건**: 서브에이전트를 포함한 세션 픽스처(session-abc123)와, 서브에이전트가 없는 세션 픽스처(session-xyz789) 적재
- **실행 단계**: 각 세션 로드 후 타임라인 렌더링
- **기대 결과**:
  - (서브에이전트 포함) 서브에이전트 메시지가 호출 지점에 인라인 삽입되고 항목이 시간순 정렬된다.
  - (서브에이전트 미포함) 모든 메인 메시지가 시간순으로 렌더되고 서브에이전트 그룹이 하나도 생기지 않는다.
- **검증 AC**: VW-AC1
- **구현**:
  - E2E: `e2e/tests/timeline-unified.spec.ts` — 통합 타임라인 렌더·호출 지점 인라인 삽입·시간순 정렬을 단정하고, 'renders a session with no subagents without creating any group'이 서브에이전트 없는 seed 세션(session-xyz789)을 실제로 로드해 서브에이전트 그룹 0개를 단정한다.
  - 컴포넌트/유닛: `frontend/src/components/TranscriptViewer.no-subagents.test.tsx` — 서브에이전트 없는 세션이 통합 타임라인에 전 메시지를 시간순으로 렌더하고, 서브에이전트 그룹/헤더/라벨이 하나도 생기지 않으며, agentId가 세션 ID와 같은 메시지도 메인으로 취급됨을 단정한다.
  - 비고: 과거 'should handle sessions with no subagents gracefully'는 beforeEach가 적재한 서브에이전트 포함 픽스처(session-abc123)를 그대로 쓰면서 에러 미발생만 단정하는 decoy였고(테스트 주석: "would need a different fixture without subagents"), 컴포넌트 테스트의 'should handle messages without agentId field gracefully'는 메시지 1건 렌더만 확인해, AC 이름 그대로인 "서브에이전트가 없는 세션도 정상 렌더링" 절반이 실측 미검증이었다. 위 두 테스트로 해소했다.
  - 단위(로직): `frontend/src/utils/groupMessages.test.ts`(메인/서브에이전트 메시지를 타임라인 그룹으로 묶기 — 연속 동일 agentId 묶음, interleaved 시 main·subagent·main 분리, 비연속 재등장 시 분리, subagentName 결정), `frontend/src/utils/enrichMessages.test.ts`(queue-operation·message 필드 없는 메시지 필터, 텍스트 추출, agentId≠sessionId 기준 서브에이전트 판정과 이름 해석), `frontend/src/components/TranscriptViewer.test.tsx`(뷰어 컨테이너·로딩·에러, 통합 타임라인·시간순 렌더·서브에이전트 그룹 구분. 이 컴포넌트 테스트는 VW-AC2/AC3와도 겹친다)

### 시나리오 2: 메인/서브에이전트 구분과 메타데이터
- **사전 조건**: 시나리오 1과 동일
- **실행 단계**: 타임라인에서 두 메시지 유형의 스타일과 메타데이터 확인
- **기대 결과**: 시각적 구분 스타일 적용, 서브에이전트 메타데이터 인라인 표시
- **검증 AC**: VW-AC2
- **구현**: `e2e/tests/timeline-distinction.spec.ts`(VW-AC2 전용 — 서브에이전트 그룹 스타일·메인 메시지 비포함,
  그룹 헤더의 이름·메시지 수 배지 인라인 표시)
- **단위**: `frontend/src/components/TranscriptViewer.test.tsx`(서브에이전트 그룹 컨테이너로 시각적 구분, 그룹 헤더에
  서브에이전트 이름 표시, 그룹에 다른 배경색 적용), `frontend/src/utils/groupMessages.test.ts`(그룹 경계 판정)

### 시나리오 3: 확장/축소와 키보드 내비게이션
- **사전 조건**: 시나리오 1과 동일
- **실행 단계**: 항목 확장/축소, 키보드로 항목 이동
- **기대 결과**: 확장/축소 시 타임라인·스크롤 위치 유지, 키보드 내비게이션 동작
- **검증 AC**: VW-AC3
- **구현**: `e2e/tests/timeline-expand-collapse.spec.ts`(VW-AC3 전용 — 그룹 확장/축소, 토글 후 헤더가 뷰포트에 유지,
  그룹 헤더 포커스·`aria-expanded` 전이와 툴 항목의 Enter 확장)
- **단위**: `frontend/src/components/TranscriptViewer.test.tsx`(서브에이전트 그룹이 기본 축소 상태로 렌더)

### 시나리오 4: 툴 호출 인라인·상세 표기
- **사전 조건**: Task(subagent_type 유/무)·비-Task 툴 호출이 포함된 픽스처
- **실행 단계**: 인라인 표기 확인 → 클릭으로 상세 확장 → 재클릭으로 축소
- **기대 결과**: `Task [code]` / `Task` / 툴 이름만 각각 올바르게 표기,
  상세 뷰에 포맷된 JSON 입력 표시
- **검증 AC**: VW-AC4
- **구현**: `e2e/tests/tool-call-display.spec.ts`
- **단위**: `frontend/src/utils/enrichMessages.test.ts`(tool_use 블록 집계 — 매칭되는 tool_result 결합 후 result-only
  메시지 제거, `is_error` 플래그 처리, 매칭 없을 때 result=null, 한 메시지의 다중 tool_use 처리)

### 시나리오 5: 절단과 타임스탬프
- **사전 조건**: 장문 메시지 포함 픽스처
- **실행 단계**: 타임라인 렌더링 확인
- **기대 결과**: 긴 텍스트 절단 표시(툴 입력의 파일 경로가 디렉토리 없이 파일명으로, 긴 툴 ID가 8자 프리픽스+생략부호로 절단), 메시지별 타임스탬프 렌더링
- **검증 AC**: VW-AC5
- **구현**:
  - E2E: `e2e/tests/truncation-and-timestamps.spec.ts`(VW-AC5 전용 — 툴 입력 파일 경로 절단은 원본 디렉토리 미노출까지 단정하고, 메인·서브에이전트 메시지의 타임스탬프 렌더·포맷·위치를 단정. 이전의 `text-truncation` + `message-timestamps` 병합)
  - 컴포넌트/유닛: `frontend/src/components/TranscriptViewer.truncation.test.tsx`(긴 툴 ID 생략부호 절단·깊은/얕은 경로 절단을 타임라인 렌더로 단정), `frontend/src/utils/truncate.test.ts`, `frontend/src/components/TruncatedText.test.tsx`
  - 비고: seed 픽스처(session-abc123)의 툴 ID는 모두 8자 이하라 E2E에서는 생략부호 절단이 발생하지 않아 툴 ID 절단은 컴포넌트/유닛 테스트로 검증한다. 과거 절단 스펙(현재는 위 파일로 병합)은 미구현 UI를 가정한 채 전부 `test.skip` 이어서 절단이 실측 검증되지 않았다.

### 시나리오 6: 모바일/데스크톱 레이아웃
- **사전 조건**: 툴 블록 다수 포함 픽스처
- **실행 단계**: 375×667, 360×640, 641px, 1024px 뷰포트에서 렌더링·리사이즈
- **기대 결과**: 모바일에서 컴팩트 패딩·11px 폰트·pre-wrap·가로 스크롤 없음,
  데스크톱에서 기본 패딩·14px 폰트 유지, 리사이즈 시 일관성
- **검증 AC**: VW-AC6
- **구현**: `e2e/tests/mobile-layout.spec.ts`
