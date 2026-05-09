use std::sync::Arc;

use axum::http::StatusCode;
use axum::routing::get;
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::routes::transcripts::{self, AppState, SharedState};
use crate::services::s3::S3Service;

pub fn build_app(s3: S3Service) -> Router {
    let state: SharedState = Arc::new(AppState { s3 });

    Router::new()
        .route("/api/health", get(transcripts::health))
        .nest("/api/transcripts", transcripts::router(state.clone()))
        .nest("/api/transcript", transcripts::router(state))
        .fallback(not_found)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

async fn not_found() -> (StatusCode, axum::Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        axum::Json(serde_json::json!({ "error": "Not found" })),
    )
}
