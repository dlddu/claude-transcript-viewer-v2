use once_cell::sync::Lazy;
use serde_json::{json, Value};
use std::collections::HashMap;

pub static MOCK_TRANSCRIPTS: Lazy<HashMap<String, Value>> = Lazy::new(build_mock_transcripts);
pub static MOCK_TRANSCRIPTS_BY_SESSION: Lazy<HashMap<String, Value>> =
    Lazy::new(build_mock_transcripts_by_session);

fn build_mock_transcripts() -> HashMap<String, Value> {
    let mut map = HashMap::new();
    let timestamp = chrono::Utc::now().to_rfc3339();

    map.insert(
        "test-transcript-1".to_string(),
        json!({
            "id": "test-transcript-1",
            "content": "Mock transcript content",
            "timestamp": timestamp,
        }),
    );
    map.insert(
        "test-json-transcript".to_string(),
        json!({
            "id": "test-json-transcript",
            "content": "Test JSON transcript",
            "timestamp": timestamp,
        }),
    );
    map
}

fn build_mock_transcripts_by_session() -> HashMap<String, Value> {
    let mut map = HashMap::new();

    map.insert(
        "session-abc123".to_string(),
        json!({
            "id": "session-abc123",
            "session_id": "session-abc123",
            "content": "{\"type\":\"user\",\"sessionId\":\"session-abc123\",\"timestamp\":\"2026-02-01T05:00:00Z\",\"uuid\":\"msg-001\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"Can you help me analyze this dataset?\"}}\n{\"type\":\"assistant\",\"sessionId\":\"session-abc123\",\"timestamp\":\"2026-02-01T05:00:05Z\",\"uuid\":\"msg-002\",\"parentUuid\":\"msg-001\",\"message\":{\"role\":\"assistant\",\"content\":\"I'd be happy to help you analyze the dataset.\",\"model\":\"claude-sonnet-4-5\"}}",
            "messages": [
                {
                    "type": "user",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:00:00Z",
                    "uuid": "msg-001",
                    "parentUuid": null,
                    "agentId": "session-abc123",
                    "message": {"role": "user", "content": "Can you help me analyze this dataset?"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:00:05Z",
                    "uuid": "msg-002",
                    "parentUuid": "msg-001",
                    "agentId": "session-abc123",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "I'd be happy to help you analyze the dataset."},
                            {"type": "tool_use", "id": "tool-001", "name": "DataAnalyzer", "input": {"file_path": "/data/input.csv"}}
                        ],
                        "model": "claude-sonnet-4-5"
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:00:08Z",
                    "uuid": "msg-002b",
                    "parentUuid": "msg-002",
                    "agentId": "session-abc123",
                    "message": {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": "tool-001", "content": "Analysis complete. Found 1000 rows with 15 columns. Data quality: 97.7%"}
                        ]
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "agent-a1b2c3d",
                    "timestamp": "2026-02-01T05:00:10Z",
                    "uuid": "sub-001",
                    "parentUuid": null,
                    "agentId": "agent-a1b2c3d",
                    "message": {"role": "user", "content": "Analyze the CSV file"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "agent-a1b2c3d",
                    "timestamp": "2026-02-01T05:00:12Z",
                    "uuid": "sub-002",
                    "parentUuid": "sub-001",
                    "agentId": "agent-a1b2c3d",
                    "message": {"role": "assistant", "content": "Starting data analysis. Found 1,000 rows with 15 columns.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "agent-a1b2c3d",
                    "timestamp": "2026-02-01T05:00:18Z",
                    "uuid": "sub-003",
                    "parentUuid": "sub-002",
                    "agentId": "agent-a1b2c3d",
                    "message": {"role": "assistant", "content": "Data quality check complete. Missing values: 23 (2.3%). No duplicate rows found.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "agent-xyz789",
                    "timestamp": "2026-02-01T05:00:46Z",
                    "uuid": "viz-001",
                    "parentUuid": null,
                    "agentId": "agent-xyz789",
                    "message": {"role": "user", "content": "Create visualizations for the dataset"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "agent-xyz789",
                    "timestamp": "2026-02-01T05:00:47Z",
                    "uuid": "viz-002",
                    "parentUuid": "viz-001",
                    "agentId": "agent-xyz789",
                    "message": {"role": "assistant", "content": "Creating visualizations. Generating histogram for sales distribution.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "agent-xyz789",
                    "timestamp": "2026-02-01T05:00:49Z",
                    "uuid": "viz-003",
                    "parentUuid": "viz-002",
                    "agentId": "agent-xyz789",
                    "message": {"role": "assistant", "content": "All visualizations complete. Created 3 charts.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:00:50Z",
                    "uuid": "msg-003",
                    "parentUuid": "msg-002",
                    "agentId": "session-abc123",
                    "message": {"role": "assistant", "content": "Analysis complete! I've examined the dataset and created visualizations to help you understand the patterns.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:01:00Z",
                    "uuid": "msg-004",
                    "parentUuid": "msg-003",
                    "agentId": "session-abc123",
                    "message": {"role": "user", "content": "Now read the config file and validate the schema"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:01:05Z",
                    "uuid": "msg-005",
                    "parentUuid": "msg-004",
                    "agentId": "session-abc123",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "I'll read the config and validate the schema for you."},
                            {"type": "tool_use", "id": "tool-002", "name": "FileReader", "input": {"path": "/app/config.json"}},
                            {"type": "tool_use", "id": "tool-003", "name": "SchemaValidator", "input": {"schema": "config-v2", "strict": true}}
                        ],
                        "model": "claude-sonnet-4-5"
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:01:30Z",
                    "uuid": "msg-005b",
                    "parentUuid": "msg-005",
                    "agentId": "session-abc123",
                    "message": {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": "tool-002", "content": "Config file contents: {\"version\": 2, \"debug\": false}"},
                            {"type": "tool_result", "tool_use_id": "tool-003", "content": "Schema validation passed. All fields conform to config-v2 spec."}
                        ]
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-abc123",
                    "timestamp": "2026-02-01T05:01:50Z",
                    "uuid": "msg-006",
                    "parentUuid": "msg-005b",
                    "agentId": "session-abc123",
                    "message": {"role": "assistant", "content": "The config file is valid and conforms to the config-v2 schema.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                }
            ],
            "subagents": [
                {
                    "id": "agent-a1b2c3d",
                    "name": "agent-a1b2c3d",
                    "transcript_file": "session-abc123/agent-a1b2c3d.jsonl",
                    "content": "{\"type\":\"user\",\"sessionId\":\"agent-a1b2c3d\",\"timestamp\":\"2026-02-01T05:00:10Z\",\"uuid\":\"sub-001\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"Analyze the CSV file\"}}",
                    "messages": [
                        {
                            "type": "user",
                            "sessionId": "agent-a1b2c3d",
                            "timestamp": "2026-02-01T05:00:10Z",
                            "uuid": "sub-001",
                            "parentUuid": null,
                            "agentId": "agent-a1b2c3d",
                            "message": {"role": "user", "content": "Analyze the CSV file"}
                        },
                        {
                            "type": "assistant",
                            "sessionId": "agent-a1b2c3d",
                            "timestamp": "2026-02-01T05:00:12Z",
                            "uuid": "sub-002",
                            "parentUuid": "sub-001",
                            "agentId": "agent-a1b2c3d",
                            "message": {"role": "assistant", "content": "Starting data analysis. Found 1,000 rows with 15 columns.", "model": "claude-sonnet-4-5"}
                        },
                        {
                            "type": "assistant",
                            "sessionId": "agent-a1b2c3d",
                            "timestamp": "2026-02-01T05:00:18Z",
                            "uuid": "sub-003",
                            "parentUuid": "sub-002",
                            "agentId": "agent-a1b2c3d",
                            "message": {"role": "assistant", "content": "Data quality check complete. Missing values: 23 (2.3%). No duplicate rows found.", "model": "claude-sonnet-4-5"}
                        }
                    ]
                },
                {
                    "id": "agent-xyz789",
                    "name": "agent-xyz789",
                    "transcript_file": "session-abc123/agent-xyz789.jsonl",
                    "content": "{\"type\":\"user\",\"sessionId\":\"agent-xyz789\",\"timestamp\":\"2026-02-01T05:00:46Z\",\"uuid\":\"viz-001\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"Create visualizations for the dataset\"}}",
                    "messages": [
                        {
                            "type": "user",
                            "sessionId": "agent-xyz789",
                            "timestamp": "2026-02-01T05:00:46Z",
                            "uuid": "viz-001",
                            "parentUuid": null,
                            "agentId": "agent-xyz789",
                            "message": {"role": "user", "content": "Create visualizations for the dataset"}
                        },
                        {
                            "type": "assistant",
                            "sessionId": "agent-xyz789",
                            "timestamp": "2026-02-01T05:00:47Z",
                            "uuid": "viz-002",
                            "parentUuid": "viz-001",
                            "agentId": "agent-xyz789",
                            "message": {"role": "assistant", "content": "Creating visualizations. Generating histogram for sales distribution.", "model": "claude-sonnet-4-5"}
                        },
                        {
                            "type": "assistant",
                            "sessionId": "agent-xyz789",
                            "timestamp": "2026-02-01T05:00:49Z",
                            "uuid": "viz-003",
                            "parentUuid": "viz-002",
                            "agentId": "agent-xyz789",
                            "message": {"role": "assistant", "content": "All visualizations complete. Created 3 charts.", "model": "claude-sonnet-4-5"}
                        }
                    ]
                }
            ]
        }),
    );

    map.insert(
        "session-task-subagent".to_string(),
        json!({
            "id": "session-task-subagent",
            "session_id": "session-task-subagent",
            "content": "{\"type\":\"user\",\"sessionId\":\"session-task-subagent\",\"timestamp\":\"2026-02-01T10:00:00Z\",\"uuid\":\"msg-001\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"Please refactor the authentication module\"},\"cwd\":\"/app\",\"version\":\"2.1.0\"}\n{\"type\":\"assistant\",\"sessionId\":\"session-task-subagent\",\"timestamp\":\"2026-02-01T10:00:05Z\",\"uuid\":\"msg-002\",\"parentUuid\":\"msg-001\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"I'll delegate this code refactoring task to a specialized subagent.\"},{\"type\":\"tool_use\",\"id\":\"task-001\",\"name\":\"Task\",\"input\":{\"subagent_type\":\"code\",\"task_description\":\"Refactor authentication module for better maintainability\",\"context\":\"Current auth module is monolithic and hard to test\"}}],\"model\":\"claude-sonnet-4-5\"},\"cwd\":\"/app\",\"version\":\"2.1.0\"}",
            "messages": [
                {
                    "type": "user",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:00:00Z",
                    "uuid": "msg-001",
                    "parentUuid": null,
                    "agentId": "session-task-subagent",
                    "message": {"role": "user", "content": "Please refactor the authentication module"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:00:05Z",
                    "uuid": "msg-002",
                    "parentUuid": "msg-001",
                    "agentId": "session-task-subagent",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "I'll delegate this code refactoring task to a specialized subagent."},
                            {
                                "type": "tool_use",
                                "id": "task-001",
                                "name": "Task",
                                "input": {
                                    "subagent_type": "code",
                                    "task_description": "Refactor authentication module for better maintainability",
                                    "context": "Current auth module is monolithic and hard to test"
                                }
                            }
                        ],
                        "model": "claude-sonnet-4-5"
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:00:30Z",
                    "uuid": "msg-002b",
                    "parentUuid": "msg-002",
                    "agentId": "session-task-subagent",
                    "message": {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": "task-001", "content": "Code refactoring completed. Split authentication module into separate concerns: AuthService, TokenManager, and UserValidator. All tests passing."}
                        ]
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:00:50Z",
                    "uuid": "msg-003",
                    "parentUuid": "msg-002b",
                    "agentId": "session-task-subagent",
                    "message": {"role": "assistant", "content": "The authentication module has been successfully refactored into three components for better maintainability.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:01:00Z",
                    "uuid": "msg-004",
                    "parentUuid": "msg-003",
                    "agentId": "session-task-subagent",
                    "message": {"role": "user", "content": "Now analyze the test coverage"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:01:05Z",
                    "uuid": "msg-005",
                    "parentUuid": "msg-004",
                    "agentId": "session-task-subagent",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "I'll delegate the test analysis to a specialized agent."},
                            {
                                "type": "tool_use",
                                "id": "task-002",
                                "name": "Task",
                                "input": {
                                    "task_description": "Analyze test coverage for authentication module",
                                    "metrics": ["line_coverage", "branch_coverage"]
                                }
                            }
                        ],
                        "model": "claude-sonnet-4-5"
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:01:30Z",
                    "uuid": "msg-005b",
                    "parentUuid": "msg-005",
                    "agentId": "session-task-subagent",
                    "message": {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": "task-002", "content": "Test coverage analysis complete. Line coverage: 87%, Branch coverage: 82%. Missing tests for error handling in TokenManager."}
                        ]
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:01:50Z",
                    "uuid": "msg-006",
                    "parentUuid": "msg-005b",
                    "agentId": "session-task-subagent",
                    "message": {"role": "assistant", "content": "The test coverage is good but could be improved for error handling in TokenManager.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:02:00Z",
                    "uuid": "msg-007",
                    "parentUuid": "msg-006",
                    "agentId": "session-task-subagent",
                    "message": {"role": "user", "content": "Use FileReader to read the config"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:02:05Z",
                    "uuid": "msg-008",
                    "parentUuid": "msg-007",
                    "agentId": "session-task-subagent",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "I'll read the configuration file."},
                            {
                                "type": "tool_use",
                                "id": "file-reader-001",
                                "name": "FileReader",
                                "input": {"path": "/app/config.json"}
                            }
                        ],
                        "model": "claude-sonnet-4-5"
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "user",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:02:30Z",
                    "uuid": "msg-008b",
                    "parentUuid": "msg-008",
                    "agentId": "session-task-subagent",
                    "message": {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": "file-reader-001", "content": "Config file contents: {\"environment\": \"production\", \"debug\": false}"}
                        ]
                    },
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-task-subagent",
                    "timestamp": "2026-02-01T10:02:50Z",
                    "uuid": "msg-009",
                    "parentUuid": "msg-008b",
                    "agentId": "session-task-subagent",
                    "message": {"role": "assistant", "content": "The configuration shows production environment with debug mode disabled.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                }
            ],
            "subagents": []
        }),
    );

    map.insert(
        "session-xyz789".to_string(),
        json!({
            "id": "session-xyz789",
            "session_id": "session-xyz789",
            "content": "{\"type\":\"user\",\"sessionId\":\"session-xyz789\",\"timestamp\":\"2026-02-01T06:00:00Z\",\"uuid\":\"msg-101\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"Can you summarize this report?\"}}\n{\"type\":\"assistant\",\"sessionId\":\"session-xyz789\",\"timestamp\":\"2026-02-01T06:00:03Z\",\"uuid\":\"msg-102\",\"parentUuid\":\"msg-101\",\"message\":{\"role\":\"assistant\",\"content\":\"I'll help you summarize the report.\",\"model\":\"claude-sonnet-4-5\"}}",
            "messages": [
                {
                    "type": "user",
                    "sessionId": "session-xyz789",
                    "timestamp": "2026-02-01T06:00:00Z",
                    "uuid": "msg-101",
                    "parentUuid": null,
                    "agentId": "session-xyz789",
                    "message": {"role": "user", "content": "Can you summarize this report?"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "session-xyz789",
                    "timestamp": "2026-02-01T06:00:03Z",
                    "uuid": "msg-102",
                    "parentUuid": "msg-101",
                    "agentId": "session-xyz789",
                    "message": {"role": "assistant", "content": "I'll help you summarize the report. Let me review the key points.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                }
            ],
            "subagents": []
        }),
    );

    map.insert(
        "f47ac10b-58cc-4372-a567-0e02b2c3d479".to_string(),
        json!({
            "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
            "session_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
            "content": "{\"type\":\"user\",\"sessionId\":\"f47ac10b-58cc-4372-a567-0e02b2c3d479\",\"timestamp\":\"2026-02-01T05:00:00Z\",\"uuid\":\"msg-001\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"Can you help me analyze this dataset?\"}}\n{\"type\":\"assistant\",\"sessionId\":\"f47ac10b-58cc-4372-a567-0e02b2c3d479\",\"timestamp\":\"2026-02-01T05:00:05Z\",\"uuid\":\"msg-002\",\"parentUuid\":\"msg-001\",\"message\":{\"role\":\"assistant\",\"content\":\"I'd be happy to help you analyze the dataset.\",\"model\":\"claude-sonnet-4-5\"}}",
            "messages": [
                {
                    "type": "user",
                    "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                    "timestamp": "2026-02-01T05:00:00Z",
                    "uuid": "msg-001",
                    "parentUuid": null,
                    "agentId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                    "message": {"role": "user", "content": "Can you help me analyze this dataset?"},
                    "cwd": "/app",
                    "version": "2.1.0"
                },
                {
                    "type": "assistant",
                    "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                    "timestamp": "2026-02-01T05:00:05Z",
                    "uuid": "msg-002",
                    "parentUuid": "msg-001",
                    "agentId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                    "message": {"role": "assistant", "content": "I'd be happy to help you analyze the dataset.", "model": "claude-sonnet-4-5"},
                    "cwd": "/app",
                    "version": "2.1.0"
                }
            ],
            "subagents": []
        }),
    );

    map
}

pub fn route_mock_transcript(id: &str) -> Option<Value> {
    let timestamp = chrono::Utc::now().to_rfc3339();
    match id {
        "test-transcript-1" => Some(json!({
            "id": "test-transcript-1",
            "content": "Mock transcript content",
            "timestamp": timestamp,
        })),
        "test-with-subagents" => Some(json!({
            "id": "test-with-subagents",
            "content": "Mock transcript with subagents",
            "subagents": [],
        })),
        "test-json-transcript" => Some(json!({
            "id": "test-json-transcript",
            "content": "Test JSON transcript",
            "timestamp": timestamp,
        })),
        "transcript-20260201-001" => Some(json!({
            "id": "transcript-20260201-001",
            "session_id": "session-abc123",
            "content": "User: Can you help me analyze this dataset?\n\nAssistant: I'd be happy to help you analyze the dataset. Let me break this down into steps:\n\n1. First, I'll examine the data structure\n2. Then identify key patterns\n3. Finally, provide insights\n\nLet me start by looking at the data...",
            "metadata": {"model": "claude-sonnet-4-5", "total_tokens": 1234, "duration_ms": 5432},
            "subagents": [
                {
                    "id": "subagent-data-analyzer",
                    "name": "Data Analyzer Subagent",
                    "type": "analysis",
                    "invoked_at": "2026-02-01T05:00:15Z",
                    "transcript_file": "subagent-data-analyzer-20260201-001.json"
                },
                {
                    "id": "subagent-visualizer",
                    "name": "Visualization Subagent",
                    "type": "visualization",
                    "invoked_at": "2026-02-01T05:00:45Z",
                    "transcript_file": "subagent-visualizer-20260201-001.json"
                }
            ],
            "tools_used": [
                {"name": "file_reader", "invocations": 3},
                {"name": "data_analyzer", "invocations": 1}
            ]
        })),
        "subagent-data-analyzer-20260201-001" => Some(json!({
            "id": "subagent-data-analyzer-20260201-001",
            "content": "Subagent: Starting data analysis...\n\nStep 1: Loading dataset\n- Found 1,000 rows\n- 15 columns detected\n\nStep 2: Checking data quality\n- Missing values: 23 (2.3%)\n\nAnalysis complete.",
            "metadata": {"model": "claude-sonnet-4-5", "total_tokens": 456, "duration_ms": 2100}
        })),
        "subagent-visualizer-20260201-001" => Some(json!({
            "id": "subagent-visualizer-20260201-001",
            "content": "Subagent: Creating visualizations...\n\nStep 1: Generating histogram\n- Created distribution plot for sales_amount\n\nStep 2: Creating time series plot\n- Generated trend line for sales over time\n\nStep 3: Building correlation heatmap\n- Analyzed correlations between numeric columns\n\nAll visualizations complete.",
            "metadata": {"model": "claude-sonnet-4-5", "total_tokens": 234, "duration_ms": 1800}
        })),
        "f47ac10b-58cc-4372-a567-0e02b2c3d479" => Some(json!({
            "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
            "content": "User: Can you analyze my project?\n\nAssistant: I'd be happy to analyze your project. Here's what I found:\n\n1. Strong architecture\n2. Good test coverage\n3. Excellent documentation\n\nOverall, great work!",
            "timestamp": timestamp
        })),
        _ => None,
    }
}
