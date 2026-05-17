use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub prefix: Option<String>,
    pub assume_role_arn: Option<String>,
    pub assume_role_session_name: Option<String>,
    pub assume_role_external_id: Option<String>,
    pub assume_role_duration_seconds: Option<i32>,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(3000);

        let bucket = env::var("S3_BUCKET").unwrap_or_else(|_| "test-transcripts".to_string());
        let region = env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
        let endpoint = optional_env("AWS_ENDPOINT_URL");
        let prefix = optional_env("S3_PREFIX");
        let assume_role_arn = optional_env("AWS_ASSUME_ROLE_ARN");
        let assume_role_session_name = optional_env("AWS_ASSUME_ROLE_SESSION_NAME");
        let assume_role_external_id = optional_env("AWS_ASSUME_ROLE_EXTERNAL_ID");

        let assume_role_duration_seconds = env::var("AWS_ASSUME_ROLE_DURATION_SECONDS")
            .ok()
            .and_then(|s| s.trim().parse::<i32>().ok());

        Self {
            port,
            bucket,
            region,
            endpoint,
            prefix,
            assume_role_arn,
            assume_role_session_name,
            assume_role_external_id,
            assume_role_duration_seconds,
        }
    }
}

fn optional_env(key: &str) -> Option<String> {
    match env::var(key) {
        Ok(value) if !value.is_empty() => Some(value),
        _ => None,
    }
}
