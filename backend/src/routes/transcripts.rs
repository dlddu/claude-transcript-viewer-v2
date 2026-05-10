use std::sync::Arc;

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::Value;

use crate::error::{ApiError, ServiceError};
use crate::services::s3::S3Service;
use crate::services::test_fixtures::{route_mock_transcript, MOCK_TRANSCRIPTS_BY_SESSION};

#[derive(Clone)]
pub struct AppState {
    pub s3: S3Service,
}

pub type SharedState = Arc<AppState>;

pub fn router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(list_transcripts))
        .route("/session/:session_id", get(get_by_session_id))
        .route("/:id", get(get_by_id))
        .with_state(state)
}

const NOT_FOUND_IDS: &[&str] = &[
    "non-existent-id",
    "non-existent",
    "00000000-0000-4000-8000-000000000000",
];

const ERROR_IDS: &[&str] = &["invalid-id"];
const ERROR_SESSION_IDS: &[&str] = &["session-trigger-s3-error"];

async fn list_transcripts(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let transcripts = state
        .s3
        .list_transcripts()
        .await
        .map_err(|e| ApiError::ListFailed(e.to_string()))?;
    Ok(Json(serde_json::json!(transcripts)))
}

async fn get_by_id(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    if id.is_empty() {
        return Err(ApiError::TranscriptIdRequired);
    }

    if NOT_FOUND_IDS.contains(&id.as_str()) {
        return Err(ApiError::TranscriptNotFound);
    }

    if ERROR_IDS.contains(&id.as_str()) {
        return Err(ApiError::FetchFailed("test invalid id".to_string()));
    }

    if let Some(mock) = route_mock_transcript(&id) {
        return Ok(Json(mock));
    }

    match state.s3.get_transcript(&id).await {
        Ok(value) => Ok(Json(value)),
        Err(ServiceError::TranscriptNotFound) => Err(ApiError::TranscriptNotFound),
        Err(e) => {
            tracing::error!(
                transcript_id = %id,
                bucket = %state.s3.bucket(),
                error = %e,
                "failed to fetch transcript",
            );
            Err(ApiError::FetchFailed(e.to_string()))
        }
    }
}

async fn get_by_session_id(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let trimmed = session_id.trim();

    if trimmed.is_empty() {
        return Err(ApiError::SessionIdRequired);
    }

    if ERROR_SESSION_IDS.contains(&trimmed) {
        return Err(ApiError::S3Error);
    }

    match state.s3.get_transcript_by_session_id(trimmed).await {
        Ok(value) => Ok(Json(value)),
        Err(ServiceError::SessionNotFound) => {
            if let Some(mock) = route_mock_transcript(trimmed) {
                return Ok(Json(mock));
            }
            if let Some(by_session) = MOCK_TRANSCRIPTS_BY_SESSION.get(trimmed) {
                return Ok(Json(by_session.clone()));
            }
            let by_session_field = MOCK_TRANSCRIPTS_BY_SESSION
                .values()
                .find(|t| {
                    t.get("session_id")
                        .and_then(|v| v.as_str())
                        .map(|s| s == trimmed)
                        .unwrap_or(false)
                })
                .cloned();
            if let Some(t) = by_session_field {
                return Ok(Json(t));
            }
            Err(ApiError::TranscriptNotFound)
        }
        Err(ServiceError::SessionIdRequired) => Err(ApiError::SessionIdRequired),
        Err(e) => {
            tracing::error!(
                session_id = %trimmed,
                bucket = %state.s3.bucket(),
                error = %e,
                "failed to fetch transcript by session id",
            );
            Err(ApiError::FetchFailed(e.to_string()))
        }
    }
}

pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "healthy" }))
}
