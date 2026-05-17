use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

pub const TRANSCRIPT_NOT_FOUND: &str = "Transcript not found";
pub const NO_TRANSCRIPT_FOR_SESSION: &str = "No transcript found for session ID";
pub const SESSION_ID_REQUIRED: &str = "Session ID is required";
pub const FETCH_FAILED: &str = "Failed to fetch transcript";
pub const LIST_FAILED: &str = "Failed to list transcripts";

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Transcript not found")]
    TranscriptNotFound,

    #[error("No transcript found for session ID")]
    NoTranscriptForSession,

    #[error("Session ID is required")]
    SessionIdRequired,

    #[error("Failed to list transcripts")]
    ListFailed,

    #[error("Failed to fetch transcript")]
    FetchFailed,

    #[error("{0}")]
    Internal(String),

    #[error("Not found")]
    NotFound,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = match &self {
            AppError::TranscriptNotFound => (
                StatusCode::NOT_FOUND,
                json!({ "error": TRANSCRIPT_NOT_FOUND }),
            ),
            AppError::NoTranscriptForSession => (
                StatusCode::NOT_FOUND,
                json!({ "error": TRANSCRIPT_NOT_FOUND }),
            ),
            AppError::SessionIdRequired => (
                StatusCode::BAD_REQUEST,
                json!({ "error": SESSION_ID_REQUIRED }),
            ),
            AppError::FetchFailed => (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": FETCH_FAILED }),
            ),
            AppError::ListFailed => (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": LIST_FAILED }),
            ),
            AppError::NotFound => (StatusCode::NOT_FOUND, json!({ "error": "Not found" })),
            AppError::Internal(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": msg.clone() }),
            ),
        };
        (status, Json(body)).into_response()
    }
}

#[derive(Debug, Error)]
pub enum S3Error {
    #[error("Transcript not found")]
    TranscriptNotFound,

    #[error("No transcript found for session ID")]
    NoTranscriptForSession,

    #[error("Session ID is required")]
    SessionIdRequired,

    #[error("{0}")]
    Other(String),
}
