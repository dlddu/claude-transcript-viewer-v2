# 데이터 모델 문서

`transcript_sessions`(세션 → S3 접두사 매핑, SQLite)의 스키마·쿼리·인덱스를 실재와 어긋나지 않게 두는 지도다. reconciler 모델 `tbm_claude-transcript-viewer-v2-data-model`이 이 디렉터리를 SSOT로 추적하고, 템플릿은 reconciler `templates/data-model.tbm.md`다.

| 파일 | 담는 것 | 짝을 이루는 실재 |
|---|---|---|
| [`erd.md`](erd.md) | mermaid ERD + 엔티티별 구조 표 | 마이그레이션을 전부 적용한 스키마 (스키마가 이긴다) |
| [`query-patterns.md`](query-patterns.md) | 쿼리 패턴 카탈로그 · 수동 형태 · 미사용 인덱스 | 코드의 쿼리 지점, 빈 DB 쿼리 플랜 |
| [`fullscan-criteria.md`](fullscan-criteria.md) | 풀스캔 허용 기준 (사람 소유) | — |

## 형태 정의

쿼리 형태는 템플릿 「형태」 절을 그대로 따른다: (연산, 대상 테이블, 등치 조건 컬럼, 범위 조건, 정렬). 지점 표기는 `파일::함수`(메서드는 `파일::타입::메서드`), 연산은 `select`·`insert`·`update`·`delete`·`upsert`만 쓴다.

이 레포 고유의 정규화는 하나다.

- `backend/store.go`의 `OpenStore`는 `db.ExecContext(ctx, pragma)`로 연결 PRAGMA를 실행한다. SQL 인자가 문자열 리터럴이 아니라 변수라 형태를 정적으로 뽑을 수 없고, 테이블을 읽거나 쓰지 않는 연결 설정이라 「형태」의 연산 목록에도 들어가지 않는다. 이 지점은 **형태가 없는 지점**이다 — 체커는 이 후보를 수동 형태로 보고하고, [`query-patterns.md`](query-patterns.md)의 수동 형태 표에 등재한다. 형태가 없으므로 귀속할 패턴 행이 없고(`패턴 ID` = `—`), 패턴 행의 호출 지점에도 넣지 않는다. 형태가 *있는* 수동 형태(동적 문자열 조립 등)는 패턴 행의 호출 지점에도 적는다.
- `OpenStore`는 제품 경로의 쿼리가 있는 `backend/store.go` 안에 있으므로 추출 제외 블록으로 빼지 않는다 — 제외는 쿼리가 아닌 것만 뺀다.

## 풀스캔 허용 기준

표는 [`fullscan-criteria.md`](fullscan-criteria.md)에 있다. 지원 인덱스가 없는 패턴의 현황은 카탈로그의 지원 칸에 적는다 — 그 값은 엔진 플랜이 정한다.

## 추출 제외 범위

- 테스트(`_test.go`), 체커(`backend/cmd/datamodelcheck/`), 마이그레이션과 그 적용기(`backend/migrations/`)는 쿼리 지점이 아니라 도구이므로 뺀다. 제품 경로의 쿼리는 뺀 것이 없다.
- 마이그레이션 이력은 `PRAGMA user_version`에 있고 테이블이 없다. 엔진 내부 테이블 `sqlite_sequence`만 스키마 비교에서 뺀다.
- `backend/store.go`의 `OpenStore`는 `db.ExecContext(ctx, pragma)`로 연결 PRAGMA를 실행한다. 위 「형태 정의」의 정규화대로 이 줄은 지점 후보로 보고하되 형태가 없는 지점으로 처리한다(조용히 건너뛰지 않는다).

```data-model-scope
migrations: backend/migrations
checker: backend/cmd/datamodelcheck
scope: backend
exclude: _test\.go$|^backend/cmd/datamodelcheck/|^backend/migrations/
site: \.(QueryContext|QueryRowContext|ExecContext|PrepareContext)\(
schema-exclude: ^sqlite_sequence$
sql: \b(FROM|JOIN|INTO|DELETE FROM) [a-z_]+\b|\bUPDATE [a-z_]+( +SET\b| *\\?$)|\bWHERE\b|\b(AND|OR) \(?[a-z_.()]+ *(=|<|>|!=|IN |IS |LIKE|BETWEEN)|\bORDER BY\b|\bON CONFLICT\b
```

## 체커

```text
cd backend && go run ./cmd/datamodelcheck [--json] [--root ..]
```

- 엔진: `modernc.org/sqlite` v1.34.4 — 운영과 같은 드라이버. 빈 DB에 `backend/migrations`를 `migrations.Apply`(`Store.migrate`가 부르는 같은 적용기)로 전부 적용한 뒤 `PRAGMA`로 카탈로그를 읽는다.
- 종료 코드: 0 정합 · 1 위반 · 2 판정 불가(README·블록·마이그레이션·ERD·카탈로그 파싱 실패).
- 현재 구현 범위: 불변식 1(ERD ↔ 스키마), 불변식 2(카탈로그 ↔ 코드 쿼리 지점 — 형태 기준 양방향 대조와 수동 형태 지점 집합 대조), 지점 후보 수집(C4). 불변식 3(지원 칸 ↔ 빈 DB 쿼리 플랜)은 `unimplemented` 위반으로 보고한다 — 그 전에는 종료 코드가 0이 되지 않는다.
- 카탈로그의 지원 칸은 불변식 3이 채운다 — 현재 모든 패턴 행이 `미판정(불변식 3)`이다.
- CI: 아직 연결하지 않았다.
