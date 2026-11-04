# E2E 모킹 정책

> 모킹 정책 · 허용목록 · 차단 요인 원장의 SSOT. 모델 `tbm_claude-transcript-viewer-v2-e2e-mock-policy`.

E2E(Playwright)는 실 Go 백엔드(실 SQLite) + 실 S3 호환 스토리지(MinIO · kind 위 LocalStack) + `server seed --dir e2e/fixtures` 픽스처가 기본이다. 브라우저 경계의 네트워크 인터셉트·응답 모킹, 브라우저 상태 치환, 테스트 전용 환경 플래그(`E2E_*`) seam은 **실환경으로 재현할 수 없을 때만** 아래 카테고리로 허용하고, 이 문서에 등재된 것만 인정한다. 미등재 모킹과 고아 등재는 모두 drift다.

## 허용 카테고리

| 코드 | 의미 |
|---|---|
| `ERR` | 서버 실패 응답. 공유 seeded 백엔드가 요청 시점에 그 실패를 내도록 만들 수 없을 때 |
| `LAT` | 응답 지연 주입. 요청이 진행 중인 창을 실환경 쪽에서 결정적으로 붙잡을 수 없을 때 |

실환경으로 준비 가능하면 어떤 카테고리도 쓸 수 없다. 「세션 0개」 같은 데이터 모킹은 불허이며, 빈 DB로 띄운 별도 실 백엔드(`e2e/tests/support/empty-backend.ts`)로 만든다.

## 표기 규약

허용된 모킹 지점 직전 줄에 `// mock-exception: <CODE> — <사유>` (TS) · `# mock-exception: <CODE> — <사유>` (YAML·셸) 주석을 단다. 아래 허용목록과 1:1이어야 한다.

## 허용목록

| 위치 | 대상 URL 패턴 | 카테고리 | 실환경 불가 사유 |
|---|---|---|---|
| `e2e/tests/session-list-states.spec.ts` SL-AC6 로딩 (`page.route` → 보류 후 `route.continue()`) | `**/api/transcripts` | LAT | 로컬 백엔드는 즉시 응답해 요청 진행 중 창을 실환경 쪽에서 결정적으로 붙잡을 수 없다. 본문은 가로채지 않고 실 백엔드 응답을 그대로 쓴다 |
| `e2e/tests/session-list-states.spec.ts` SL-AC6 실패 (`page.route` + `route.fulfill` 500) | `**/api/transcripts` | ERR | 목록 엔드포인트는 SQLite만 읽고 S3를 부르지 않는다(`S3Service.ListTranscripts`). 실 의존을 끊은 별도 인스턴스는 기동 시 DB를 열지 못해 서버가 뜨지 않으므로, 요청 시점의 목록 실패를 공유 seeded DB에서 낼 수 없다 |
| `e2e/tests/support/session-list.ts` `LIST_ROUTE` | `**/api/transcripts` | ERR · LAT | 위 두 지점이 가로채는 대상 글롭 상수 |

SL-AC6 빈 상태는 등재 대상이 아니다 — 빈 DB의 실 백엔드 인스턴스로 대체했다.

LC-AC5 삭제 실패도 등재 대상이 아니다 — `s3:DeleteObject`만 거부하는 MinIO 사용자의 자격증명으로 띄운 실 백엔드 인스턴스(`e2e/tests/support/backend-instance.ts`)로 실제 AccessDenied를 낸다(`transcript-delete-api.spec.ts`). 테스트 전용 플래그는 쓰지 않으며 자격증명은 `DELETE_DENIED_*` 환경변수로 받는다.

## 차단 요인 원장

차단 요인의 해소 주체는 항상 `tbm_claude-transcript-viewer-v2-e2e-mock-policy` 모델이다(소관 칸 없음). 선행이 「없음」이면 착수 가능 행이다.

| ID | 차단 요인 | 해소 방향 | 선행 | 재검토 시점 |
|---|---|---|---|---|
