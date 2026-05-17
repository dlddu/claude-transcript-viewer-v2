use std::sync::Arc;

use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::Value;

use crate::error::{AppError, S3Error};
use crate::services::s3::S3Repo;

pub type SharedRepo = Arc<dyn S3Repo>;

pub fn transcripts_router() -> Router<SharedRepo> {
    Router::new()
        .route("/session/:session_id", get(get_transcript_by_session))
        .route("/:id", get(get_transcript))
        .route("/", get(list_transcripts))
}

async fn get_transcript_by_session(
    State(repo): State<SharedRepo>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let trimmed = session_id.trim();
    if trimmed.is_empty() {
        return Err(AppError::SessionIdRequired);
    }

    match repo.get_transcript_by_session_id(trimmed).await {
        Ok(transcript) => {
            let value =
                serde_json::to_value(transcript).map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(Json(value))
        }
        Err(S3Error::NoTranscriptForSession) => Err(AppError::TranscriptNotFound),
        Err(S3Error::SessionIdRequired) => Err(AppError::SessionIdRequired),
        Err(err) => {
            tracing::error!(session_id = %trimmed, error = %err, "Error fetching transcript by session ID");
            Err(AppError::FetchFailed)
        }
    }
}

async fn get_transcript(
    State(repo): State<SharedRepo>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    if id.is_empty() {
        return Err(AppError::Internal("Transcript ID is required".to_string()));
    }
    match repo.get_transcript(&id).await {
        Ok(transcript) => {
            let value =
                serde_json::to_value(transcript).map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(Json(value))
        }
        Err(S3Error::TranscriptNotFound) => Err(AppError::TranscriptNotFound),
        Err(err) => {
            tracing::error!(transcript_id = %id, error = %err, "Error fetching transcript");
            Err(AppError::FetchFailed)
        }
    }
}

async fn list_transcripts(State(repo): State<SharedRepo>) -> Result<Json<Vec<String>>, AppError> {
    match repo.list_transcripts().await {
        Ok(list) => Ok(Json(list)),
        Err(err) => {
            tracing::error!(error = %err, "Error listing transcripts");
            Err(AppError::ListFailed)
        }
    }
}

pub async fn handler_404() -> impl IntoResponse {
    AppError::NotFound
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::build_app_with_repo;
    use crate::models::{SubagentTranscript, Transcript, TranscriptMessage};
    use async_trait::async_trait;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use std::sync::Mutex;
    use tower::ServiceExt;

    #[derive(Default)]
    struct MockRepo {
        get_transcript_response: Mutex<Option<Result<Transcript, S3Error>>>,
        get_by_session_response: Mutex<Option<Result<Transcript, S3Error>>>,
        list_response: Mutex<Option<Result<Vec<String>, S3Error>>>,
        last_session_id: Mutex<Option<String>>,
    }

    impl MockRepo {
        fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }

        fn set_get_transcript(&self, r: Result<Transcript, S3Error>) {
            *self.get_transcript_response.lock().unwrap() = Some(r);
        }
        fn set_get_by_session(&self, r: Result<Transcript, S3Error>) {
            *self.get_by_session_response.lock().unwrap() = Some(r);
        }
        #[allow(dead_code)]
        fn set_list(&self, r: Result<Vec<String>, S3Error>) {
            *self.list_response.lock().unwrap() = Some(r);
        }
    }

    #[async_trait]
    impl S3Repo for MockRepo {
        async fn get_transcript(&self, _id: &str) -> Result<Transcript, S3Error> {
            self.get_transcript_response
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| Err(S3Error::Other("not configured".to_string())))
        }
        async fn list_transcripts(&self) -> Result<Vec<String>, S3Error> {
            self.list_response
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| Err(S3Error::Other("not configured".to_string())))
        }
        async fn get_transcript_by_session_id(
            &self,
            session_id: &str,
        ) -> Result<Transcript, S3Error> {
            *self.last_session_id.lock().unwrap() = Some(session_id.to_string());
            self.get_by_session_response
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| Err(S3Error::Other("not configured".to_string())))
        }
    }

    async fn body_to_json(body: Body) -> Value {
        let bytes = body.collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn make_transcript(id: &str, session_id: Option<&str>) -> Transcript {
        Transcript {
            id: id.to_string(),
            session_id: session_id.map(|s| s.to_string()),
            content: "Some transcript content".to_string(),
            messages: None,
            subagents: None,
            extra: serde_json::Map::new(),
        }
    }

    #[tokio::test]
    async fn get_transcript_returns_data() {
        let repo = MockRepo::new();
        repo.set_get_transcript(Ok(make_transcript("test-transcript-1", None)));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/transcripts/test-transcript-1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert_eq!(body["id"], "test-transcript-1");
        assert!(body.get("content").is_some());
    }

    #[tokio::test]
    async fn get_transcript_returns_404_when_not_found() {
        let repo = MockRepo::new();
        repo.set_get_transcript(Err(S3Error::TranscriptNotFound));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/transcripts/non-existent-id")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = body_to_json(response.into_body()).await;
        assert!(body.get("error").is_some());
    }

    #[tokio::test]
    async fn get_transcript_returns_500_on_unexpected_error() {
        let repo = MockRepo::new();
        repo.set_get_transcript(Err(S3Error::Other("Unexpected S3 failure".to_string())));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/transcripts/invalid-id")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(response.status().as_u16() >= 400);
    }

    #[tokio::test]
    async fn get_transcript_includes_subagents() {
        let repo = MockRepo::new();
        let mut t = make_transcript("test-with-subagents", None);
        t.subagents = Some(Vec::new());
        repo.set_get_transcript(Ok(t));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/transcripts/test-with-subagents")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert!(body["subagents"].is_array());
    }

    fn session_transcript(session_id: &str) -> Transcript {
        Transcript {
            id: session_id.to_string(),
            session_id: Some(session_id.to_string()),
            content: "{}".to_string(),
            messages: Some(vec![TranscriptMessage {
                message_type: "user".to_string(),
                session_id: session_id.to_string(),
                timestamp: "2026-02-01T05:00:00Z".to_string(),
                uuid: "msg-001".to_string(),
                parent_uuid: None,
                agent_id: Some(session_id.to_string()),
                extra: serde_json::Map::new(),
            }]),
            subagents: Some(Vec::<SubagentTranscript>::new()),
            extra: serde_json::Map::new(),
        }
    }

    #[tokio::test]
    async fn get_by_session_returns_data() {
        let session_id = "session-abc123";
        let repo = MockRepo::new();
        repo.set_get_by_session(Ok(session_transcript(session_id)));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/transcript/session/{}", session_id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert_eq!(body["session_id"], session_id);
        assert!(body["id"].is_string());
        assert!(body["content"].is_string());
        assert!(body["messages"].is_array());
    }

    #[tokio::test]
    async fn get_by_session_returns_404_when_not_found() {
        let repo = MockRepo::new();
        repo.set_get_by_session(Err(S3Error::NoTranscriptForSession));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/transcript/session/session-nonexistent-999")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = body_to_json(response.into_body()).await;
        let err: String = body["error"].as_str().unwrap_or("").to_string();
        assert!(err.to_lowercase().contains("not found"));
    }

    #[tokio::test]
    async fn get_by_session_includes_subagents() {
        let session_id = "session-abc123";
        let repo = MockRepo::new();
        let mut t = session_transcript(session_id);
        t.messages = Some(Vec::new());
        repo.set_get_by_session(Ok(t));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/transcript/session/{}", session_id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert!(body["subagents"].is_array());
    }

    #[tokio::test]
    async fn get_by_session_first_message_has_structure() {
        let session_id = "session-abc123";
        let repo = MockRepo::new();
        repo.set_get_by_session(Ok(session_transcript(session_id)));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/transcript/session/{}", session_id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        let msgs = body["messages"].as_array().unwrap();
        let first = &msgs[0];
        assert!(first.get("type").is_some());
        assert!(first.get("sessionId").is_some());
        assert!(first.get("uuid").is_some());
    }

    #[tokio::test]
    async fn get_by_session_handles_s3_errors() {
        let repo = MockRepo::new();
        repo.set_get_by_session(Err(S3Error::Other("S3 connection failed".to_string())));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/transcript/session/session-trigger-s3-error")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(response.status().as_u16() >= 400);
        let body = body_to_json(response.into_body()).await;
        assert!(body.get("error").is_some());
    }

    #[tokio::test]
    async fn get_by_session_trims_whitespace() {
        let session_id = "session-abc123";
        let repo = MockRepo::new();
        repo.set_get_by_session(Ok(session_transcript(session_id)));
        let app = build_app_with_repo(repo.clone());

        let url_segment = url_encode("  session-abc123  ");
        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/transcript/session/{}", url_segment))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert_eq!(body["session_id"], session_id);
        assert_eq!(
            repo.last_session_id.lock().unwrap().as_deref(),
            Some(session_id)
        );
    }

    #[tokio::test]
    async fn get_by_session_response_shape_matches() {
        let session_id = "session-abc123";
        let repo = MockRepo::new();
        repo.set_get_by_session(Ok(session_transcript(session_id)));
        let app = build_app_with_repo(repo.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/transcript/session/{}", session_id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert_eq!(body["session_id"], session_id);
        assert!(body["id"].is_string());
        assert!(body["content"].is_string());
        assert!(body["messages"].is_array());
        assert!(body["subagents"].is_array());

        let msgs = body["messages"].as_array().unwrap();
        if !msgs.is_empty() {
            let first = &msgs[0];
            let t = first["type"].as_str().unwrap();
            assert!(t == "user" || t == "assistant" || t == "queue-operation");
            assert!(first["sessionId"].is_string());
            assert!(first["uuid"].is_string());
        }
    }

    #[tokio::test]
    async fn health_endpoint() {
        let repo = MockRepo::new();
        let app = build_app_with_repo(repo);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_to_json(response.into_body()).await;
        assert_eq!(body["status"], "healthy");
    }

    #[tokio::test]
    async fn session_route_resolves_under_both_mount_points() {
        let session_id = "abc";
        for prefix in ["/api/transcript", "/api/transcripts"] {
            let repo = MockRepo::new();
            repo.set_get_by_session(Ok(session_transcript(session_id)));
            let app = build_app_with_repo(repo.clone());
            let response = app
                .oneshot(
                    Request::builder()
                        .uri(format!("{}/session/{}", prefix, session_id))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                StatusCode::OK,
                "session route should resolve under {}",
                prefix
            );
            assert_eq!(
                repo.last_session_id.lock().unwrap().as_deref(),
                Some(session_id),
                "session handler should be invoked under {}",
                prefix
            );
        }
    }

    #[tokio::test]
    async fn fallback_returns_404_json() {
        let repo = MockRepo::new();
        let app = build_app_with_repo(repo);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/no/such/path")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = body_to_json(response.into_body()).await;
        assert_eq!(body["error"], json!("Not found"));
    }

    fn url_encode(s: &str) -> String {
        let mut out = String::new();
        for byte in s.as_bytes() {
            let c = *byte;
            if c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.' | b'~') {
                out.push(c as char);
            } else {
                out.push_str(&format!("%{:02X}", c));
            }
        }
        out
    }
}
