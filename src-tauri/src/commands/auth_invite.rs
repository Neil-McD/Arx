use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYCHAIN_SUPABASE_SESSION: &str = "supabase_session";
const UI_STATE_PENDING_INVITES_V1: &str = "pending_invites_v1";
const MAX_INVITE_KEY_LEN: usize = 128;

#[derive(Clone, Serialize)]
pub(crate) struct ChatgptAuthSummary {
    email: Option<String>,
    account_id: Option<String>,
    access_token_expires_at: Option<i64>,
}

fn summarize_chatgpt_auth(value: &crate::ChatgptAuthV1) -> ChatgptAuthSummary {
    ChatgptAuthSummary {
        email: value.email.clone(),
        account_id: value.account_id.clone(),
        access_token_expires_at: value.access_token_expires_at,
    }
}

#[tauri::command]
pub(crate) fn get_chatgpt_auth_summary_cmd() -> Result<Option<ChatgptAuthSummary>, String> {
    Ok(crate::load_chatgpt_auth_v1()?.map(|value| summarize_chatgpt_auth(&value)))
}

#[tauri::command]
pub(crate) fn clear_chatgpt_auth_cmd() -> Result<(), String> {
    crate::clear_chatgpt_auth_v1()
}

#[tauri::command]
pub(crate) async fn chatgpt_login_cmd() -> Result<ChatgptAuthSummary, String> {
    // Use Codex's fixed localhost callback port. The OAuth client is typically
    // registered with a single redirect URI, so random ports can fail.
    let listener = crate::bind_chatgpt_callback_listener().await?;
    let redirect_uri = format!(
        "http://localhost:{}/auth/callback",
        crate::CHATGPT_OAUTH_CALLBACK_PORT
    );

    let (code_verifier, code_challenge) = crate::generate_chatgpt_pkce();
    let state = crate::generate_chatgpt_state();
    let auth_url = crate::build_chatgpt_authorize_url(&redirect_uri, &code_challenge, &state)?;

    // Launch browser for the OAuth consent/login flow.
    open::that(&auth_url).map_err(|e| e.to_string())?;

    let code = crate::wait_for_chatgpt_oauth_callback(listener, &state).await?;
    let (id_token, access_token, refresh_token) =
        crate::exchange_chatgpt_code_for_tokens(&code, &redirect_uri, &code_verifier).await?;

    let account_id = crate::extract_chatgpt_account_id_from_token(&id_token)
        .or_else(|| crate::extract_chatgpt_account_id_from_token(&access_token));
    let email = crate::jwt_string_claim(&id_token, "email");
    let access_token_expires_at = crate::jwt_i64_claim(&access_token, "exp");

    let stored = crate::ChatgptAuthV1 {
        id_token,
        access_token,
        refresh_token,
        account_id,
        email,
        access_token_expires_at,
    };
    crate::save_chatgpt_auth_v1(&stored)?;
    Ok(summarize_chatgpt_auth(&stored))
}

#[derive(Clone, Deserialize)]
pub(crate) struct ChatgptCloudTurnMessageInput {
    role: String,
    content: String,
}

#[derive(Clone, Serialize)]
pub(crate) struct ChatgptCloudTurnResult {
    text: String,
    model_id: String,
    inference_source: String,
}

fn normalize_chatgpt_cloud_turn_request(
    model_id: &str,
    messages: Vec<ChatgptCloudTurnMessageInput>,
) -> Result<(Option<String>, Vec<serde_json::Value>), String> {
    if model_id.is_empty() {
        return Err("model_id is required".to_string());
    }
    if model_id.len() > 128 {
        return Err("model_id is too long".to_string());
    }
    if messages.is_empty() {
        return Err("messages are required".to_string());
    }
    if messages.len() > 80 {
        return Err("messages exceed max count".to_string());
    }

    let mut instructions_parts: Vec<String> = Vec::new();
    let mut input_items: Vec<serde_json::Value> = Vec::new();
    let mut total_chars: usize = 0;

    for msg in messages {
        let role = msg.role.trim().to_lowercase();
        let content = msg.content.trim();
        if content.is_empty() {
            continue;
        }
        total_chars = total_chars.saturating_add(content.len());
        if total_chars > 250_000 {
            return Err("messages exceed size budget".to_string());
        }

        match role.as_str() {
            "system" => instructions_parts.push(content.to_string()),
            "user" => input_items.push(serde_json::json!({
                "role": "user",
                "content": [{ "type": "input_text", "text": content }]
            })),
            "assistant" => input_items.push(serde_json::json!({
                "role": "assistant",
                "content": [{ "type": "output_text", "text": content }]
            })),
            _ => return Err("messages contain unsupported role".to_string()),
        }
    }

    if input_items.is_empty() {
        return Err("messages must include at least one user/assistant item".to_string());
    }

    let instructions = if instructions_parts.is_empty() {
        None
    } else {
        Some(instructions_parts.join("\n\n"))
    };

    Ok((instructions, input_items))
}

fn parse_chatgpt_cloud_turn_response_bytes(
    bytes: &[u8],
    content_type: &str,
) -> Result<(String, Option<String>), String> {
    if content_type.contains("text/event-stream") {
        let body = String::from_utf8_lossy(bytes);
        let mut text = String::new();
        let mut saw_delta = false;
        let mut saw_done_text = false;
        let mut model_id: Option<String> = None;

        for raw_line in body.lines() {
            let line = raw_line.trim();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let data = line.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                break;
            }

            let parsed: serde_json::Value = match serde_json::from_str(data) {
                Ok(value) => value,
                Err(_) => continue,
            };

            if model_id.is_none() {
                model_id = parsed
                    .get("response")
                    .and_then(|v| v.get("model"))
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string())
                    .or_else(|| {
                        parsed
                            .get("model")
                            .and_then(|v| v.as_str())
                            .map(|v| v.to_string())
                    });
            }

            let kind = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if kind == "error" {
                let message = parsed
                    .get("message")
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        parsed
                            .get("error")
                            .and_then(|v| v.get("message"))
                            .and_then(|v| v.as_str())
                    })
                    .unwrap_or("ChatGPT inference failed.");
                return Err(message.to_string());
            }

            if kind == "response.output_text.delta" {
                if let Some(delta) = parsed.get("delta").and_then(|v| v.as_str()) {
                    if !delta.is_empty() {
                        saw_delta = true;
                        text.push_str(delta);
                    }
                }
                continue;
            }

            if kind == "response.output_text.done" && !saw_delta && !saw_done_text {
                if let Some(done_text) = parsed.get("text").and_then(|v| v.as_str()) {
                    if !done_text.trim().is_empty() {
                        saw_done_text = true;
                        text.push_str(done_text);
                    }
                }
                continue;
            }

            if kind == "response.output_item.done" && !saw_delta && !saw_done_text {
                let Some(item) = parsed.get("item") else {
                    continue;
                };
                let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if item_type != "message" {
                    continue;
                }
                let Some(content_items) = item.get("content").and_then(|v| v.as_array()) else {
                    continue;
                };
                let mut done_text = String::new();
                for part in content_items {
                    let part_type = part.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if part_type != "output_text" {
                        continue;
                    }
                    if let Some(value) = part.get("text").and_then(|v| v.as_str()) {
                        if !value.is_empty() {
                            done_text.push_str(value);
                        }
                    }
                }
                if !done_text.trim().is_empty() {
                    saw_done_text = true;
                    text.push_str(&done_text);
                }
            }
        }

        return Ok((text, model_id));
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| "ChatGPT returned invalid JSON".to_string())?;
    let model_id = parsed
        .get("model")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .or_else(|| {
            parsed
                .get("response")
                .and_then(|v| v.get("model"))
                .and_then(|v| v.as_str())
                .map(|v| v.to_string())
        });

    if let Some(error_message) = parsed
        .get("error")
        .and_then(|v| v.get("message"))
        .and_then(|v| v.as_str())
    {
        return Err(error_message.to_string());
    }

    let text = parsed
        .get("output_text")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .or_else(|| {
            parsed
                .get("output")
                .and_then(|v| v.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("content"))
                .and_then(|v| v.as_array())
                .and_then(|parts| parts.first())
                .and_then(|part| part.get("text"))
                .and_then(|v| v.as_str())
                .map(|v| v.to_string())
        })
        .unwrap_or_default();

    Ok((text, model_id))
}

#[tauri::command]
pub(crate) async fn chatgpt_cloud_turn_cmd(
    model_id: String,
    messages: Vec<ChatgptCloudTurnMessageInput>,
    max_tokens: Option<i64>,
) -> Result<ChatgptCloudTurnResult, String> {
    let model_id = model_id.trim().to_string();
    let (instructions, input_items) = normalize_chatgpt_cloud_turn_request(&model_id, messages)?;
    let max_tokens = max_tokens.filter(|value| *value > 0);

    let mut request_body = serde_json::json!({
        "model": model_id,
        "store": false,
        "stream": true,
        "input": input_items,
    });
    if let Some(value) = instructions {
        request_body["instructions"] = serde_json::Value::String(value);
    }
    if let Some(value) = max_tokens {
        request_body["max_output_tokens"] = serde_json::json!(value);
    }
    let request_bytes =
        serde_json::to_vec(&request_body).map_err(|e| format!("Request serialization failed: {}", e))?;

    let mut first_failure: Option<String> = None;
    for attempt in 0..2 {
        let auth = crate::get_chatgpt_auth_for_inference_with_timeout(
            crate::CHATGPT_AUTH_PREFETCH_TIMEOUT_MS,
        )
        .await
        .ok_or_else(|| "ChatGPT session not available. Sign in again.".to_string())?;

        let mut request = reqwest::Client::new()
            .post(crate::CHATGPT_CODEX_RESPONSES_URL)
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .header("User-Agent", "codex-cli")
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream");
        if let Some(account_id) = auth.account_id.as_deref().filter(|value| !value.trim().is_empty()) {
            request = request.header("ChatGPT-Account-Id", account_id.trim());
        }

        let response = request
            .body(request_bytes.clone())
            .send()
            .await
            .map_err(|e| format!("ChatGPT request failed: {}", e))?;
        let status = response.status();
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = response
            .bytes()
            .await
            .map_err(|e| format!("ChatGPT response read failed: {}", e))?;

        if !status.is_success() {
            let detail = String::from_utf8_lossy(&body).trim().to_string();
            let failure = if detail.is_empty() {
                format!("ChatGPT inference failed (HTTP {}).", status.as_u16())
            } else {
                format!("ChatGPT inference failed (HTTP {}): {}", status.as_u16(), detail)
            };
            if attempt == 0 {
                first_failure = Some(failure);
                continue;
            }
            return Err(first_failure.unwrap_or(failure));
        }

        let (text, resolved_model_id) =
            parse_chatgpt_cloud_turn_response_bytes(&body, content_type.as_str())?;
        let text = text.trim().to_string();
        if text.is_empty() {
            return Err("ChatGPT returned an empty response.".to_string());
        }
        return Ok(ChatgptCloudTurnResult {
            text,
            model_id: resolved_model_id.unwrap_or_else(|| model_id.clone()),
            inference_source: "chatgpt".to_string(),
        });
    }

    Err(first_failure.unwrap_or_else(|| "ChatGPT inference failed.".to_string()))
}

#[tauri::command]
pub(crate) fn get_supabase_session_cmd() -> Result<Option<String>, String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub(crate) fn set_supabase_session_cmd(session_json: String) -> Result<(), String> {
    let cleaned = session_json.trim();
    if cleaned.is_empty() {
        return Err("session_json is empty".to_string());
    }
    if cleaned.len() > 64 * 1024 {
        return Err("session_json too large".to_string());
    }
    let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
    entry.set_password(cleaned).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn clear_supabase_session_cmd() -> Result<(), String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub(crate) fn open_external_url_cmd(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is empty".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("url must start with http:// or https://".to_string());
    }
    open::that(trimmed).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct PendingInviteRecord {
    invite_key: String,
    status: String, // pending | dismissed | joined | expired
    first_seen_at: i64,
    updated_at: i64,
    dismissed_at: Option<i64>,
    join_intent_at: Option<i64>,
    joined_at: Option<i64>,
    expired_at: Option<i64>,
    community_id: Option<String>,
    community_name: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct PendingInvitesEnvelope {
    v: i32,
    invites: Vec<PendingInviteRecord>,
}

fn load_pending_invites(conn: &rusqlite::Connection) -> Vec<PendingInviteRecord> {
    let Some(raw) = crate::db::get_ui_state(conn, UI_STATE_PENDING_INVITES_V1)
        .ok()
        .flatten()
    else {
        return Vec::new();
    };
    let Ok(parsed) = serde_json::from_str::<PendingInvitesEnvelope>(&raw) else {
        return Vec::new();
    };
    if parsed.v != 1 {
        return Vec::new();
    }
    parsed.invites
}

fn save_pending_invites(
    conn: &rusqlite::Connection,
    invites: Vec<PendingInviteRecord>,
) -> Result<(), String> {
    let envelope = PendingInvitesEnvelope { v: 1, invites };
    let value = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    crate::db::set_ui_state(conn, UI_STATE_PENDING_INVITES_V1, &value).map_err(|e| e.to_string())
}

fn normalize_invite_key(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() > MAX_INVITE_KEY_LEN {
        return None;
    }
    Some(trimmed.to_string())
}

#[tauri::command]
pub(crate) fn list_pending_invites_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Vec<PendingInviteRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    Ok(load_pending_invites(&conn))
}

#[tauri::command]
pub(crate) fn upsert_pending_invite_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
    source: Option<String>,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "pending".to_string();
            existing.dismissed_at = None;
            existing.expired_at = None;
        }
        existing.updated_at = now;
        if existing.source.is_none() {
            existing.source = source;
        }
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "pending".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: None,
            joined_at: None,
            expired_at: None,
            community_id: None,
            community_name: None,
            source,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn dismiss_pending_invite_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "dismissed".to_string();
        }
        existing.dismissed_at = Some(now);
        existing.join_intent_at = None;
        existing.updated_at = now;
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "dismissed".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: Some(now),
            join_intent_at: None,
            joined_at: None,
            expired_at: None,
            community_id: None,
            community_name: None,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn request_join_pending_invite_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "pending".to_string();
        }
        existing.dismissed_at = None;
        existing.expired_at = None;
        existing.join_intent_at = Some(now);
        existing.updated_at = now;
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "pending".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: Some(now),
            joined_at: None,
            expired_at: None,
            community_id: None,
            community_name: None,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn mark_pending_invite_joined_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
    community_id: Option<String>,
    community_name: Option<String>,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        existing.status = "joined".to_string();
        existing.joined_at = Some(now);
        existing.dismissed_at = None;
        existing.expired_at = None;
        existing.join_intent_at = None;
        existing.updated_at = now;
        if existing.community_id.is_none() {
            existing.community_id = community_id;
        }
        if existing.community_name.is_none() {
            existing.community_name = community_name;
        }
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "joined".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: None,
            joined_at: Some(now),
            expired_at: None,
            community_id,
            community_name,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn mark_pending_invite_expired_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "expired".to_string();
            existing.expired_at = Some(now);
            existing.dismissed_at = None;
            existing.join_intent_at = None;
            existing.updated_at = now;
        }
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "expired".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: None,
            joined_at: None,
            expired_at: Some(now),
            community_id: None,
            community_name: None,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}
