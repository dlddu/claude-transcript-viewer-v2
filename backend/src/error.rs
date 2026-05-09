use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Transcript not found")]
    TranscriptNotFound,

    #[error("No transcript found for session ID")]
    SessionNotFound,

    #[error("Session ID is required")]
    SessionIdRequired,

    #[error("Transcript ID is required")]
    TranscriptIdRequired,

    #[error("Failed to fetch transcript: {0}")]
    FetchFailed(String),

    #[error("Failed to list transcripts: {0}")]
    ListFailed(String),

    #[error("S3 service error")]
    S3Error,

    #[error("Internal server error: {0}")]
    Internal(String),
}

impl ApiError {
    pub fn status(&self) -> StatusCode {
        match self {
            ApiError::TranscriptNotFound | ApiError::SessionNotFound => StatusCode::NOT_FOUND,
            ApiError::SessionIdRequired | ApiError::TranscriptIdRequired => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            ApiError::TranscriptNotFound => "Transcript not found".to_string(),
            ApiError::SessionNotFound => "Transcript not found".to_string(),
            ApiError::SessionIdRequired => "Session ID is required".to_string(),
            ApiError::TranscriptIdRequired => "Transcript ID is required".to_string(),
            ApiError::FetchFailed(_) => "Failed to fetch transcript".to_string(),
            ApiError::ListFailed(_) => "Failed to list transcripts".to_string(),
            ApiError::S3Error => "S3 service error".to_string(),
            ApiError::Internal(_) => "Internal server error".to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let message = self.user_message();
        if status.is_server_error() {
            tracing::error!(error = %self, "request failed");
        }
        (status, Json(json!({ "error": message }))).into_response()
    }
}

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("Transcript not found")]
    TranscriptNotFound,

    #[error("No transcript found for session ID")]
    SessionNotFound,

    #[error("Session ID is required")]
    SessionIdRequired,

    #[error("S3 error: {0}")]
    S3(String),

    #[error("Parse error: {0}")]
    Parse(String),
}
