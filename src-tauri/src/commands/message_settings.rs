use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use uuid::Uuid;

fn extract_message_text(content_json: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(content_json).ok()?;
    if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(arr) = value.as_array() {
        let mut parts: Vec<String> = Vec::new();
        for item in arr {
            if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }
        }
        if !parts.is_empty() {
            return Some(parts.join("\n"));
        }
    }
    None
}

#[tauri::command]
pub(crate) fn add_message_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
    role: String,
    content_json: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let role_normalized = role.trim().to_ascii_lowercase();
    let content_value = serde_json::from_str::<serde_json::Value>(&content_json)
        .unwrap_or(serde_json::Value::Null);
    let message_text = extract_message_text(&content_json);

    let (event_type, payload_json) = match role_normalized.as_str() {
        "user" => (
            "user_message",
            json!({
              "v": 1,
              "role": "user",
              "content": content_value,
            }),
        ),
        "assistant" => {
            let run_id = format!("local_fallback_{}", Uuid::new_v4().simple());
            (
                "assistant_message",
                json!({
                  "v": 1,
                  "role": "assistant",
                  "content": content_value,
                  "source_event_ids": [],
                  "meta": {
                    "engine_id": "messages_agent",
                    "run_id": run_id,
                  }
                }),
            )
        }
        _ => {
            let run_id = format!("local_engine_io_{}", Uuid::new_v4().simple());
            (
                "engine_io_chunk",
                json!({
                  "v": 1,
                  "role": role,
                  "content": content_value,
                  "meta": {
                    "engine_id": "messages_agent",
                    "run_id": run_id,
                  }
                }),
            )
        }
    };

    let payload_text = serde_json::to_string(&payload_json).map_err(|e| e.to_string())?;
    crate::db::append_event(
        &conn,
        Path::new(&state.db_path),
        &session_id,
        event_type,
        message_text.as_deref(),
        Some(&payload_text),
        None,
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_messages_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
) -> Result<Vec<crate::db::MessageRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::list_messages(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_messages_tail_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
    limit: usize,
) -> Result<Vec<crate::db::MessageRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::list_messages_tail(&conn, &session_id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_messages_before_seq_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
    before_seq: i64,
    limit: usize,
) -> Result<Vec<crate::db::MessageRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::list_messages_before_seq(&conn, &session_id, before_seq, limit)
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ModelToggle {
    id: String,
    label: String,
    enabled: bool,
}

fn default_model_toggles() -> Vec<ModelToggle> {
    vec![
        ModelToggle {
            id: "gpt-5.2".to_string(),
            label: "GPT 5.2".to_string(),
            enabled: true,
        },
        ModelToggle {
            id: "sonnet-4.5".to_string(),
            label: "Sonnet 4.5".to_string(),
            enabled: true,
        },
        ModelToggle {
            id: "opus-4.5".to_string(),
            label: "Opus 4.5".to_string(),
            enabled: true,
        },
        ModelToggle {
            id: "opus-4.6".to_string(),
            label: "Opus 4.6".to_string(),
            enabled: true,
        },
        ModelToggle {
            id: "gemini-3-flash".to_string(),
            label: "Gemini 3 Flash".to_string(),
            enabled: true,
        },
        ModelToggle {
            id: "gemini-3-pro".to_string(),
            label: "Gemini 3 Pro".to_string(),
            enabled: true,
        },
        ModelToggle {
            id: "grok-4.1".to_string(),
            label: "Grok 4.1".to_string(),
            enabled: true,
        },
    ]
}

#[tauri::command]
pub(crate) fn get_model_toggles_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Vec<ModelToggle>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let value = crate::db::get_ui_state(&conn, "model_toggles")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "[]".to_string());
    let mut parsed: Vec<ModelToggle> = serde_json::from_str(&value).unwrap_or_default();
    if parsed.is_empty() {
        parsed = default_model_toggles();
        // Persist defaults for a stable first-run UX after DB resets.
        if let Ok(serialized) = serde_json::to_string(&parsed) {
            let _ = crate::db::set_ui_state(&conn, "model_toggles", &serialized);
        }
    }
    Ok(parsed)
}

#[tauri::command]
pub(crate) fn set_model_toggles_cmd(
    state: tauri::State<crate::db::DbState>,
    toggles: Vec<ModelToggle>,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let value = serde_json::to_string(&toggles).map_err(|e| e.to_string())?;
    crate::db::set_ui_state(&conn, "model_toggles", &value).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
pub(crate) struct SecretScanRedaction {
    kind: String,
    count: usize,
}

#[derive(Clone, Serialize)]
pub(crate) struct SecretScanResult {
    redacted: String,
    blocked: bool,
    redactions: Vec<SecretScanRedaction>,
}

#[tauri::command]
pub(crate) fn scan_publish_content_cmd(text: String) -> Result<SecretScanResult, String> {
    let (redacted, report) = crate::context::redact_secrets(&text);
    // Publish is fail-closed: any detected secret blocks egress (even if redaction is possible).
    let blocked = !report.redactions.is_empty();
    Ok(SecretScanResult {
        redacted,
        blocked,
        redactions: report
            .redactions
            .into_iter()
            .map(|(kind, count)| SecretScanRedaction { kind, count })
            .collect(),
    })
}

#[tauri::command]
pub(crate) fn get_exec_policy_rules_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Option<String>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::get_ui_state(&conn, "exec_policy_rules").map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn get_system_prompt_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Option<String>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::get_ui_state(&conn, "system_prompt").map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn set_system_prompt_cmd(
    state: tauri::State<crate::db::DbState>,
    prompt: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    if prompt.len() > 20000 {
        return Err("prompt too large".to_string());
    }
    crate::db::set_ui_state(&conn, "system_prompt", &prompt).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn get_approval_mode_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Option<String>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::get_ui_state(&conn, "approval_mode").map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn set_approval_mode_cmd(
    state: tauri::State<crate::db::DbState>,
    mode: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::set_ui_state(&conn, "approval_mode", &mode).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn detect_test_commands_cmd(
    state: tauri::State<crate::db::DbState>,
    cwd: String,
) -> Result<Vec<String>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let workspace_root = crate::db::get_ui_state(&conn, "workspace_root")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "workspace root not set".to_string())?;
    if !crate::is_within_root(&workspace_root, &cwd) {
        return Err("cwd outside workspace root".to_string());
    }
    let root = Path::new(&cwd);
    if !root.exists() {
        return Err("cwd does not exist".to_string());
    }

    let mut commands = Vec::new();
    if root.join("Cargo.toml").exists() {
        commands.push("cargo test -q".to_string());
    }
    if root.join("package.json").exists() {
        commands.push("npm test".to_string());
    }
    if root.join("pyproject.toml").exists() || root.join("pytest.ini").exists() {
        commands.push("pytest".to_string());
    }
    if root.join("go.mod").exists() {
        commands.push("go test ./...".to_string());
    }
    if root.join("Makefile").exists() || root.join("makefile").exists() {
        commands.push("make test".to_string());
    }

    Ok(commands)
}

#[tauri::command]
pub(crate) fn set_exec_policy_rules_cmd(
    state: tauri::State<crate::db::DbState>,
    rules: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    if rules.len() > 10000 {
        return Err("rules too large".to_string());
    }
    crate::db::set_ui_state(&conn, "exec_policy_rules", &rules).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn get_session_resume_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
) -> Result<crate::db::SessionResume, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::get_session_resume(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn get_active_model_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Option<String>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::get_ui_state(&conn, "active_model").map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn set_active_model_cmd(
    state: tauri::State<crate::db::DbState>,
    model_id: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::set_ui_state(&conn, "active_model", &model_id).map_err(|e| e.to_string())
}
