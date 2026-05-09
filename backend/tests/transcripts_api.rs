use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;

use backend::app::build_app;
use backend::services::s3::{S3Service, S3ServiceConfig};

async fn test_app() -> axum::Router {
    let s3 = S3Service::new(S3ServiceConfig {
        bucket: "test-bucket".to_string(),
        region: "us-east-1".to_string(),
        ..Default::default()
    })
    .await;
    build_app(s3)
}

async fn get_json(app: &axum::Router, path: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
        .await
        .expect("request failed");
    let status = response.status();
    let body = to_bytes(response.into_body(), 10 * 1024 * 1024)
        .await
        .expect("body");
    let value: Value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).expect("body should be JSON")
    };
    (status, value)
}

#[tokio::test]
async fn health_returns_healthy() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/health").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "healthy");
}

#[tokio::test]
async fn returns_transcript_data_from_s3() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcripts/test-transcript-1").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], "test-transcript-1");
    assert!(body["content"].is_string());
}

#[tokio::test]
async fn returns_404_when_transcript_not_found() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcripts/non-existent-id").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["error"].is_string());
}

#[tokio::test]
async fn handles_s3_errors_gracefully() {
    let app = test_app().await;
    let (status, _body) = get_json(&app, "/api/transcripts/invalid-id").await;
    assert!(status.as_u16() >= 400);
}

#[tokio::test]
async fn includes_subagents_in_response() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcripts/test-with-subagents").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["subagents"].is_array());
}

#[tokio::test]
async fn returns_transcript_for_valid_session_id() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcript/session/session-abc123").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["session_id"], "session-abc123");
    assert!(body["content"].is_string());
    assert!(body["messages"].is_array());
}

#[tokio::test]
async fn returns_404_when_session_id_not_found() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcript/session/session-nonexistent-999").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let error = body["error"].as_str().unwrap().to_lowercase();
    assert!(error.contains("not found"));
}

#[tokio::test]
async fn includes_subagents_array_for_session() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcript/session/session-abc123").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["subagents"].is_array());
}

#[tokio::test]
async fn messages_have_proper_structure() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcript/session/session-abc123").await;
    assert_eq!(status, StatusCode::OK);
    let messages = body["messages"].as_array().unwrap();
    if let Some(first) = messages.first() {
        assert!(first.get("type").is_some());
        assert!(first.get("sessionId").is_some());
        assert!(first.get("uuid").is_some());
    }
}

#[tokio::test]
async fn handles_session_s3_errors_gracefully() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcript/session/session-trigger-s3-error").await;
    assert!(status.as_u16() >= 400);
    assert!(body["error"].is_string());
}

#[tokio::test]
async fn returns_consistent_response_structure() {
    let app = test_app().await;
    let (status, body) = get_json(&app, "/api/transcript/session/session-abc123").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["id"].is_string());
    assert_eq!(body["session_id"], "session-abc123");
    assert!(body["content"].is_string());
    assert!(body["messages"].is_array());
    assert!(body["subagents"].is_array());

    let messages = body["messages"].as_array().unwrap();
    if let Some(message) = messages.first() {
        let kind = message["type"].as_str().unwrap();
        assert!(matches!(kind, "user" | "assistant" | "queue-operation"));
        assert!(message["sessionId"].is_string());
        assert!(message["uuid"].is_string());
    }
}
