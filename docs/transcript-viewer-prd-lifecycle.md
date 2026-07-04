# PRD: 트랜스크립트 라이프사이클 (업로드·다운로드·삭제)

## 달성 가치
- V3: 트랜스크립트 크기에 무관한 가벼움 — 업로드/다운로드 모두 presigned URL로 S3 직결, 백엔드는 메타데이터만 처리
- V4: 운영 부담 최소화 — SQLite 단일 인덱스, 재시도 안전한 삭제
- V2: 즉각적인 대화 탐색 — 미등록 세션에 대한 명확한 404 피드백

## Acceptance Criteria

### LC-AC1: presigned PUT URL 업로드
- **설명**: `POST /api/transcripts/upload-url/{sessionId}`가 `<sessionId>.jsonl`용 presigned S3 PUT URL을 반환한다.
  서버는 세션의 Hive 파티션 프리픽스(`year=/month=/day=/hour=/session_id=`)를 1회 계산하고
  `session_id → s3_prefix` 매핑을 SQLite에 영속화한다. 응답에는 `url`, `method`, `key`, `session_id`, `expires_in`이 포함된다.
- **달성 가치**: V3, V4
- **검증 방법**: API 호출 후 응답 필드와 S3 키의 Hive 규칙 준수, SQLite 매핑 생성을 확인

### LC-AC2: 세션 파일의 단일 디렉토리 공유
- **설명**: 같은 세션의 후속 업로드(`?file_name=` 파라미터, `subagents/<name>.jsonl` 포함)는
  저장된 프리픽스를 재사용하여 모든 파일이 하나의 Hive 디렉토리에 모인다.
- **달성 가치**: V3
- **검증 방법**: 메인 + 서브에이전트 파일 업로드 후 두 키가 동일 프리픽스를 공유하는지 확인

### LC-AC3: 단기 presigned GET 매니페스트 다운로드
- **설명**: `GET /api/transcript/session/{id}`가 SQLite에서 프리픽스를 해석하고 세션 객체를 나열하여,
  메인 트랜스크립트와 각 서브에이전트 파일에 대한 단기 presigned GET URL(기본 5분,
  `DOWNLOAD_URL_TTL_SECONDS`) 매니페스트를 반환한다. 브라우저가 S3에서 직접 다운로드해
  로컬에서 파싱·병합·렌더링하며, 트랜스크립트 바이트는 백엔드 파드를 통과하지 않는다.
- **달성 가치**: V3
- **검증 방법**: 매니페스트 구조(main/subagents/expires_in) 확인, 백엔드 경유 없이 브라우저-S3 직결 다운로드 확인

### LC-AC4: 미등록 세션 404
- **설명**: 다운로드·삭제 API는 SQLite에 매핑이 없는 세션에 대해 `404`를 반환하여
  프론트엔드가 명확한 실패 피드백을 표시할 수 있게 한다.
- **달성 가치**: V2
- **검증 방법**: 존재하지 않는 세션 ID로 GET/DELETE 호출 시 404 응답 확인

### LC-AC5: 재시도 안전 삭제
- **설명**: `DELETE /api/transcript/session/{id}`는 세션 Hive 디렉토리 아래 모든 객체
  (메인 + 서브에이전트)를 먼저 삭제한 뒤 마지막에 SQLite 매핑을 제거한다.
  중단된 삭제는 세션을 여전히 조회 가능한 상태로 남겨 안전하게 재시도할 수 있다.
- **달성 가치**: V4
- **검증 방법**: 삭제 성공 시 S3 객체 전량 제거 + 매핑 제거 확인, 삭제 순서(객체 → 매핑) 확인
