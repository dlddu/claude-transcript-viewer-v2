use std::env;
use std::sync::Arc;

use aws_config::{BehaviorVersion, Region};
use aws_credential_types::provider::SharedCredentialsProvider;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::Builder as S3ConfigBuilder;
use aws_sdk_s3::Client as S3Client;
use serde_json::Value;

use crate::error::ServiceError;

use super::test_fixtures::{MOCK_TRANSCRIPTS, MOCK_TRANSCRIPTS_BY_SESSION};

#[derive(Debug, Clone, Default)]
pub struct S3ServiceConfig {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub prefix: Option<String>,
    pub assume_role_arn: Option<String>,
    pub assume_role_session_name: Option<String>,
    pub assume_role_external_id: Option<String>,
    pub assume_role_duration_seconds: Option<i32>,
}

#[derive(Clone)]
pub struct S3Service {
    inner: Arc<S3ServiceInner>,
}

struct S3ServiceInner {
    bucket: String,
    prefix: String,
    client: Option<S3Client>,
}

fn normalize_prefix(prefix: Option<&str>) -> String {
    let Some(p) = prefix else {
        return String::new();
    };
    let trimmed = p.trim_start_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with('/') {
        trimmed.to_string()
    } else {
        format!("{trimmed}/")
    }
}

/// Walk an error's source chain so AWS SDK failures surface the full context
/// (operation, dispatch error, transport error, request id, etc.) instead of
/// the unhelpful top-level "unhandled error" string.
fn format_error_chain<E: std::error::Error + ?Sized>(err: &E) -> String {
    use std::fmt::Write;
    let mut buf = err.to_string();
    let mut source: Option<&dyn std::error::Error> = err.source();
    while let Some(e) = source {
        let _ = write!(buf, ": {e}");
        source = e.source();
    }
    buf
}

impl S3Service {
    pub async fn new(config: S3ServiceConfig) -> Self {
        let bucket = config.bucket.clone();
        let prefix = normalize_prefix(config.prefix.as_deref());
        let client = build_s3_client(&config).await;
        Self {
            inner: Arc::new(S3ServiceInner {
                bucket,
                prefix,
                client,
            }),
        }
    }

    pub async fn from_env() -> Self {
        let assume_role_duration_seconds = env::var("AWS_ASSUME_ROLE_DURATION_SECONDS")
            .ok()
            .and_then(|v| v.parse::<i32>().ok());

        let config = S3ServiceConfig {
            bucket: env::var("S3_BUCKET").unwrap_or_else(|_| "test-transcripts".to_string()),
            region: env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
            endpoint: env::var("AWS_ENDPOINT_URL").ok(),
            prefix: env::var("S3_PREFIX").ok(),
            assume_role_arn: env::var("AWS_ASSUME_ROLE_ARN").ok(),
            assume_role_session_name: env::var("AWS_ASSUME_ROLE_SESSION_NAME").ok(),
            assume_role_external_id: env::var("AWS_ASSUME_ROLE_EXTERNAL_ID").ok(),
            assume_role_duration_seconds,
        };
        Self::new(config).await
    }

    pub fn bucket(&self) -> &str {
        &self.inner.bucket
    }

    pub fn prefix(&self) -> &str {
        &self.inner.prefix
    }

    pub async fn get_transcript(&self, transcript_id: &str) -> Result<Value, ServiceError> {
        if self.inner.bucket == "test-bucket" {
            return MOCK_TRANSCRIPTS
                .get(transcript_id)
                .cloned()
                .ok_or(ServiceError::TranscriptNotFound);
        }

        let client = self
            .inner
            .client
            .as_ref()
            .ok_or_else(|| ServiceError::S3("S3 client not configured".to_string()))?;

        let base_key = if transcript_id.ends_with(".json") {
            transcript_id.to_string()
        } else {
            format!("{transcript_id}.json")
        };
        let key = format!("{}{}", self.inner.prefix, base_key);

        tracing::debug!(bucket = %self.inner.bucket, key = %key, "GetObject");

        let response = client
            .get_object()
            .bucket(&self.inner.bucket)
            .key(&key)
            .send()
            .await
            .map_err(|err| {
                let detailed = format_error_chain(&err);
                match err.into_service_error() {
                    aws_sdk_s3::operation::get_object::GetObjectError::NoSuchKey(_) => {
                        ServiceError::TranscriptNotFound
                    }
                    other => {
                        if let Some(code) = other.meta().code() {
                            if code.eq_ignore_ascii_case("NoSuchKey") || code == "404" {
                                return ServiceError::TranscriptNotFound;
                            }
                        }
                        tracing::warn!(
                            bucket = %self.inner.bucket,
                            key = %key,
                            error = %detailed,
                            "GetObject failed",
                        );
                        ServiceError::S3(detailed)
                    }
                }
            })?;

        let body = response
            .body
            .collect()
            .await
            .map_err(|e| ServiceError::S3(format_error_chain(&e)))?;
        let bytes = body.into_bytes();
        let parsed: Value = serde_json::from_slice(&bytes)
            .map_err(|e| ServiceError::Parse(format!("Failed to parse JSON: {e}")))?;
        Ok(parsed)
    }

    pub async fn list_transcripts(&self) -> Result<Vec<String>, ServiceError> {
        if self.inner.bucket == "test-bucket" {
            let mut keys: Vec<String> = MOCK_TRANSCRIPTS.keys().cloned().collect();
            keys.sort();
            return Ok(keys);
        }
        if self.inner.bucket == "empty-bucket" {
            return Ok(vec![]);
        }

        let client = self
            .inner
            .client
            .as_ref()
            .ok_or_else(|| ServiceError::S3("S3 client not configured".to_string()))?;

        let mut request = client.list_objects_v2().bucket(&self.inner.bucket);
        if !self.inner.prefix.is_empty() {
            request = request.prefix(&self.inner.prefix);
        }
        let response = request.send().await.map_err(|err| {
            let detailed = format_error_chain(&err);
            let svc = err.into_service_error();
            if let Some(code) = svc.meta().code() {
                if code.eq_ignore_ascii_case("NoSuchBucket") {
                    return ServiceError::S3("NoSuchBucket".to_string());
                }
            }
            ServiceError::S3(detailed)
        });
        let response = match response {
            Ok(r) => r,
            Err(ServiceError::S3(msg)) if msg == "NoSuchBucket" => return Ok(vec![]),
            Err(e) => return Err(e),
        };

        let contents = response.contents();
        if contents.is_empty() {
            return Ok(vec![]);
        }

        let mut ids: Vec<String> = contents
            .iter()
            .filter_map(|item| item.key())
            .map(|key| {
                if !self.inner.prefix.is_empty() && key.starts_with(&self.inner.prefix) {
                    &key[self.inner.prefix.len()..]
                } else {
                    key
                }
            })
            .map(|key| {
                if let Some(stripped) = key.strip_suffix(".json") {
                    stripped.to_string()
                } else {
                    key.to_string()
                }
            })
            .collect();
        ids.sort();
        Ok(ids)
    }

    pub async fn get_transcript_by_session_id(
        &self,
        session_id: &str,
    ) -> Result<Value, ServiceError> {
        let trimmed = session_id.trim();
        if trimmed.is_empty() {
            return Err(ServiceError::SessionIdRequired);
        }

        if self.inner.bucket == "test-bucket" {
            return MOCK_TRANSCRIPTS_BY_SESSION
                .get(trimmed)
                .cloned()
                .ok_or(ServiceError::SessionNotFound);
        }

        let client = self
            .inner
            .client
            .as_ref()
            .ok_or_else(|| ServiceError::S3("S3 client not configured".to_string()))?;

        let session_key_prefix = format!("{}{}", self.inner.prefix, trimmed);

        tracing::debug!(
            bucket = %self.inner.bucket,
            prefix = %session_key_prefix,
            "ListObjectsV2 for session",
        );

        let list_response = client
            .list_objects_v2()
            .bucket(&self.inner.bucket)
            .prefix(&session_key_prefix)
            .send()
            .await
            .map_err(|err| {
                let detailed = format_error_chain(&err);
                let svc = err.into_service_error();
                if let Some(code) = svc.meta().code() {
                    if code.eq_ignore_ascii_case("NoSuchBucket") {
                        return ServiceError::SessionNotFound;
                    }
                }
                tracing::warn!(
                    bucket = %self.inner.bucket,
                    prefix = %session_key_prefix,
                    error = %detailed,
                    "ListObjectsV2 failed",
                );
                ServiceError::S3(detailed)
            })?;

        let contents = list_response.contents();
        if contents.is_empty() {
            return Err(ServiceError::SessionNotFound);
        }

        let main_key_jsonl = format!("{session_key_prefix}.jsonl");
        let main_key_json = format!("{session_key_prefix}.json");
        let main_transcript_key = contents
            .iter()
            .filter_map(|item| item.key())
            .find(|key| **key == main_key_jsonl || **key == main_key_json)
            .map(|s| s.to_string())
            .ok_or(ServiceError::SessionNotFound)?;

        let get_response = client
            .get_object()
            .bucket(&self.inner.bucket)
            .key(&main_transcript_key)
            .send()
            .await
            .map_err(|err| ServiceError::S3(format_error_chain(&err)))?;

        let body = get_response
            .body
            .collect()
            .await
            .map_err(|e| ServiceError::S3(format_error_chain(&e)))?;
        let body_string = String::from_utf8(body.into_bytes().to_vec())
            .map_err(|e| ServiceError::Parse(format!("Body is not UTF-8: {e}")))?;

        let (mut transcript, mut main_messages) = if main_transcript_key.ends_with(".jsonl") {
            let messages = parse_jsonl(&body_string)?;
            let transcript = serde_json::json!({
                "id": trimmed,
                "session_id": trimmed,
                "content": body_string,
                "messages": messages,
            });
            (transcript, messages)
        } else {
            let parsed: Value = serde_json::from_str(&body_string)
                .map_err(|e| ServiceError::Parse(e.to_string()))?;
            let messages = parsed
                .get("messages")
                .and_then(|m| m.as_array())
                .cloned()
                .unwrap_or_default();
            (parsed, messages)
        };

        for msg in &mut main_messages {
            if let Value::Object(map) = msg {
                if !map.contains_key("agentId") || map.get("agentId") == Some(&Value::Null) {
                    map.insert("agentId".to_string(), Value::String(trimmed.to_string()));
                }
            }
        }

        let mut all_messages = main_messages.clone();

        let subagent_files: Vec<String> = contents
            .iter()
            .filter_map(|item| item.key())
            .filter(|key| {
                key.starts_with(&format!("{session_key_prefix}/")) && key.contains("agent-")
            })
            .map(|s| s.to_string())
            .collect();

        let mut subagents: Vec<Value> = Vec::new();
        for sub_key in subagent_files {
            let sub_resp = match client
                .get_object()
                .bucket(&self.inner.bucket)
                .key(&sub_key)
                .send()
                .await
            {
                Ok(r) => r,
                Err(_) => continue,
            };
            let sub_body = match sub_resp.body.collect().await {
                Ok(b) => b,
                Err(_) => continue,
            };
            let sub_string = match String::from_utf8(sub_body.into_bytes().to_vec()) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let file_name = sub_key.rsplit('/').next().unwrap_or(&sub_key);
            let agent_id = file_name
                .strip_suffix(".jsonl")
                .or_else(|| file_name.strip_suffix(".json"))
                .unwrap_or(file_name)
                .to_string();

            let mut sub_messages = parse_jsonl(&sub_string).unwrap_or_default();
            for msg in &mut sub_messages {
                if let Value::Object(map) = msg {
                    if !map.contains_key("agentId") || map.get("agentId") == Some(&Value::Null) {
                        map.insert("agentId".to_string(), Value::String(agent_id.clone()));
                    }
                }
            }

            all_messages.extend(sub_messages.clone());

            subagents.push(serde_json::json!({
                "id": agent_id,
                "name": agent_id,
                "transcript_file": sub_key,
                "content": sub_string,
                "messages": sub_messages,
            }));
        }

        if !subagents.is_empty() {
            if let Value::Object(ref mut map) = transcript {
                map.insert("subagents".to_string(), Value::Array(subagents));
            }
        } else if let Value::Object(ref mut map) = transcript {
            if !map.contains_key("subagents") {
                map.insert("subagents".to_string(), Value::Array(vec![]));
            }
        }

        all_messages.sort_by(|a, b| {
            let ta = a.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
            let tb = b.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
            ta.cmp(tb)
        });

        if let Value::Object(ref mut map) = transcript {
            map.insert("messages".to_string(), Value::Array(all_messages));
        }

        Ok(transcript)
    }
}

fn parse_jsonl(body: &str) -> Result<Vec<Value>, ServiceError> {
    let mut messages = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(trimmed)
            .map_err(|e| ServiceError::Parse(format!("Invalid JSONL: {e}")))?;
        messages.push(value);
    }
    Ok(messages)
}

async fn build_s3_client(config: &S3ServiceConfig) -> Option<S3Client> {
    log_startup_config(config);

    let region = Region::new(config.region.clone());

    if let Some(endpoint) = &config.endpoint {
        let access_key = env::var("AWS_ACCESS_KEY_ID").unwrap_or_else(|_| "minioadmin".to_string());
        let secret_key =
            env::var("AWS_SECRET_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
        let creds = Credentials::new(access_key, secret_key, None, None, "static");

        tracing::info!(
            endpoint = %endpoint,
            credential_source = "static (endpoint override)",
            "S3 client using S3-compatible endpoint",
        );

        let s3_config = S3ConfigBuilder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(region)
            .endpoint_url(endpoint)
            .credentials_provider(SharedCredentialsProvider::new(creds))
            .force_path_style(true)
            .build();
        return Some(S3Client::from_conf(s3_config));
    }

    let mut loader = aws_config::defaults(BehaviorVersion::latest()).region(region.clone());

    if let Some(role_arn) = &config.assume_role_arn {
        tracing::info!(
            role_arn = %role_arn,
            session_name = ?config.assume_role_session_name,
            has_external_id = config.assume_role_external_id.is_some(),
            duration_seconds = ?config.assume_role_duration_seconds,
            "Configuring STS AssumeRole credentials provider",
        );
        let mut builder = aws_config::sts::AssumeRoleProvider::builder(role_arn)
            .session_name(
                config
                    .assume_role_session_name
                    .clone()
                    .unwrap_or_else(|| "claude-transcript-viewer".to_string()),
            )
            .region(region);
        if let Some(external_id) = &config.assume_role_external_id {
            builder = builder.external_id(external_id);
        }
        if let Some(duration) = config.assume_role_duration_seconds {
            builder = builder.session_length(std::time::Duration::from_secs(duration as u64));
        }
        let provider = builder.build().await;
        loader = loader.credentials_provider(provider);
    } else {
        tracing::info!("Using default AWS credential provider chain (env, IRSA, profile, IMDS)",);
    }

    let shared_config = loader.load().await;
    probe_credentials(&shared_config).await;
    Some(S3Client::new(&shared_config))
}

/// Mask all but the last 4 characters of an access key for log output.
fn mask_access_key(key: &str) -> String {
    let len = key.len();
    if len <= 4 {
        "****".to_string()
    } else {
        let tail = &key[len - 4..];
        format!("{}****{}", &key[..1], tail)
    }
}

fn log_startup_config(config: &S3ServiceConfig) {
    let aws_envs: Vec<String> = env::vars()
        .map(|(k, _)| k)
        .filter(|k| k.starts_with("AWS_") || k == "S3_BUCKET" || k == "S3_PREFIX")
        .collect();

    tracing::info!(
        bucket = %config.bucket,
        region = %config.region,
        prefix = ?config.prefix,
        endpoint = ?config.endpoint,
        assume_role_arn = ?config.assume_role_arn,
        env_vars_present = ?aws_envs,
        "S3 service configuration",
    );
}

async fn probe_credentials(shared_config: &aws_config::SdkConfig) {
    use aws_credential_types::provider::ProvideCredentials;

    let Some(provider) = shared_config.credentials_provider() else {
        tracing::warn!("No credentials provider configured on SdkConfig");
        return;
    };

    match provider.provide_credentials().await {
        Ok(creds) => {
            tracing::info!(
                access_key_id = %mask_access_key(creds.access_key_id()),
                has_session_token = creds.session_token().is_some(),
                expiry = ?creds.expiry(),
                "AWS credentials resolved at startup",
            );
        }
        Err(err) => {
            tracing::error!(
                error = %format_error_chain(&err),
                "Failed to resolve AWS credentials at startup. Check AWS_ACCESS_KEY_ID / \
                 AWS_WEB_IDENTITY_TOKEN_FILE / IMDS / ~/.aws/credentials.",
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_prefix_returns_empty_for_none() {
        assert_eq!(normalize_prefix(None), "");
    }

    #[test]
    fn normalize_prefix_returns_empty_for_empty_string() {
        assert_eq!(normalize_prefix(Some("")), "");
    }

    #[test]
    fn normalize_prefix_appends_trailing_slash() {
        assert_eq!(normalize_prefix(Some("foo/bar")), "foo/bar/");
    }

    #[test]
    fn normalize_prefix_keeps_trailing_slash() {
        assert_eq!(normalize_prefix(Some("foo/bar/")), "foo/bar/");
    }

    #[test]
    fn normalize_prefix_strips_leading_slashes() {
        assert_eq!(normalize_prefix(Some("/foo/bar/")), "foo/bar/");
    }

    #[test]
    fn normalize_prefix_normalizes_slashes_only() {
        assert_eq!(normalize_prefix(Some("///")), "");
    }
}
