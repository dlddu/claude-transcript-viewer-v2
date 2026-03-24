#!/bin/bash
set -euo pipefail

# linear-status-report.sh
# Updates a Linear issue's status and adds a comment based on deployment results.
#
# Required environment variables:
#   LINEAR_API_KEY   - Linear API key for authentication
#
# Input: JSON file at INPUT_FILE (default: /tmp/status-report-input.json) with:
#   issue_id     - Linear issue identifier (e.g., "DLD-833")
#   team_id      - Linear team key (e.g., "DLD")
#   status       - Deployment result: "success" or "failure"
#   comment_body - Comment text to add to the issue

LINEAR_API_URL="${LINEAR_API_URL:-https://api.linear.app/graphql}"
INPUT_FILE="${INPUT_FILE:-/tmp/status-report-input.json}"

debug() {
  echo "[DEBUG][$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

linear_api() {
  local query="$1"
  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$LINEAR_API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "$query")
  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')
  debug "Linear API 응답 수신 (HTTP 상태 코드: $http_code, 응답 크기: ${#body})"
  if [ "$http_code" -ne 200 ]; then
    echo "$body"
    return 1
  fi
  echo "$body"
}

output_result() {
  local success="$1" issue_id="$2" status_updated="$3" comment_created="$4"
  local error="${5:-}" error_stage="${6:-}" summary="${7:-}"
  jq -n \
    --arg issue_id "$issue_id" \
    --arg error "$error" \
    --arg error_stage "$error_stage" \
    --arg summary "$summary" \
    --argjson success "$success" \
    --argjson status_updated "$status_updated" \
    --argjson comment_created "$comment_created" \
    '{success: $success, issue_id: $issue_id, status_updated: $status_updated, comment_created: $comment_created, error: $error, error_stage: $error_stage, summary: $summary}'
}

debug "=== linear-status-report.sh 시작 ==="
debug "LINEAR_API_URL: $LINEAR_API_URL"
debug "INPUT_FILE: $INPUT_FILE"

# Validate LINEAR_API_KEY
debug "LINEAR_API_KEY 존재 여부 확인 중..."
if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo '{"success":false,"issue_id":"","status_updated":false,"comment_created":false,"error":"LINEAR_API_KEY not set","error_stage":"init","summary":"LINEAR_API_KEY 환경 변수가 설정되지 않음"}'
  exit 1
fi
debug "LINEAR_API_KEY 확인 완료 (길이: ${#LINEAR_API_KEY})"

# Read input JSON
debug "입력 파일에서 JSON 읽기 시작... (파일: $INPUT_FILE)"
if [ ! -f "$INPUT_FILE" ]; then
  echo '{"success":false,"issue_id":"","status_updated":false,"comment_created":false,"error":"Input file not found","error_stage":"init","summary":"입력 파일을 찾을 수 없음"}'
  exit 1
fi
INPUT_JSON=$(cat "$INPUT_FILE")
debug "입력 JSON 수신 완료 (길이: ${#INPUT_JSON})"

# Parse required fields
debug "필수 필드 파싱 중..."
ISSUE_ID=$(echo "$INPUT_JSON" | jq -r '.issue_id')
TEAM_ID=$(echo "$INPUT_JSON" | jq -r '.team_id')
STATUS=$(echo "$INPUT_JSON" | jq -r '.status')
COMMENT_BODY=$(echo "$INPUT_JSON" | jq -r '.comment_body')
debug "파싱 결과 - ISSUE_ID: $ISSUE_ID, TEAM_ID: $TEAM_ID, STATUS: $STATUS, COMMENT_BODY 길이: ${#COMMENT_BODY}"

# Determine target state name based on status
debug "status 기반 대상 상태 결정 중... (STATUS=$STATUS)"
case "$STATUS" in
  success)
    TARGET_STATE_NAME="Done"
    ;;
  failure)
    TARGET_STATE_NAME="In Progress"
    ;;
  *)
    echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"Unknown status: $STATUS\",\"error_stage\":\"init\",\"summary\":\"알 수 없는 상태: $STATUS\"}"
    exit 1
    ;;
esac
debug "대상 상태 결정 완료: TARGET_STATE_NAME=$TARGET_STATE_NAME"

# Step 1: Look up team UUID from team key
debug "--- Step 1: 팀 UUID 조회 시작 (TEAM_ID=$TEAM_ID) ---"
TEAM_QUERY=$(jq -n --arg key "$TEAM_ID" '{query: "query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id name key } } }", variables: { key: $key }}')
debug "Linear API 호출 중... (요청 크기: ${#TEAM_QUERY})"
TEAM_RESPONSE=$(linear_api "$TEAM_QUERY") || {
  error_msg=$(echo "$TEAM_RESPONSE" | jq -r '.errors[0].message // "Unknown error"' 2>/dev/null || echo "API call failed")
  debug "ERROR: 팀 UUID 조회 실패 - $error_msg"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"$error_msg\",\"error_stage\":\"team_lookup\",\"summary\":\"Linear 팀 조회 실패: $error_msg\"}"
  exit 1
}

TEAM_UUID=$(echo "$TEAM_RESPONSE" | jq -r '.data.teams.nodes[0].id // empty')
if [ -z "$TEAM_UUID" ]; then
  debug "ERROR: 팀 UUID를 찾을 수 없음 (TEAM_ID=$TEAM_ID)"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"Team not found: $TEAM_ID\",\"error_stage\":\"team_lookup\",\"summary\":\"팀을 찾을 수 없음: $TEAM_ID\"}"
  exit 1
fi
debug "팀 UUID 조회 완료: $TEAM_UUID"

# Step 2: Get workflow states for the team using UUID
debug "--- Step 2: 팀 워크플로우 상태 조회 시작 (TEAM_UUID=$TEAM_UUID) ---"
STATES_QUERY=$(jq -n --arg teamId "$TEAM_UUID" '{query: "query($teamId: ID!) { workflowStates(filter: { team: { id: { eq: $teamId } } }) { nodes { id name type } } }", variables: { teamId: $teamId }}')
debug "Linear API 호출 중... (요청 크기: ${#STATES_QUERY})"
STATES_RESPONSE=$(linear_api "$STATES_QUERY") || {
  error_msg=$(echo "$STATES_RESPONSE" | jq -r '.errors[0].message // "Unknown error"' 2>/dev/null || echo "API call failed")
  debug "ERROR: 워크플로우 상태 조회 실패 - $error_msg"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"$error_msg\",\"error_stage\":\"status_lookup\",\"summary\":\"Linear 상태 조회 실패: $error_msg\"}"
  exit 1
}

# Check for errors in the response
API_ERROR=$(echo "$STATES_RESPONSE" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [ -n "$API_ERROR" ]; then
  debug "ERROR: 워크플로우 상태 조회 실패 - $API_ERROR"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"$API_ERROR\",\"error_stage\":\"status_lookup\",\"summary\":\"Linear 상태 조회 실패: $API_ERROR\"}"
  exit 1
fi

TARGET_STATE_ID=$(echo "$STATES_RESPONSE" | jq -r --arg name "$TARGET_STATE_NAME" '.data.workflowStates.nodes[] | select(.name == $name) | .id' | head -1)
if [ -z "$TARGET_STATE_ID" ]; then
  debug "ERROR: 대상 상태를 찾을 수 없음 (TARGET_STATE_NAME=$TARGET_STATE_NAME)"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"State not found: $TARGET_STATE_NAME\",\"error_stage\":\"status_lookup\",\"summary\":\"대상 상태를 찾을 수 없음: $TARGET_STATE_NAME\"}"
  exit 1
fi
debug "대상 상태 ID 확인: $TARGET_STATE_ID"

# Step 3: Look up the issue by identifier to get its UUID
debug "--- Step 3: 이슈 UUID 조회 시작 (ISSUE_ID=$ISSUE_ID) ---"
ISSUE_QUERY=$(jq -n --arg id "$ISSUE_ID" '{query: "query($id: String!) { issueSearch(query: $id, first: 1) { nodes { id identifier } } }", variables: { id: $id }}')
debug "Linear API 호출 중... (요청 크기: ${#ISSUE_QUERY})"
ISSUE_RESPONSE=$(linear_api "$ISSUE_QUERY") || {
  error_msg=$(echo "$ISSUE_RESPONSE" | jq -r '.errors[0].message // "Unknown error"' 2>/dev/null || echo "API call failed")
  debug "ERROR: 이슈 조회 실패 - $error_msg"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"$error_msg\",\"error_stage\":\"issue_lookup\",\"summary\":\"이슈 조회 실패: $error_msg\"}"
  exit 1
}

ISSUE_UUID=$(echo "$ISSUE_RESPONSE" | jq -r '.data.issueSearch.nodes[0].id // empty')
if [ -z "$ISSUE_UUID" ]; then
  debug "ERROR: 이슈를 찾을 수 없음 (ISSUE_ID=$ISSUE_ID)"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"Issue not found: $ISSUE_ID\",\"error_stage\":\"issue_lookup\",\"summary\":\"이슈를 찾을 수 없음: $ISSUE_ID\"}"
  exit 1
fi
debug "이슈 UUID 조회 완료: $ISSUE_UUID"

# Step 4: Update issue status
debug "--- Step 4: 이슈 상태 업데이트 시작 ---"
UPDATE_QUERY=$(jq -n --arg issueId "$ISSUE_UUID" --arg stateId "$TARGET_STATE_ID" '{query: "mutation($issueId: String!, $stateId: String!) { issueUpdate(id: $issueId, input: { stateId: $stateId }) { success issue { id identifier state { name } } } }", variables: { issueId: $issueId, stateId: $stateId }}')
debug "Linear API 호출 중... (요청 크기: ${#UPDATE_QUERY})"
UPDATE_RESPONSE=$(linear_api "$UPDATE_QUERY") || {
  error_msg=$(echo "$UPDATE_RESPONSE" | jq -r '.errors[0].message // "Unknown error"' 2>/dev/null || echo "API call failed")
  debug "ERROR: 이슈 상태 업데이트 실패 - $error_msg"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":false,\"comment_created\":false,\"error\":\"$error_msg\",\"error_stage\":\"status_update\",\"summary\":\"이슈 상태 업데이트 실패: $error_msg\"}"
  exit 1
}

STATUS_UPDATED=$(echo "$UPDATE_RESPONSE" | jq -r '.data.issueUpdate.success // false')
debug "이슈 상태 업데이트 결과: $STATUS_UPDATED"

# Step 5: Add comment to issue
debug "--- Step 5: 이슈 코멘트 추가 시작 ---"
COMMENT_QUERY=$(jq -n --arg issueId "$ISSUE_UUID" --arg body "$COMMENT_BODY" '{query: "mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id } } }", variables: { issueId: $issueId, body: $body }}')
debug "Linear API 호출 중... (요청 크기: ${#COMMENT_QUERY})"
COMMENT_RESPONSE=$(linear_api "$COMMENT_QUERY") || {
  error_msg=$(echo "$COMMENT_RESPONSE" | jq -r '.errors[0].message // "Unknown error"' 2>/dev/null || echo "API call failed")
  debug "ERROR: 코멘트 추가 실패 - $error_msg"
  echo "{\"success\":false,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":$STATUS_UPDATED,\"comment_created\":false,\"error\":\"$error_msg\",\"error_stage\":\"comment_create\",\"summary\":\"코멘트 추가 실패: $error_msg\"}"
  exit 1
}

COMMENT_CREATED=$(echo "$COMMENT_RESPONSE" | jq -r '.data.commentCreate.success // false')
debug "코멘트 추가 결과: $COMMENT_CREATED"

# Output final result
debug "=== linear-status-report.sh 완료 ==="
echo "{\"success\":true,\"issue_id\":\"$ISSUE_ID\",\"status_updated\":$STATUS_UPDATED,\"comment_created\":$COMMENT_CREATED,\"error\":\"\",\"error_stage\":\"\",\"summary\":\"이슈 $ISSUE_ID 상태를 $TARGET_STATE_NAME(으)로 업데이트 완료\"}"
