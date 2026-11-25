# 쿼리 패턴 카탈로그

`docs/data-model/`의 코드 쿼리 지점을 형태 기준으로 빠짐없이 적은 카탈로그다. 귀속 키는 **형태** — (연산, 대상 테이블, 등치 조건 컬럼, 범위 조건, 정렬) — 이고, `ID`는 사람이 부르기 위한 안정 라벨일 뿐 귀속 키가 아니다. 같은 형태는 한 행에만 존재한다. 판정은 대상 레포의 체커(`backend/cmd/datamodelcheck`)가 한다.

- 지점 표기: `파일::함수`, 메서드면 `파일::타입::메서드`.
- 형태 표기: 템플릿 「형태」 절 — `연산 테이블 | eq(...) | range(...) | order(...)`. 칸이 비면 `-`.
- 호출 지점이 같은 형태의 지점을 여러 개 가지면 한 행의 호출 지점 칸에 나열한다.

## 패턴

| ID | 형태 | 지원 인덱스 또는 허용 사유 | 호출 지점 |
|---|---|---|---|
| `Q-01` | `select transcript_sessions \| eq(session_id) \| - \| -` | 미판정(불변식 3) | `backend/store.go::Store::GetSessionPrefix` |
| `Q-02` | `upsert transcript_sessions \| eq(session_id) \| - \| -` | 미판정(불변식 3) | `backend/store.go::Store::PutSessionAt` |
| `Q-03` | `delete transcript_sessions \| eq(session_id) \| - \| -` | 미판정(불변식 3) | `backend/store.go::Store::DeleteSession` |
| `Q-04` | `select transcript_sessions \| - \| - \| order(created_at desc, session_id desc)` | 미판정(불변식 3) | `backend/store.go::Store::ListSessions` |
| `Q-05` | `select transcript_sessions \| - \| - \| order(session_id asc)` | 미판정(불변식 3) | `backend/store.go::Store::ListSessionIDs` |

지원 칸이 `미판정(불변식 3)`인 이유는 불변식 3(빈 DB 쿼리 플랜 대조)이 아직 판정하지 않기 때문이다 — 체커는 현재 불변식 1·2만 판정한다. 지원 칸의 값은 엔진 플랜이 정한다(문서의 주장이 아니다).

## 수동 형태

형태를 정적으로 뽑을 수 없는 지점이다. 체커가 보고한 추출 불가 지점 집합 == 이 표의 지점 집합(양방향).

| 호출 지점 | 패턴 ID | 대표 SQL | 추출 불가 사유 |
|---|---|---|---|
| `backend/store.go::OpenStore` | `—` | `PRAGMA busy_timeout=5000` | 연결 설정 PRAGMA — SQL 인자가 문자열 리터럴이 아니라 변수(`pragma`)라 형태를 정적으로 뽑을 수 없다. 테이블을 읽거나 쓰지 않는 연결 설정이므로 형태가 없고, 따라서 귀속할 패턴 행도 없다. |

`패턴 ID`가 `—`인 행은 형태가 아예 없는 지점이다 — 이 레포의 `OpenStore` PRAGMA 루프가 그렇다. 형태가 있는 수동 형태(동적 문자열 조립 등)는 패턴 행의 호출 지점에도 적는다.

## 미사용 인덱스

어떤 패턴의 플랜도 쓰지 않는 인덱스(PK 제외)이다. 등재만 하고 삭제하지 않는다. 현재 스키마의 비-PK 인덱스 집합은 비어 있어 이 표의 행도 0이다.

| 인덱스 | 테이블 | 비고 |
|---|---|---|
