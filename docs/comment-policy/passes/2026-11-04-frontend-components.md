# 2026-11-04 · frontend 컴포넌트·테스트

범위(줄머리 주석 386줄 → 23줄): `frontend/src/App.tsx`, `frontend/src/components/{LookupTabs,MessageUuidLookup,SessionIdLookup,SessionList,TruncatedText}.test.tsx`, `frontend/src/components/TranscriptViewer.{no-subagents,truncation}.test.tsx`. 줄 끝 주석 3건(`TranscriptViewer.truncation.test.tsx`)도 함께 판정했다(→ 1건). 이 슬라이스는 수동 승인 케이스 경로(MA1~MA3)와 열린 PR(#104: e2e·`test.yml`, #98: `docs/`)의 변경 파일을 모두 피한다.

## 제거 목록

| 불필요 유형 | 대상 |
|---|---|
| 코드 재진술 | 테스트의 `// Arrange`·`// Act`·`// Assert` 표지와 그 뒤에 붙은 설명(전 파일), `SessionIdLookup.test.tsx`의 mock 초기화·성공/실패 조회 설명, `TruncatedText.test.tsx`의 mock·cleanup·툴팁 위치 설명, `SessionList.test.tsx`의 fetch mock 헬퍼·렌더 헬퍼·날짜 변환 예시·DELETE 호출 설명, `TranscriptViewer.*.test.tsx`의 단언별 풀이와 절단 형태 설명, `App.tsx`의 경로 파싱 설명과 `openSession` 동작 요약 |
| 저장소 문서 재진술 | `TranscriptViewer.no-subagents.test.tsx`(VW-AC1)·`TranscriptViewer.truncation.test.tsx`(VW-AC5)의 머리 블록 — AC 조항과 단언 목록을 되풀이한다 |
| 작업 흔적 | 두 머리 블록의 배경 서술(기존 E2E가 decoy였다는 경위, 단정이 없었다는 이력) — 경위는 PR·커밋 이력의 몫이다 |
| 소감·추측 | 없음 |

더 나은 자리로 옮긴 주석은 없다. `Arrange/Act/Assert` 구분은 빈 줄과 코드 순서가 대신한다.

## 유지 목록

| 대상 | 줄 | 필요 사유 |
|---|---|---|
| `App.tsx` 마스터-디테일 설명, 재조회 회피, 탭 마운트 유지 | 10 | 지우면 (a) 목록 열기만 전체 화면으로 가고 식별자 조회는 인라인인 이유를 몰라 둘을 같은 방식으로 합치고, (b) 현재 페이지에서 네비게이션하지 않는 이유(재조회 방지)를 몰라 라우팅을 넣고, (c) 탭이 숨겨질 뿐 언마운트되지 않아 돌아왔을 때 Sessions 탭이 선택된 채 남는다는 의존을 깨뜨린다. |
| `LookupTabs.test.tsx` Sessions 탭 stub 설명 | 2 | 지우면 Sessions 탭이 마운트 시 `GET /api/transcripts`를 부른다는 사실을 몰라, stub 없이 그 탭을 여는 테스트가 실제 fetch 실패나 act 경고로 흔들린다. |
| `MessageUuidLookup.test.tsx` 로딩 단언 | 1 | 지우면 `BUTTON`을 거르는 필터가 불필요해 보여, 버튼 라벨 "Extract & Search"의 `loading` 부분 일치로 테스트가 실패한다. |
| `SessionList.test.tsx` 최신순 계약 | 2 | 지우면 백엔드가 이미 최신순으로 주고 컴포넌트가 받은 순서대로 그린다는 분업을 몰라, 테스트 데이터 순서를 바꾸거나 컴포넌트에 정렬을 더한다. |
| `SessionList.test.tsx` act 플러시 헬퍼 | 6 | 지우면 `setTimeout` 매크로태스크 대신 `findBy`·마이크로태스크 한 번으로 단순화해, fetch → json → setState 여러 단계를 못 비워 "not wrapped in act" 경고와 경쟁이 생긴다. |
| `TranscriptViewer.no-subagents.test.tsx` 픽스처 | 2 | 지우면 이 픽스처가 서브에이전트 없는 seed 세션(`session-xyz789`)과 같은 형태이고 `loadTranscript`가 넘기는 시간순으로 정렬돼 있다는 전제를 몰라, 순서 단언의 기대가 입력 순서인 이유를 역추적해야 한다. |
| `TranscriptViewer.truncation.test.tsx` 경계값 | 1 | 지우면 `tool-001`이 절단 한도(8자)와 정확히 같은 경계 입력임을 몰라 "짧은 ID" 테스트가 길이를 바꿔 경계 검증을 잃는다. |
