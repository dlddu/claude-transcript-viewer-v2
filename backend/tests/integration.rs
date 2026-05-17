use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::{primitives::ByteStream, Client as S3Client};
use claude_transcript_viewer_backend::services::s3::{S3Repo, S3Service, S3ServiceConfig};

const TEST_BUCKET: &str = "test-transcripts";

fn endpoint_url() -> Option<String> {
    std::env::var("AWS_ENDPOINT_URL")
        .ok()
        .filter(|s| !s.is_empty())
}

fn fixtures_dir() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest.parent().unwrap().join("e2e").join("fixtures")
}

async fn admin_client(endpoint: &str) -> S3Client {
    let access_key =
        std::env::var("AWS_ACCESS_KEY_ID").unwrap_or_else(|_| "minioadmin".to_string());
    let secret_key =
        std::env::var("AWS_SECRET_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    let creds = Credentials::new(access_key, secret_key, None, None, "test");

    let conf = aws_sdk_s3::config::Builder::new()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new("us-east-1"))
        .endpoint_url(endpoint)
        .credentials_provider(creds)
        .force_path_style(true)
        .build();

    S3Client::from_conf(conf)
}

async fn ensure_bucket(client: &S3Client, bucket: &str) {
    let _ = client.create_bucket().bucket(bucket).send().await;
}

async fn put_object(client: &S3Client, bucket: &str, key: &str, body: Vec<u8>) {
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(ByteStream::from(body))
        .send()
        .await
        .expect("put_object should succeed");
}

async fn delete_object(client: &S3Client, bucket: &str, key: &str) {
    let _ = client.delete_object().bucket(bucket).key(key).send().await;
}

async fn upload_fixtures(client: &S3Client) {
    let dir = fixtures_dir();
    for entry in fs::read_dir(&dir).expect("read fixtures dir") {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_file() {
            let key = path.file_name().unwrap().to_string_lossy().to_string();
            let body = fs::read(&path).unwrap();
            put_object(client, TEST_BUCKET, &key, body).await;
        } else if path.is_dir() {
            let dir_name = path.file_name().unwrap().to_string_lossy().to_string();
            for sub in fs::read_dir(&path).unwrap() {
                let sub = sub.unwrap();
                if sub.path().is_file() {
                    let key = format!(
                        "{}/{}",
                        dir_name,
                        sub.path().file_name().unwrap().to_string_lossy()
                    );
                    let body = fs::read(sub.path()).unwrap();
                    put_object(client, TEST_BUCKET, &key, body).await;
                }
            }
        }
    }
}

fn make_service(
    endpoint: &str,
    prefix: Option<&str>,
) -> impl std::future::Future<Output = S3Service> {
    let config = S3ServiceConfig {
        bucket: TEST_BUCKET.to_string(),
        region: "us-east-1".to_string(),
        endpoint: Some(endpoint.to_string()),
        prefix: prefix.map(|s| s.to_string()),
        assume_role_arn: None,
        assume_role_session_name: None,
        assume_role_external_id: None,
        assume_role_duration_seconds: None,
    };
    S3Service::new(config)
}

macro_rules! require_endpoint {
    () => {
        match endpoint_url() {
            Some(e) => e,
            None => {
                eprintln!(
                    "Skipping integration test: AWS_ENDPOINT_URL not set (start MinIO/moto on :9000)"
                );
                return;
            }
        }
    };
}

#[tokio::test]
async fn fetch_transcript_from_s3_endpoint() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;
    upload_fixtures(&client).await;

    let service = make_service(&endpoint, None).await;
    let result = service.get_transcript("transcript-20260201-001").await;

    let transcript = result.expect("should fetch transcript");
    assert_eq!(transcript.id, "transcript-20260201-001");
    assert!(!transcript.content.is_empty());
}

#[tokio::test]
async fn fetch_transcript_contains_subagents_metadata() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;
    upload_fixtures(&client).await;

    let service = make_service(&endpoint, None).await;
    let transcript = service
        .get_transcript("transcript-20260201-001")
        .await
        .unwrap();

    let subagents = transcript.subagents.expect("subagents present");
    assert!(!subagents.is_empty());
    assert!(!subagents[0].name.is_empty());
}

#[tokio::test]
async fn list_transcripts_returns_ids() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;
    upload_fixtures(&client).await;

    let service = make_service(&endpoint, None).await;
    let list = service.list_transcripts().await.unwrap();
    assert!(list.iter().any(|id| id == "transcript-20260201-001"));
}

#[tokio::test]
async fn prefixed_service_fetches_under_prefix() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;

    let prefix = "tenants/acme/transcripts/";
    let id = "prefixed-integration-transcript";
    let body = serde_json::to_vec(&serde_json::json!({
        "id": id,
        "content": "Prefixed transcript content for integration testing",
        "timestamp": "2026-02-01T05:00:00Z",
    }))
    .unwrap();
    put_object(
        &client,
        TEST_BUCKET,
        &format!("{}{}.json", prefix, id),
        body,
    )
    .await;

    let prefixed = make_service(&endpoint, Some(prefix)).await;
    let transcript = prefixed.get_transcript(id).await.unwrap();
    assert_eq!(transcript.id, id);
    assert!(transcript.content.contains("Prefixed transcript content"));

    let unprefixed = make_service(&endpoint, None).await;
    let err = unprefixed.get_transcript(id).await.unwrap_err();
    assert!(matches!(
        err,
        claude_transcript_viewer_backend::error::S3Error::TranscriptNotFound
    ));

    let list = prefixed.list_transcripts().await.unwrap();
    assert!(list.iter().any(|x| x == id));
    for x in &list {
        assert!(!x.starts_with(prefix), "prefix should be stripped");
    }

    delete_object(&client, TEST_BUCKET, &format!("{}{}.json", prefix, id)).await;
}

#[tokio::test]
async fn session_id_returns_merged_timeline() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;
    upload_fixtures(&client).await;

    let service = make_service(&endpoint, None).await;
    let transcript = service
        .get_transcript_by_session_id("session-abc123")
        .await
        .expect("session transcript fetched");

    assert_eq!(transcript.session_id.as_deref(), Some("session-abc123"));
    let messages = transcript.messages.expect("messages present");
    assert!(messages.len() > 2);

    let main_msgs = messages
        .iter()
        .filter(|m| m.session_id == "session-abc123")
        .count();
    let sub_msgs = messages
        .iter()
        .filter(|m| m.session_id != "session-abc123")
        .count();
    assert!(main_msgs > 0);
    assert!(sub_msgs > 0);

    for w in messages.windows(2) {
        let a = parse_iso(&w[0].timestamp);
        let b = parse_iso(&w[1].timestamp);
        assert!(b >= a, "messages should be chronological");
    }
}

#[tokio::test]
async fn session_id_assigns_agent_id_to_main_and_subagents() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;
    upload_fixtures(&client).await;

    let service = make_service(&endpoint, None).await;
    let transcript = service
        .get_transcript_by_session_id("session-abc123")
        .await
        .unwrap();

    let messages = transcript.messages.unwrap();
    for msg in &messages {
        let agent_id = msg.agent_id.as_deref().unwrap_or("");
        assert!(!agent_id.is_empty());
        if msg.session_id == "session-abc123" {
            assert_eq!(agent_id, "session-abc123");
        } else {
            assert_eq!(agent_id, msg.session_id);
            assert_ne!(agent_id, "session-abc123");
        }
    }

    let subagents = transcript.subagents.unwrap_or_default();
    assert!(!subagents.is_empty());
    for s in &subagents {
        assert!(s.messages.as_ref().map(|m| !m.is_empty()).unwrap_or(false));
    }
}

#[tokio::test]
async fn session_without_subagents() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;
    upload_fixtures(&client).await;

    let service = make_service(&endpoint, None).await;
    let transcript = service
        .get_transcript_by_session_id("session-xyz789")
        .await
        .unwrap();

    assert_eq!(transcript.session_id.as_deref(), Some("session-xyz789"));
    let messages = transcript.messages.unwrap();
    for msg in &messages {
        assert_eq!(msg.session_id, "session-xyz789");
        assert_eq!(msg.agent_id.as_deref(), Some("session-xyz789"));
    }
    let subagents = transcript.subagents.unwrap_or_default();
    assert!(subagents.is_empty());
}

#[tokio::test]
async fn get_transcript_missing_returns_not_found() {
    let endpoint = require_endpoint!();
    let client = admin_client(&endpoint).await;
    ensure_bucket(&client, TEST_BUCKET).await;

    let service = make_service(&endpoint, None).await;
    let err = service.get_transcript("does-not-exist").await.unwrap_err();
    assert!(matches!(
        err,
        claude_transcript_viewer_backend::error::S3Error::TranscriptNotFound
    ));
}

// Use the same iso_to_millis parsing the service uses by re-implementing here
// to verify ordering — we can't access the private helper.
fn parse_iso(s: &str) -> i64 {
    // Naive UTC parse for "YYYY-MM-DDTHH:MM:SSZ" — sufficient for fixture data.
    let bytes = s.as_bytes();
    if s.len() < 19 || bytes[10] != b'T' {
        return 0;
    }
    let y: i32 = s[0..4].parse().unwrap_or(0);
    let mo: u32 = s[5..7].parse().unwrap_or(0);
    let d: u32 = s[8..10].parse().unwrap_or(0);
    let h: i64 = s[11..13].parse().unwrap_or(0);
    let mi: i64 = s[14..16].parse().unwrap_or(0);
    let se: i64 = s[17..19].parse().unwrap_or(0);
    let ye = if mo <= 2 { y - 1 } else { y } as i64;
    let me = mo as i64;
    let de = d as i64;
    let era = if ye >= 0 { ye } else { ye - 399 } / 400;
    let yoe = ye - era * 400;
    let doy = (153 * (if me > 2 { me - 3 } else { me + 9 }) + 2) / 5 + de - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    (days * 86400 + h * 3600 + mi * 60 + se) * 1000
}

// Silence unused warnings when the macro early-returns.
#[allow(dead_code)]
fn _unused_arc() -> Arc<()> {
    Arc::new(())
}
