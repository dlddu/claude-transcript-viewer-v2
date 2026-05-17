use std::sync::Arc;

use axum::{routing::get, Json, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::config::Config;
use crate::routes::transcripts::{handler_404, transcripts_router, SharedRepo};
use crate::services::s3::{S3Service, S3ServiceConfig};

pub async fn build_app(config: Config) -> Router {
    let s3_config: S3ServiceConfig = (&config).into();
    let service = S3Service::new(s3_config).await;
    let repo: SharedRepo = Arc::new(service);
    build_app_with_repo(repo)
}

pub fn build_app_with_repo(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .nest("/api/transcripts", transcripts_router())
        .nest("/api/transcript", transcripts_router())
        .fallback(handler_404)
        .layer(CorsLayer::permissive())
        .with_state(repo)
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "healthy" }))
}
