use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptMessage {
    #[serde(rename = "type")]
    pub message_type: String,

    #[serde(rename = "sessionId")]
    pub session_id: String,

    pub timestamp: String,

    pub uuid: String,

    #[serde(rename = "parentUuid")]
    pub parent_uuid: Option<String>,

    #[serde(rename = "agentId", skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,

    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentTranscript {
    pub id: String,
    pub name: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<TranscriptMessage>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript_file: Option<String>,

    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub id: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    pub content: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<TranscriptMessage>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagents: Option<Vec<SubagentTranscript>>,

    #[serde(flatten)]
    pub extra: Map<String, Value>,
}
