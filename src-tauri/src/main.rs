#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cancellation;
mod context;
mod context_builder;
mod db;
mod engine_sessions;
mod logging;


use db::{
  add_message, create_session, create_thread, delete_thread, delete_ui_state,
  create_personal_memory_item, delete_personal_memory_item, list_personal_memory_items,
  search_personal_memory_items, set_personal_memory_item_pinned,
  get_project_by_id, get_session_resume, get_ui_state, list_events,
  list_messages, list_sessions, list_threads, open_conn, set_ui_state,
  get_thread_by_id,
  upsert_project, set_thread_workspace_path, DbState,
};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::Emitter;
use tauri::Manager;
use futures::StreamExt;

const ENGINE_CODEX_CLI: &str = "codex_cli";
const ENGINE_OPENROUTER_CHAT: &str = "openrouter_chat";
const OPENROUTER_MAX_TOKENS: u32 = 1024;

#[derive(Clone, Serialize)]
struct ToolUiSpec {
  name: String,
  description: String,
  parameters: serde_json::Value,
  requires_approval: bool,
  auto_apply: bool,
  parallel_safe: bool,
}

struct ProjectIdentity {
  name: Option<String>,
  root_path: String,
  git_root: Option<String>,
  git_remote: Option<String>,
  fingerprint: String,
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
  let output = Command::new("git").arg("-C").arg(dir).args(args).output().ok()?;
  if !output.status.success() {
    return None;
  }
  let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if value.is_empty() { None } else { Some(value) }
}

#[tauri::command]
fn list_tools_cmd() -> Result<Vec<ToolUiSpec>, String> {
  // MVP: engines own execution. Arx does not expose an internal tool registry.
  Ok(Vec::new())
}

fn normalize_agent_mode(mode: &str) -> Option<&'static str> {
  match mode.trim().to_lowercase().as_str() {
    "build" => Some("build"),
    "plan" => Some("plan"),
    "explore" => Some("explore"),
    _ => None,
  }
}

#[tauri::command]
fn get_agent_mode_cmd(state: tauri::State<DbState>, session_id: String) -> Result<String, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let key = format!("agent_mode::{}", session_id);
  Ok(get_ui_state(&conn, &key)
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| "build".to_string()))
}

#[tauri::command]
fn set_agent_mode_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  mode: String,
) -> Result<(), String> {
  let Some(mode) = normalize_agent_mode(&mode) else {
    return Err("invalid mode (expected build|plan|explore)".to_string());
  };
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let key = format!("agent_mode::{}", session_id);
  set_ui_state(&conn, &key, mode).map_err(|e| e.to_string())
}

#[tauri::command]
async fn respond_permission_cmd(
  state: tauri::State<'_, DbState>,
  session_id: String,
  model_id: String,
  tool_call_id: String,
  response: String,
  cwd: String,
) -> Result<String, String> {
  // MVP: no internal tool execution. Keep this command for UI compatibility.
  let _ = (&state, session_id, model_id, tool_call_id, response, cwd);
  Ok("Internal tool system is disabled in MVP; use the engine terminal.".to_string())
}

fn is_pty_engine(engine_id: &str) -> bool {
  engine_id == ENGINE_CODEX_CLI
}

#[derive(Clone, Serialize)]
struct OpenRouterStreamPayload {
  session_id: String,
  chunk: String,
  full_content: String,
  seq: u64,
  prompt_tokens: Option<u64>,
  completion_tokens: Option<u64>,
  max_tokens: u32,
}

#[derive(Clone, Serialize)]
struct SessionIdPayload {
  session_id: String,
}

#[tauri::command]
fn harness_start_cmd(
  window: tauri::Window,
  state: tauri::State<DbState>,
  thread_id: String,
  cwd: String,
) -> Result<(), String> {
  engine_start_cmd(window, state, thread_id, cwd)
}

/// Legacy alias for backward compatibility
#[tauri::command]
fn engine_start_cmd(
  window: tauri::Window,
  state: tauri::State<DbState>,
  thread_id: String,
  cwd: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let thread = get_thread_by_id(&conn, &thread_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "thread not found".to_string())?;

  if !is_pty_engine(&thread.engine_id) {
    return Ok(());
  }

  engine_sessions::ensure_engine_session(&window, &state, &thread_id, &thread.engine_id, &cwd)
}

#[tauri::command]
async fn send_turn_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  thread_id: String,
  cwd: String,
  input: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let thread = get_thread_by_id(&conn, &thread_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "thread not found".to_string())?;

  let workspace = thread
    .workspace_path
    .as_deref()
    .filter(|p| !p.trim().is_empty())
    .unwrap_or_else(|| if !cwd.trim().is_empty() { cwd.trim() } else { "." });
  if thread.workspace_path.as_deref().map(|v| v.trim()) != Some(workspace) {
    let _ = set_thread_workspace_path(&conn, &thread_id, Some(workspace));
  }

  // Shared memory injection (both harness + OpenRouter chat).
  let built = context_builder::build_turn_handoff_prefix(&conn, workspace)
    .map_err(|e| e.to_string())?;
  let retrieval_payload = serde_json::json!({
    "workspace_path": workspace,
    "personal_memory": {
      "budget_chars": 2000,
      "items": built.used_personal_memory.iter().map(|it| serde_json::json!({
        "id": it.id,
        "content": it.content,
        "scope": it.scope,
        "scope_id": it.scope_id,
        "pinned": it.pinned,
        "updated_at": it.updated_at,
        "redacted": it.redacted
      })).collect::<Vec<_>>()
    }
  });
  let _ = db::append_event(
    &conn,
    &thread_id,
    "memory_retrieval",
    Some("personal_memory"),
    Some(&retrieval_payload.to_string()),
    None,
  );

  if is_pty_engine(&thread.engine_id) {
    engine_sessions::ensure_engine_session(&window, &state, &thread_id, &thread.engine_id, &cwd)?;
    let mut payload = format!("{}{}", built.handoff_prefix, input);
    if !payload.ends_with('\n') {
      payload.push('\n');
    }
    return engine_sessions::write_to_engine(&thread_id, &payload);
  }

  if thread.engine_id != ENGINE_OPENROUTER_CHAT {
    return Err(format!("Unsupported engine_id: {}", thread.engine_id));
  }

  let model_id = thread
    .model_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .ok_or_else(|| "OpenRouter model is required".to_string())?;

  let (_redacted, report) = context::redact_secrets(&input);
  if !report.redactions.is_empty() {
    return Err("Blocked: sensitive content detected in message. Remove secrets before sending.".to_string());
  }

  let openrouter_key = {
    let entry = Entry::new("com.arx.app", "openrouter").map_err(|e| e.to_string())?;
    entry.get_password().map_err(|_| "Missing OpenRouter API key.".to_string())?
  };

  #[derive(Serialize)]
  struct OpenRouterMessage {
    role: String,
    content: String,
  }

  #[derive(Serialize)]
  struct OpenRouterRequest {
    model: String,
    messages: Vec<OpenRouterMessage>,
    max_tokens: u32,
    stream: bool,
  }

  #[derive(Deserialize)]
  struct OpenRouterChoiceMessage {
    content: Option<String>,
  }

  #[derive(Deserialize)]
  struct OpenRouterChoice {
    message: Option<OpenRouterChoiceMessage>,
    delta: Option<OpenRouterChoiceMessage>,
  }

  #[derive(Deserialize)]
  struct OpenRouterResponse {
    choices: Option<Vec<OpenRouterChoice>>,
    usage: Option<serde_json::Value>,
  }

  // Build a simple conversation: system = handoff_prefix, then last 20 user/assistant messages, then the current input.
  let mut messages: Vec<OpenRouterMessage> = Vec::new();
  messages.push(OpenRouterMessage {
    role: "system".to_string(),
    content: built.handoff_prefix,
  });
  if let Ok(history) = list_messages(&conn, &thread_id) {
    for msg in history.into_iter().rev().take(20).rev() {
      let value: serde_json::Value = serde_json::from_str(&msg.content_json).unwrap_or(serde_json::Value::Null);
      let text = value.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
      if text.is_empty() {
        continue;
      }
      messages.push(OpenRouterMessage {
        role: msg.role,
        content: text,
      });
    }
  }
  // Ensure current input is present as the last user message.
  if messages.last().map(|m| m.role.as_str()) != Some("user") || messages.last().map(|m| m.content.as_str()) != Some(input.trim()) {
    messages.push(OpenRouterMessage {
      role: "user".to_string(),
      content: input.trim().to_string(),
    });
  }

  let client = reqwest::Client::new();
  let res = client
    .post("https://openrouter.ai/api/v1/chat/completions")
    .header("Authorization", format!("Bearer {}", openrouter_key))
    .header("Content-Type", "application/json")
    .json(&OpenRouterRequest {
      model: model_id.to_string(),
      messages,
      max_tokens: OPENROUTER_MAX_TOKENS,
      stream: true,
    })
    .send()
    .await
    .map_err(|e| format!("OpenRouter request failed: {}", e))?;

  if !res.status().is_success() {
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let friendly = serde_json::from_str::<serde_json::Value>(&body)
      .ok()
      .and_then(|v| v.get("error").cloned())
      .and_then(|e| e.get("message").and_then(|m| m.as_str()).map(|s| s.to_string()))
      .unwrap_or_else(|| body);
    return Err(format!("OpenRouter error {}: {}", status.as_u16(), friendly));
  }

  let mut seq: u64 = 0;
  let mut assistant = String::new();
  let mut pending = String::new();
  let mut prompt_tokens: Option<u64> = None;
  let mut completion_tokens: Option<u64> = None;

  let mut stream = res.bytes_stream();
  while let Some(next) = stream.next().await {
    let bytes = next.map_err(|e| format!("OpenRouter stream error: {}", e))?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    pending.push_str(&text);

    while let Some(idx) = pending.find('\n') {
      let mut line = pending[..idx].to_string();
      pending = pending[idx + 1..].to_string();
      line = line.trim().to_string();
      if line.is_empty() {
        continue;
      }
      if !line.starts_with("data:") {
        continue;
      }
      let data = line.trim_start_matches("data:").trim();
      if data == "[DONE]" {
        pending.clear();
        break;
      }

      let parsed: serde_json::Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => continue,
      };

      if let Some(usage) = parsed.get("usage") {
        prompt_tokens = usage.get("prompt_tokens").and_then(|v| v.as_u64()).or(prompt_tokens);
        completion_tokens = usage.get("completion_tokens").and_then(|v| v.as_u64()).or(completion_tokens);
      }

      let delta = parsed
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| {
          choice
            .get("delta")
            .and_then(|d| d.get("content"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
              choice
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
            })
        });

      let Some(delta) = delta else { continue; };
      if delta.is_empty() {
        continue;
      }
      assistant.push_str(&delta);
      seq += 1;
      let _ = window.emit(
        "openrouter-stream",
        OpenRouterStreamPayload {
          session_id: thread_id.clone(),
          chunk: delta,
          full_content: assistant.clone(),
          seq,
          prompt_tokens,
          completion_tokens,
          max_tokens: OPENROUTER_MAX_TOKENS,
        },
      );
    }
  }

  let content = assistant.trim().to_string();
  if content.is_empty() {
    return Err("OpenRouter returned an empty response.".to_string());
  }

  add_message(
    &conn,
    &thread_id,
    "assistant",
    &serde_json::json!({ "text": content }).to_string(),
  )
  .map_err(|e| e.to_string())?;

  let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
  Ok(())
}

/// Legacy alias for backward compatibility
#[tauri::command]
async fn engine_send_turn_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  thread_id: String,
  cwd: String,
  input: String,
) -> Result<(), String> {
  send_turn_cmd(window, state, thread_id, cwd, input).await
}

#[tauri::command]
fn engine_write_stdin_cmd(thread_id: String, input: String) -> Result<(), String> {
  engine_sessions::write_to_engine(&thread_id, &input)
}

#[tauri::command]
fn engine_stop_cmd(thread_id: String) -> Result<(), String> {
  engine_sessions::stop_engine(&thread_id)
}

fn normalize_git_remote(value: &str) -> String {
  value.trim().to_string()
}

fn compute_project_identity(path: &Path) -> Result<ProjectIdentity, String> {
  let canonical = match path.canonicalize() {
    Ok(path) => path,
    Err(_) => path.to_path_buf(),
  };
  let root_path = canonical.to_string_lossy().to_string();
  let name = canonical
    .file_name()
    .map(|value| value.to_string_lossy().to_string());

  let git_root = run_git(&canonical, &["rev-parse", "--show-toplevel"]);
  let git_remote = git_root
    .as_deref()
    .and_then(|root| run_git(Path::new(root), &["config", "--get", "remote.origin.url"]))
    .map(|value| normalize_git_remote(&value));

  let fingerprint = if let Some(root) = git_root.as_deref() {
    let root_pathbuf = Path::new(root);
    let rel = canonical.strip_prefix(root_pathbuf).unwrap_or_else(|_| Path::new(""));
    let rel_str = rel
      .to_string_lossy()
      .trim_start_matches(std::path::MAIN_SEPARATOR)
      .to_string();
    let repo_id = git_remote
      .clone()
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| root.to_string());
    if rel_str.is_empty() {
      format!("git:{}::.", repo_id)
    } else {
      format!("git:{}::{}", repo_id, rel_str)
    }
  } else {
    format!("path:{}", root_path)
  };

  Ok(ProjectIdentity {
    name,
    root_path,
    git_root,
    git_remote,
    fingerprint,
  })
}

#[tauri::command]
fn create_thread_cmd(
  state: tauri::State<DbState>,
  title: String,
  engine_id: Option<String>,
  model_id: Option<String>,
) -> Result<db::ThreadRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let engine_id = engine_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .unwrap_or(ENGINE_CODEX_CLI);

  let model_id = model_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty());

  if engine_id == ENGINE_OPENROUTER_CHAT && model_id.is_none() {
    return Err("OpenRouter model is required".to_string());
  }

  let thread = create_thread(
    &conn,
    &title,
    engine_id,
    model_id,
  ).map_err(|e| e.to_string())?;
  Ok(thread)
}

/// Legacy: creates thread with default harness (codex_cli)
#[tauri::command]
fn create_session_cmd(
  state: tauri::State<DbState>,
  title: String,
) -> Result<db::SessionRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let session = create_session(&conn, &title).map_err(|e| e.to_string())?;
  Ok(session)
}

#[tauri::command]
fn list_sessions_cmd(state: tauri::State<DbState>) -> Result<Vec<db::SessionRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_sessions(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_threads_cmd(state: tauri::State<DbState>) -> Result<Vec<db::ThreadRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_threads(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_thread_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
) -> Result<Option<db::ThreadRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  get_thread_by_id(&conn, &thread_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_events_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  limit: usize,
) -> Result<Vec<db::EventRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_events(&conn, &thread_id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_thread_cmd(state: tauri::State<DbState>, thread_id: String) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  delete_thread(&conn, &thread_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_thread_workspace_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  workspace_path: Option<String>,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let cleaned = workspace_path.as_deref().map(|p| p.trim()).filter(|p| !p.is_empty());
  set_thread_workspace_path(&conn, &thread_id, cleaned).map_err(|e| e.to_string())?;
  let payload = serde_json::json!({
    "workspace_path": cleaned,
  });
  let _ = db::append_event(
    &conn,
    &thread_id,
    "thread_metadata_changed",
    Some("workspace_path"),
    Some(&payload.to_string()),
    None,
  );
  Ok(())
}

#[tauri::command]
async fn cancel_session_cmd(session_id: String) -> Result<bool, String> {
  let cancelled = cancellation::cancellation_manager().cancel(&session_id).await;
  Ok(cancelled)
}

#[tauri::command]
fn get_workspace_root_cmd(state: tauri::State<DbState>) -> Result<String, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let value = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  Ok(value)
}

#[tauri::command]
fn set_workspace_root_cmd(state: tauri::State<DbState>, path: String) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
  set_ui_state(&conn, "workspace_root", &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_path_within_workspace_cmd(state: tauri::State<DbState>, path: String) -> Result<bool, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let resolved = resolve_path_under_root(&workspace_root, &path);
  Ok(is_within_root(
    &workspace_root,
    resolved.to_string_lossy().as_ref(),
  ))
}

#[tauri::command]
fn set_active_project_cmd(
  state: tauri::State<DbState>,
  project_id: Option<String>,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  match project_id {
    Some(value) => {
      let project = get_project_by_id(&conn, &value).map_err(|e| e.to_string())?;
      if project.is_none() {
        return Err("project not found".to_string());
      }
      set_ui_state(&conn, "active_project_id", &value).map_err(|e| e.to_string())?;
      let _ = delete_ui_state(&conn, "active_project_path");
      Ok(())
    }
    None => {
      delete_ui_state(&conn, "active_project_id").map_err(|e| e.to_string())?;
      delete_ui_state(&conn, "active_project_path").map_err(|e| e.to_string())
    }
  }
}

#[tauri::command]
fn get_active_project_cmd(
  state: tauri::State<DbState>,
) -> Result<Option<db::ProjectRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  if let Some(project_id) = get_ui_state(&conn, "active_project_id").map_err(|e| e.to_string())? {
    if let Some(project) = get_project_by_id(&conn, &project_id).map_err(|e| e.to_string())? {
      return Ok(Some(project));
    }
  }

  if let Some(path) = get_ui_state(&conn, "active_project_path").map_err(|e| e.to_string())? {
    let identity = compute_project_identity(Path::new(&path))?;
    let project = upsert_project(
      &conn,
      identity.name.as_deref(),
      &identity.root_path,
      identity.git_root.as_deref(),
      identity.git_remote.as_deref(),
      &identity.fingerprint,
    )
    .map_err(|e| e.to_string())?;

    return Ok(Some(project));
  }

  Ok(None)
}

#[tauri::command]
fn list_projects_cmd(state: tauri::State<DbState>) -> Result<Vec<db::ProjectRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  db::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project_cmd(
  state: tauri::State<DbState>,
  path: String,
) -> Result<db::ProjectRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("path required".to_string());
  }
  let root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let path = std::path::Path::new(&root).join(trimmed);
  std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
  let identity = compute_project_identity(&path)?;
  let record = upsert_project(
    &conn,
    identity.name.as_deref(),
    &identity.root_path,
    identity.git_root.as_deref(),
    identity.git_remote.as_deref(),
    &identity.fingerprint,
  )
  .map_err(|e| e.to_string())?;

  Ok(record)
}

#[tauri::command]
fn add_message_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  role: String,
  content_json: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  add_message(&conn, &session_id, &role, &content_json).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_messages_cmd(
  state: tauri::State<DbState>,
  session_id: String,
) -> Result<Vec<db::MessageRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_messages(&conn, &session_id).map_err(|e| e.to_string())
}


#[tauri::command]
fn create_personal_memory_item_cmd(
  state: tauri::State<DbState>,
  content: String,
  scope: String,
  scope_id: Option<String>,
  pinned: Option<bool>,
  provenance_event_id: Option<String>,
) -> Result<db::PersonalMemoryItemRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  create_personal_memory_item(
    &conn,
    &content,
    &scope,
    scope_id.as_deref(),
    pinned.unwrap_or(false),
    provenance_event_id.as_deref(),
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_personal_memory_items_cmd(
  state: tauri::State<DbState>,
  scope: Option<String>,
  scope_id: Option<String>,
  limit: usize,
) -> Result<Vec<db::PersonalMemoryItemRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_personal_memory_items(&conn, scope.as_deref(), scope_id.as_deref(), limit)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn search_personal_memory_items_cmd(
  state: tauri::State<DbState>,
  query: String,
  limit: usize,
) -> Result<Vec<db::PersonalMemoryItemRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  search_personal_memory_items(&conn, &query, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_personal_memory_item_pinned_cmd(
  state: tauri::State<DbState>,
  id: String,
  pinned: bool,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  set_personal_memory_item_pinned(&conn, &id, pinned).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_personal_memory_item_cmd(
  state: tauri::State<DbState>,
  id: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  delete_personal_memory_item(&conn, &id).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
struct ModelToggle {
  id: String,
  label: String,
  enabled: bool,
}

fn default_model_toggles() -> Vec<ModelToggle> {
  vec![
    ModelToggle {
      id: "gpt-5.1".to_string(),
      label: "GPT 5.1".to_string(),
      enabled: false,
    },
    ModelToggle {
      id: "gpt-5.2".to_string(),
      label: "GPT 5.2".to_string(),
      enabled: false,
    },
    ModelToggle {
      id: "sonnet-4.5".to_string(),
      label: "Sonnet 4.5".to_string(),
      enabled: false,
    },
    ModelToggle {
      id: "opus-4.5".to_string(),
      label: "Opus 4.5".to_string(),
      enabled: false,
    },
    ModelToggle {
      id: "gemini-3-flash".to_string(),
      label: "Gemini 3 Flash".to_string(),
      enabled: false,
    },
    ModelToggle {
      id: "gemini-3-pro".to_string(),
      label: "Gemini 3 Pro".to_string(),
      enabled: false,
    },
    ModelToggle {
      id: "grok-4.1".to_string(),
      label: "Grok 4.1".to_string(),
      enabled: false,
    },
  ]
}

#[tauri::command]
fn get_model_toggles_cmd(state: tauri::State<DbState>) -> Result<Vec<ModelToggle>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let value = get_ui_state(&conn, "model_toggles")
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| "[]".to_string());
  let mut parsed: Vec<ModelToggle> = serde_json::from_str(&value).unwrap_or_default();
  if parsed.is_empty() {
    parsed = default_model_toggles();
  }
  Ok(parsed)
}

#[tauri::command]
fn set_model_toggles_cmd(
  state: tauri::State<DbState>,
  toggles: Vec<ModelToggle>,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let value = serde_json::to_string(&toggles).map_err(|e| e.to_string())?;
  set_ui_state(&conn, "model_toggles", &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_provider_key_cmd(provider: String, key: String) -> Result<(), String> {
  let entry = Entry::new("com.arx.app", &provider).map_err(|e| e.to_string())?;
  entry.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_provider_key_cmd(provider: String) -> Result<(), String> {
  let entry = Entry::new("com.arx.app", &provider).map_err(|e| e.to_string())?;
  entry.delete_password().map_err(|e| e.to_string())
}

#[tauri::command]
fn has_provider_key_cmd(provider: String) -> Result<bool, String> {
  let entry = Entry::new("com.arx.app", &provider).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(_) => Ok(true),
    Err(keyring::Error::NoEntry) => Ok(false),
    Err(err) => Err(err.to_string()),
  }
}

#[derive(Clone, Serialize)]
struct SecretScanRedaction {
  kind: String,
  count: usize,
}

#[derive(Clone, Serialize)]
struct SecretScanResult {
  redacted: String,
  blocked: bool,
  redactions: Vec<SecretScanRedaction>,
}

#[tauri::command]
fn scan_publish_content_cmd(text: String) -> Result<SecretScanResult, String> {
  let (redacted, report) = context::redact_secrets(&text);
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

const KEYCHAIN_SUPABASE_SESSION: &str = "supabase_session";

#[tauri::command]
fn get_supabase_session_cmd() -> Result<Option<String>, String> {
  let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(err) => Err(err.to_string()),
  }
}

#[tauri::command]
fn set_supabase_session_cmd(session_json: String) -> Result<(), String> {
  let cleaned = session_json.trim();
  if cleaned.is_empty() {
    return Err("session_json is empty".to_string());
  }
  if cleaned.len() > 64 * 1024 {
    return Err("session_json too large".to_string());
  }
  let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
  entry
    .set_password(cleaned)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_supabase_session_cmd() -> Result<(), String> {
  let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
  match entry.delete_password() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(err) => Err(err.to_string()),
  }
}

#[tauri::command]
fn get_exec_policy_rules_cmd(state: tauri::State<DbState>) -> Result<Option<String>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  get_ui_state(&conn, "exec_policy_rules").map_err(|e| e.to_string())
}

#[tauri::command]
fn get_approval_mode_cmd(state: tauri::State<DbState>) -> Result<Option<String>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  get_ui_state(&conn, "approval_mode").map_err(|e| e.to_string())
}

#[tauri::command]
fn set_approval_mode_cmd(state: tauri::State<DbState>, mode: String) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  set_ui_state(&conn, "approval_mode", &mode).map_err(|e| e.to_string())
}

#[tauri::command]
fn detect_test_commands_cmd(
  state: tauri::State<DbState>,
  cwd: String,
) -> Result<Vec<String>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  if !is_within_root(&workspace_root, &cwd) {
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
fn get_session_exec_policy_rules_cmd(
  state: tauri::State<DbState>,
  session_id: String,
) -> Result<Option<String>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let key = format!("exec_policy_session_rules::{}", session_id);
  get_ui_state(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_exec_policy_rules_cmd(state: tauri::State<DbState>, rules: String) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  if rules.len() > 10000 {
    return Err("rules too large".to_string());
  }
  set_ui_state(&conn, "exec_policy_rules", &rules).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_session_exec_policy_rules_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  rules: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  if rules.len() > 10000 {
    return Err("rules too large".to_string());
  }
  let key = format!("exec_policy_session_rules::{}", session_id);
  set_ui_state(&conn, &key, &rules).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct ExecPolicyDecision {
  decision: String,
  reason: String,
  matched_rule: Option<String>,
}

#[tauri::command]
fn classify_command_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  command: String,
) -> Result<ExecPolicyDecision, String> {
  let _ = (state, session_id, command);
  Ok(ExecPolicyDecision {
    decision: "prompt".to_string(),
    reason: "Internal command classification is disabled in MVP; use the engine terminal.".to_string(),
    matched_rule: None,
  })
}

#[tauri::command]
fn get_session_resume_cmd(
  state: tauri::State<DbState>,
  session_id: String,
) -> Result<db::SessionResume, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  get_session_resume(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_event_log_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
  logging::read_events_for_session(&state.db_path, &session_id, limit)
}

#[tauri::command]
fn export_event_log_cmd(state: tauri::State<DbState>, session_id: String) -> Result<String, String> {
  logging::export_events_for_session(&state.db_path, &session_id)
}

#[tauri::command]
fn get_active_model_cmd(state: tauri::State<DbState>) -> Result<Option<String>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  get_ui_state(&conn, "active_model").map_err(|e| e.to_string())
}

#[tauri::command]
fn set_active_model_cmd(state: tauri::State<DbState>, model_id: String) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  set_ui_state(&conn, "active_model", &model_id).map_err(|e| e.to_string())
}

fn is_within_root(root: &str, cwd: &str) -> bool {
  let root_path = std::path::Path::new(root);
  let cwd_path = std::path::Path::new(cwd);
  let root_canon = match root_path.canonicalize() {
    Ok(path) => path,
    Err(_) => return false,
  };
  let cwd_canon = match cwd_path.canonicalize() {
    Ok(path) => path,
    Err(_) => return false,
  };
  cwd_canon.starts_with(root_canon)
}

fn resolve_path_under_root(root: &str, path: &str) -> std::path::PathBuf {
  let path_buf = std::path::PathBuf::from(path);
  if path_buf.is_absolute() {
    path_buf
  } else {
    std::path::Path::new(root).join(path_buf)
  }
}

#[derive(Serialize)]
struct AttachmentResult {
  id: String,
  path: String,
  name: String,
  file_type: String, // "image" or "file"
  size: u64,
  preview_data_url: Option<String>,
}

#[tauri::command]
fn ingest_attachment_cmd(path: String) -> Result<AttachmentResult, String> {
  use base64::{engine::general_purpose::STANDARD, Engine};
  use std::fs;

  let file_path = Path::new(&path);
  if !file_path.exists() {
    return Err(format!("File not found: {}", path));
  }

  let metadata = fs::metadata(&file_path).map_err(|e| e.to_string())?;
  if !metadata.is_file() {
    return Err("Path is not a file".to_string());
  }

  let size = metadata.len();
  let name = file_path
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("unknown")
    .to_string();

  // Determine file type based on extension
  let extension = file_path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_lowercase();

  let image_extensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];
  let is_image = image_extensions.contains(&extension.as_str());
  let file_type = if is_image { "image" } else { "file" };

  // Generate preview for images (max 256KB for thumbnail)
  let preview_data_url = if is_image && size <= 5 * 1024 * 1024 {
    let bytes = fs::read(&file_path).ok();
    bytes.and_then(|data| {
      let preview_bytes = if data.len() > 256 * 1024 {
        &data[..256 * 1024]
      } else {
        &data[..]
      };
      let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
      };
      if data.len() <= 256 * 1024 {
        Some(format!("data:{};base64,{}", mime, STANDARD.encode(preview_bytes)))
      } else {
        None
      }
    })
  } else {
    None
  };

  let id = format!(
    "att_{}",
    uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string()
  );

  Ok(AttachmentResult {
    id,
    path: path.clone(),
    name,
    file_type: file_type.to_string(),
    size,
    preview_data_url,
  })
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!(e))?;
      let db_dir = db::db_path(&base_dir);
      let key = std::env::var("ARX_DB_KEY").unwrap_or_else(|_| "dev-only-key".to_string());
      let recovery_db_path = db_dir.join(format!("arx.db.recovery.{}", db::now_ts()));

      // Be resilient to DB migration drift: if any setup step fails due to DB state,
      // back up the DB and retry once with a fresh database.
      let mut last_err: Option<anyhow::Error> = None;
      let mut use_recovery_db = false;
      for attempt in 0..2 {
        match (|| -> anyhow::Result<db::DbState> {
          let state = if use_recovery_db {
            db::init_db_at(&recovery_db_path, &key)?
          } else {
            db::init_db(&db_dir, &key)?
          };
          let conn = open_conn(&state.db_path, &state.key)?;
          if get_ui_state(&conn, "workspace_root")?.is_none() {
            // Prefer a sensible dev default (current working directory) so the UI reflects the
            // repo being worked on. Fall back to ~/Arx Workspace.
            let default_root = if cfg!(debug_assertions) {
              std::env::current_dir()
                .ok()
                .unwrap_or_else(|| {
                  app
                    .path()
                    .home_dir()
                    .expect("home dir must exist")
                    .join("Arx Workspace")
                })
            } else {
              app
                .path()
                .home_dir()
                .map_err(|e| anyhow::anyhow!(e))?
                .join("Arx Workspace")
            };
            std::fs::create_dir_all(&default_root)?;
            set_ui_state(&conn, "workspace_root", default_root.to_string_lossy().as_ref())?;
          }
          Ok(state)
        })() {
          Ok(state) => {
            app.manage(state);
            last_err = None;
            break;
          }
          Err(err) => {
            last_err = Some(err);
            if attempt == 0 {
              eprintln!("DB setup failed; backing up and retrying: {last_err:?}");
              if db::backup_db_files(&db_dir).is_err() {
                // If the DB can't be moved aside (e.g., locked), fall back to a recovery DB path
                // so the app can still start.
                use_recovery_db = true;
              }
              continue;
            }
          }
        }
      }
      if let Some(err) = last_err {
        return Err(err.into());
      }

      #[cfg(target_os = "macos")]
      {
        use tauri_plugin_decorum::WebviewWindowExt;
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_traffic_lights_inset(16.0, 22.0);
        }
      }

      Ok(())
    })
    .plugin(tauri_plugin_decorum::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      create_thread_cmd,
      create_session_cmd,
      delete_thread_cmd,
      list_sessions_cmd,
      list_threads_cmd,
      get_thread_cmd,
      list_events_cmd,
      list_tools_cmd,
      get_agent_mode_cmd,
      set_agent_mode_cmd,
      respond_permission_cmd,
      harness_start_cmd,
      engine_start_cmd,
      send_turn_cmd,
      engine_send_turn_cmd,
      engine_write_stdin_cmd,
      engine_stop_cmd,
      get_supabase_session_cmd,
      set_supabase_session_cmd,
      clear_supabase_session_cmd,
      get_workspace_root_cmd,
      set_workspace_root_cmd,
      is_path_within_workspace_cmd,
      get_active_project_cmd,
      set_active_project_cmd,
      list_projects_cmd,
      create_project_cmd,
      add_message_cmd,
      list_messages_cmd,
      create_personal_memory_item_cmd,
      list_personal_memory_items_cmd,
      search_personal_memory_items_cmd,
      set_personal_memory_item_pinned_cmd,
      delete_personal_memory_item_cmd,
      get_model_toggles_cmd,
      set_model_toggles_cmd,
      get_active_model_cmd,
      set_active_model_cmd,
      set_provider_key_cmd,
      clear_provider_key_cmd,
      has_provider_key_cmd,
      scan_publish_content_cmd,
      get_exec_policy_rules_cmd,
      get_approval_mode_cmd,
      detect_test_commands_cmd,
      set_exec_policy_rules_cmd,
      set_approval_mode_cmd,
      get_session_exec_policy_rules_cmd,
      set_session_exec_policy_rules_cmd,
      classify_command_cmd,
      get_session_resume_cmd,
      list_event_log_cmd,
      export_event_log_cmd,
      cancel_session_cmd,
      ingest_attachment_cmd,
      set_thread_workspace_cmd
    ])
    .on_window_event(|window, event| {
      #[cfg(target_os = "macos")]
      {
        match event {
          tauri::WindowEvent::Resized(_)
          | tauri::WindowEvent::Focused(true)
          | tauri::WindowEvent::ThemeChanged(_)
          | tauri::WindowEvent::ScaleFactorChanged { .. } => {
            use tauri_plugin_decorum::WebviewWindowExt;
            if let Some(wv) = window.get_webview_window(window.label()) {
              let _ = wv.set_traffic_lights_inset(16.0, 24.0);
            }
          }
          _ => {}
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
