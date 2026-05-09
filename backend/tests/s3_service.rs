use backend::services::s3::{S3Service, S3ServiceConfig};

async fn build_test_service(prefix: Option<&str>) -> S3Service {
    S3Service::new(S3ServiceConfig {
        bucket: "test-bucket".to_string(),
        region: "us-east-1".to_string(),
        prefix: prefix.map(|s| s.to_string()),
        ..Default::default()
    })
    .await
}

#[tokio::test]
async fn fetches_transcript_from_mock_bucket() {
    let svc = build_test_service(None).await;
    let result = svc.get_transcript("test-transcript-1").await.unwrap();
    assert_eq!(result["id"], "test-transcript-1");
    assert!(result["content"].is_string());
}

#[tokio::test]
async fn returns_error_when_transcript_not_found() {
    let svc = build_test_service(None).await;
    let err = svc.get_transcript("non-existent").await.unwrap_err();
    assert_eq!(err.to_string(), "Transcript not found");
}

#[tokio::test]
async fn parses_json_transcript() {
    let svc = build_test_service(None).await;
    let result = svc.get_transcript("test-json-transcript").await.unwrap();
    assert!(result["id"].is_string());
    assert!(result["content"].is_string());
    assert!(result["timestamp"].is_string());
}

#[tokio::test]
async fn lists_transcripts_in_bucket() {
    let svc = build_test_service(None).await;
    let results = svc.list_transcripts().await.unwrap();
    assert!(!results.is_empty());
}

#[tokio::test]
async fn returns_empty_for_empty_bucket() {
    let svc = S3Service::new(S3ServiceConfig {
        bucket: "empty-bucket".to_string(),
        region: "us-east-1".to_string(),
        ..Default::default()
    })
    .await;
    let results = svc.list_transcripts().await.unwrap();
    assert!(results.is_empty());
}

#[tokio::test]
async fn merges_main_and_subagent_messages() {
    let svc = build_test_service(None).await;
    let result = svc
        .get_transcript_by_session_id("session-abc123")
        .await
        .unwrap();
    let messages = result["messages"].as_array().unwrap();
    assert!(messages.len() > 2);

    let main_count = messages
        .iter()
        .filter(|m| m["sessionId"] == "session-abc123")
        .count();
    let sub_count = messages
        .iter()
        .filter(|m| m["sessionId"] != "session-abc123")
        .count();
    assert!(main_count > 0);
    assert!(sub_count > 0);
}

#[tokio::test]
async fn sorts_messages_chronologically() {
    let svc = build_test_service(None).await;
    let result = svc
        .get_transcript_by_session_id("session-abc123")
        .await
        .unwrap();
    let messages = result["messages"].as_array().unwrap();
    for window in messages.windows(2) {
        let prev = window[0]["timestamp"].as_str().unwrap();
        let curr = window[1]["timestamp"].as_str().unwrap();
        assert!(prev <= curr, "messages out of chronological order");
    }
}

#[tokio::test]
async fn all_messages_have_agent_id() {
    let svc = build_test_service(None).await;
    let result = svc
        .get_transcript_by_session_id("session-abc123")
        .await
        .unwrap();
    let messages = result["messages"].as_array().unwrap();
    for msg in messages {
        let agent_id = msg["agentId"].as_str().unwrap_or("");
        assert!(!agent_id.is_empty());
    }
}

#[tokio::test]
async fn main_messages_have_session_id_as_agent_id() {
    let svc = build_test_service(None).await;
    let result = svc
        .get_transcript_by_session_id("session-abc123")
        .await
        .unwrap();
    let messages = result["messages"].as_array().unwrap();
    for msg in messages
        .iter()
        .filter(|m| m["sessionId"] == "session-abc123")
    {
        assert_eq!(msg["agentId"], "session-abc123");
    }
}

#[tokio::test]
async fn subagent_messages_have_subagent_session_as_agent_id() {
    let svc = build_test_service(None).await;
    let result = svc
        .get_transcript_by_session_id("session-abc123")
        .await
        .unwrap();
    let messages = result["messages"].as_array().unwrap();
    for msg in messages
        .iter()
        .filter(|m| m["sessionId"] != "session-abc123")
    {
        assert_eq!(msg["agentId"], msg["sessionId"]);
        assert_ne!(msg["agentId"], "session-abc123");
    }
}

#[tokio::test]
async fn handles_session_with_no_subagents() {
    let svc = build_test_service(None).await;
    let result = svc
        .get_transcript_by_session_id("session-xyz789")
        .await
        .unwrap();
    assert_eq!(result["session_id"], "session-xyz789");
    let messages = result["messages"].as_array().unwrap();
    for msg in messages {
        assert_eq!(msg["sessionId"], "session-xyz789");
        assert_eq!(msg["agentId"], "session-xyz789");
    }
    assert_eq!(result["subagents"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn assume_role_constructor_does_not_panic() {
    let _svc = S3Service::new(S3ServiceConfig {
        bucket: "test-bucket".to_string(),
        region: "us-east-1".to_string(),
        assume_role_arn: Some("arn:aws:iam::123456789012:role/test-role".to_string()),
        assume_role_session_name: Some("custom-session".to_string()),
        assume_role_external_id: Some("ext-123".to_string()),
        assume_role_duration_seconds: Some(1800),
        ..Default::default()
    })
    .await;
}

#[tokio::test]
async fn endpoint_takes_precedence_over_assume_role() {
    let _svc = S3Service::new(S3ServiceConfig {
        bucket: "test-bucket".to_string(),
        region: "us-east-1".to_string(),
        endpoint: Some("http://localhost:9000".to_string()),
        assume_role_arn: Some("arn:aws:iam::123456789012:role/test-role".to_string()),
        ..Default::default()
    })
    .await;
}

#[tokio::test]
async fn prefix_defaults_to_empty() {
    let svc = build_test_service(None).await;
    assert_eq!(svc.prefix(), "");
}

#[tokio::test]
async fn prefix_appends_trailing_slash() {
    let svc = build_test_service(Some("foo/bar")).await;
    assert_eq!(svc.prefix(), "foo/bar/");
}

#[tokio::test]
async fn prefix_strips_leading_slash() {
    let svc = build_test_service(Some("/foo/bar/")).await;
    assert_eq!(svc.prefix(), "foo/bar/");
}
