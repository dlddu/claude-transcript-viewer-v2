use std::sync::Arc;

use async_trait::async_trait;
use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::Builder as S3ConfigBuilder,
    error::SdkError,
    operation::{get_object::GetObjectError, list_objects_v2::ListObjectsV2Error},
    Client as S3Client,
};
use futures::future::join_all;
use serde_json::Value;

use crate::config::Config;
use crate::error::S3Error;
use crate::models::{SubagentTranscript, Transcript, TranscriptMessage};

#[derive(Debug, Clone)]
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

impl From<&Config> for S3ServiceConfig {
    fn from(cfg: &Config) -> Self {
        Self {
            bucket: cfg.bucket.clone(),
            region: cfg.region.clone(),
            endpoint: cfg.endpoint.clone(),
            prefix: cfg.prefix.clone(),
            assume_role_arn: cfg.assume_role_arn.clone(),
            assume_role_session_name: cfg.assume_role_session_name.clone(),
            assume_role_external_id: cfg.assume_role_external_id.clone(),
            assume_role_duration_seconds: cfg.assume_role_duration_seconds,
        }
    }
}

pub fn normalize_prefix(prefix: Option<&str>) -> String {
    let Some(prefix) = prefix else {
        return String::new();
    };
    let trimmed = prefix.trim_start_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with('/') {
        trimmed.to_string()
    } else {
        format!("{}/", trimmed)
    }
}

fn format_error_chain<E: std::error::Error + ?Sized>(err: &E) -> String {
    use std::fmt::Write;
    let mut out = err.to_string();
    let mut source = err.source();
    while let Some(s) = source {
        let _ = write!(&mut out, ": {}", s);
        source = s.source();
    }
    out
}

#[async_trait]
pub trait S3Repo: Send + Sync {
    async fn get_transcript(&self, transcript_id: &str) -> Result<Transcript, S3Error>;
    async fn list_transcripts(&self) -> Result<Vec<String>, S3Error>;
    async fn get_transcript_by_session_id(&self, session_id: &str) -> Result<Transcript, S3Error>;
}

pub struct S3Service {
    client: S3Client,
    bucket: String,
    prefix: String,
}

impl S3Service {
    pub async fn new(config: S3ServiceConfig) -> Self {
        let bucket = config.bucket.clone();
        let prefix = normalize_prefix(config.prefix.as_deref());
        let region = Region::new(config.region.clone());

        let s3_config = if let Some(endpoint) = config.endpoint.as_ref() {
            let access_key =
                std::env::var("AWS_ACCESS_KEY_ID").unwrap_or_else(|_| "minioadmin".to_string());
            let secret_key =
                std::env::var("AWS_SECRET_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
            let creds = Credentials::new(access_key, secret_key, None, None, "static");

            S3ConfigBuilder::new()
                .behavior_version(BehaviorVersion::latest())
                .region(region)
                .endpoint_url(endpoint)
                .credentials_provider(creds)
                .force_path_style(true)
                .build()
        } else if let Some(role_arn) = config.assume_role_arn.as_ref() {
            let base_config = aws_config::defaults(BehaviorVersion::latest())
                .region(Region::new(config.region.clone()))
                .load()
                .await;

            let mut builder = aws_config::sts::AssumeRoleProvider::builder(role_arn).session_name(
                config
                    .assume_role_session_name
                    .clone()
                    .unwrap_or_else(|| "claude-transcript-viewer".to_string()),
            );

            if let Some(external_id) = config.assume_role_external_id.as_ref() {
                builder = builder.external_id(external_id);
            }
            if let Some(duration) = config.assume_role_duration_seconds {
                builder = builder.session_length(std::time::Duration::from_secs(duration as u64));
            }

            let provider = builder.configure(&base_config).build().await;

            aws_sdk_s3::config::Builder::from(&base_config)
                .credentials_provider(provider)
                .build()
        } else {
            // Default chain: env vars → profile → IRSA / container creds → IMDS.
            // The pre-migration Node.js code reached IMDS on EKS worker nodes
            // without any special config; aws-sdk-rust's default IMDS client
            // has a 1s connect/read timeout which can be too aggressive on
            // some networks and causes the chain to silently report "no
            // providers in chain provided credentials". Build the chain with
            // an IMDS client that has 5s timeouts so the instance-profile
            // path actually completes.
            let imds_client = aws_config::imds::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(5))
                .read_timeout(std::time::Duration::from_secs(5))
                .build();

            let credentials =
                aws_config::default_provider::credentials::DefaultCredentialsChain::builder()
                    .imds_client(imds_client)
                    .region(region.clone())
                    .build()
                    .await;

            let base_config = aws_config::defaults(BehaviorVersion::latest())
                .region(region)
                .credentials_provider(credentials)
                .load()
                .await;
            aws_sdk_s3::config::Builder::from(&base_config).build()
        };

        let client = S3Client::from_conf(s3_config);

        Self {
            client,
            bucket,
            prefix,
        }
    }

    pub fn prefix(&self) -> &str {
        &self.prefix
    }
}

#[async_trait]
impl S3Repo for S3Service {
    async fn get_transcript(&self, transcript_id: &str) -> Result<Transcript, S3Error> {
        let base_key = if transcript_id.ends_with(".json") {
            transcript_id.to_string()
        } else {
            format!("{}.json", transcript_id)
        };
        let key = format!("{}{}", self.prefix, base_key);

        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await;

        let body = match response {
            Ok(resp) => resp.body,
            Err(sdk_err) => {
                if is_get_object_not_found(&sdk_err) {
                    return Err(S3Error::TranscriptNotFound);
                }
                return Err(S3Error::Other(format!(
                    "S3 GetObject failed: {}",
                    format_error_chain(&sdk_err)
                )));
            }
        };

        let bytes = body
            .collect()
            .await
            .map_err(|e| S3Error::Other(format!("Failed to read body: {}", e)))?
            .into_bytes();

        if bytes.is_empty() {
            return Err(S3Error::TranscriptNotFound);
        }

        let body_string = String::from_utf8(bytes.to_vec())
            .map_err(|e| S3Error::Other(format!("Invalid UTF-8: {}", e)))?;

        let transcript: Transcript = serde_json::from_str(&body_string)
            .map_err(|e| S3Error::Other(format!("JSON parse error: {}", e)))?;

        Ok(transcript)
    }

    async fn list_transcripts(&self) -> Result<Vec<String>, S3Error> {
        let mut req = self.client.list_objects_v2().bucket(&self.bucket);
        if !self.prefix.is_empty() {
            req = req.prefix(&self.prefix);
        }

        let response = req.send().await;

        let response = match response {
            Ok(r) => r,
            Err(sdk_err) => {
                if is_no_such_bucket(&sdk_err) {
                    return Ok(Vec::new());
                }
                return Err(S3Error::Other(format!(
                    "S3 ListObjectsV2 failed: {}",
                    format_error_chain(&sdk_err)
                )));
            }
        };

        let contents = response.contents.unwrap_or_default();
        if contents.is_empty() {
            return Ok(Vec::new());
        }

        let result: Vec<String> = contents
            .into_iter()
            .filter_map(|item| item.key)
            .map(|key| {
                if !self.prefix.is_empty() && key.starts_with(&self.prefix) {
                    key[self.prefix.len()..].to_string()
                } else {
                    key
                }
            })
            .map(|key| {
                if let Some(stripped) = key.strip_suffix(".json") {
                    stripped.to_string()
                } else {
                    key
                }
            })
            .collect();

        Ok(result)
    }

    async fn get_transcript_by_session_id(&self, session_id: &str) -> Result<Transcript, S3Error> {
        let trimmed = session_id.trim();
        if trimmed.is_empty() {
            return Err(S3Error::SessionIdRequired);
        }

        let session_key_prefix = format!("{}{}", self.prefix, trimmed);

        let list_response = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(&session_key_prefix)
            .send()
            .await;

        let list_response = match list_response {
            Ok(r) => r,
            Err(sdk_err) => {
                if is_no_such_bucket(&sdk_err) {
                    return Err(S3Error::NoTranscriptForSession);
                }
                return Err(S3Error::Other(format!(
                    "S3 ListObjectsV2 failed: {}",
                    format_error_chain(&sdk_err)
                )));
            }
        };

        let contents = list_response.contents.unwrap_or_default();
        if contents.is_empty() {
            return Err(S3Error::NoTranscriptForSession);
        }

        let jsonl_key = format!("{}.jsonl", session_key_prefix);
        let json_key = format!("{}.json", session_key_prefix);
        let main_transcript_key = contents
            .iter()
            .filter_map(|item| item.key.as_deref())
            .find(|k| *k == jsonl_key.as_str() || *k == json_key.as_str())
            .map(|s| s.to_string());

        let Some(main_transcript_key) = main_transcript_key else {
            return Err(S3Error::NoTranscriptForSession);
        };

        let get_response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&main_transcript_key)
            .send()
            .await
            .map_err(|sdk_err| {
                if is_get_object_not_found(&sdk_err) {
                    S3Error::NoTranscriptForSession
                } else {
                    S3Error::Other(format!(
                        "S3 GetObject failed: {}",
                        format_error_chain(&sdk_err)
                    ))
                }
            })?;

        let bytes = get_response
            .body
            .collect()
            .await
            .map_err(|e| S3Error::Other(format!("Failed to read body: {}", e)))?
            .into_bytes();

        if bytes.is_empty() {
            return Err(S3Error::NoTranscriptForSession);
        }

        let body_string = String::from_utf8(bytes.to_vec())
            .map_err(|e| S3Error::Other(format!("Invalid UTF-8: {}", e)))?;

        let (mut transcript, mut main_messages) = if main_transcript_key.ends_with(".jsonl") {
            let main_messages: Vec<TranscriptMessage> = body_string
                .trim()
                .split('\n')
                .filter(|line| !line.trim().is_empty())
                .map(serde_json::from_str::<TranscriptMessage>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| S3Error::Other(format!("JSONL parse error: {}", e)))?;

            let transcript = Transcript {
                id: trimmed.to_string(),
                session_id: Some(trimmed.to_string()),
                content: body_string.clone(),
                messages: Some(main_messages.clone()),
                subagents: None,
                extra: serde_json::Map::new(),
            };
            (transcript, main_messages)
        } else {
            let value: Value = serde_json::from_str(&body_string)
                .map_err(|e| S3Error::Other(format!("JSON parse error: {}", e)))?;
            let transcript: Transcript = serde_json::from_value(value)
                .map_err(|e| S3Error::Other(format!("Transcript decode error: {}", e)))?;
            let messages = transcript.messages.clone().unwrap_or_default();
            (transcript, messages)
        };

        for msg in main_messages.iter_mut() {
            if msg.agent_id.is_none() || msg.agent_id.as_deref() == Some("") {
                msg.agent_id = Some(trimmed.to_string());
            }
        }

        let subagent_prefix = format!("{}/", session_key_prefix);
        let subagent_files: Vec<String> = contents
            .iter()
            .filter_map(|item| item.key.as_deref())
            .filter(|k| k.starts_with(&subagent_prefix) && k.contains("agent-"))
            .map(|s| s.to_string())
            .collect();

        let mut all_messages = main_messages.clone();

        if !subagent_files.is_empty() {
            let client = Arc::new(self.client.clone());
            let bucket = self.bucket.clone();
            let futures = subagent_files.into_iter().map(|key| {
                let client = client.clone();
                let bucket = bucket.clone();
                async move { fetch_subagent(&client, &bucket, &key).await }
            });

            let results = join_all(futures).await;
            let mut subagents: Vec<SubagentTranscript> = Vec::new();
            for result in results.into_iter().flatten() {
                if let Some(msgs) = result.messages.as_ref() {
                    all_messages.extend(msgs.iter().cloned());
                }
                subagents.push(result);
            }
            transcript.subagents = Some(subagents);
        }

        all_messages.sort_by(|a, b| {
            let ta = parse_timestamp(&a.timestamp);
            let tb = parse_timestamp(&b.timestamp);
            ta.cmp(&tb)
        });

        transcript.messages = Some(all_messages);

        Ok(transcript)
    }
}

async fn fetch_subagent(client: &S3Client, bucket: &str, key: &str) -> Option<SubagentTranscript> {
    let response = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .ok()?;

    let bytes = response.body.collect().await.ok()?.into_bytes();
    if bytes.is_empty() {
        return None;
    }

    let body_string = String::from_utf8(bytes.to_vec()).ok()?;
    let file_name = key.rsplit('/').next().unwrap_or(key);
    let agent_id = file_name
        .strip_suffix(".jsonl")
        .or_else(|| file_name.strip_suffix(".json"))
        .unwrap_or(file_name)
        .to_string();

    let subagent_messages: Vec<TranscriptMessage> = body_string
        .trim()
        .split('\n')
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let mut msg: TranscriptMessage = serde_json::from_str(line).ok()?;
            if msg.agent_id.is_none() || msg.agent_id.as_deref() == Some("") {
                msg.agent_id = Some(agent_id.clone());
            }
            Some(msg)
        })
        .collect();

    Some(SubagentTranscript {
        id: agent_id.clone(),
        name: agent_id,
        content: Some(body_string),
        messages: Some(subagent_messages),
        transcript_file: Some(key.to_string()),
        extra: serde_json::Map::new(),
    })
}

fn parse_timestamp(s: &str) -> i64 {
    // Match JS new Date(s).getTime() semantics in a simple way: parse RFC3339,
    // fall back to 0 (which matches Date("invalid").getTime() → NaN; sort
    // stability is acceptable as messages here have valid ISO timestamps).
    // We avoid pulling in chrono — perform a lightweight parse for ISO 8601.
    iso_to_millis(s).unwrap_or(0)
}

fn iso_to_millis(s: &str) -> Option<i64> {
    // Accept formats like 2026-02-01T05:00:00Z or 2026-02-01T05:00:00.123Z
    // or with timezone offset like 2026-02-01T05:00:00+00:00
    let s = s.trim();
    if s.len() < 19 {
        return None;
    }
    let year: i32 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    if s.as_bytes()[10] != b'T' && s.as_bytes()[10] != b' ' {
        return None;
    }
    let hour: u32 = s[11..13].parse().ok()?;
    let minute: u32 = s[14..16].parse().ok()?;
    let second: u32 = s[17..19].parse().ok()?;

    let mut rest = &s[19..];
    let mut millis: i64 = 0;
    if rest.starts_with('.') {
        let end = rest[1..]
            .find(|c: char| !c.is_ascii_digit())
            .map(|i| i + 1)
            .unwrap_or(rest.len());
        let frac = &rest[1..end];
        let pad: String = frac.chars().chain(std::iter::repeat('0')).take(3).collect();
        millis = pad.parse().unwrap_or(0);
        rest = &rest[end..];
    }

    let tz_offset_seconds: i64 = if rest == "Z" || rest.is_empty() {
        0
    } else {
        let sign = match rest.as_bytes().first() {
            Some(b'+') => 1,
            Some(b'-') => -1,
            _ => return None,
        };
        let off = &rest[1..];
        let (hh, mm) = if let Some(pos) = off.find(':') {
            (
                off[..pos].parse::<i64>().ok()?,
                off[pos + 1..].parse::<i64>().ok()?,
            )
        } else if off.len() == 4 {
            (off[..2].parse::<i64>().ok()?, off[2..].parse::<i64>().ok()?)
        } else if off.len() == 2 {
            (off.parse::<i64>().ok()?, 0)
        } else {
            return None;
        };
        sign * (hh * 3600 + mm * 60)
    };

    let days = days_from_civil(year, month, day);
    let secs =
        days * 86400 + hour as i64 * 3600 + minute as i64 * 60 + second as i64 - tz_offset_seconds;
    Some(secs * 1000 + millis)
}

fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y } as i64;
    let m = m as i64;
    let d = d as i64;
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn is_get_object_not_found(err: &SdkError<GetObjectError>) -> bool {
    match err {
        SdkError::ServiceError(svc_err) => {
            matches!(svc_err.err(), GetObjectError::NoSuchKey(_))
                || svc_err.raw().status().as_u16() == 404
        }
        _ => false,
    }
}

fn is_no_such_bucket(err: &SdkError<ListObjectsV2Error>) -> bool {
    match err {
        SdkError::ServiceError(svc_err) => {
            matches!(svc_err.err(), ListObjectsV2Error::NoSuchBucket(_))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_prefix_empty() {
        assert_eq!(normalize_prefix(None), "");
        assert_eq!(normalize_prefix(Some("")), "");
        assert_eq!(normalize_prefix(Some("///")), "");
    }

    #[test]
    fn normalize_prefix_appends_slash() {
        assert_eq!(normalize_prefix(Some("foo/bar")), "foo/bar/");
    }

    #[test]
    fn normalize_prefix_keeps_trailing_slash() {
        assert_eq!(normalize_prefix(Some("foo/bar/")), "foo/bar/");
    }

    #[test]
    fn normalize_prefix_strips_leading_slash() {
        assert_eq!(normalize_prefix(Some("/foo/bar/")), "foo/bar/");
    }

    #[test]
    fn iso_to_millis_basic() {
        assert_eq!(iso_to_millis("2026-02-01T05:00:00Z"), Some(1769922000000));
        assert_eq!(
            iso_to_millis("2026-02-01T05:00:00.123Z"),
            Some(1769922000123)
        );
        assert!(
            iso_to_millis("2026-02-01T05:00:05Z").unwrap()
                > iso_to_millis("2026-02-01T05:00:00Z").unwrap()
        );
    }

    #[tokio::test]
    async fn s3_service_constructs_without_assume_role() {
        let svc = S3Service::new(S3ServiceConfig {
            bucket: "test-bucket".to_string(),
            region: "us-east-1".to_string(),
            endpoint: None,
            prefix: None,
            assume_role_arn: None,
            assume_role_session_name: None,
            assume_role_external_id: None,
            assume_role_duration_seconds: None,
        })
        .await;
        assert_eq!(svc.bucket, "test-bucket");
    }

    #[tokio::test]
    async fn s3_service_endpoint_takes_precedence() {
        let svc = S3Service::new(S3ServiceConfig {
            bucket: "test-bucket".to_string(),
            region: "us-east-1".to_string(),
            endpoint: Some("http://localhost:9000".to_string()),
            prefix: None,
            assume_role_arn: Some("arn:aws:iam::123456789012:role/test-role".to_string()),
            assume_role_session_name: None,
            assume_role_external_id: None,
            assume_role_duration_seconds: None,
        })
        .await;
        assert_eq!(svc.bucket, "test-bucket");
    }
}
