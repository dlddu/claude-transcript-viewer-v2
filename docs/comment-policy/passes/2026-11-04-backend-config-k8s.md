# 2026-11-04 · backend 비-MA3 파일 · 설정 · k8s · kind

범위(줄머리 주석 L 391줄 → 132줄, 줄 끝 E 8줄 → 2줄(`store_test.go`·`kind-setup.sh`의 줄 끝 주석은 전부 제거되어 행을 삭제했다)): `backend/{s3_test,seed_test,server,server_test,static,store_test,types,s3_integration_test}.go`, `.dockerignore`·`.gitignore`·`.env.example`·`backend/.env.example`·`frontend/.env.example`·`Dockerfile`·`e2e/playwright.config.ts`·`k8s/**`·`scripts/kind-{config.yaml,setup.sh}`. 수동 승인 케이스 경로(MA2: `scripts/review-policy/`·`review-policy.yml`, MA3: `backend/{store,s3,seed}.go`)와 `.github/workflows/`(GitHub App 푸시 권한 제약으로 이번 슬라이스에서 제외, 원장 `—` 유지)와 열린 PR(#104: `test.yml`·`e2e/tests/support/*`·`transcript-delete-api.spec.ts`, #98: `docs/`)의 변경 파일을 피한다. 변경은 주석 삭제와 `server.go`·`types.go` doc 주석 1줄 압축뿐이고 코드는 `gofmt` 정렬 외에 바뀌지 않는다.

## 제거 목록

| 불필요 유형 | 대상 |
|---|---|
| 코드 재진술 | Go 테스트의 섹션 구분선·헬퍼/테스트 doc(mockS3Client·fakePresigner·fakeService·테스트 함수 설명), 인라인 `// ordered by session_id`·`// newest → oldest`·`// newest` 등, `.dockerignore`·`.gitignore`·`Dockerfile`의 단계/섹션 라벨, `kind-setup.sh`의 단계 라벨과 `# No Color`, `kind-config.yaml`의 HTTP/HTTPS 라벨, 예시 Secret의 사용 단계·kubectl 대체 레시피 |
| 저장소 문서 재진술 | `seed_test.go`·`s3_test.go`·`server_test.go`·`s3_integration_test.go`의 AC 조항·E2E 의존 설명(`docs/transcript-viewer-test-*.md`가 말한다), `types.go`의 정렬·RFC3339 설명, `kind-setup.sh` 머리의 전제 조건·사용법·수행 단계 목록 |
| 작업 흔적 | `seed_test.go` 머리의 "이 테스트 이전에는 간접으로만 검증됐다" 경위, `kustomization.yaml`·`deployment.yaml`의 "단일 워크로드" 병기 설명 |
| 장식·구분 | 모든 `// --- ... ---` 구분선, `.env.example`의 섹션 제목과 MinIO 실행 레시피, `Dockerfile`·`k8s/app/secret.example.yaml`의 헤더 |

더 나은 자리로 옮긴 주석은 없다.

## 유지 목록

| 대상 | 줄 | 필요 사유 |
|---|---|---|
| `server.go` doc 주석 3건(`TranscriptService`·`ServerOption`·`WithStaticDir`) | 3 | doc 주석 수준이 요구하는 1줄이다(사유 면제). 본문은 압축했다. |
| `types.go` doc 주석 3건 | 6 | doc 주석 수준(1줄). `TranscriptFileRef`의 `ID` 의미는 수준을 넘지만, 지우면 main은 세션 id·subagent는 agent id(파일 이름에서 `.jsonl` 뺀 값)라는 것을 몰라 프런트가 ID로 잘못 매칭하므로 유지. `TranscriptFilesResponse`의 "바이트를 프록시하지 않는다"는 아키텍처 불변식이다. |
| `server.go` 알 수 없는 API 경로 404 | 1 | 지우면 정적 서빙 SPA fallback이 API 404를 삼켜도 되는 줄 알고 `index.html`을 돌려주게 된다. |
| `server_test.go` 오류 메시지 매처 | 2 | 지우면 메시지 문구가 e2e의 두 정규식을 동시에 만족해야 한다는 제약을 몰라 문구를 바꿔 e2e가 깨진다. |
| `static.go` 경로 정규화 · index.html 재검증 · 해시 자산 | 3 | `..` 탈출 방지, Vite가 빌드마다 `index.html`을 다시 쓴다는 캐시 헤더의 근거, 해시 파일명이라 장기 캐시가 안전하다는 근거 — 지우면 각 캐시 헤더·정규화를 "불필요"로 보고 걷어낸다. |
| `s3_test.go` hivePrefixFor 날짜 | 2 | 지우면 날짜가 의미 있다고 보고 clock 의존을 더하거나 비교 값을 맞추려 든다(prefix는 store에서 해석). |
| `s3_test.go` sessionFixture 규약 | 2 | 지우면 main 파일명이 자동으로 `<session_id>.jsonl`이고 subagent는 파일명 키라는 규약을 몰라 픽스처를 잘못 짠다. |
| `s3_test.go` 페이지네이션 픽스처 · 삭제 순서 픽스처 | 4 | main 파일이 subagent 뒤에 정렬되는 키 배치에 의존해서만 페이지네이션 누락·삭제 중단 시나리오가 성립한다. 지우면 키 이름을 바꿔 테스트가 무의미해진다. |
| `s3_test.go` 17:00 prev day UTC (E) | 1 | KST 02:00이 UTC 전날이라는 파티션 경계 산술이다. |
| `seed_test.go` 이름순 처리 · 의도적 역순 기록 · 맵 키 의미(E) | 5+1 | seed 순서가 정렬된 파일명에서 나온다는 불변식이 테스트의 근거라, 지우면 쓰기 순서를 "정리"해 테스트가 아무것도 검증하지 못한다. 맵 키가 세션 prefix 기준 상대 이름임은 코드에서 읽히지 않는다. |
| `store_test.go` 삽입 순서 | 2 | 시간순도 id순도 아닌 순서로 넣어야 created_at DESC 정렬이 실제로 검증된다. |
| `playwright.config.ts` testIgnore | 4 | 지우면 `node:test` 스펙을 Playwright가 로드하려다 실패하고, 이 무시 목록이 왜 있는지 몰라 지운다. |
| `.env.example` 3종 | 23·29·5 | 선택 변수의 이름·기본값·미설정 시 동작(STATIC_DIR 미설정=API만, TTL 기본값, assume-role, 공개 엔드포인트가 브라우저 해석용이라는 것, `VITE_API_URL` 미설정=동일 오리진)은 소스를 읽어야만 알 수 있다. 주석 처리된 `KEY=값` 줄은 선택 변수의 형식 예시다. |
| `Dockerfile` | 6 | `VITE_API_URL` 없이 빌드해야 동일 오리진이라는 것, CA 번들을 빌드 단계에서 복사하는 이유, SQLite 경로가 k8s에서 PVC라는 것. |
| `k8s/app/configmap.example.yaml` | 9 | 프로덕션 출처(external-secrets가 SSM에서 렌더링)와 선택 키의 의미·기본값. |
| `k8s/app/deployment.yaml` | 12 | `maxSurge: 0`과 Recreate를 쓰지 못하는 이유(RWO PVC 다중 attach, API 거부), ConfigMap·Secret이 프로덕션과 CI에서 다른 출처(IRSA 여부). |
| `k8s/app/pvc.yaml` | 4 | 이름을 유지하는 이유(기존 볼륨·SQLite 재사용)와 단일 writer 제약. |
| `k8s/app/secret.example.yaml` | 3 | 실제 비밀 커밋 금지 경고, IRSA 없는 환경 한정이라는 사용 조건. |
| `k8s/kustomization.yaml` | 2 | 로컬 개발 헬퍼를 의도적으로 제외한다는 것 — 지우면 빠진 리소스를 누락으로 보고 더한다. |
| `k8s/localstack/deployment.yaml` | 2 | 브라우저가 presigned URL로 직접 받으므로 CORS 허용 origin이 필요한 이유. |
| `scripts/kind-config.yaml` | 2 | 호스트 포트가 백엔드 API·LocalStack용이라는 것(포트 번호만으로는 알 수 없다). |
| `scripts/kind-setup.sh` | 3 | 공개 엔드포인트 지정이 port-forward 기반 브라우저 해석을 위한 것이라는 점, LocalStack엔 IRSA가 없어 자격 증명만 Secret으로 둔다는 점. |
