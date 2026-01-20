#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod blob_store;
mod context;
mod context_builder;
mod db;


use db::{
  add_message, create_thread, delete_thread, delete_ui_state,
  create_personal_memory_item, delete_personal_memory_item, list_personal_memory_items,
  search_personal_memory_items, set_personal_memory_item_pinned,
  get_project_by_id, get_session_resume, get_ui_state, list_events,
  list_messages, list_threads, open_conn, set_ui_state,
  get_thread_by_id,
  upsert_project, set_thread_community_id, set_thread_engine_model, set_thread_workspace_path, DbState,
};
use keyring::Entry;
	use once_cell::sync::Lazy;
	use serde::{Deserialize, Serialize};
	use std::collections::HashMap;
	use std::io::BufRead;
	use std::path::Path;
	use std::process::Command;
	use std::process::Stdio;
	use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use futures::StreamExt;
use tokio::io::AsyncReadExt;
use tokio::process::Command as TokioCommand;
use tokio::sync::{oneshot, watch, Mutex};
use sha2::{Digest as _, Sha256};

const ENGINE_OPENROUTER_CHAT: &str = "openrouter_chat";
const ENGINE_OPENROUTER_MESSAGES_AGENT: &str = "openrouter_messages_agent";
const OPENROUTER_MAX_TOKENS: u32 = 1024;
const IO_BLOB_THRESHOLD_BYTES: usize = 16 * 1024;
const RIPGREP_VERSION: &str = "14.1.1";

static THREAD_RUN_LOCKS: Lazy<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));
static PENDING_TOOL_APPROVALS: Lazy<Mutex<HashMap<String, oneshot::Sender<ToolApprovalDecision>>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));
static CANCEL_RUN_SIGNALS: Lazy<Mutex<HashMap<String, watch::Sender<bool>>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));

struct CancelRegistration {
  thread_id: String,
}

impl CancelRegistration {
  async fn register(thread_id: &str) -> (Self, watch::Receiver<bool>) {
    let (tx, rx) = watch::channel(false);
    {
      let mut map = CANCEL_RUN_SIGNALS.lock().await;
      map.insert(thread_id.to_string(), tx);
    }
    (Self { thread_id: thread_id.to_string() }, rx)
  }
}

impl Drop for CancelRegistration {
  fn drop(&mut self) {
    let thread_id = self.thread_id.clone();
    tokio::spawn(async move {
      let mut map = CANCEL_RUN_SIGNALS.lock().await;
      map.remove(&thread_id);
    });
  }
}

#[derive(Clone, Copy)]
struct ToolApprovalDecision {
  approved: bool,
  allow_write_edit_for_session: bool,
}

fn parse_openrouter_affordable_max_tokens(message: &str) -> Option<u32> {
  let lower = message.to_lowercase();
  let needle = "can only afford";
  let idx = lower.find(needle)?;
  let after = &lower[idx + needle.len()..];
  let start = after.find(|c: char| c.is_ascii_digit())?;
  let after = &after[start..];
  let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
  digits.trim().parse::<u32>().ok().filter(|v| *v > 0)
}

fn format_openrouter_error(resp_bytes: &[u8]) -> String {
  let fallback = String::from_utf8_lossy(resp_bytes).trim().to_string();
  let value = match serde_json::from_slice::<serde_json::Value>(resp_bytes) {
    Ok(v) => v,
    Err(_) => return if fallback.is_empty() { "(no response body)".to_string() } else { fallback },
  };

  let Some(err) = value.get("error") else {
    return if fallback.is_empty() { value.to_string() } else { fallback };
  };

  let normalize = |s: &str| -> String { s.split_whitespace().collect::<Vec<_>>().join(" ") };

  let message = err
    .get("message")
    .and_then(|v| v.as_str())
    .map(|s| normalize(s).trim().to_string())
    .filter(|s| !s.is_empty());

  let mut provider: Option<String> = None;
  let mut raw: Option<String> = None;
  if let Some(meta) = err.get("metadata") {
    provider = meta
      .get("provider_name")
      .or_else(|| meta.get("provider"))
      .and_then(|v| v.as_str())
      .map(|s| normalize(s).trim().to_string())
      .filter(|s| !s.is_empty());
    raw = meta
      .get("raw")
      .and_then(|v| v.as_str())
      .map(|s| normalize(s).trim().to_string())
      .filter(|s| !s.is_empty());
  }

  let mut out = String::new();
  if let Some(provider) = provider.as_deref() {
    out.push_str(provider);
    out.push_str(": ");
  }
  if let Some(message) = message.as_deref() {
    out.push_str(message);
  }
  if let Some(raw) = raw.as_deref() {
    if Some(raw) != message.as_deref() {
      if !out.is_empty() {
        out.push_str(" — ");
      }
      out.push_str(raw);
    }
  }

  let out = out.trim().to_string();
  if out.is_empty() {
    return if fallback.is_empty() { value.to_string() } else { fallback };
  }

  if out.len() > 800 {
    format!("{}...", &out[..797])
  } else {
    out
  }
}

fn parse_boolish(value: &str) -> bool {
  matches!(
    value.trim().to_lowercase().as_str(),
    "1" | "true" | "yes" | "on"
  )
}

async fn lock_thread_run(thread_id: &str) -> tokio::sync::OwnedMutexGuard<()> {
  let lock = {
    let mut map = THREAD_RUN_LOCKS.lock().await;
    map.entry(thread_id.to_string())
      .or_insert_with(|| Arc::new(Mutex::new(())))
      .clone()
  };
  lock.lock_owned().await
}

fn workspace_scope_id_from_path(path: &str) -> String {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  let p = Path::new(trimmed);
  let canon = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
  canon.to_string_lossy().to_string()
}

fn append_run_started(
  conn: &rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  run_id: &str,
  workspace_scope_id: &str,
  mode: &str,
  engine_id: &str,
  model_id: Option<&str>,
) {
  let payload = serde_json::json!({
    "v": 1,
    "run_id": run_id,
    "runtime_id": "arx_harness",
    "thread_id": thread_id,
    "workspace_scope_id": if workspace_scope_id.trim().is_empty() { serde_json::Value::Null } else { serde_json::Value::String(workspace_scope_id.to_string()) },
    "mode": mode,
    "engine_id": engine_id,
    "model_id": model_id
  });
  let _ = db::append_event(conn, db_path, thread_id, "run_started", None, Some(&payload.to_string()), None);
}

fn append_run_finished(
  conn: &rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  run_id: &str,
  status: &str,
  reason: Option<&str>,
) {
  let payload = serde_json::json!({
    "v": 1,
    "run_id": run_id,
    "status": status,
    "reason": reason
  });
  let _ = db::append_event(conn, db_path, thread_id, "run_finished", None, Some(&payload.to_string()), None);
}

fn finish_cancelled_openrouter_messages_agent(
  window: &tauri::Window,
  conn: &rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  run_id: &str,
  engine_input_event_id: Option<String>,
  engine_input_seq: Option<i64>,
) -> SendTurnResult {
  append_run_finished(conn, db_path, thread_id, run_id, "cancelled", Some("user_cancel"));
  let _ = window.emit(
    "agent-status",
    AgentStatusPayload {
      session_id: thread_id.to_string(),
      status: "idle".to_string(),
      tool_name: None,
      tool_args_preview: None,
    },
  );
  let _ = window.emit(
    "openrouter-turn-finished",
    SessionIdPayload {
      session_id: thread_id.to_string(),
    },
  );
  SendTurnResult {
    thread_id: thread_id.to_string(),
    engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
    engine_input_event_id,
    engine_input_seq,
    run_id: Some(run_id.to_string()),
  }
}

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

#[tauri::command]
async fn decide_tool_call_cmd(
  tool_call_id: String,
  approved: bool,
  allow_write_edit_for_session: Option<bool>,
) -> Result<(), String> {
  let sender = {
    let mut map = PENDING_TOOL_APPROVALS.lock().await;
    map.remove(tool_call_id.trim())
  };
  let Some(sender) = sender else {
    return Err("tool call not awaiting approval".to_string());
  };
  sender
    .send(ToolApprovalDecision {
      approved,
      allow_write_edit_for_session: allow_write_edit_for_session.unwrap_or(false),
    })
    .map_err(|_| "tool call approval receiver dropped".to_string())
}

#[tauri::command]
fn get_auto_approve_write_edit_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
) -> Result<bool, String> {
  let thread_id = thread_id.trim();
  if thread_id.is_empty() {
    return Err("thread_id is required".to_string());
  }
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let key = format!("auto_approve_write_edit::{}", thread_id);
  Ok(
    get_ui_state(&conn, &key)
      .ok()
      .flatten()
      .map(|value| parse_boolish(&value))
      .unwrap_or(false),
  )
}

#[tauri::command]
fn set_auto_approve_write_edit_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  enabled: bool,
) -> Result<(), String> {
  let thread_id = thread_id.trim();
  if thread_id.is_empty() {
    return Err("thread_id is required".to_string());
  }
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let key = format!("auto_approve_write_edit::{}", thread_id);
  set_ui_state(&conn, &key, if enabled { "1" } else { "0" }).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_run_cmd(thread_id: String) -> Result<bool, String> {
  let thread_id = thread_id.trim().to_string();
  if thread_id.is_empty() {
    return Err("thread_id is required".to_string());
  }
  let sender = {
    let map = CANCEL_RUN_SIGNALS.lock().await;
    map.get(&thread_id).cloned()
  };
  if let Some(sender) = sender {
    let _ = sender.send(true);
    return Ok(true);
  }
  Ok(false)
}

#[derive(Deserialize)]
struct OpenRouterModelsResponse {
  data: Vec<OpenRouterModel>,
}

#[derive(Deserialize)]
struct OpenRouterModel {
  id: String,
  name: Option<String>,
}

fn load_openrouter_model_map(
  conn: &rusqlite::Connection,
) -> Option<std::collections::HashMap<String, String>> {
  let value = get_ui_state(conn, "openrouter_model_map").ok().flatten()?;
  serde_json::from_str::<std::collections::HashMap<String, String>>(&value).ok()
}

fn save_openrouter_model_map(conn: &rusqlite::Connection, map: &std::collections::HashMap<String, String>) {
  // Persist only invokable OpenRouter ids (provider/model).
  let filtered: std::collections::HashMap<String, String> = map
    .iter()
    .filter(|(_k, v)| v.contains('/'))
    .map(|(k, v)| (k.clone(), v.clone()))
    .collect();
  if let Ok(value) = serde_json::to_string(&filtered) {
    let _ = set_ui_state(conn, "openrouter_model_map", &value);
  }
}

async fn fetch_openrouter_model_map(
  openrouter_key: &str,
) -> Result<std::collections::HashMap<String, String>, String> {
  let res = reqwest::Client::new()
    .get("https://openrouter.ai/api/v1/models")
    .header("Authorization", format!("Bearer {}", openrouter_key))
    .send()
    .await
    .map_err(|e| format!("OpenRouter models request failed: {}", e))?;

  if !res.status().is_success() {
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    return Err(format!("OpenRouter models error {}: {}", status.as_u16(), body));
  }

  let body = res.text().await.unwrap_or_default();
  let parsed: OpenRouterModelsResponse =
    serde_json::from_str(&body).map_err(|e| format!("OpenRouter models parse failed: {}", e))?;

  fn provider_prefix(id: &str) -> Option<&str> {
    id.split_once('/').map(|(p, _)| p)
  }

  fn provider_weight(provider: Option<&str>) -> i32 {
    match provider.unwrap_or_default() {
      "openai" => 0,
      "anthropic" => 1,
      "google" => 2,
      "x-ai" => 3,
      _ => 9,
    }
  }

  #[derive(Clone, Copy)]
  struct AliasDef {
    alias: &'static str,
    keywords: &'static [&'static str],
    preferred_provider: Option<&'static str>,
  }

  const ALIASES: &[AliasDef] = &[
    AliasDef {
      alias: "gpt-5.1",
      keywords: &["gpt", "5.1"],
      preferred_provider: Some("openai"),
    },
    AliasDef {
      alias: "gpt-5.2",
      keywords: &["gpt", "5.2"],
      preferred_provider: Some("openai"),
    },
    AliasDef {
      alias: "sonnet-4.5",
      keywords: &["sonnet", "4.5"],
      preferred_provider: Some("anthropic"),
    },
    AliasDef {
      alias: "opus-4.5",
      keywords: &["opus", "4.5"],
      preferred_provider: Some("anthropic"),
    },
    AliasDef {
      alias: "gemini-3-flash",
      keywords: &["gemini", "3", "flash"],
      preferred_provider: Some("google"),
    },
    AliasDef {
      alias: "gemini-3-pro",
      keywords: &["gemini", "3", "pro"],
      preferred_provider: Some("google"),
    },
    AliasDef {
      alias: "grok-4.1",
      keywords: &["grok", "4.1"],
      preferred_provider: Some("x-ai"),
    },
  ];

  // Collect candidates for each alias, then choose deterministically.
  let mut candidates: std::collections::HashMap<&'static str, Vec<(i32, i32, i32, String)>> =
    std::collections::HashMap::new();
  for def in ALIASES {
    candidates.insert(def.alias, Vec::new());
  }

  for model in parsed.data {
    let id = model.id;
    // OpenRouter chat completions require provider/model ids; fail-closed.
    if !id.contains('/') {
      continue;
    }
    let id_lower = id.to_lowercase();
    let name_lower = model
      .name
      .unwrap_or_default()
      .to_lowercase();
    let provider = provider_prefix(&id);

    for def in ALIASES {
      let mut score: Option<i32> = None;
      if id_lower == def.alias || id_lower.ends_with(&format!("/{}", def.alias)) {
        score = Some(0);
      } else if !name_lower.is_empty()
        && def.keywords.iter().all(|k| name_lower.contains(k))
      {
        score = Some(1);
      } else if id_lower.ends_with(def.alias) {
        score = Some(2);
      }

      if let Some(score) = score {
        let pref_mismatch = def
          .preferred_provider
          .map(|p| if provider == Some(p) { 0 } else { 1 })
          .unwrap_or(0);
        let weight = provider_weight(provider);
        candidates
          .get_mut(def.alias)
          .unwrap()
          .push((score, pref_mismatch, weight, id.clone()));
      }
    }
  }

  let mut map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
  for def in ALIASES {
    if let Some(list) = candidates.get_mut(def.alias) {
      list.sort_by(|a, b| a.cmp(b));
      if let Some((_score, _pref, _weight, best)) = list.first() {
        if best.contains('/') {
          map.insert(def.alias.to_string(), best.clone());
        }
      }
    }
  }

  Ok(map)
}

fn append_openrouter_assistant_message(
  conn: &rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  content_text: &str,
  model_id: &str,
  run_id: &str,
  source_event_ids: &[String],
  openrouter_model_id: Option<&str>,
  prompt: Option<u64>,
  completion: Option<u64>,
  max_tokens: u32,
) {
  let payload = serde_json::json!({
    "v": 1,
    "role": "assistant",
    "content": { "text": content_text },
    "meta": {
      "engine_id": ENGINE_OPENROUTER_CHAT,
      "model_id": model_id,
      "openrouter_model_id": openrouter_model_id,
      "run_id": run_id,
      "prompt_tokens": prompt,
      "completion_tokens": completion,
      "max_tokens": max_tokens
    },
    "source_event_ids": source_event_ids
  });
  let (fts_text, _report) = context::redact_secrets(content_text);
  let _ = db::append_event(
    conn,
    db_path,
    thread_id,
    "assistant_message",
    Some(&fts_text),
    Some(&payload.to_string()),
    None,
  );
}

fn hex_sha256(bytes: &[u8]) -> String {
  let digest = Sha256::digest(bytes);
  let mut out = String::with_capacity(digest.len() * 2);
  for b in digest {
    out.push_str(&format!("{:02x}", b));
  }
  out
}

fn append_memory_write_event(
  conn: &rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  action: &str,
  item: &db::PersonalMemoryItemRecord,
  provenance_event_id: Option<&str>,
) {
  let (preview, report) = context::redact_secrets(&item.content);
  let payload = serde_json::json!({
    "v": 1,
    "action": action,
    "item": {
      "id": item.id,
      "scope": item.scope,
      "scope_id": item.scope_id,
      "pinned": item.pinned,
      "content_sha256": hex_sha256(item.content.as_bytes()),
      "content_len": item.content.len(),
      "content_preview_redacted": preview,
      "blocked": report.blocked,
      "redactions": report.redactions.iter().map(|(kind, count)| serde_json::json!({"kind": kind, "count": count})).collect::<Vec<_>>()
    },
    "provenance_event_id": provenance_event_id
  });
  let _ = db::append_event(
    conn,
    db_path,
    thread_id,
    "memory_write",
    Some("memory_write"),
    Some(&payload.to_string()),
    None,
  );
}

#[derive(Clone, Serialize)]
struct ToolApprovalRequestedPayload {
  session_id: String,
  tool_call_id: String,
  tool_name: String,
  args_json: String,
}

fn canonicalize_json(value: &serde_json::Value) -> serde_json::Value {
  match value {
    serde_json::Value::Object(map) => {
      let mut keys: Vec<&String> = map.keys().collect();
      keys.sort();
      let mut out = serde_json::Map::new();
      for key in keys {
        if let Some(v) = map.get(key) {
          out.insert(key.clone(), canonicalize_json(v));
        }
      }
      serde_json::Value::Object(out)
    }
    serde_json::Value::Array(arr) => {
      serde_json::Value::Array(arr.iter().map(canonicalize_json).collect())
    }
    _ => value.clone(),
  }
}

fn canonical_json_string(value: &serde_json::Value) -> String {
  serde_json::to_string(&canonicalize_json(value)).unwrap_or_else(|_| "null".to_string())
}

fn compute_tool_call_key(tool_name: &str, args: &serde_json::Value, workspace_scope_id: &str) -> String {
  let canonical = canonical_json_string(args);
  hex_sha256(format!("{}\n{}\n{}", tool_name, workspace_scope_id, canonical).as_bytes())
}

fn tool_requires_approval(tool_name: &str) -> bool {
  matches!(tool_name, "write" | "edit" | "bash")
}

struct AgentToolCallOutcome {
  tool_result_content: String,
  cancelled: bool,
}

async fn execute_agent_tool_call(
  window: &tauri::Window,
  conn: &mut rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  workspace: &str,
  mode: &str,
  run_id: &str,
  workspace_scope_id: &str,
  tool_use_id: &str,
  raw_tool_name: &str,
  mut tool_args: serde_json::Value,
  auto_approve_key: &str,
  auto_approve_write_edit: &mut bool,
  cancel_rx: watch::Receiver<bool>,
) -> AgentToolCallOutcome {
  let mut tool_name = normalize_agent_tool_name(raw_tool_name);
  if tool_name.is_empty() {
    tool_name = "invalid".to_string();
    tool_args = serde_json::json!({
      "tool": raw_tool_name,
      "error": "invalid tool name",
      "input": canonical_json_string(&tool_args)
    });
  } else if !is_known_agent_tool_name(tool_name.as_str()) {
    tool_args = serde_json::json!({
      "tool": raw_tool_name,
      "error": "unknown tool",
      "input": canonical_json_string(&tool_args)
    });
    tool_name = "invalid".to_string();
  }

  let tool_call_id = uuid::Uuid::new_v4().to_string();
  let tool_call_key = compute_tool_call_key(&tool_name, &tool_args, workspace_scope_id);
  let args_json = canonical_json_string(&tool_args);
  let requires_approval = tool_requires_approval(&tool_name);
  let denied_by_mode = mode == "explore" && requires_approval;
  let is_write_edit = matches!(tool_name.as_str(), "write" | "edit");
  let auto_approved_by_session = !denied_by_mode && requires_approval && is_write_edit && *auto_approve_write_edit;

  let requested_payload = serde_json::json!({
    "v": 1,
    "run_id": run_id,
    "tool_call_id": tool_call_id.clone(),
    "tool_call_key": tool_call_key,
    "tool_name": tool_name.clone(),
    "args": tool_args.clone(),
    "requires_approval": requires_approval,
    "policy_basis": "mvp_default"
  });
  let _ = db::append_event(
    conn,
    db_path,
    thread_id,
    "tool_call_requested",
    None,
    Some(&requested_payload.to_string()),
    None,
  );

  let decision = if denied_by_mode {
    ToolApprovalDecision {
      approved: false,
      allow_write_edit_for_session: false,
    }
  } else if requires_approval {
    if auto_approved_by_session {
      ToolApprovalDecision {
        approved: true,
        allow_write_edit_for_session: false,
      }
    } else {
      await_tool_approval(
        window,
        thread_id,
        &tool_call_id,
        &tool_name,
        &args_json,
        cancel_rx.clone(),
      )
      .await
    }
  } else {
    ToolApprovalDecision {
      approved: true,
      allow_write_edit_for_session: false,
    }
  };

  if *cancel_rx.borrow() {
    let decision_payload = serde_json::json!({
      "v": 1,
      "run_id": run_id,
      "tool_call_id": tool_call_id.clone(),
      "approved": false,
      "approved_by": "policy",
      "note": "user_cancel"
    });
    let _ = db::append_event(
      conn,
      db_path,
      thread_id,
      "tool_call_denied",
      None,
      Some(&decision_payload.to_string()),
      None,
    );
    return AgentToolCallOutcome {
      tool_result_content: "error: cancelled".to_string(),
      cancelled: true,
    };
  }

  let approved = decision.approved;
  let mut note: Option<&'static str> = None;
  let approved_by = if denied_by_mode {
    note = Some("explore_mode");
    "policy"
  } else if auto_approved_by_session {
    note = Some("session_allow_write_edit");
    "policy"
  } else {
    if approved && is_write_edit && decision.allow_write_edit_for_session {
      *auto_approve_write_edit = true;
      note = Some("session_allow_write_edit_set");
      let _ = set_ui_state(conn, auto_approve_key, "1");
    }
    "user"
  };

  if requires_approval {
    let decision_payload = serde_json::json!({
      "v": 1,
      "run_id": run_id,
      "tool_call_id": tool_call_id.clone(),
      "approved": approved,
      "approved_by": approved_by,
      "note": note
    });
    let _ = db::append_event(
      conn,
      db_path,
      thread_id,
      if approved { "tool_call_approved" } else { "tool_call_denied" },
      None,
      Some(&decision_payload.to_string()),
      None,
    );
  }

  if !approved {
    return AgentToolCallOutcome {
      tool_result_content: if denied_by_mode {
        "error: denied (explore mode)".to_string()
      } else {
        "error: denied".to_string()
      },
      cancelled: false,
    };
  }

  if *cancel_rx.borrow() {
    return AgentToolCallOutcome {
      tool_result_content: "error: cancelled".to_string(),
      cancelled: true,
    };
  }

  let started_payload = serde_json::json!({
    "v": 1,
    "run_id": run_id,
    "tool_call_id": tool_call_id.clone(),
    "attempt": 1,
    "cwd": workspace,
    "workspace_scope_id": workspace_scope_id,
    "sandbox": { "mode": "local", "root": workspace }
  });
  let _ = db::append_event(
    conn,
    db_path,
    thread_id,
    "tool_call_started",
    None,
    Some(&started_payload.to_string()),
    None,
  );

  let tool_args_preview = {
    let path = tool_args
      .get("path")
      .or_else(|| tool_args.get("file_path"))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let cmd = tool_args
      .get("cmd")
      .or_else(|| tool_args.get("command"))
      .and_then(|v| v.as_str())
      .map(|s| {
        let trimmed = s.trim();
        if trimmed.len() > 60 {
          format!("{}...", &trimmed[..57])
        } else {
          trimmed.to_string()
        }
      });
    let pat = tool_args
      .get("pat")
      .or_else(|| tool_args.get("pattern"))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let writes = tool_args
      .get("writes")
      .and_then(|v| v.as_array())
      .map(|arr| {
        let count = arr.len();
        let example = arr
          .first()
          .and_then(|v| v.get("path").or_else(|| v.get("file_path")))
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .trim()
          .to_string();
        if example.is_empty() {
          format!("{} file{}", count, if count == 1 { "" } else { "s" })
        } else if count == 1 {
          example
        } else {
          format!(
            "{} files (e.g. {})",
            count,
            if example.len() > 48 {
              format!("{}...", &example[..45])
            } else {
              example
            }
          )
        }
      });
    path.or(cmd).or(pat).or(writes)
  };

  let _ = window.emit(
    "agent-status",
    AgentStatusPayload {
      session_id: thread_id.to_string(),
      status: "working".to_string(),
      tool_name: Some(tool_name.clone()),
      tool_args_preview: tool_args_preview.clone(),
    },
  );

  let _ = window.emit(
    "tool-call-progress",
    ToolCallProgressPayload {
      session_id: thread_id.to_string(),
      tool_call_id: tool_call_id.clone(),
      tool_name: tool_name.clone(),
      tool_args_preview: tool_args_preview.clone(),
      status: "started".to_string(),
      result: None,
    },
  );

  let exec = run_agent_tool(workspace, db_path, &tool_name, &tool_args).await;
  let stdout_blob = write_blob_and_record(conn, db_path, &exec.stdout);
  let stderr_blob = write_blob_and_record(conn, db_path, &exec.stderr);
  let (redacted_preview, _preview_report) = context::redact_secrets(&exec.tool_result_content);
  let result_preview = redacted_preview.chars().take(1200).collect::<String>();

  let finished_payload = serde_json::json!({
    "v": 1,
    "run_id": run_id,
    "tool_call_id": tool_call_id.clone(),
    "attempt": 1,
    "status": exec.status,
    "reason": exec.reason,
    "exit_code": exec.exit_code,
    "tool_use_id": tool_use_id,
    "result_preview": result_preview,
    "stdout_blob_id": stdout_blob.as_ref().map(|b| b.id.clone()),
    "stdout_blob_ref": stdout_blob.as_ref().map(|b| b.rel_path.clone()),
    "stderr_blob_id": stderr_blob.as_ref().map(|b| b.id.clone()),
    "stderr_blob_ref": stderr_blob.as_ref().map(|b| b.rel_path.clone()),
    "artifacts": exec.artifacts
  });
  let _ = db::append_event(
    conn,
    db_path,
    thread_id,
    "tool_call_finished",
    None,
    Some(&finished_payload.to_string()),
    None,
  );

  let _ = window.emit(
    "tool-call-progress",
    ToolCallProgressPayload {
      session_id: thread_id.to_string(),
      tool_call_id: tool_call_id.clone(),
      tool_name: tool_name.clone(),
      tool_args_preview,
      status: "finished".to_string(),
      result: Some(if exec.status == "ok" {
        "ok".to_string()
      } else {
        "error".to_string()
      }),
    },
  );

  AgentToolCallOutcome {
    tool_result_content: exec.tool_result_content,
    cancelled: false,
  }
}

fn build_atom_system_prompt(
  workspace_path: &str,
  used_personal_memory: &[context_builder::UsedPersonalMemoryItem],
  community_id: Option<&str>,
) -> String {
  let os = std::env::consts::OS;
  let git_repo = std::path::Path::new(workspace_path).join(".git").exists();

  let personal_memory_block = if used_personal_memory.is_empty() {
    "(none)".to_string()
  } else {
    used_personal_memory
      .iter()
      .map(|it| format!("- {}", it.content.trim().replace('\n', " ")))
      .collect::<Vec<_>>()
      .join("\n")
  };

  let community_name = community_id.unwrap_or("none");
  let community_memory_block = "(none)".to_string();

  format!(
    "You are Atom, the AI agent of Arx.\n\n<context>\nWorkspace: {}\nEnvironment:\n- Platform: {}\n- Git repo: {}\n\nPersonal memory (user-controlled):\n{}\n\nCommunity memory ({}):\n{}\n</context>\n\nRules:\n- Be useful, friendly, and concise.\n- Be maximally truth-seeking: do not invent file contents, tool outputs, or claims about side effects. If unsure, use tools or ask.\n- Stay within the workspace root; prefer relative paths; never access outside it.\n- Tools you can use: read, list_dir, glob, grep, write, edit, task, bash.\n  - read/list_dir/glob/grep/task are safe.\n  - write/edit/bash may require approval. Do not ask “is it ok”; request the tool and proceed when allowed.\n  - For creating new files or rewriting full files: use write (it creates parent directories; no mkdir needed). You can also pass writes: [{{path, content}}, ...] for multiple files.\n  - For small targeted replacements inside a file: use edit.\n  - Use bash only for real shell tasks.\n- Minimize tool calls; avoid repeating the same tool with the same inputs.\n- Never include secrets. If sensitive data appears, ask for a safe substitute or redact.\n- If blocked, ask at most one clarifying question and propose a default next step.\n",
    workspace_path,
    os,
    if git_repo { "yes" } else { "no" },
    personal_memory_block,
    community_name,
    community_memory_block
  )
}

fn make_agent_tool_schema() -> Vec<serde_json::Value> {
  vec![
    serde_json::json!({
      "name": "read",
      "description": "Read a file with line numbers. Use offset/limit for large files.",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "offset": { "type": "integer" },
          "limit": { "type": "integer" }
        },
        "required": ["path"]
      }
    }),
    serde_json::json!({
      "name": "list_dir",
      "description": "List a directory (files vs folders). Use this for folders; use read for files.",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }),
    serde_json::json!({
      "name": "sha256",
      "description": "Compute SHA-256 of a file's raw bytes (hex).",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }),
    serde_json::json!({
      "name": "write",
      "description": "Write full content to a file (creates parent directories). expected_before_sha256 is optional (sha256 hex string to precondition overwrite). For multiple files, you can also pass writes: [{path, content}, ...]. If omitted, proceeds nano-style.",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "content": { "type": "string" },
          "expected_before_sha256": { "type": "string" },
          "writes": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "path": { "type": "string" },
                "content": { "type": "string" },
                "expected_before_sha256": { "type": "string" }
              },
              "required": ["path", "content"]
            }
          }
        },
        "required": ["path", "content"]
      }
    }),
    serde_json::json!({
      "name": "task",
      "description": "Quick helper for exploring: optionally list a directory, glob files, and/or search for a literal substring in text files. Read-only.",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "pat": { "type": "string" },
          "query": { "type": "string" },
          "list": { "type": "boolean" }
        }
      }
    }),
    serde_json::json!({
      "name": "invalid",
      "description": "Return an error for an invalid tool call (used for malformed tool names/args).",
      "input_schema": {
        "type": "object",
        "properties": {
          "tool": { "type": "string" },
          "error": { "type": "string" },
          "input": { "type": "string" }
        }
      }
    }),
    serde_json::json!({
      "name": "edit",
      "description": "Replace old with new in a file. Replaces the first occurrence by default; set all=true (or replaceAll=true) to replace all. Supports aliases: filePath, oldString, newString, replaceAll. If old is empty, overwrites the file with new. expected_before_sha256 is optional (string).",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "filePath": { "type": "string" },
          "old": { "type": "string" },
          "oldString": { "type": "string" },
          "new": { "type": "string" },
          "newString": { "type": "string" },
          "all": { "type": "boolean" },
          "replaceAll": { "type": "boolean" },
          "expected_before_sha256": { "type": "string" },
          "expectedBeforeSha256": { "type": "string" }
        },
        "required": ["path", "old", "new"]
      }
    }),
    serde_json::json!({
      "name": "glob",
      "description": "Find files by glob pattern (supports **). Sorted by mtime desc. Returns up to 200 hits. Ignores .git, node_modules, dist, target, blobs.",
      "input_schema": {
        "type": "object",
        "properties": {
          "pat": { "type": "string" },
          "path": { "type": "string" }
        },
        "required": ["pat"]
      }
    }),
		    serde_json::json!({
		      "name": "grep",
		      "description": "Search files for a regex pattern. Uses ripgrep (rg) (bundled/downloaded as needed) with a fallback Rust scan. Returns up to 50 hits. Skips large/binary files and ignores .git, node_modules, dist, target, blobs. Optional include glob: \"*.ts\" or \"*.{ts,tsx}\".",
		      "input_schema": {
		        "type": "object",
		        "properties": {
		          "pat": { "type": "string" },
	            "pattern": { "type": "string" },
	            "query": { "type": "string" },
	            "path": { "type": "string" },
	            "include": { "type": "string" }
        },
        "required": ["pat"]
      }
    }),
    serde_json::json!({
      "name": "bash",
      "description": "Run a shell command (30s timeout). Creates cwd if needed. Requires approval.",
      "input_schema": {
        "type": "object",
        "properties": {
          "cmd": { "type": "string" },
          "cwd": { "type": "string" }
        },
        "required": ["cmd"]
      }
    }),
  ]
}

fn make_agent_tool_schema_openai() -> Vec<serde_json::Value> {
  make_agent_tool_schema()
    .into_iter()
    .filter_map(|tool| {
      let name = tool.get("name")?.as_str()?.to_string();
      let description = tool.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let parameters = tool.get("input_schema").cloned().unwrap_or(serde_json::Value::Null);
      Some(serde_json::json!({
        "type": "function",
        "function": {
          "name": name,
          "description": description,
          "parameters": parameters
        }
      }))
    })
    .collect()
}

fn resolve_scoped_path(root: &str, raw_path: &str) -> Result<std::path::PathBuf, String> {
  let cleaned = raw_path.trim();
  if cleaned.is_empty() {
    return Err("path is required".to_string());
  }
  let resolved = resolve_path_under_root(root, cleaned);
  let resolved_str = resolved.to_string_lossy().to_string();
  if !is_within_root(root, &resolved_str) {
    return Err(format!("path outside workspace scope: {}", cleaned));
  }
  Ok(resolved)
}

fn rel_path_display(root: &str, abs: &std::path::Path) -> String {
  let root_path = std::path::Path::new(root);
  let root_canon = root_path.canonicalize().unwrap_or_else(|_| root_path.to_path_buf());
  let abs_canon = abs.canonicalize().unwrap_or_else(|_| abs.to_path_buf());
  abs_canon
    .strip_prefix(&root_canon)
    .ok()
    .map(|p| p.to_string_lossy().to_string())
    .unwrap_or_else(|| abs.to_string_lossy().to_string())
}

fn write_file_atomic(path: &std::path::Path, bytes: &[u8]) -> anyhow::Result<()> {
  let parent = path
    .parent()
    .unwrap_or_else(|| std::path::Path::new("."));
  std::fs::create_dir_all(parent)?;

  let tmp_name = format!(
    ".arx.tmp.{}.{}",
    uuid::Uuid::new_v4().simple(),
    std::process::id()
  );
  let tmp_path = parent.join(tmp_name);
  {
    use std::io::Write as _;
    let mut file = std::fs::OpenOptions::new()
      .write(true)
      .create_new(true)
      .open(&tmp_path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
  }
  std::fs::rename(&tmp_path, path)?;
  Ok(())
}

struct ToolExecResult {
  status: &'static str, // "ok" | "error"
  tool_result_content: String,
  stdout: Vec<u8>,
  stderr: Vec<u8>,
  exit_code: Option<i32>,
  artifacts: Vec<serde_json::Value>,
  reason: Option<String>,
}

fn tool_ok(content: String) -> ToolExecResult {
  ToolExecResult {
    status: "ok",
    stdout: content.as_bytes().to_vec(),
    stderr: Vec::new(),
    exit_code: Some(0),
    artifacts: Vec::new(),
    reason: None,
    tool_result_content: content,
  }
}

fn tool_error(message: String) -> ToolExecResult {
  ToolExecResult {
    status: "error",
    stdout: Vec::new(),
    stderr: message.as_bytes().to_vec(),
    exit_code: Some(1),
    artifacts: Vec::new(),
    reason: Some("tool_error".to_string()),
    tool_result_content: format!("error: {}", message),
  }
}

fn is_ignored_component(name: &str) -> bool {
  matches!(name, ".git" | "node_modules" | "dist" | "target" | "blobs")
}

fn is_ignored_path(path: &std::path::Path) -> bool {
  path.components().any(|c| match c {
    std::path::Component::Normal(s) => s.to_str().map(is_ignored_component).unwrap_or(false),
    _ => false,
  })
}

fn pattern_needs_pcre2(pat: &str) -> bool {
  pat.contains("(?=")
    || pat.contains("(?!")
    || pat.contains("(?<=")
    || pat.contains("(?<!")
    || pat.contains("(?<")
    || pat.contains("\\1")
    || pat.contains("\\2")
    || pat.contains("\\k<")
}

fn ripgrep_exe_name() -> &'static str {
  if cfg!(windows) { "rg.exe" } else { "rg" }
}

fn ripgrep_platform_config() -> Result<(&'static str, &'static str), String> {
  if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    return Ok(("aarch64-apple-darwin", "tar.gz"));
  }
  if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    return Ok(("x86_64-apple-darwin", "tar.gz"));
  }
  if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    return Ok(("x86_64-unknown-linux-musl", "tar.gz"));
  }
  if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
    return Ok(("aarch64-unknown-linux-gnu", "tar.gz"));
  }
  if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
    return Ok(("x86_64-pc-windows-msvc", "zip"));
  }
  Err("unsupported platform for bundled ripgrep".to_string())
}

fn find_executable_in_path(exe_name: &str) -> Option<std::path::PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  for dir in std::env::split_paths(&path_var) {
    let candidate = dir.join(exe_name);
    if candidate.exists() && candidate.is_file() {
      return Some(candidate);
    }
  }
  None
}

fn ripgrep_bin_dir(db_path: &Path) -> Result<std::path::PathBuf, String> {
  Ok(
    db_path
      .parent()
      .ok_or_else(|| "failed to resolve app data dir".to_string())?
      .join("bin"),
  )
}

fn find_file_recursive(root: &Path, filename: &str) -> Option<std::path::PathBuf> {
  let read_dir = std::fs::read_dir(root).ok()?;
  for entry in read_dir.flatten() {
    let path = entry.path();
    let file_type = entry.file_type().ok()?;
    if file_type.is_symlink() {
      continue;
    }
    if file_type.is_dir() {
      if let Some(found) = find_file_recursive(&path, filename) {
        return Some(found);
      }
      continue;
    }
    if file_type.is_file() {
      if path.file_name().and_then(|v| v.to_str()) == Some(filename) {
        return Some(path);
      }
    }
  }
  None
}

fn run_checked_command(cmd: &mut std::process::Command, label: &str) -> Result<(), String> {
  let output = cmd.output().map_err(|e| format!("{} failed: {}", label, e))?;
  if output.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  if stderr.is_empty() {
    return Err(format!("{} failed", label));
  }
  Err(format!("{} failed: {}", label, stderr))
}

async fn ensure_ripgrep(db_path: &Path) -> Result<std::path::PathBuf, String> {
  let exe_name = ripgrep_exe_name();

  if let Ok(override_path) = std::env::var("ARX_RIPGREP_PATH") {
    let p = std::path::PathBuf::from(override_path);
    if p.exists() && p.is_file() {
      return Ok(p);
    }
    return Err("ARX_RIPGREP_PATH points to a missing file".to_string());
  }

  if let Some(path) = find_executable_in_path(exe_name) {
    return Ok(path);
  }

  let bin_dir = ripgrep_bin_dir(db_path)?;
  let managed = bin_dir.join(exe_name);
  if managed.exists() && managed.is_file() {
    return Ok(managed);
  }

  let (platform, ext) = ripgrep_platform_config()?;
  let filename = format!("ripgrep-{}-{}.{}", RIPGREP_VERSION, platform, ext);
  let url = format!(
    "https://github.com/BurntSushi/ripgrep/releases/download/{}/{}",
    RIPGREP_VERSION, filename
  );

  std::fs::create_dir_all(&bin_dir).map_err(|e| format!("create bin dir failed: {}", e))?;

  let client = reqwest::Client::new();
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("ripgrep download failed: {}", e))?;
  if !resp.status().is_success() {
    return Err(format!("ripgrep download failed (status {})", resp.status()));
  }
  let archive_bytes = resp
    .bytes()
    .await
    .map_err(|e| format!("ripgrep download read failed: {}", e))?
    .to_vec();

  let archive_path = bin_dir.join(&filename);
  write_file_atomic(&archive_path, &archive_bytes).map_err(|e| format!("write ripgrep archive failed: {}", e))?;

  let extract_dir = bin_dir.join(format!(
    ".arx.ripgrep.extract.{}",
    uuid::Uuid::new_v4().simple()
  ));
  std::fs::create_dir_all(&extract_dir).map_err(|e| format!("create extract dir failed: {}", e))?;

  let extract_result = match ext {
    "tar.gz" => {
      let mut cmd = std::process::Command::new("tar");
      cmd.arg("-xzf").arg(&archive_path).arg("-C").arg(&extract_dir);
      run_checked_command(&mut cmd, "tar extract")
    }
    "zip" => {
      if cfg!(windows) {
        let archive_str = archive_path.to_string_lossy().replace('\'', "''");
        let dest_str = extract_dir.to_string_lossy().replace('\'', "''");
        let mut cmd = std::process::Command::new("powershell");
        cmd
          .arg("-NoProfile")
          .arg("-Command")
          .arg(format!(
            "Expand-Archive -Force -Path '{}' -DestinationPath '{}'",
            archive_str, dest_str
          ));
        run_checked_command(&mut cmd, "powershell Expand-Archive")
      } else {
        Err("zip extraction is only supported on Windows".to_string())
      }
    }
    other => Err(format!("unsupported ripgrep archive type: {}", other)),
  };

  let extracted_bin_path = if extract_result.is_ok() {
    find_file_recursive(&extract_dir, exe_name)
      .ok_or_else(|| format!("{} not found in extracted ripgrep archive", exe_name))
  } else {
    Err(extract_result.err().unwrap_or_else(|| "extract failed".to_string()))
  };

  let cleanup = || {
    let _ = std::fs::remove_file(&archive_path);
    let _ = std::fs::remove_dir_all(&extract_dir);
  };

  let extracted_bin_path = match extracted_bin_path {
    Ok(v) => v,
    Err(err) => {
      cleanup();
      return Err(err);
    }
  };

  let bin_bytes = std::fs::read(&extracted_bin_path).map_err(|e| {
    cleanup();
    format!("read extracted ripgrep failed: {}", e)
  })?;

  write_file_atomic(&managed, &bin_bytes).map_err(|e| {
    cleanup();
    format!("write ripgrep failed: {}", e)
  })?;

  cleanup();

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt as _;
    let mut perms = std::fs::metadata(&managed)
      .map_err(|e| format!("ripgrep metadata failed: {}", e))?
      .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&managed, perms).map_err(|e| format!("ripgrep chmod failed: {}", e))?;
  }

  Ok(managed)
}

fn run_ripgrep_grep(
  rg_path: &Path,
  workspace_root: &str,
  base_rel: &str,
  pat: &str,
  include: Option<&str>,
  max_hits: usize,
  needs_pcre2: bool,
) -> Result<(Vec<String>, bool, bool), String> {
  use std::io::{BufRead, BufReader, Read as _};
  use std::process::Stdio;

  let mut cmd = std::process::Command::new(rg_path);
  cmd.current_dir(workspace_root)
    .arg("-nH")
    .arg("--color")
    .arg("never")
    .arg("--no-messages")
    .arg("--hidden")
    .arg("--no-follow")
    .arg("--max-filesize")
    .arg("2M");

  for glob in ["!.git/**", "!node_modules/**", "!dist/**", "!target/**", "!blobs/**"] {
    cmd.arg("--glob").arg(glob);
  }

  if needs_pcre2 {
    cmd.arg("--pcre2");
  }

  cmd.arg("--regexp").arg(pat);

  if let Some(include) = include.map(|s| s.trim()).filter(|s| !s.is_empty()) {
    cmd.arg("--glob").arg(include);
  }

  cmd.arg(base_rel).stdout(Stdio::piped()).stderr(Stdio::piped());

  let mut child = match cmd.spawn() {
    Ok(child) => child,
    Err(err) => return Err(format!("ripgrep spawn failed: {}", err)),
  };

  let stderr_handle = child.stderr.take().map(|mut stderr| {
    std::thread::spawn(move || {
      let mut out: Vec<u8> = Vec::new();
      let _ = stderr.read_to_end(&mut out);
      out
    })
  });

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "failed to capture ripgrep stdout".to_string())?;
  let reader = BufReader::new(stdout);

  let mut hits: Vec<String> = Vec::new();
  let mut truncated = false;

  for line in reader.lines() {
    let line = match line {
      Ok(v) => v,
      Err(_) => break,
    };
    if line.trim().is_empty() {
      continue;
    }
    hits.push(line.replace('\\', "/"));
    if hits.len() >= max_hits {
      truncated = true;
      let _ = child.kill();
      break;
    }
  }

  let status = child.wait().map_err(|e| format!("ripgrep wait failed: {}", e))?;
  let exit_code = status.code();
  let stderr_bytes = stderr_handle
    .and_then(|h| h.join().ok())
    .unwrap_or_default();
  let stderr_text = String::from_utf8_lossy(&stderr_bytes).trim().to_string();

  if truncated {
    return Ok((hits, true, false));
  }

  match exit_code {
    Some(0) => Ok((hits, false, false)),
    Some(1) => Ok((Vec::new(), false, false)),
    Some(2) => {
      if hits.is_empty() {
        let msg = if stderr_text.is_empty() {
          "ripgrep failed".to_string()
        } else {
          format!("ripgrep failed: {}", stderr_text)
        };
        Err(msg)
      } else {
        Ok((hits, false, true))
      }
    }
    Some(code) => {
      let msg = if stderr_text.is_empty() {
        format!("ripgrep failed (exit code {})", code)
      } else {
        format!("ripgrep failed (exit code {}): {}", code, stderr_text)
      };
      Err(msg)
    }
    None => Err("ripgrep failed (terminated)".to_string()),
  }
}

fn normalize_agent_tool_name(tool_name: &str) -> String {
  let trimmed = tool_name.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  let lower = trimmed.to_lowercase();
  match lower.as_str() {
    "list" | "ls" => "list_dir".to_string(),
    _ => lower,
  }
}

fn is_known_agent_tool_name(tool_name: &str) -> bool {
  matches!(
    tool_name,
    "read"
      | "list_dir"
      | "sha256"
      | "write"
      | "edit"
      | "glob"
      | "grep"
      | "task"
      | "invalid"
      | "bash"
  )
}

fn parse_unified_diff_hunks(diff: &str) -> Result<Vec<(usize, usize, usize, usize, Vec<(char, String)>)>, String> {
  let mut hunks: Vec<(usize, usize, usize, usize, Vec<(char, String)>)> = Vec::new();
  let mut current: Option<(usize, usize, usize, usize, Vec<(char, String)>)> = None;

  for raw_line in diff.lines() {
    let line = raw_line.trim_end_matches('\r');
    if line.starts_with("@@") {
      if let Some(hunk) = current.take() {
        hunks.push(hunk);
      }
      let inner = line
        .split("@@")
        .nth(1)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "invalid hunk header".to_string())?;
      let mut parts = inner.split_whitespace();
      let old_range = parts.next().ok_or_else(|| "invalid hunk header".to_string())?;
      let new_range = parts.next().ok_or_else(|| "invalid hunk header".to_string())?;

      let parse_range = |value: &str, prefix: char| -> Option<(usize, usize)> {
        if !value.starts_with(prefix) {
          return None;
        }
        let rest = &value[1..];
        let mut items = rest.split(',');
        let start = items.next()?.parse::<usize>().ok()?;
        let count = items
          .next()
          .and_then(|v| v.parse::<usize>().ok())
          .unwrap_or(1);
        Some((start, count))
      };
      let Some((old_start, old_count)) = parse_range(old_range, '-') else {
        return Err("invalid hunk header (old range)".to_string());
      };
      let Some((new_start, new_count)) = parse_range(new_range, '+') else {
        return Err("invalid hunk header (new range)".to_string());
      };

      current = Some((old_start, old_count, new_start, new_count, Vec::new()));
      continue;
    }

    if line.starts_with("--- ")
      || line.starts_with("+++ ")
      || line.starts_with("diff ")
      || line.starts_with("index ")
    {
      continue;
    }

    if line.starts_with("\\ No newline at end of file") {
      continue;
    }

    let Some(hunk) = current.as_mut() else {
      continue;
    };
    let (prefix, rest) = match line.chars().next() {
      Some(ch @ (' ' | '+' | '-')) => (ch, &line[1..]),
      _ => continue,
    };
    hunk.4.push((prefix, rest.to_string()));
  }

  if let Some(hunk) = current.take() {
    hunks.push(hunk);
  }

  if hunks.is_empty() {
    return Err("no hunks found in unified diff".to_string());
  }
  Ok(hunks)
}

#[derive(Clone)]
enum CodexPatchHunk {
  Add { path: String, contents: String },
  Delete { path: String },
  Update {
    path: String,
    move_to: Option<String>,
    chunks: Vec<CodexUpdateChunk>,
  },
}

#[derive(Clone)]
struct CodexUpdateChunk {
  change_context: Option<String>,
  old_lines: Vec<String>,
  new_lines: Vec<String>,
  is_end_of_file: bool,
}

fn parse_codex_patch_hunks(patch_text: &str) -> Result<Vec<CodexPatchHunk>, String> {
  let lines = patch_text.lines().collect::<Vec<_>>();

  let begin_marker = "*** Begin Patch";
  let end_marker = "*** End Patch";

  let begin_idx = lines
    .iter()
    .position(|line| line.trim_end_matches('\r').trim() == begin_marker);
  let end_idx = lines
    .iter()
    .position(|line| line.trim_end_matches('\r').trim() == end_marker);

  let start = begin_idx.map(|i| i + 1).unwrap_or(0);
  let end = end_idx.unwrap_or(lines.len());
  if start > end || end > lines.len() {
    return Err("invalid patch markers".to_string());
  }

  let mut hunks: Vec<CodexPatchHunk> = Vec::new();
  let mut i = start;

  let parse_header_path = |line: &str, prefix: &str| -> Option<String> {
    let trimmed = line.trim_end_matches('\r');
    if !trimmed.starts_with(prefix) {
      return None;
    }
    trimmed.splitn(2, ':').nth(1).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
  };

  while i < end {
    let line = lines[i].trim_end_matches('\r');
    if let Some(path) = parse_header_path(line, "*** Add File:") {
      i += 1;
      let mut out_lines: Vec<String> = Vec::new();
      while i < end {
        let l = lines[i].trim_end_matches('\r');
        if l.starts_with("***") {
          break;
        }
        if let Some(rest) = l.strip_prefix('+') {
          out_lines.push(rest.to_string());
        }
        i += 1;
      }
      hunks.push(CodexPatchHunk::Add {
        path,
        contents: out_lines.join("\n"),
      });
      continue;
    }

    if let Some(path) = parse_header_path(line, "*** Delete File:") {
      hunks.push(CodexPatchHunk::Delete { path });
      i += 1;
      continue;
    }

    if let Some(path) = parse_header_path(line, "*** Update File:") {
      i += 1;
      let mut move_to: Option<String> = None;
      if i < end {
        let next = lines[i].trim_end_matches('\r');
        if let Some(dest) = parse_header_path(next, "*** Move to:") {
          move_to = Some(dest);
          i += 1;
        }
      }

      let mut chunks: Vec<CodexUpdateChunk> = Vec::new();
      while i < end {
        let l = lines[i].trim_end_matches('\r');
        if l.starts_with("***") {
          break;
        }
        if !l.starts_with("@@") {
          i += 1;
          continue;
        }

        let context_line = l.trim_start_matches("@@").trim().to_string();
        i += 1;

        let mut old_lines: Vec<String> = Vec::new();
        let mut new_lines: Vec<String> = Vec::new();
        let mut is_end_of_file = false;
        while i < end {
          let cl = lines[i].trim_end_matches('\r');
          if cl.starts_with("@@") || cl.starts_with("***") {
            break;
          }
          if cl == "*** End of File" {
            is_end_of_file = true;
            i += 1;
            break;
          }
          if let Some(rest) = cl.strip_prefix(' ') {
            old_lines.push(rest.to_string());
            new_lines.push(rest.to_string());
          } else if let Some(rest) = cl.strip_prefix('-') {
            old_lines.push(rest.to_string());
          } else if let Some(rest) = cl.strip_prefix('+') {
            new_lines.push(rest.to_string());
          }
          i += 1;
        }

        chunks.push(CodexUpdateChunk {
          change_context: if context_line.is_empty() { None } else { Some(context_line) },
          old_lines,
          new_lines,
          is_end_of_file,
        });
      }

      hunks.push(CodexPatchHunk::Update {
        path,
        move_to,
        chunks,
      });
      continue;
    }

    i += 1;
  }

  if hunks.is_empty() {
    return Err("no file changes found in patch".to_string());
  }
  Ok(hunks)
}

fn seek_sequence(lines: &[String], pattern: &[String], start_index: usize) -> Option<usize> {
  if pattern.is_empty() {
    return None;
  }
  if start_index > lines.len() {
    return None;
  }
  let max = lines.len().saturating_sub(pattern.len());
  for i in start_index..=max {
    let mut matches = true;
    for j in 0..pattern.len() {
      if lines.get(i + j) != Some(&pattern[j]) {
        matches = false;
        break;
      }
    }
    if matches {
      return Some(i);
    }
  }
  None
}

fn apply_codex_chunks_to_lines(
  original_lines: &[String],
  chunks: &[CodexUpdateChunk],
) -> Result<Vec<String>, String> {
  let mut replacements: Vec<(usize, usize, Vec<String>)> = Vec::new();
  let mut line_index: usize = 0;

  for chunk in chunks {
    if let Some(ctx) = &chunk.change_context {
      let ctx_pattern = vec![ctx.clone()];
      let found = seek_sequence(original_lines, &ctx_pattern, line_index)
        .ok_or_else(|| format!("failed to find context '{}'", ctx))?;
      line_index = found + 1;
    }

    if chunk.old_lines.is_empty() {
      replacements.push((original_lines.len(), 0, chunk.new_lines.clone()));
      continue;
    }

    let mut pattern = chunk.old_lines.clone();
    let mut new_segment = chunk.new_lines.clone();
    let mut found = seek_sequence(original_lines, &pattern, line_index);

    if found.is_none() && pattern.last().map(|s| s.is_empty()).unwrap_or(false) {
      pattern.pop();
      if new_segment.last().map(|s| s.is_empty()).unwrap_or(false) {
        new_segment.pop();
      }
      found = seek_sequence(original_lines, &pattern, line_index);
    }

    let Some(found_idx) = found else {
      return Err(format!(
        "failed to find expected lines:\n{}",
        chunk.old_lines.join("\n")
      ));
    };

    replacements.push((found_idx, pattern.len(), new_segment));
    line_index = found_idx + pattern.len();
  }

  replacements.sort_by(|a, b| a.0.cmp(&b.0));

  let mut out = original_lines.to_vec();
  for (start, old_len, new_seg) in replacements.into_iter().rev() {
    if start > out.len() {
      return Err("replacement starts past end of file".to_string());
    }
    let end = start.saturating_add(old_len);
    if end > out.len() {
      return Err("replacement past end of file".to_string());
    }
    out.splice(start..end, new_seg);
  }

  Ok(out)
}

fn apply_unified_diff_to_lines(
  original_lines: &[String],
  hunks: &[(usize, usize, usize, usize, Vec<(char, String)>)],
) -> Result<Vec<String>, String> {
  let mut out: Vec<String> = Vec::new();
  let mut idx: usize = 0;

  for (old_start, _old_count, _new_start, _new_count, lines) in hunks {
    let target = old_start.saturating_sub(1);
    if target > original_lines.len() {
      return Err(format!("hunk starts past end of file (line {})", old_start));
    }
    if target < idx {
      return Err("hunks overlap or are out of order".to_string());
    }
    out.extend_from_slice(&original_lines[idx..target]);
    idx = target;

    for (kind, text) in lines {
      match kind {
        ' ' => {
          if idx >= original_lines.len() {
            return Err("context line past end of file".to_string());
          }
          if original_lines[idx] != *text {
            return Err(format!("context mismatch at line {}", idx + 1));
          }
          out.push(original_lines[idx].clone());
          idx += 1;
        }
        '-' => {
          if idx >= original_lines.len() {
            return Err("remove line past end of file".to_string());
          }
          if original_lines[idx] != *text {
            return Err(format!("remove mismatch at line {}", idx + 1));
          }
          idx += 1;
        }
        '+' => {
          out.push(text.clone());
        }
        _ => {}
      }
    }
  }

  out.extend_from_slice(&original_lines[idx..]);
  Ok(out)
}

async fn read_limited(mut reader: impl tokio::io::AsyncRead + Unpin, max_bytes: usize) -> Vec<u8> {
  let mut out = Vec::new();
  let mut buf = [0u8; 8192];
  loop {
    let n = match reader.read(&mut buf).await {
      Ok(0) => break,
      Ok(n) => n,
      Err(_) => break,
    };
    if out.len() < max_bytes {
      let remaining = max_bytes - out.len();
      out.extend_from_slice(&buf[..std::cmp::min(remaining, n)]);
    }
  }
  out
}

fn coerce_json_to_multiline_string(value: &serde_json::Value) -> Option<String> {
  match value {
    serde_json::Value::String(s) => Some(s.to_string()),
    serde_json::Value::Array(arr) => {
      let mut out: Vec<String> = Vec::new();
      for v in arr {
        if let Some(s) = coerce_json_to_multiline_string(v) {
          if !s.is_empty() {
            out.push(s);
          }
        }
      }
      if out.is_empty() {
        None
      } else {
        Some(out.join("\n"))
      }
    }
    serde_json::Value::Object(map) => {
      for key in ["text", "patch", "diff", "content", "unified_diff", "unifiedDiff"] {
        if let Some(v) = map.get(key) {
          if let Some(s) = coerce_json_to_multiline_string(v) {
            if !s.trim().is_empty() {
              return Some(s);
            }
          }
        }
      }
      None
    }
    _ => None,
  }
}

async fn run_agent_tool(
  workspace_root: &str,
  db_path: &Path,
  tool_name: &str,
  args: &serde_json::Value,
) -> ToolExecResult {
  let Some(obj) = args.as_object() else {
    return tool_error("args must be an object".to_string());
  };

  match tool_name {
    "read" => {
      let path = obj
        .get("path")
        .or_else(|| obj.get("file_path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
      let offset = obj.get("offset").and_then(|v| v.as_i64()).unwrap_or(0).max(0) as usize;
      let limit = obj.get("limit").and_then(|v| v.as_i64()).unwrap_or(200).max(1) as usize;
      let abs = match resolve_scoped_path(workspace_root, path) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      let meta = match std::fs::metadata(&abs) {
        Ok(m) => m,
        Err(err) => return tool_error(format!("read failed: {}", err)),
      };
      if meta.is_dir() {
        return tool_error("path is a directory; use list_dir for folders".to_string());
      }
	      let file = match std::fs::File::open(&abs) {
	        Ok(f) => f,
	        Err(err) => return tool_error(format!("open failed: {}", err)),
	      };
	      let reader = std::io::BufReader::new(file);
	      let mut out = String::new();
	      for (idx, line) in reader.lines().skip(offset).take(limit).enumerate() {
	        let line_no = offset + idx + 1;
	        match line {
	          Ok(line) => {
	            out.push_str(&format!("{:4}| {}\n", line_no, line));
	          }
	          Err(_) => break,
	        }
	      }
      if out.trim().is_empty() {
        out = "(empty)".to_string();
      }
      tool_ok(out)
    }
    "list_dir" => {
      let path = obj
        .get("path")
        .or_else(|| obj.get("dir_path"))
        .and_then(|v| v.as_str())
        .unwrap_or(".")
        .trim();
      let abs = match resolve_scoped_path(workspace_root, path) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      let meta = match std::fs::metadata(&abs) {
        Ok(m) => m,
        Err(err) => return tool_error(format!("list_dir failed: {}", err)),
      };
      if !meta.is_dir() {
        return tool_error("path is not a directory".to_string());
      }

      let mut dirs: Vec<String> = Vec::new();
      let mut files: Vec<String> = Vec::new();
      let read_dir = match std::fs::read_dir(&abs) {
        Ok(rd) => rd,
        Err(err) => return tool_error(format!("list_dir failed: {}", err)),
      };
      for entry in read_dir.flatten() {
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if is_ignored_component(name.as_str()) {
          continue;
        }
        let file_type = match entry.file_type() {
          Ok(ft) => ft,
          Err(_) => continue,
        };
        if file_type.is_dir() {
          dirs.push(format!("{}/", name));
        } else if file_type.is_file() {
          files.push(name);
        }
      }
      dirs.sort();
      files.sort();
      let rel = rel_path_display(workspace_root, &abs);
      let mut out_lines: Vec<String> = Vec::new();
      out_lines.push(format!("dir: {} ({} dirs, {} files)", rel, dirs.len(), files.len()));
      if !dirs.is_empty() || !files.is_empty() {
        out_lines.push(String::new());
        out_lines.extend(dirs);
        out_lines.extend(files);
      }
      tool_ok(out_lines.join("\n"))
    }
    "sha256" => {
      let path = obj
        .get("path")
        .or_else(|| obj.get("file_path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
      let abs = match resolve_scoped_path(workspace_root, path) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      if !abs.exists() {
        return tool_error("file does not exist".to_string());
      }
      let bytes = match std::fs::read(&abs) {
        Ok(b) => b,
        Err(err) => return tool_error(format!("read failed: {}", err)),
      };
      let sha = hex_sha256(&bytes);
      let mut result = tool_ok(sha.clone());
      result.artifacts.push(serde_json::json!({
        "type": "file_hash",
        "path": rel_path_display(workspace_root, &abs),
        "sha256": sha,
        "byte_len": bytes.len()
      }));
      result
    }
    "task" => {
      let base = obj
        .get("path")
        .or_else(|| obj.get("cwd"))
        .or_else(|| obj.get("workdir"))
        .and_then(|v| v.as_str())
        .unwrap_or(".")
        .trim();
      let base_abs = match resolve_scoped_path(workspace_root, base) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      if !base_abs.exists() {
        return tool_error("path does not exist".to_string());
      }

      let do_list = obj.get("list").and_then(|v| v.as_bool()).unwrap_or(true);
      let pat = obj
        .get("pat")
        .or_else(|| obj.get("pattern"))
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
      let query = obj
        .get("query")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

      let mut out_lines: Vec<String> = Vec::new();

      if do_list {
        if base_abs.is_dir() {
          let mut dirs: Vec<String> = Vec::new();
          let mut files: Vec<String> = Vec::new();
          let read_dir = match std::fs::read_dir(&base_abs) {
            Ok(rd) => rd,
            Err(err) => return tool_error(format!("list_dir failed: {}", err)),
          };
          for entry in read_dir.flatten() {
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy().to_string();
            if is_ignored_component(name.as_str()) {
              continue;
            }
            let file_type = match entry.file_type() {
              Ok(ft) => ft,
              Err(_) => continue,
            };
            if file_type.is_dir() {
              dirs.push(format!("{}/", name));
            } else if file_type.is_file() {
              files.push(name);
            }
          }
          dirs.sort();
          files.sort();
          let rel = rel_path_display(workspace_root, &base_abs);
          out_lines.push(format!("dir: {} ({} dirs, {} files)", rel, dirs.len(), files.len()));
          if !dirs.is_empty() || !files.is_empty() {
            out_lines.push(String::new());
            out_lines.extend(dirs);
            out_lines.extend(files);
          }
        } else {
          out_lines.push(format!(
            "path: {} (not a directory)",
            rel_path_display(workspace_root, &base_abs)
          ));
        }
      }

      if let Some(pat) = pat {
        let pattern_abs = if std::path::Path::new(&pat).is_absolute() {
          std::path::PathBuf::from(&pat)
        } else {
          base_abs.join(&pat)
        };
        let pattern = pattern_abs.to_string_lossy().replace('\\', "/");
        let prefix = pattern
          .char_indices()
          .find(|(_idx, ch)| matches!(ch, '*' | '?' | '[' | '{'))
          .map(|(idx, _)| pattern[..idx].to_string())
          .unwrap_or_else(|| pattern.clone());
        let prefix_path = if prefix.trim().is_empty() {
          base_abs.to_string_lossy().to_string()
        } else {
          prefix
        };
        if !is_within_root(workspace_root, &prefix_path) {
          return tool_error("pat resolves outside workspace scope".to_string());
        }

        let mut hits: Vec<(i64, String)> = Vec::new();
        let mut total_matches: usize = 0;
        const MAX_HITS: usize = 200;
        match glob::glob(&pattern) {
          Ok(paths) => {
            for p in paths.flatten() {
              if is_ignored_path(&p) {
                continue;
              }
              let rel = rel_path_display(workspace_root, &p);
              if std::path::Path::new(&rel).is_absolute() {
                continue;
              }
              total_matches += 1;
              let mtime = std::fs::metadata(&p)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
              hits.push((mtime, rel));
            }
          }
          Err(err) => return tool_error(format!("invalid glob: {}", err)),
        }
        hits.sort_by(|a, b| b.0.cmp(&a.0));
        let truncated = hits.len() > MAX_HITS;
        if hits.len() > MAX_HITS {
          hits.truncate(MAX_HITS);
        }
        let mut glob_lines: Vec<String> = Vec::new();
        glob_lines.push(format!(
          "matches: {} (returned: {}{}) (ignored: .git,node_modules,dist,target,blobs)",
          total_matches,
          hits.len(),
          if truncated { ", truncated" } else { "" }
        ));
        if !hits.is_empty() {
          glob_lines.push(String::new());
          glob_lines.extend(hits.into_iter().map(|(_mtime, rel)| rel));
        }
        let listing = tool_ok(glob_lines.join("\n"));
        if !out_lines.is_empty() {
          out_lines.push(String::new());
        }
        out_lines.push(listing.tool_result_content.trim().to_string());
      }

      if let Some(query) = query {
        const MAX_HITS: usize = 50;
        const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
        let mut hits: Vec<String> = Vec::new();
        let mut stack = vec![base_abs.clone()];
        let mut scanned_files: u64 = 0;
        let mut skipped_large: u64 = 0;
        let mut skipped_binary: u64 = 0;

        while let Some(dir) = stack.pop() {
          if hits.len() >= MAX_HITS {
            break;
          }
          if is_ignored_path(&dir) {
            continue;
          }
          let read_dir = match std::fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(_) => continue,
          };
          for entry in read_dir.flatten() {
            let path = entry.path();
            if is_ignored_path(&path) {
              continue;
            }
            let file_type = match entry.file_type() {
              Ok(ft) => ft,
              Err(_) => continue,
            };
            if file_type.is_dir() {
              stack.push(path);
              continue;
            }
            if !file_type.is_file() {
              continue;
            }
            scanned_files += 1;

            let meta = match std::fs::metadata(&path) {
              Ok(m) => m,
              Err(_) => continue,
            };
            if meta.len() > MAX_FILE_BYTES {
              skipped_large += 1;
              continue;
            }
            let bytes = match std::fs::read(&path) {
              Ok(b) => b,
              Err(_) => continue,
            };
            if bytes.iter().any(|b| *b == 0) {
              skipped_binary += 1;
              continue;
            }
            let text = String::from_utf8_lossy(&bytes);
            for (idx, line) in text.lines().enumerate() {
              if line.contains(&query) {
                let rel = rel_path_display(workspace_root, &path);
                hits.push(format!("{}:{}:{}", rel, idx + 1, line));
                if hits.len() >= MAX_HITS {
                  break;
                }
              }
            }
            if hits.len() >= MAX_HITS {
              break;
            }
          }
        }

        if !out_lines.is_empty() {
          out_lines.push(String::new());
        }
        out_lines.push(format!(
          "query: \"{}\" hits: {}{} (scanned_files: {}, skipped_large: {}, skipped_binary: {})",
          query,
          hits.len(),
          if hits.len() >= MAX_HITS { " (truncated)" } else { "" },
          scanned_files,
          skipped_large,
          skipped_binary
        ));
        if !hits.is_empty() {
          out_lines.push(String::new());
          out_lines.extend(hits);
        }
      }

      if out_lines.is_empty() {
        out_lines.push("ok".to_string());
      }
      tool_ok(out_lines.join("\n"))
    }
    "invalid" => {
      let tool = obj.get("tool").and_then(|v| v.as_str()).unwrap_or("").trim();
      let error = obj.get("error").and_then(|v| v.as_str()).unwrap_or("").trim();
      let input = obj.get("input").and_then(|v| v.as_str()).unwrap_or("").trim();
      let mut msg = String::new();
      if !tool.is_empty() {
        msg.push_str(&format!("tool: {}\n", tool));
      }
      if !error.is_empty() {
        msg.push_str(&format!("error: {}\n", error));
      }
      if !input.is_empty() {
        msg.push_str(&format!("input: {}\n", input));
      }
      if msg.trim().is_empty() {
        msg = "invalid tool call".to_string();
      }
      if !msg.ends_with('\n') {
        msg.push('\n');
      }
      msg.push_str("available_tools: read, list_dir, glob, grep, task, sha256, write, edit, bash\n");
      msg.push_str("hint: use write (or writes: [...]) for creating files; use edit for small in-file changes.\n");
      tool_error(msg.trim().to_string())
    }
    "apply_patch" => {
      let path = obj
        .get("path")
        .or_else(|| obj.get("file_path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
      let patch_value = obj
        .get("patch")
        .or_else(|| obj.get("patchText"))
        .or_else(|| obj.get("patch_text"))
        .or_else(|| obj.get("unified_diff"))
        .or_else(|| obj.get("unifiedDiff"))
        .or_else(|| obj.get("diff"));
      let patch_text = patch_value
        .and_then(coerce_json_to_multiline_string)
        .unwrap_or_default();
      if patch_text.trim().is_empty() {
        return tool_error(
          "patch is required. Provide input.patch as a string (or array of lines), e.g.\n\
{\"patch\":\"*** Begin Patch\\n*** Add File: foo.txt\\n+hello\\n*** End Patch\"}\n\
If you just want to create/overwrite files, use the write tool instead."
            .to_string(),
        );
      }
      #[derive(Clone)]
      enum ExpectedBeforeSha {
        Create,
        Hash(String),
      }
      let expected = match obj.get("expected_before_sha256") {
        None => None,
        Some(serde_json::Value::Null) => Some(ExpectedBeforeSha::Create),
        Some(serde_json::Value::String(s)) => {
          let trimmed = s.trim();
          if trimmed.is_empty() {
            None
          } else {
            Some(ExpectedBeforeSha::Hash(trimmed.to_string()))
          }
        }
        Some(_) => return tool_error("expected_before_sha256 must be string or null".to_string()),
      };

      let looks_like_codex_patch = patch_text.contains("*** Begin Patch")
        || patch_text.contains("*** Update File:")
        || patch_text.contains("*** Add File:")
        || patch_text.contains("*** Delete File:");
      let looks_like_codex_chunks =
        patch_text.lines().any(|l| l.trim_start().starts_with("@@")) && !patch_text.contains("@@ -");

      let mut codex_hunks: Option<Vec<CodexPatchHunk>> = None;
      if looks_like_codex_patch {
        codex_hunks = parse_codex_patch_hunks(&patch_text).ok();
      }
      if codex_hunks.is_none() && looks_like_codex_chunks {
        if path.trim().is_empty() {
          return tool_error("path is required when patch has no file header".to_string());
        }
        let synthetic = format!(
          "*** Begin Patch\n*** Update File: {}\n{}\n*** End Patch\n",
          path.trim(),
          patch_text.trim_end()
        );
        codex_hunks = Some(match parse_codex_patch_hunks(&synthetic) {
          Ok(hunks) => hunks,
          Err(err) => return tool_error(err),
        });
      }

      if let Some(hunks) = codex_hunks {
        let scoped_expected_target = if expected.is_some() {
          if !path.trim().is_empty() {
            Some(path.trim().to_string())
          } else if hunks.len() == 1 {
            Some(match &hunks[0] {
              CodexPatchHunk::Add { path, .. } => path.clone(),
              CodexPatchHunk::Delete { path } => path.clone(),
              CodexPatchHunk::Update { path, .. } => path.clone(),
            })
          } else {
            return tool_error("expected_before_sha256 is only supported for single-file patches".to_string());
          }
        } else {
          None
        };

        let mut artifacts: Vec<serde_json::Value> = Vec::new();
        let mut changed: Vec<String> = Vec::new();

        for hunk in hunks {
          match hunk {
            CodexPatchHunk::Add { path, contents } => {
              let abs = match resolve_scoped_path(workspace_root, &path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
              };
              if abs.exists() {
                return tool_error(format!("file exists: {}", path));
              }
              if let Some(target) = scoped_expected_target.as_deref() {
                if target == path {
                  if let Some(ExpectedBeforeSha::Hash(_)) = expected {
                    return tool_error("expected_before_sha256 provided, but file does not exist".to_string());
                  }
                }
              }
              if let Err(err) = write_file_atomic(&abs, contents.as_bytes()) {
                return tool_error(format!("apply_patch add failed: {}", err));
              }
              let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| contents.as_bytes().to_vec());
              let after_hash = hex_sha256(&after_bytes);
              let rel = rel_path_display(workspace_root, &abs);
              changed.push(rel.clone());
              artifacts.push(serde_json::json!({
                "type": "file_write",
                "path": rel,
                "before_sha256": null,
                "after_sha256": after_hash,
                "byte_len": after_bytes.len()
              }));
            }
            CodexPatchHunk::Delete { path } => {
              let abs = match resolve_scoped_path(workspace_root, &path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
              };
              let meta = match std::fs::metadata(&abs) {
                Ok(m) => m,
                Err(_) => return tool_error(format!("file does not exist: {}", path)),
              };
              if meta.is_dir() {
                return tool_error(format!("path is a directory: {}", path));
              }
              let before_bytes = std::fs::read(&abs).unwrap_or_default();
              let before_hash = hex_sha256(&before_bytes);
              if let Some(target) = scoped_expected_target.as_deref() {
                if target == path {
                  match expected.clone() {
                    Some(ExpectedBeforeSha::Create) => {
                      return tool_error("expected_before_sha256 was null (create), but file exists".to_string());
                    }
                    Some(ExpectedBeforeSha::Hash(expected_hash)) => {
                      if before_hash != expected_hash {
                        return tool_error(format!(
                          "expected_before_sha256 mismatch (expected {}, got {})",
                          expected_hash, before_hash
                        ));
                      }
                    }
                    None => {}
                  }
                }
              }
              if let Err(err) = std::fs::remove_file(&abs) {
                return tool_error(format!("delete failed: {}", err));
              }
              let rel = rel_path_display(workspace_root, &abs);
              changed.push(rel.clone());
              artifacts.push(serde_json::json!({
                "type": "file_delete",
                "path": rel,
                "before_sha256": before_hash,
                "after_sha256": null,
                "byte_len": before_bytes.len()
              }));
            }
            CodexPatchHunk::Update { path, move_to, chunks } => {
              let abs = match resolve_scoped_path(workspace_root, &path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
              };
              let meta = match std::fs::metadata(&abs) {
                Ok(m) => m,
                Err(_) => return tool_error(format!("file does not exist: {}", path)),
              };
              if meta.is_dir() {
                return tool_error(format!("path is a directory: {}", path));
              }

              let before_bytes = match std::fs::read(&abs) {
                Ok(b) => b,
                Err(err) => return tool_error(format!("read failed: {}", err)),
              };
              let before_hash = hex_sha256(&before_bytes);
              if let Some(target) = scoped_expected_target.as_deref() {
                if target == path {
                  match expected.clone() {
                    Some(ExpectedBeforeSha::Create) => {
                      return tool_error("expected_before_sha256 was null (create), but file exists".to_string());
                    }
                    Some(ExpectedBeforeSha::Hash(expected_hash)) => {
                      if before_hash != expected_hash {
                        return tool_error(format!(
                          "expected_before_sha256 mismatch (expected {}, got {})",
                          expected_hash, before_hash
                        ));
                      }
                    }
                    None => {}
                  }
                }
              }

              let before_text = String::from_utf8_lossy(&before_bytes).to_string();
              let had_trailing_newline = before_text.ends_with('\n');
              let mut original_lines: Vec<String> = before_text
                .split('\n')
                .map(|s| s.trim_end_matches('\r').to_string())
                .collect();
              if had_trailing_newline && original_lines.last().map(|s| s.is_empty()).unwrap_or(false) {
                original_lines.pop();
              }

              let new_lines = match apply_codex_chunks_to_lines(&original_lines, &chunks) {
                Ok(lines) => lines,
                Err(err) => return tool_error(format!("apply_patch failed: {}", err)),
              };
              let mut new_text = new_lines.join("\n");
              if had_trailing_newline {
                new_text.push('\n');
              }

              let dest_abs = if let Some(dest) = move_to.as_deref() {
                match resolve_scoped_path(workspace_root, dest) {
                  Ok(v) => v,
                  Err(e) => return tool_error(e),
                }
              } else {
                abs.clone()
              };

              if let Err(err) = write_file_atomic(&dest_abs, new_text.as_bytes()) {
                return tool_error(format!("apply_patch write failed: {}", err));
              }
              if dest_abs != abs {
                let _ = std::fs::remove_file(&abs);
              }

              let after_bytes = std::fs::read(&dest_abs).unwrap_or_else(|_| new_text.as_bytes().to_vec());
              let after_hash = hex_sha256(&after_bytes);
              let rel = rel_path_display(workspace_root, &dest_abs);
              changed.push(rel.clone());
              artifacts.push(serde_json::json!({
                "type": "file_patch",
                "path": rel,
                "before_sha256": before_hash,
                "after_sha256": after_hash,
                "byte_len": after_bytes.len()
              }));
            }
          }
        }

        changed.sort();
        changed.dedup();
        let summary = if changed.is_empty() {
          "ok".to_string()
        } else {
          format!("ok\npatched {} file(s):\n{}", changed.len(), changed.join("\n"))
        };
        let mut result = tool_ok(summary);
        result.artifacts = artifacts;
        return result;
      }

      // Fallback: unified diff with numeric @@ ranges (single file).
      if path.trim().is_empty() {
        return tool_error("path is required for unified diffs".to_string());
      }
      let unified_diff = patch_text;

      let abs = match resolve_scoped_path(workspace_root, &path) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };

      let exists = abs.exists();
      let before_bytes = if exists { std::fs::read(&abs).ok() } else { None };
      if exists {
        let before_bytes = before_bytes.clone().unwrap_or_default();
        let before_hash = hex_sha256(&before_bytes);
        match expected {
          Some(ExpectedBeforeSha::Create) => {
            return tool_error(
              "expected_before_sha256 was null (create), but file exists; refuse overwrite".to_string(),
            );
          }
          Some(ExpectedBeforeSha::Hash(expected_hash)) => {
            if before_hash != expected_hash {
              return tool_error(format!(
                "expected_before_sha256 mismatch (expected {}, got {})",
                expected_hash, before_hash
              ));
            }
          }
          None => {}
        }
      } else if let Some(ExpectedBeforeSha::Hash(_)) = expected {
        return tool_error("expected_before_sha256 provided, but file does not exist".to_string());
      }

      let before_text = before_bytes
        .as_ref()
        .map(|b| String::from_utf8_lossy(b).to_string())
        .unwrap_or_default();
      let had_trailing_newline = before_text.ends_with('\n');
      let mut original_lines: Vec<String> = before_text
        .split('\n')
        .map(|s| s.trim_end_matches('\r').to_string())
        .collect();
      if had_trailing_newline && original_lines.last().map(|s| s.is_empty()).unwrap_or(false) {
        original_lines.pop();
      }

      let hunks = match parse_unified_diff_hunks(&unified_diff) {
        Ok(hunks) => hunks,
        Err(err) => return tool_error(err),
      };
      let out_lines = match apply_unified_diff_to_lines(&original_lines, &hunks) {
        Ok(lines) => lines,
        Err(err) => return tool_error(format!("patch failed: {}", err)),
      };
      let mut out_text = out_lines.join("\n");
      if had_trailing_newline || (!out_text.is_empty() && !out_text.ends_with('\n')) {
        out_text.push('\n');
      }

      if let Err(err) = write_file_atomic(&abs, out_text.as_bytes()) {
        return tool_error(format!("write failed: {}", err));
      }

      let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| out_text.as_bytes().to_vec());
      let after_hash = hex_sha256(&after_bytes);
      let before_hash = before_bytes.as_ref().map(|b| hex_sha256(b));

      let mut result = tool_ok("ok".to_string());
      result.artifacts.push(serde_json::json!({
        "type": "file_patch",
        "path": rel_path_display(workspace_root, &abs),
        "before_sha256": before_hash,
        "after_sha256": after_hash,
        "byte_len": after_bytes.len()
      }));
      result
    }
    "glob" => {
      let pat = obj
        .get("pat")
        .or_else(|| obj.get("pattern"))
	        .and_then(|v| v.as_str())
	        .unwrap_or("")
	        .trim();
	      if pat.is_empty() {
	        return tool_error("pat is required".to_string());
	      }
	      let base = obj
	        .get("path")
	        .or_else(|| obj.get("cwd"))
	        .or_else(|| obj.get("workdir"))
	        .and_then(|v| v.as_str())
	        .unwrap_or(".")
	        .trim();
	      let base_abs = match resolve_scoped_path(workspace_root, base) {
	        Ok(v) => v,
	        Err(e) => return tool_error(e),
	      };
	      if !base_abs.exists() {
	        return tool_error("path does not exist".to_string());
	      }

	      let pattern_abs = if std::path::Path::new(pat).is_absolute() {
	        std::path::PathBuf::from(pat)
	      } else {
	        base_abs.join(pat)
	      };
	      let pattern = pattern_abs.to_string_lossy().replace('\\', "/");

	      // Guardrail: ensure the non-wildcard prefix stays within the workspace scope.
	      let prefix = pattern
	        .char_indices()
	        .find(|(_idx, ch)| matches!(ch, '*' | '?' | '[' | '{'))
	        .map(|(idx, _)| pattern[..idx].to_string())
	        .unwrap_or_else(|| pattern.clone());
	      let prefix_path = if prefix.trim().is_empty() {
	        base_abs.to_string_lossy().to_string()
	      } else {
	        prefix
	      };
	      if !is_within_root(workspace_root, &prefix_path) {
	        return tool_error("pat resolves outside workspace scope".to_string());
	      }

	      let mut hits: Vec<(i64, String)> = Vec::new();
	      let mut total_matches: usize = 0;
	      const MAX_HITS: usize = 200;
	      match glob::glob(&pattern) {
	        Ok(paths) => {
	          for p in paths.flatten() {
	            if is_ignored_path(&p) {
	              continue;
	            }
	            let rel = rel_path_display(workspace_root, &p);
	            if std::path::Path::new(&rel).is_absolute() {
	              continue;
	            }
	            total_matches += 1;
	            let mtime = std::fs::metadata(&p)
	              .and_then(|m| m.modified())
	              .ok()
	              .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
	              .map(|d| d.as_secs() as i64)
	              .unwrap_or(0);
	            hits.push((mtime, rel));
	          }
	        }
	        Err(err) => return tool_error(format!("invalid glob: {}", err)),
	      }
	      hits.sort_by(|a, b| b.0.cmp(&a.0));
	      let truncated = hits.len() > MAX_HITS;
	      if hits.len() > MAX_HITS {
	        hits.truncate(MAX_HITS);
	      }
	      let mut out_lines: Vec<String> = Vec::new();
	      out_lines.push(format!(
	        "matches: {} (returned: {}{}) (ignored: .git,node_modules,dist,target,blobs)",
	        total_matches,
	        hits.len(),
	        if truncated { ", truncated" } else { "" }
	      ));
	      if !hits.is_empty() {
	        out_lines.push(String::new());
	        out_lines.extend(hits.into_iter().map(|(_mtime, rel)| rel));
	      }
	      tool_ok(out_lines.join("\n"))
	    }
	    "grep" => {
	      let pat = obj
	        .get("pat")
	        .or_else(|| obj.get("query"))
	        .or_else(|| obj.get("pattern"))
	        .and_then(|v| v.as_str())
	        .unwrap_or("")
	        .trim();
	      if pat.is_empty() {
	        return tool_error("pat is required".to_string());
	      }
      let base = obj
        .get("path")
        .or_else(|| obj.get("cwd"))
        .or_else(|| obj.get("workdir"))
        .and_then(|v| v.as_str())
        .unwrap_or(".")
        .trim();
      let include = obj
        .get("include")
        .or_else(|| obj.get("glob"))
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());
      let base_abs = match resolve_scoped_path(workspace_root, base) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      if !base_abs.exists() {
        return tool_error("path does not exist".to_string());
      }

	      const MAX_HITS: usize = 50;

	      let needs_pcre2 = pattern_needs_pcre2(pat);
	      let mut base_rel = rel_path_display(workspace_root, &base_abs);
	      if base_rel.trim().is_empty() {
	        base_rel = ".".to_string();
	      }
        let mut rg_err: Option<String> = None;
        let rg_path = match ensure_ripgrep(db_path).await {
          Ok(path) => Some(path),
          Err(err) => {
            rg_err = Some(err);
            None
          }
        };

        if let Some(rg_path) = rg_path {
	        match run_ripgrep_grep(&rg_path, workspace_root, &base_rel, pat, include, MAX_HITS, needs_pcre2) {
	          Ok((hits, truncated, had_errors)) => {
	            let mut out_lines: Vec<String> = Vec::new();
	            out_lines.push(format!(
	              "hits: {}{} (backend: rg{})",
	              hits.len(),
	              if truncated { " (truncated)" } else { "" },
	              if needs_pcre2 { ", pcre2" } else { "" }
	            ));
	            if had_errors {
	              out_lines.push("(some paths were inaccessible and skipped)".to_string());
	            }
	            if !hits.is_empty() {
	              out_lines.push(String::new());
	              out_lines.extend(hits);
	            }
	            return tool_ok(out_lines.join("\n"));
	          }
	          Err(err) => {
              if needs_pcre2 {
                return tool_error(err);
              }
              // Fall through to Rust scan.
              rg_err = Some(err);
	          }
	        }
        } else if needs_pcre2 {
          return tool_error(match rg_err {
            Some(err) => format!("unsupported regex feature (look-around/backrefs); {}", err),
            None => "unsupported regex feature (look-around/backrefs); ripgrep unavailable".to_string(),
          });
	      }

	      let re = match regex::Regex::new(pat) {
	        Ok(re) => re,
	        Err(err) => return tool_error(format!("invalid regex: {}", err)),
	      };

	      let mut stack = vec![base_abs];
	      let mut hits: Vec<String> = Vec::new();
	      const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
        let mut scanned_files: u64 = 0;
        let mut skipped_large: u64 = 0;
        let mut skipped_binary: u64 = 0;

      while let Some(dir) = stack.pop() {
        if hits.len() >= MAX_HITS {
          break;
        }
        if is_ignored_path(&dir) {
          continue;
        }
        let read_dir = match std::fs::read_dir(&dir) {
          Ok(rd) => rd,
          Err(_) => continue,
        };
        for entry in read_dir.flatten() {
          let path = entry.path();
          if is_ignored_path(&path) {
            continue;
          }
          let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
          };
          if file_type.is_dir() {
            stack.push(path);
            continue;
          }
	          if !file_type.is_file() {
	            continue;
	          }
            scanned_files += 1;
	
	          let meta = match std::fs::metadata(&path) {
	            Ok(m) => m,
	            Err(_) => continue,
	          };
	          if meta.len() > MAX_FILE_BYTES {
              skipped_large += 1;
	            continue;
	          }
	
	          let bytes = match std::fs::read(&path) {
	            Ok(b) => b,
	            Err(_) => continue,
	          };
	          if bytes.iter().any(|b| *b == 0) {
              skipped_binary += 1;
	            continue;
	          }
          let text = String::from_utf8_lossy(&bytes);
          for (idx, line) in text.lines().enumerate() {
            if re.is_match(line) {
              let rel = rel_path_display(workspace_root, &path);
              hits.push(format!("{}:{}:{}", rel, idx + 1, line));
              if hits.len() >= MAX_HITS {
                break;
              }
            }
          }
          if hits.len() >= MAX_HITS {
            break;
          }
        }
      }

	      let mut out_lines: Vec<String> = Vec::new();
        let backend_note = rg_err
          .as_ref()
          .map(|err| {
            let trimmed = err.trim();
            if trimmed.is_empty() {
              String::new()
            } else if trimmed.len() > 120 {
              format!(", rg unavailable: {}...", &trimmed[..117])
            } else {
              format!(", rg unavailable: {}", trimmed)
            }
          })
          .unwrap_or_default();
        out_lines.push(format!(
          "hits: {}{} (backend: rust{}; scanned_files: {}, skipped_large: {}, skipped_binary: {})",
          hits.len(),
          if hits.len() >= MAX_HITS { " (truncated)" } else { "" },
          backend_note,
          scanned_files,
          skipped_large,
          skipped_binary
        ));
        if !hits.is_empty() {
          out_lines.push(String::new());
          out_lines.extend(hits);
        }
	      tool_ok(out_lines.join("\n"))
	    }
	    "write" => {
      #[derive(Clone)]
      enum ExpectedBeforeSha {
        Create,
        Hash(String),
      }

      let parse_expected_before = |obj: &serde_json::Map<String, serde_json::Value>| -> Result<Option<ExpectedBeforeSha>, ToolExecResult> {
        match obj.get("expected_before_sha256") {
          None => Ok(None),
          Some(serde_json::Value::Null) => Ok(Some(ExpectedBeforeSha::Create)),
          Some(serde_json::Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
              Ok(None)
            } else {
              Ok(Some(ExpectedBeforeSha::Hash(trimmed.to_string())))
            }
          }
          Some(_) => Err(tool_error("expected_before_sha256 must be string or null".to_string())),
        }
      };

      if let Some(writes) = obj.get("writes").and_then(|v| v.as_array()) {
        if writes.is_empty() {
          return tool_error("writes must be a non-empty array".to_string());
        }

        struct PreparedWrite {
          rel: String,
          abs: std::path::PathBuf,
          content: String,
          expected: Option<ExpectedBeforeSha>,
          before_bytes: Option<Vec<u8>>,
        }

        let mut prepared: Vec<PreparedWrite> = Vec::new();
        for (idx, entry) in writes.iter().enumerate() {
          let Some(entry_obj) = entry.as_object() else {
            return tool_error(format!("writes[{}] must be an object", idx));
          };

          let path = entry_obj
            .get("path")
            .or_else(|| entry_obj.get("filePath"))
            .or_else(|| entry_obj.get("filepath"))
            .or_else(|| entry_obj.get("file_path"))
            .or_else(|| entry_obj.get("filename"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
          if path.is_empty() {
            return tool_error(format!("writes[{}].path is required", idx));
          }

          let content = entry_obj
            .get("content")
            .or_else(|| entry_obj.get("text"))
            .or_else(|| entry_obj.get("contents"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

          let expected = match parse_expected_before(entry_obj) {
            Ok(v) => v,
            Err(e) => return e,
          };

          let abs = match resolve_scoped_path(workspace_root, &path) {
            Ok(v) => v,
            Err(e) => return tool_error(e),
          };

          let meta = match std::fs::metadata(&abs) {
            Ok(m) => Some(m),
            Err(_) => None,
          };
          if meta.as_ref().is_some_and(|m| m.is_dir()) {
            return tool_error(format!("writes[{}].path is a directory", idx));
          }

          let exists = meta.is_some();
          let before_bytes = if exists { std::fs::read(&abs).ok() } else { None };
          if exists {
            let before_hash = hex_sha256(before_bytes.as_ref().unwrap_or(&Vec::new()));
            match expected.clone() {
              Some(ExpectedBeforeSha::Create) => {
                return tool_error(format!(
                  "writes[{}]: expected_before_sha256 was null (create), but file exists; refuse overwrite",
                  idx
                ));
              }
              Some(ExpectedBeforeSha::Hash(expected_hash)) => {
                if before_hash != expected_hash {
                  return tool_error(format!(
                    "writes[{}]: expected_before_sha256 mismatch (expected {}, got {})",
                    idx, expected_hash, before_hash
                  ));
                }
              }
              None => {}
            }
          }

          let rel = rel_path_display(workspace_root, &abs);
          prepared.push(PreparedWrite {
            rel,
            abs,
            content,
            expected,
            before_bytes,
          });
        }

        let mut artifacts: Vec<serde_json::Value> = Vec::new();
        let mut changed: Vec<String> = Vec::new();
        for item in prepared {
          if let Err(err) = write_file_atomic(&item.abs, item.content.as_bytes()) {
            return tool_error(format!("write failed ({}): {}", item.rel, err));
          }
          let after_bytes =
            std::fs::read(&item.abs).unwrap_or_else(|_| item.content.as_bytes().to_vec());
          let after_hash = hex_sha256(&after_bytes);
          let before_hash = item.before_bytes.as_ref().map(|b| hex_sha256(b));

          changed.push(item.rel.clone());
          artifacts.push(serde_json::json!({
            "type": "file_write",
            "path": item.rel,
            "before_sha256": before_hash,
            "after_sha256": after_hash,
            "byte_len": after_bytes.len()
          }));
        }

        changed.sort();
        changed.dedup();
        let summary = format!("ok\nwrote {} file(s):\n{}", changed.len(), changed.join("\n"));
        let mut result = tool_ok(summary);
        result.artifacts = artifacts;
        return result;
      }

      let path = obj
        .get("path")
        .or_else(|| obj.get("filePath"))
        .or_else(|| obj.get("filepath"))
        .or_else(|| obj.get("file_path"))
        .or_else(|| obj.get("filename"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
      if path.is_empty() {
        return tool_error(
          "path is required. Provide {\"path\":\"folder/file.txt\",\"content\":\"...\"}. For multiple files, you can also use {\"writes\":[{\"path\":\"a.txt\",\"content\":\"...\"}]}."
            .to_string(),
        );
      }
      let content = obj
        .get("content")
        .or_else(|| obj.get("text"))
        .or_else(|| obj.get("contents"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
      let expected = match parse_expected_before(obj) {
        Ok(v) => v,
        Err(e) => return e,
      };

      let abs = match resolve_scoped_path(workspace_root, path) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };

      if std::fs::metadata(&abs).ok().is_some_and(|m| m.is_dir()) {
        return tool_error("path is a directory; use a file path".to_string());
      }

      let exists = abs.exists();
      let before_bytes = if exists { std::fs::read(&abs).ok() } else { None };
      if exists {
        let before_bytes = before_bytes.clone().unwrap_or_default();
        let before_hash = hex_sha256(&before_bytes);
        match expected {
          Some(ExpectedBeforeSha::Create) => {
            return tool_error(
              "expected_before_sha256 was null (create), but file exists; refuse overwrite".to_string(),
            );
          }
          Some(ExpectedBeforeSha::Hash(expected_hash)) => {
            if before_hash != expected_hash {
              return tool_error(format!(
                "expected_before_sha256 mismatch (expected {}, got {})",
                expected_hash, before_hash
              ));
            }
          }
          None => {
            // Nano-style: if no precondition is provided, proceed using current file content.
          }
        }
      }

      if let Err(err) = write_file_atomic(&abs, content.as_bytes()) {
        return tool_error(format!("write failed: {}", err));
      }

      let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| content.as_bytes().to_vec());
      let after_hash = hex_sha256(&after_bytes);
      let before_hash = before_bytes.as_ref().map(|b| hex_sha256(b));

      let mut result = tool_ok("ok".to_string());
      result.artifacts.push(serde_json::json!({
        "type": "file_write",
        "path": rel_path_display(workspace_root, &abs),
        "before_sha256": before_hash,
        "after_sha256": after_hash,
        "byte_len": after_bytes.len()
      }));
	      result
	    }
	    "edit" => {
      let path = obj
        .get("path")
        .or_else(|| obj.get("filePath"))
        .or_else(|| obj.get("filepath"))
        .or_else(|| obj.get("file_path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
      if path.is_empty() {
        return tool_error("path is required".to_string());
      }
      let old = obj
        .get("old")
        .or_else(|| obj.get("oldString"))
        .or_else(|| obj.get("old_string"))
        .or_else(|| obj.get("find"))
        .or_else(|| obj.get("from"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
      let new = obj
        .get("new")
        .or_else(|| obj.get("newString"))
        .or_else(|| obj.get("new_string"))
        .or_else(|| obj.get("replace"))
        .or_else(|| obj.get("to"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
      let all = obj
        .get("all")
        .or_else(|| obj.get("replaceAll"))
        .or_else(|| obj.get("replace_all"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      let expected = obj
        .get("expected_before_sha256")
        .or_else(|| obj.get("expectedBeforeSha256"))
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
      let abs = match resolve_scoped_path(workspace_root, path) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      let exists = abs.exists();
      let before_bytes = if exists {
        match std::fs::read(&abs) {
          Ok(b) => Some(b),
          Err(err) => return tool_error(format!("read failed: {}", err)),
        }
      } else {
        None
      };
      let before_hash = before_bytes.as_ref().map(|b| hex_sha256(b));

      if exists {
        if let Some(expected) = expected.as_deref() {
          if before_hash.as_deref() != Some(expected) {
            return tool_error(format!(
              "expected_before_sha256 mismatch (expected {}, got {})",
              expected,
              before_hash.clone().unwrap_or_default()
            ));
          }
        }
      } else if expected.is_some() {
        return tool_error("expected_before_sha256 provided, but file does not exist".to_string());
      }

      if old.is_empty() {
        if let Err(err) = write_file_atomic(&abs, new.as_bytes()) {
          return tool_error(format!("write failed: {}", err));
        }
        let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| new.as_bytes().to_vec());
        let after_hash = hex_sha256(&after_bytes);

        let mut result = tool_ok(if exists { "ok".to_string() } else { "ok (created)".to_string() });
        result.artifacts.push(serde_json::json!({
          "type": "file_edit",
          "path": rel_path_display(workspace_root, &abs),
          "before_sha256": before_hash,
          "after_sha256": after_hash,
          "byte_len": after_bytes.len()
        }));
        return result;
      }

      if !exists {
        return tool_error("file does not exist".to_string());
      }

      let text = String::from_utf8_lossy(before_bytes.as_ref().unwrap()).to_string();
      if !text.contains(old) {
        return tool_error(
          "old_string not found; use read to inspect the file, then retry with a more specific old_string (or use write to overwrite the file)".to_string(),
        );
      }
      let count = text.matches(old).count();
      let replaced = if all { text.replace(old, new) } else { text.replacen(old, new, 1) };
      if let Err(err) = write_file_atomic(&abs, replaced.as_bytes()) {
        return tool_error(format!("write failed: {}", err));
      }
      let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| replaced.as_bytes().to_vec());
      let after_hash = hex_sha256(&after_bytes);

      let mut result = tool_ok(if !all && count > 1 {
        format!(
          "ok (replaced first occurrence; old_string appears {} times; use replaceAll=true to replace all)",
          count
        )
      } else {
        "ok".to_string()
      });
      result.artifacts.push(serde_json::json!({
        "type": "file_edit",
        "path": rel_path_display(workspace_root, &abs),
        "before_sha256": before_hash,
        "after_sha256": after_hash,
        "byte_len": after_bytes.len()
      }));
	      result
	    }
	    "bash" => {
      let cmd = obj
        .get("cmd")
        .or_else(|| obj.get("command"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
      if cmd.is_empty() {
        return tool_error("cmd is required".to_string());
      }
      let cwd = obj
        .get("cwd")
        .or_else(|| obj.get("workdir"))
        .and_then(|v| v.as_str())
        .unwrap_or(".")
        .trim();
      let cwd_abs = match resolve_scoped_path(workspace_root, cwd) {
        Ok(v) => v,
        Err(e) => return tool_error(e),
      };
      if !cwd_abs.exists() {
        if let Err(err) = std::fs::create_dir_all(&cwd_abs) {
          return tool_error(format!("cwd does not exist and could not be created: {}", err));
        }
      }

      let mut command = if cfg!(windows) {
        let mut c = TokioCommand::new("cmd");
        c.arg("/C").arg(cmd);
        c
      } else {
        let mut c = TokioCommand::new("sh");
        c.arg("-lc").arg(cmd);
        c
      };
      command
        .current_dir(&cwd_abs)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

      let mut child = match command.spawn() {
        Ok(c) => c,
        Err(err) => return tool_error(format!("spawn failed: {}", err)),
      };
      let stdout = child.stdout.take();
      let stderr = child.stderr.take();
      let stdout_fut = async move {
        if let Some(stdout) = stdout {
          read_limited(stdout, 1024 * 1024).await
        } else {
          Vec::new()
        }
      };
      let stderr_fut = async move {
        if let Some(stderr) = stderr {
          read_limited(stderr, 256 * 1024).await
        } else {
          Vec::new()
        }
      };
      let stdout_task = tokio::spawn(stdout_fut);
      let stderr_task = tokio::spawn(stderr_fut);

      let mut timed_out = false;
      let status = tokio::select! {
        res = child.wait() => res.ok(),
        _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {
          timed_out = true;
          let _ = child.kill().await;
          let _ = child.wait().await;
          None
        }
      };

      let stdout = stdout_task.await.unwrap_or_default();
      let stderr = stderr_task.await.unwrap_or_default();
      let exit_code = status.and_then(|s| s.code());

      let tool_result_content = if timed_out {
        let mut out = String::from_utf8_lossy(&stdout).to_string();
        if !out.is_empty() && !out.ends_with('\n') {
          out.push('\n');
        }
        out.push_str("(timed out after 30s)");
        out
      } else {
        let mut out = String::from_utf8_lossy(&stdout).to_string();
        if !stderr.is_empty() {
          if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
          }
          out.push_str(&String::from_utf8_lossy(&stderr));
        }
        if out.trim().is_empty() { "(empty)".to_string() } else { out.trim().to_string() }
      };

      ToolExecResult {
        status: if timed_out { "error" } else { "ok" },
        tool_result_content,
        stdout,
        stderr,
        exit_code,
        artifacts: Vec::new(),
        reason: if timed_out { Some("timeout".to_string()) } else { None },
      }
    }
    _ => tool_error(format!("unknown tool: {}", tool_name)),
  }
}

#[derive(Clone, Serialize)]
struct OpenRouterStreamPayload {
  session_id: String,
  run_id: String,
  engine_id: String,
  model_id: String,
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

#[derive(Clone, Serialize)]
struct AgentStatusPayload {
  session_id: String,
  status: String,        // "thinking" | "working" | "idle"
  tool_name: Option<String>,
  tool_args_preview: Option<String>,
}

#[derive(Clone, Serialize)]
struct ToolCallProgressPayload {
  session_id: String,
  tool_call_id: String,
  tool_name: String,
  tool_args_preview: Option<String>,
  status: String,        // "started" | "finished"
  result: Option<String>, // "ok" | "error" (only when finished)
}

#[derive(Clone, Serialize)]
struct SendTurnResult {
  thread_id: String,
  engine_id: String,
  engine_input_event_id: Option<String>,
  engine_input_seq: Option<i64>,
  run_id: Option<String>,
}

fn append_openrouter_messages_assistant_message(
  conn: &rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  content_text: &str,
  model_id: &str,
  run_id: &str,
  source_event_ids: &[String],
  openrouter_model_id: Option<&str>,
  max_tokens: u32,
) {
  let payload = serde_json::json!({
    "v": 1,
    "role": "assistant",
    "content": { "text": content_text },
    "meta": {
      "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
      "model_id": model_id,
      "openrouter_model_id": openrouter_model_id,
      "run_id": run_id,
      "max_tokens": max_tokens
    },
    "source_event_ids": source_event_ids
  });
  let (fts_text, _report) = context::redact_secrets(content_text);
  let _ = db::append_event(
    conn,
    db_path,
    thread_id,
    "assistant_message",
    Some(&fts_text),
    Some(&payload.to_string()),
    None,
  );
}

async fn await_tool_approval(
  window: &tauri::Window,
  session_id: &str,
  tool_call_id: &str,
  tool_name: &str,
  args_json: &str,
  mut cancel_rx: watch::Receiver<bool>,
) -> ToolApprovalDecision {
  let (tx, rx) = oneshot::channel::<ToolApprovalDecision>();
  {
    let mut map = PENDING_TOOL_APPROVALS.lock().await;
    map.insert(tool_call_id.to_string(), tx);
  }

  let _ = window.emit(
    "tool-approval-requested",
    ToolApprovalRequestedPayload {
      session_id: session_id.to_string(),
      tool_call_id: tool_call_id.to_string(),
      tool_name: tool_name.to_string(),
      args_json: args_json.to_string(),
    },
  );

  if *cancel_rx.borrow() {
    let mut map = PENDING_TOOL_APPROVALS.lock().await;
    map.remove(tool_call_id);
    return ToolApprovalDecision {
      approved: false,
      allow_write_edit_for_session: false,
    };
  }

  tokio::select! {
    decision = rx => {
      match decision {
        Ok(decision) => decision,
        Err(_) => ToolApprovalDecision { approved: false, allow_write_edit_for_session: false },
      }
    }
    _ = cancel_rx.changed() => {
      let mut map = PENDING_TOOL_APPROVALS.lock().await;
      map.remove(tool_call_id);
      ToolApprovalDecision { approved: false, allow_write_edit_for_session: false }
    }
  }
}

fn write_blob_and_record(
  conn: &rusqlite::Connection,
  db_path: &Path,
  bytes: &[u8],
) -> Option<crate::blob_store::BlobWriteResult> {
  if bytes.is_empty() {
    return None;
  }
  match blob_store::write_blob(db_path, bytes) {
    Ok(blob) => {
      let _ = db::record_blob(conn, &blob.id, &blob.rel_path, blob.byte_len);
      Some(blob)
    }
    Err(_) => None,
  }
}

async fn send_turn_openrouter_messages_agent(
  window: &tauri::Window,
  mut conn: rusqlite::Connection,
  db_path: &Path,
  thread_id: &str,
  workspace: &str,
  mode: &str,
  selected_model_id: &str,
  input: &str,
  atom_system_prompt: &str,
  mut cancel_rx: watch::Receiver<bool>,
) -> Result<SendTurnResult, String> {
  let run_id = uuid::Uuid::new_v4().to_string();
  let workspace_scope_id = workspace_scope_id_from_path(workspace);

	  append_run_started(
	    &conn,
	    db_path,
	    thread_id,
	    &run_id,
	    &workspace_scope_id,
	    mode,
	    ENGINE_OPENROUTER_MESSAGES_AGENT,
	    Some(selected_model_id),
	  );

  let input_trim = input.trim();
  let (input_redacted, input_report) = context::redact_secrets(input_trim);
	  if input_report.blocked {
	    append_openrouter_messages_assistant_message(
	      &conn,
	      db_path,
	      thread_id,
	      "Blocked: sensitive content detected in message. Remove secrets before sending.",
	      selected_model_id,
	      &run_id,
	      &[],
	      None,
	      OPENROUTER_MAX_TOKENS,
	    );
	    append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("secret_redaction"));
	    let _ = window.emit(
	      "openrouter-turn-finished",
	      SessionIdPayload {
	        session_id: thread_id.to_string(),
      },
    );
    return Ok(SendTurnResult {
      thread_id: thread_id.to_string(),
      engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
      engine_input_event_id: None,
      engine_input_seq: None,
      run_id: Some(run_id),
    });
	  }

  let input_to_send = if input_report.redactions.is_empty() {
    input_trim.to_string()
  } else {
    input_redacted.trim().to_string()
  };

  let openrouter_key = {
    let entry = Entry::new("com.arx.app", "openrouter").map_err(|e| e.to_string())?;
    match entry.get_password() {
      Ok(value) => value,
	      Err(_) => {
	        append_openrouter_messages_assistant_message(
	          &conn,
	          db_path,
	          thread_id,
	          "Missing API key. Add it in Settings.",
	          selected_model_id,
	          &run_id,
	          &[],
	          None,
	          OPENROUTER_MAX_TOKENS,
	        );
	        append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("missing_api_key"));
	        let _ = window.emit(
	          "openrouter-turn-finished",
	          SessionIdPayload {
	            session_id: thread_id.to_string(),
          },
        );
        return Ok(SendTurnResult {
          thread_id: thread_id.to_string(),
          engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
          engine_input_event_id: None,
          engine_input_seq: None,
          run_id: Some(run_id),
        });
      }
    }
  };

	  let openrouter_model_id = {
	    let trimmed = selected_model_id.trim();
	    if trimmed.contains('/') {
	      trimmed.to_string()
	    } else if let Some(map) = load_openrouter_model_map(&conn) {
	      map.get(trimmed)
	        .and_then(|v| if v.contains('/') { Some(v.clone()) } else { None })
	        .unwrap_or_else(|| trimmed.to_string())
	    } else {
      trimmed.to_string()
    }
  };

  let openrouter_model_id = if openrouter_model_id.contains('/') {
    openrouter_model_id
  } else {
	    let map = match fetch_openrouter_model_map(&openrouter_key).await {
	      Ok(map) => map,
	      Err(err) => {
	        append_openrouter_messages_assistant_message(
	          &conn,
	          db_path,
	          thread_id,
	          &format!("Engine error: OpenRouter model lookup failed: {}", err),
	          selected_model_id,
	          &run_id,
	          &[],
	          None,
	          OPENROUTER_MAX_TOKENS,
	        );
	        append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("model_lookup_failed"));
	        let _ = window.emit(
	          "openrouter-turn-finished",
	          SessionIdPayload {
	            session_id: thread_id.to_string(),
          },
        );
        return Ok(SendTurnResult {
          thread_id: thread_id.to_string(),
          engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
          engine_input_event_id: None,
          engine_input_seq: None,
          run_id: Some(run_id),
	        });
	      }
	    };
	    save_openrouter_model_map(&conn, &map);
	    match map.get(selected_model_id.trim()).cloned().filter(|v| v.contains('/')) {
	      Some(value) => value,
	      None => {
	        append_openrouter_messages_assistant_message(
	          &conn,
	          db_path,
	          thread_id,
	          &format!(
	            "Engine error: Model '{}' is not available for this OpenRouter key.",
	            selected_model_id
	          ),
	          selected_model_id,
	          &run_id,
	          &[],
	          None,
	          OPENROUTER_MAX_TOKENS,
	        );
	        append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("model_unavailable"));
	        let _ = window.emit(
	          "openrouter-turn-finished",
	          SessionIdPayload {
	            session_id: thread_id.to_string(),
          },
        );
        return Ok(SendTurnResult {
          thread_id: thread_id.to_string(),
          engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
          engine_input_event_id: None,
          engine_input_seq: None,
          run_id: Some(run_id),
        });
      }
		    }
		  };

	  if !openrouter_model_id.starts_with("anthropic/") {
	    #[derive(Default, Clone)]
	    struct PartialToolCall {
	      id: String,
	      name: String,
	      arguments: String,
	    }

	    #[derive(Default, Clone)]
	    struct ChatCallResponse {
	      text: String,
	      tool_calls: Vec<PartialToolCall>,
	    }

	    let system_prompt = atom_system_prompt.to_string();

	    // Base conversation: system in messages, then last ~20 user/assistant text messages.
	    let mut messages: Vec<serde_json::Value> = Vec::new();
	    messages.push(serde_json::json!({ "role": "system", "content": system_prompt }));
	    if let Ok(history) = list_messages(&conn, thread_id) {
	      for msg in history.into_iter().rev().take(20).rev() {
	        let value: serde_json::Value =
	          serde_json::from_str(&msg.content_json).unwrap_or(serde_json::Value::Null);
	        let text = value
	          .get("text")
	          .and_then(|v| v.as_str())
	          .unwrap_or("")
	          .trim()
	          .to_string();
	        if text.is_empty() {
	          continue;
	        }
	        let (redacted, _report) = context::redact_secrets(&text);
	        let redacted = redacted.trim().to_string();
	        if redacted.is_empty() {
	          continue;
	        }
	        messages.push(serde_json::json!({ "role": msg.role, "content": redacted }));
	      }
	    }
	    if messages.last().and_then(|m| m.get("role")).and_then(|v| v.as_str()) != Some("user")
	      || messages.last().and_then(|m| m.get("content")).and_then(|v| v.as_str())
	        != Some(input_to_send.as_str())
	    {
	      messages.push(serde_json::json!({ "role": "user", "content": input_to_send.clone() }));
	    }

	    let tools_schema = make_agent_tool_schema_openai();
	    let client = reqwest::Client::new();
	    let auto_approve_key = format!("auto_approve_write_edit::{}", thread_id);
	    let mut auto_approve_write_edit = get_ui_state(&conn, &auto_approve_key)
	      .ok()
	      .flatten()
	      .map(|value| {
	        matches!(
	          value.trim().to_lowercase().as_str(),
	          "1" | "true" | "yes" | "on"
	        )
	      })
	      .unwrap_or(false);

	    let mut evidence_event_ids: Vec<String> = Vec::new();
	    let mut call_seq: u64 = 0;
	    let mut first_engine_input_event_id: Option<String> = None;
	    let mut first_engine_input_seq: Option<i64> = None;
	    let mut final_text: Option<String> = None;

	    loop {
	      if *cancel_rx.borrow() {
	        return Ok(finish_cancelled_openrouter_messages_agent(
	          window,
	          &conn,
	          db_path,
	          thread_id,
	          &run_id,
	          first_engine_input_event_id.clone(),
	          first_engine_input_seq,
	        ));
	      }

	      call_seq += 1;
	      let mut request_max_tokens = OPENROUTER_MAX_TOKENS;
	      let mut request_attempt: u32 = 1;

	      let (engine_input_event, status, resp_bytes, parsed_response) = loop {
	        let request = serde_json::json!({
	          "model": openrouter_model_id,
	          "max_tokens": request_max_tokens,
	          "stream": true,
	          "messages": messages,
	          "tools": tools_schema
	        });
	        let request_bytes = serde_json::to_vec(&request)
	          .map_err(|e| format!("OpenRouter request serialization failed: {}", e))?;
	        let request_blob = blob_store::write_blob(db_path, &request_bytes)
	          .map_err(|e| format!("OpenRouter request blob write failed: {}", e))?;
	        let _ = db::record_blob(&conn, &request_blob.id, &request_blob.rel_path, request_blob.byte_len);

	        let engine_input_payload = serde_json::json!({
	          "v": 1,
	          "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	          "provider_id": "openrouter",
	          "model_id": selected_model_id,
	          "openrouter_model_id": openrouter_model_id,
	          "run_id": run_id,
	          "seq": call_seq,
	          "attempt": request_attempt,
	          "request_format": "openrouter.chat_completions.json",
	          "sent_blob_id": request_blob.id,
	          "sent_blob_ref": request_blob.rel_path,
	          "sent_byte_len": request_blob.byte_len,
	          "max_tokens": request_max_tokens,
	          "stream": true,
	          "input_redaction_report": {
	            "blocked": input_report.blocked,
	            "redactions": input_report.redactions.iter().map(|(kind, count)| serde_json::json!({"kind": kind, "count": count})).collect::<Vec<_>>()
	          }
	        });

	        let engine_input_event = match db::append_event(
	          &conn,
	          db_path,
	          thread_id,
	          "engine_input",
	          None,
	          Some(&engine_input_payload.to_string()),
	          Some(&request_blob.rel_path),
	        ) {
	          Ok(evt) => {
	            if first_engine_input_event_id.is_none() {
	              first_engine_input_event_id = Some(evt.id.clone());
	              first_engine_input_seq = Some(evt.seq);
	            }
	            evt
	          }
	          Err(err) => {
	            append_openrouter_messages_assistant_message(
	              &conn,
	              db_path,
	              thread_id,
	              &format!("Storage error: failed to record engine_input: {}", err),
	              selected_model_id,
	              &run_id,
	              &[],
	              Some(&openrouter_model_id),
	              request_max_tokens,
	            );
	            append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("engine_input_record_failed"));
	            let _ = window.emit(
	              "openrouter-turn-finished",
	              SessionIdPayload {
	                session_id: thread_id.to_string(),
	              },
	            );
	            return Ok(SendTurnResult {
	              thread_id: thread_id.to_string(),
	              engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	              engine_input_event_id: first_engine_input_event_id.clone(),
	              engine_input_seq: first_engine_input_seq,
	              run_id: Some(run_id),
	            });
	          }
	        };

	        // Emit "thinking" status before calling the model
	        let _ = window.emit(
	          "agent-status",
	          AgentStatusPayload {
	            session_id: thread_id.to_string(),
	            status: "thinking".to_string(),
	            tool_name: None,
	            tool_args_preview: None,
	          },
	        );

	        if *cancel_rx.borrow() {
	          return Ok(finish_cancelled_openrouter_messages_agent(
	            window,
	            &conn,
	            db_path,
	            thread_id,
	            &run_id,
	            first_engine_input_event_id.clone(),
	            first_engine_input_seq,
	          ));
	        }

	        let send_fut = client
	          .post("https://openrouter.ai/api/v1/chat/completions")
	          .header("Authorization", format!("Bearer {}", openrouter_key))
	          .header("Content-Type", "application/json")
	          .header("Accept", "text/event-stream")
	          .body(request_bytes)
	          .send();

	        let res = tokio::select! {
	          _ = cancel_rx.changed() => {
	            return Ok(finish_cancelled_openrouter_messages_agent(
	              window,
	              &conn,
	              db_path,
	              thread_id,
	              &run_id,
	              first_engine_input_event_id.clone(),
	              first_engine_input_seq,
	            ));
	          }
	          res = send_fut => res,
	        };

	        let res = match res {
	          Ok(r) => r,
	          Err(err) => {
	            append_openrouter_messages_assistant_message(
	              &conn,
	              db_path,
	              thread_id,
	              &format!("Engine error: OpenRouter request failed: {}", err),
	              selected_model_id,
	              &run_id,
	              &[],
	              Some(&openrouter_model_id),
	              request_max_tokens,
	            );
	            append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("openrouter_request_failed"));
	            let _ = window.emit(
	              "openrouter-turn-finished",
	              SessionIdPayload {
	                session_id: thread_id.to_string(),
	              },
	            );
	            return Ok(SendTurnResult {
	              thread_id: thread_id.to_string(),
	              engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	              engine_input_event_id: Some(engine_input_event.id),
	              engine_input_seq: Some(engine_input_event.seq),
	              run_id: Some(run_id),
	            });
	          }
	        };

	        let status = res.status();
	        let content_type = res
	          .headers()
	          .get("content-type")
	          .and_then(|v| v.to_str().ok())
	          .unwrap_or("")
	          .to_string();

	        let mut resp_bytes: Vec<u8> = Vec::new();
	        let mut parsed_response = ChatCallResponse::default();

	        if !status.is_success() || !content_type.contains("text/event-stream") {
	          resp_bytes = tokio::select! {
	            _ = cancel_rx.changed() => {
	              return Ok(finish_cancelled_openrouter_messages_agent(
	                window,
	                &conn,
	                db_path,
	                thread_id,
	                &run_id,
	                first_engine_input_event_id.clone(),
	                first_engine_input_seq,
	              ));
	            }
	            bytes = res.bytes() => bytes.unwrap_or_default().to_vec(),
	          };

	          let resp_blob = blob_store::write_blob(db_path, &resp_bytes)
	            .map_err(|e| format!("OpenRouter response blob write failed: {}", e))?;
	          let _ = db::record_blob(&conn, &resp_blob.id, &resp_blob.rel_path, resp_blob.byte_len);

	          let engine_io_payload = serde_json::json!({
	            "v": 1,
	            "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	            "provider_id": "openrouter",
	            "model_id": selected_model_id,
	            "openrouter_model_id": openrouter_model_id,
	            "run_id": run_id,
	            "call_seq": call_seq,
	            "attempt": request_attempt,
	            "http_status": status.as_u16(),
	            "chunk_blob_id": resp_blob.id,
	            "chunk_blob_ref": resp_blob.rel_path,
	            "chunk_byte_len": resp_blob.byte_len
	          });

	          if let Ok(evt) = db::append_event(
	            &conn,
	            db_path,
	            thread_id,
	            "engine_io_chunk",
	            None,
	            Some(&engine_io_payload.to_string()),
	            Some(&resp_blob.rel_path),
	          ) {
	            evidence_event_ids.push(evt.id);
	          }

	          let friendly = format_openrouter_error(&resp_bytes);
	          if status.as_u16() == 402 && request_attempt == 1 {
	            if let Some(afford) = parse_openrouter_affordable_max_tokens(&friendly) {
	              if afford < request_max_tokens {
	                request_max_tokens = afford;
	                request_attempt = 2;
	                continue;
	              }
	            }
	          }

	          if status.is_success() {
	            let parsed: serde_json::Value = serde_json::from_slice(&resp_bytes).unwrap_or(serde_json::Value::Null);
	            let choice = parsed
	              .get("choices")
	              .and_then(|v| v.as_array())
	              .and_then(|arr| arr.first())
	              .cloned()
	              .unwrap_or(serde_json::Value::Null);
	            parsed_response.text = choice
	              .get("message")
	              .and_then(|m| m.get("content"))
	              .and_then(|v| v.as_str())
	              .unwrap_or("")
	              .to_string();
	            if let Some(tcs) = choice
	              .get("message")
	              .and_then(|m| m.get("tool_calls"))
	              .and_then(|v| v.as_array())
	            {
	              for tc in tcs {
	                let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
	                let name = tc
	                  .get("function")
	                  .and_then(|f| f.get("name"))
	                  .and_then(|v| v.as_str())
	                  .unwrap_or("")
	                  .to_string();
	                let arguments = tc
	                  .get("function")
	                  .and_then(|f| f.get("arguments"))
	                  .map(|v| {
	                    if let Some(s) = v.as_str() {
	                      s.to_string()
	                    } else {
	                      v.to_string()
	                    }
	                  })
	                  .unwrap_or_else(|| "{}".to_string());
	                if !name.trim().is_empty() {
	                  parsed_response.tool_calls.push(PartialToolCall { id, name, arguments });
	                }
	              }
	            }
	          }

	          break (engine_input_event, status, resp_bytes, parsed_response);
	        }

	        let mut stream = res.bytes_stream();
	        let mut pending = String::new();
	        let mut chunk_seq: u64 = 0;
	        let mut stream_seq: u64 = 0;
	        let mut assistant = String::new();
	        let mut tool_calls: Vec<PartialToolCall> = Vec::new();
	        let mut prompt_tokens: Option<u64> = None;
	        let mut completion_tokens: Option<u64> = None;

	        loop {
	          if *cancel_rx.borrow() {
	            return Ok(finish_cancelled_openrouter_messages_agent(
	              window,
	              &conn,
	              db_path,
	              thread_id,
	              &run_id,
	              first_engine_input_event_id.clone(),
	              first_engine_input_seq,
	            ));
	          }

	          let next = tokio::select! {
	            _ = cancel_rx.changed() => {
	              return Ok(finish_cancelled_openrouter_messages_agent(
	                window,
	                &conn,
	                db_path,
	                thread_id,
	                &run_id,
	                first_engine_input_event_id.clone(),
	                first_engine_input_seq,
	              ));
	            }
	            next = stream.next() => next,
	          };

	          let Some(next) = next else { break };
	          let bytes = match next {
	            Ok(bytes) => bytes,
	            Err(err) => {
	              append_openrouter_messages_assistant_message(
	                &conn,
	                db_path,
	                thread_id,
	                &format!("Engine error: OpenRouter stream error: {}", err),
	                selected_model_id,
	                &run_id,
	                &evidence_event_ids,
	                Some(&openrouter_model_id),
	                request_max_tokens,
	              );
	              append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("openrouter_stream_error"));
	              let _ = window.emit(
	                "openrouter-turn-finished",
	                SessionIdPayload {
	                  session_id: thread_id.to_string(),
	                },
	              );
	              return Ok(SendTurnResult {
	                thread_id: thread_id.to_string(),
	                engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	                engine_input_event_id: Some(engine_input_event.id),
	                engine_input_seq: Some(engine_input_event.seq),
	                run_id: Some(run_id),
	              });
	            }
	          };

	          let (chunk_text, chunk_lossy) = match std::str::from_utf8(&bytes) {
	            Ok(s) => (s.to_string(), false),
	            Err(_) => (String::from_utf8_lossy(&bytes).to_string(), true),
	          };
	          pending.push_str(&chunk_text);

	          chunk_seq += 1;
	          let mut chunk_blob_ref: Option<String> = None;
	          let chunk_payload = if chunk_lossy || bytes.len() > IO_BLOB_THRESHOLD_BYTES {
	            if let Some(blob) = write_blob_and_record(&conn, db_path, bytes.as_ref()) {
	              chunk_blob_ref = Some(blob.rel_path.clone());
	              serde_json::json!({
	                "v": 1,
	                "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	                "model_id": selected_model_id,
	                "openrouter_model_id": openrouter_model_id,
	                "run_id": run_id,
	                "call_seq": call_seq,
	                "chunk_seq": chunk_seq,
	                "http_status": status.as_u16(),
	                "chunk_blob_ref": blob.rel_path,
	                "chunk_byte_len": blob.byte_len,
	                "chunk_text_preview": chunk_text,
	              })
	            } else {
	              serde_json::json!({
	                "v": 1,
	                "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	                "model_id": selected_model_id,
	                "openrouter_model_id": openrouter_model_id,
	                "run_id": run_id,
	                "call_seq": call_seq,
	                "chunk_seq": chunk_seq,
	                "http_status": status.as_u16(),
	                "chunk": chunk_text,
	              })
	            }
	          } else {
	            serde_json::json!({
	              "v": 1,
	              "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	              "model_id": selected_model_id,
	              "openrouter_model_id": openrouter_model_id,
	              "run_id": run_id,
	              "call_seq": call_seq,
	              "chunk_seq": chunk_seq,
	              "http_status": status.as_u16(),
	              "chunk": chunk_text,
	            })
	          };
	          if let Ok(evt) = db::append_event(
	            &conn,
	            db_path,
	            thread_id,
	            "engine_io_chunk",
	            None,
	            Some(&chunk_payload.to_string()),
	            chunk_blob_ref.as_deref(),
	          ) {
	            evidence_event_ids.push(evt.id);
	          }

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

	            let choice = parsed
	              .get("choices")
	              .and_then(|v| v.as_array())
	              .and_then(|arr| arr.first())
	              .cloned()
	              .unwrap_or(serde_json::Value::Null);

	            if let Some(delta) = choice
	              .get("delta")
	              .and_then(|d| d.get("content"))
	              .and_then(|v| v.as_str())
	            {
	              if !delta.is_empty() {
	                assistant.push_str(delta);
	                stream_seq += 1;
	                let _ = window.emit(
	                  "openrouter-stream",
	                  OpenRouterStreamPayload {
	                    session_id: thread_id.to_string(),
	                    run_id: run_id.clone(),
	                    engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	                    model_id: selected_model_id.to_string(),
	                    chunk: delta.to_string(),
	                    full_content: assistant.clone(),
	                    seq: stream_seq,
	                    prompt_tokens,
	                    completion_tokens,
	                    max_tokens: request_max_tokens,
	                  },
	                );
	              }
	            }

	            if let Some(tcs) = choice
	              .get("delta")
	              .and_then(|d| d.get("tool_calls"))
	              .and_then(|v| v.as_array())
	            {
	              for tc in tcs {
	                let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
	                if tool_calls.len() <= idx {
	                  tool_calls.resize_with(idx + 1, Default::default);
	                }
	                if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
	                  if !id.trim().is_empty() {
	                    tool_calls[idx].id = id.to_string();
	                  }
	                }
	                if let Some(name) = tc
	                  .get("function")
	                  .and_then(|f| f.get("name"))
	                  .and_then(|v| v.as_str())
	                {
	                  if !name.trim().is_empty() {
	                    tool_calls[idx].name = name.to_string();
	                  }
	                }
	                if let Some(args_part) = tc
	                  .get("function")
	                  .and_then(|f| f.get("arguments"))
	                  .and_then(|v| v.as_str())
	                {
	                  if !args_part.is_empty() {
	                    tool_calls[idx].arguments.push_str(args_part);
	                  }
	                }
	              }
	            }
	          }
	        }

	        parsed_response.text = assistant;
	        for tc in tool_calls {
	          if !tc.name.trim().is_empty() {
	            parsed_response.tool_calls.push(tc);
	          }
	        }
	        break (engine_input_event, status, resp_bytes, parsed_response);
	      };

	      if !status.is_success() {
	        let friendly = format_openrouter_error(&resp_bytes);
	        append_openrouter_messages_assistant_message(
	          &conn,
	          db_path,
	          thread_id,
	          &format!("Engine error: OpenRouter error {}: {}", status.as_u16(), friendly),
	          selected_model_id,
	          &run_id,
	          &evidence_event_ids,
	          Some(&openrouter_model_id),
	          request_max_tokens,
	        );
	        append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("openrouter_http_error"));
	        let _ = window.emit(
	          "openrouter-turn-finished",
	          SessionIdPayload {
	            session_id: thread_id.to_string(),
	          },
	        );
	        return Ok(SendTurnResult {
	          thread_id: thread_id.to_string(),
	          engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	          engine_input_event_id: Some(engine_input_event.id),
	          engine_input_seq: Some(engine_input_event.seq),
	          run_id: Some(run_id),
	        });
	      }

	      let mut tool_calls = parsed_response.tool_calls;
	      if tool_calls.is_empty() {
	        final_text = Some(parsed_response.text.trim().to_string());
	        break;
	      }

	      for tc in &mut tool_calls {
	        if tc.id.trim().is_empty() {
	          tc.id = uuid::Uuid::new_v4().to_string();
	        }
	        if tc.arguments.trim().is_empty() {
	          tc.arguments = "{}".to_string();
	        }
	      }

	      let tool_calls_json = tool_calls
	        .iter()
	        .map(|tc| {
	          serde_json::json!({
	            "id": tc.id,
	            "type": "function",
	            "function": { "name": tc.name, "arguments": tc.arguments }
	          })
	        })
	        .collect::<Vec<_>>();
	      messages.push(serde_json::json!({
	        "role": "assistant",
	        "content": parsed_response.text,
	        "tool_calls": tool_calls_json
	      }));

	      for tc in tool_calls {
	        let mut tool_use_id = tc.id;
	        let mut raw_tool_name = tc.name;
	        let mut parsed_args = serde_json::from_str::<serde_json::Value>(&tc.arguments).unwrap_or(serde_json::Value::Null);
	        if !parsed_args.is_object() {
	          parsed_args = serde_json::json!({
	            "tool": raw_tool_name,
	            "error": "invalid tool arguments (expected JSON object)",
	            "input": tc.arguments
	          });
	          raw_tool_name = "invalid".to_string();
	        }
	        if tool_use_id.trim().is_empty() {
	          tool_use_id = uuid::Uuid::new_v4().to_string();
	        }

		        let outcome = execute_agent_tool_call(
		          window,
		          &mut conn,
		          db_path,
		          thread_id,
		          workspace,
	          mode,
	          &run_id,
	          &workspace_scope_id,
	          &tool_use_id,
	          &raw_tool_name,
	          parsed_args,
	          &auto_approve_key,
	          &mut auto_approve_write_edit,
	          cancel_rx.clone(),
	        )
	        .await;
	        if outcome.cancelled {
	          return Ok(finish_cancelled_openrouter_messages_agent(
	            window,
	            &conn,
	            db_path,
	            thread_id,
	            &run_id,
	            first_engine_input_event_id.clone(),
	            first_engine_input_seq,
	          ));
	        }

	        messages.push(serde_json::json!({
	          "role": "tool",
	          "tool_call_id": tool_use_id,
	          "content": outcome.tool_result_content
	        }));

	        if *cancel_rx.borrow() {
	          return Ok(finish_cancelled_openrouter_messages_agent(
	            window,
	            &conn,
	            db_path,
	            thread_id,
	            &run_id,
	            first_engine_input_event_id.clone(),
	            first_engine_input_seq,
	          ));
	        }
	      }
	    }

	    let content = final_text.unwrap_or_else(|| "".to_string());
	    if content.trim().is_empty() {
	      append_openrouter_messages_assistant_message(
	        &conn,
	        db_path,
	        thread_id,
	        "Engine error: OpenRouter returned an empty response.",
	        selected_model_id,
	        &run_id,
	        &evidence_event_ids,
	        Some(&openrouter_model_id),
	        OPENROUTER_MAX_TOKENS,
	      );
	      append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("empty_response"));
	      let _ = window.emit(
	        "openrouter-turn-finished",
	        SessionIdPayload {
	          session_id: thread_id.to_string(),
	        },
	      );
	      return Ok(SendTurnResult {
	        thread_id: thread_id.to_string(),
	        engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	        engine_input_event_id: first_engine_input_event_id.clone(),
	        engine_input_seq: first_engine_input_seq,
	        run_id: Some(run_id),
	      });
	    }

	    append_openrouter_messages_assistant_message(
	      &conn,
	      db_path,
	      thread_id,
	      &content,
	      selected_model_id,
	      &run_id,
	      &evidence_event_ids,
	      Some(&openrouter_model_id),
	      OPENROUTER_MAX_TOKENS,
	    );
	    append_run_finished(&conn, db_path, thread_id, &run_id, "ok", None);

	    let _ = window.emit(
	      "agent-status",
	      AgentStatusPayload {
	        session_id: thread_id.to_string(),
	        status: "idle".to_string(),
	        tool_name: None,
	        tool_args_preview: None,
	      },
	    );

	    let _ = window.emit(
	      "openrouter-turn-finished",
	      SessionIdPayload {
	        session_id: thread_id.to_string(),
	      },
	    );
	    return Ok(SendTurnResult {
	      thread_id: thread_id.to_string(),
	      engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	      engine_input_event_id: first_engine_input_event_id,
	      engine_input_seq: first_engine_input_seq,
	      run_id: Some(run_id),
	    });
	  }

		  let system_prompt = atom_system_prompt.to_string();

			  // Base conversation: system in request, then last ~20 user/assistant text messages.
			  let mut messages: Vec<serde_json::Value> = Vec::new();
		  if let Ok(history) = list_messages(&conn, thread_id) {
		    for msg in history.into_iter().rev().take(20).rev() {
	      let value: serde_json::Value =
	        serde_json::from_str(&msg.content_json).unwrap_or(serde_json::Value::Null);
      let text = value
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
      if text.is_empty() {
        continue;
      }
      let (redacted, _report) = context::redact_secrets(&text);
      let redacted = redacted.trim().to_string();
      if redacted.is_empty() {
        continue;
      }
      messages.push(serde_json::json!({ "role": msg.role, "content": redacted }));
    }
  }
  if messages.last().and_then(|m| m.get("role")).and_then(|v| v.as_str()) != Some("user")
    || messages.last().and_then(|m| m.get("content")).and_then(|v| v.as_str()) != Some(input_to_send.as_str())
  {
    messages.push(serde_json::json!({ "role": "user", "content": input_to_send.clone() }));
  }

	  let tools_schema = make_agent_tool_schema();
	  let client = reqwest::Client::new();
	  let auto_approve_key = format!("auto_approve_write_edit::{}", thread_id);
	  let mut auto_approve_write_edit = get_ui_state(&conn, &auto_approve_key)
	    .ok()
	    .flatten()
	    .map(|value| {
	      matches!(
	        value.trim().to_lowercase().as_str(),
	        "1" | "true" | "yes" | "on"
	      )
	    })
	    .unwrap_or(false);
	
	  let mut evidence_event_ids: Vec<String> = Vec::new();
	  let mut call_seq: u64 = 0;
	  let mut first_engine_input_event_id: Option<String> = None;
	  let mut first_engine_input_seq: Option<i64> = None;
	  let mut final_text: Option<String> = None;

	  loop {
	    if *cancel_rx.borrow() {
	      return Ok(finish_cancelled_openrouter_messages_agent(
	        window,
	        &conn,
	        db_path,
	        thread_id,
	        &run_id,
	        first_engine_input_event_id.clone(),
	        first_engine_input_seq,
	      ));
	    }

	    call_seq += 1;
	    let mut request_max_tokens = OPENROUTER_MAX_TOKENS;
	    let mut request_attempt: u32 = 1;
	
	    let (engine_input_event, status, resp_bytes) = loop {
	      let request = serde_json::json!({
	        "model": openrouter_model_id,
	        "max_tokens": request_max_tokens,
	        "stream": true,
	        "system": system_prompt,
	        "messages": messages,
	        "tools": tools_schema
	      });
	      let request_bytes = serde_json::to_vec(&request)
	        .map_err(|e| format!("OpenRouter request serialization failed: {}", e))?;
	      let request_blob = blob_store::write_blob(db_path, &request_bytes)
	        .map_err(|e| format!("OpenRouter request blob write failed: {}", e))?;
	      let _ = db::record_blob(&conn, &request_blob.id, &request_blob.rel_path, request_blob.byte_len);
	
	      let engine_input_payload = serde_json::json!({
	        "v": 1,
	        "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	        "provider_id": "openrouter",
	        "model_id": selected_model_id,
	        "openrouter_model_id": openrouter_model_id,
	        "run_id": run_id,
	        "seq": call_seq,
	        "attempt": request_attempt,
	        "request_format": "openrouter.messages.json",
	        "sent_blob_id": request_blob.id,
	        "sent_blob_ref": request_blob.rel_path,
	        "sent_byte_len": request_blob.byte_len,
	        "max_tokens": request_max_tokens,
	        "stream": true,
	        "input_redaction_report": {
	          "blocked": input_report.blocked,
	          "redactions": input_report.redactions.iter().map(|(kind, count)| serde_json::json!({"kind": kind, "count": count})).collect::<Vec<_>>()
	        }
	      });
	
	      let engine_input_event = match db::append_event(
	        &conn,
	        db_path,
	        thread_id,
	        "engine_input",
	        None,
	        Some(&engine_input_payload.to_string()),
	        Some(&request_blob.rel_path),
	      ) {
	        Ok(evt) => {
	          if first_engine_input_event_id.is_none() {
	            first_engine_input_event_id = Some(evt.id.clone());
	            first_engine_input_seq = Some(evt.seq);
	          }
	          evt
	        }
	        Err(err) => {
	          append_openrouter_messages_assistant_message(
	            &conn,
	            db_path,
	            thread_id,
	            &format!("Storage error: failed to record engine_input: {}", err),
	            selected_model_id,
	            &run_id,
	            &[],
	            Some(&openrouter_model_id),
	            request_max_tokens,
	          );
	          append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("engine_input_record_failed"));
	          let _ = window.emit(
	            "openrouter-turn-finished",
	            SessionIdPayload {
	              session_id: thread_id.to_string(),
	            },
	          );
	          return Ok(SendTurnResult {
	            thread_id: thread_id.to_string(),
	            engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	            engine_input_event_id: first_engine_input_event_id.clone(),
	            engine_input_seq: first_engine_input_seq,
	            run_id: Some(run_id),
	          });
	        }
	      };
	
	      // Emit "thinking" status before calling the model
	      let _ = window.emit(
	        "agent-status",
	        AgentStatusPayload {
	          session_id: thread_id.to_string(),
	          status: "thinking".to_string(),
	          tool_name: None,
	          tool_args_preview: None,
	        },
	      );

	      if *cancel_rx.borrow() {
	        return Ok(finish_cancelled_openrouter_messages_agent(
	          window,
	          &conn,
	          db_path,
	          thread_id,
	          &run_id,
	          first_engine_input_event_id.clone(),
	          first_engine_input_seq,
	        ));
	      }

	      let send_fut = client
	        .post("https://openrouter.ai/api/v1/messages")
	        .header("Authorization", format!("Bearer {}", openrouter_key))
	        .header("Content-Type", "application/json")
	        .header("Accept", "text/event-stream")
	        .header("anthropic-version", "2023-06-01")
	        .body(request_bytes)
	        .send();

	      let res = tokio::select! {
	        _ = cancel_rx.changed() => {
	          return Ok(finish_cancelled_openrouter_messages_agent(
	            window,
	            &conn,
	            db_path,
	            thread_id,
	            &run_id,
	            first_engine_input_event_id.clone(),
	            first_engine_input_seq,
	          ));
	        }
	        res = send_fut => res,
	      };

	      let res = match res {
	        Ok(res) => res,
	        Err(err) => {
	          append_openrouter_messages_assistant_message(
	            &conn,
	            db_path,
	            thread_id,
	            &format!("Engine error: OpenRouter request failed: {}", err),
	            selected_model_id,
	            &run_id,
	            &[],
	            Some(&openrouter_model_id),
	            request_max_tokens,
	          );
	          append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("openrouter_request_failed"));
	          let _ = window.emit(
	            "openrouter-turn-finished",
	            SessionIdPayload {
	              session_id: thread_id.to_string(),
	            },
	          );
	          return Ok(SendTurnResult {
	            thread_id: thread_id.to_string(),
	            engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	            engine_input_event_id: Some(engine_input_event.id),
	            engine_input_seq: Some(engine_input_event.seq),
	            run_id: Some(run_id),
	          });
	        }
	      };
	
	      let status = res.status();
	      let content_type = res
	        .headers()
	        .get("content-type")
	        .and_then(|v| v.to_str().ok())
	        .unwrap_or("")
	        .to_string();

	      // If the server doesn't stream, fall back to the non-stream JSON response.
	      if !status.is_success() || !content_type.contains("text/event-stream") {
	        let resp_bytes = tokio::select! {
	          _ = cancel_rx.changed() => {
	            return Ok(finish_cancelled_openrouter_messages_agent(
	              window,
	              &conn,
	              db_path,
	              thread_id,
	              &run_id,
	              first_engine_input_event_id.clone(),
	              first_engine_input_seq,
	            ));
	          }
	          bytes = res.bytes() => bytes.unwrap_or_default().to_vec(),
	        };

	        let resp_blob = blob_store::write_blob(db_path, &resp_bytes)
	          .map_err(|e| format!("OpenRouter response blob write failed: {}", e))?;
	        let _ = db::record_blob(&conn, &resp_blob.id, &resp_blob.rel_path, resp_blob.byte_len);

	        let engine_io_payload = serde_json::json!({
	          "v": 1,
	          "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	          "provider_id": "openrouter",
	          "model_id": selected_model_id,
	          "openrouter_model_id": openrouter_model_id,
	          "run_id": run_id,
	          "seq": call_seq,
	          "attempt": request_attempt,
	          "http_status": status.as_u16(),
	          "chunk_blob_id": resp_blob.id,
	          "chunk_blob_ref": resp_blob.rel_path,
	          "chunk_byte_len": resp_blob.byte_len
	        });

	        let engine_io_event = db::append_event(
	          &conn,
	          db_path,
	          thread_id,
	          "engine_io_chunk",
	          None,
	          Some(&engine_io_payload.to_string()),
	          Some(&resp_blob.rel_path),
	        )
	        .map_err(|e| format!("Storage error: failed to record engine_io_chunk: {}", e))?;
	        evidence_event_ids.push(engine_io_event.id.clone());

	        if status.as_u16() == 402 && request_attempt == 1 {
	          let friendly = serde_json::from_slice::<serde_json::Value>(&resp_bytes)
	            .ok()
	            .and_then(|v| v.get("error").cloned())
	            .and_then(|e| e.get("message").and_then(|m| m.as_str()).map(|s| s.to_string()))
	            .unwrap_or_else(|| String::from_utf8_lossy(&resp_bytes).to_string());
	          if let Some(afford) = parse_openrouter_affordable_max_tokens(&friendly) {
	            if afford < request_max_tokens {
	              request_max_tokens = afford;
	              request_attempt = 2;
	              continue;
	            }
	          }
	        }

	        break (engine_input_event, status, resp_bytes);
	      }

	      enum StreamedBlock {
	        Text { text: String },
	        ToolUse { id: String, name: String, input: serde_json::Value, input_json: String },
	      }

	      let mut stream = res.bytes_stream();
	      let mut pending = String::new();
	      let mut chunk_seq: u64 = 0;
	      let mut stream_seq: u64 = 0;
	      let mut assistant = String::new();
	      let mut blocks: Vec<Option<StreamedBlock>> = Vec::new();
	      let mut prompt_tokens: Option<u64> = None;
	      let mut completion_tokens: Option<u64> = None;
	      let mut saw_message_stop = false;

	      while !saw_message_stop {
	        if *cancel_rx.borrow() {
	          return Ok(finish_cancelled_openrouter_messages_agent(
	            window,
	            &conn,
	            db_path,
	            thread_id,
	            &run_id,
	            first_engine_input_event_id.clone(),
	            first_engine_input_seq,
	          ));
	        }

	        let next = tokio::select! {
	          _ = cancel_rx.changed() => {
	            return Ok(finish_cancelled_openrouter_messages_agent(
	              window,
	              &conn,
	              db_path,
	              thread_id,
	              &run_id,
	              first_engine_input_event_id.clone(),
	              first_engine_input_seq,
	            ));
	          }
	          next = stream.next() => next,
	        };
	        let Some(next) = next else { break };

	        let bytes = match next {
	          Ok(bytes) => bytes,
	          Err(err) => {
	            append_openrouter_messages_assistant_message(
	              &conn,
	              db_path,
	              thread_id,
	              &format!("Engine error: OpenRouter stream error: {}", err),
	              selected_model_id,
	              &run_id,
	              &evidence_event_ids,
	              Some(&openrouter_model_id),
	              request_max_tokens,
	            );
	            append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("openrouter_stream_error"));
	            let _ = window.emit(
	              "openrouter-turn-finished",
	              SessionIdPayload {
	                session_id: thread_id.to_string(),
	              },
	            );
	            return Ok(SendTurnResult {
	              thread_id: thread_id.to_string(),
	              engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	              engine_input_event_id: Some(engine_input_event.id),
	              engine_input_seq: Some(engine_input_event.seq),
	              run_id: Some(run_id),
	            });
	          }
	        };

	        let (chunk_text, chunk_lossy) = match std::str::from_utf8(&bytes) {
	          Ok(s) => (s.to_string(), false),
	          Err(_) => (String::from_utf8_lossy(&bytes).to_string(), true),
	        };
	        pending.push_str(&chunk_text);

	        chunk_seq += 1;
	        let mut chunk_blob_ref: Option<String> = None;
	        let chunk_payload = if chunk_lossy || bytes.len() > IO_BLOB_THRESHOLD_BYTES {
	          if let Some(blob) = write_blob_and_record(&conn, db_path, bytes.as_ref()) {
	            chunk_blob_ref = Some(blob.rel_path.clone());
	            serde_json::json!({
	              "v": 1,
	              "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	              "model_id": selected_model_id,
	              "openrouter_model_id": openrouter_model_id,
	              "run_id": run_id,
	              "call_seq": call_seq,
	              "chunk_seq": chunk_seq,
	              "http_status": status.as_u16(),
	              "chunk_blob_ref": blob.rel_path,
	              "chunk_byte_len": blob.byte_len,
	              "chunk_text_preview": chunk_text,
	            })
	          } else {
	            serde_json::json!({
	              "v": 1,
	              "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	              "model_id": selected_model_id,
	              "openrouter_model_id": openrouter_model_id,
	              "run_id": run_id,
	              "call_seq": call_seq,
	              "chunk_seq": chunk_seq,
	              "http_status": status.as_u16(),
	              "chunk": chunk_text,
	            })
	          }
	        } else {
	          serde_json::json!({
	            "v": 1,
	            "engine_id": ENGINE_OPENROUTER_MESSAGES_AGENT,
	            "model_id": selected_model_id,
	            "openrouter_model_id": openrouter_model_id,
	            "run_id": run_id,
	            "call_seq": call_seq,
	            "chunk_seq": chunk_seq,
	            "http_status": status.as_u16(),
	            "chunk": chunk_text,
	          })
	        };
	        if let Ok(evt) = db::append_event(
	          &conn,
	          db_path,
	          thread_id,
	          "engine_io_chunk",
	          None,
	          Some(&chunk_payload.to_string()),
	          chunk_blob_ref.as_deref(),
	        ) {
	          evidence_event_ids.push(evt.id);
	        }

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
	            saw_message_stop = true;
	            pending.clear();
	            break;
	          }

	          let parsed: serde_json::Value = match serde_json::from_str(data) {
	            Ok(v) => v,
	            Err(_) => continue,
	          };

	          let event_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
	          if event_type == "message_delta" {
	            if let Some(usage) = parsed.get("usage") {
	              let pt = usage
	                .get("prompt_tokens")
	                .and_then(|v| v.as_u64())
	                .or_else(|| usage.get("input_tokens").and_then(|v| v.as_u64()));
	              let ct = usage
	                .get("completion_tokens")
	                .and_then(|v| v.as_u64())
	                .or_else(|| usage.get("output_tokens").and_then(|v| v.as_u64()));
	              if pt.is_some() {
	                prompt_tokens = pt;
	              }
	              if ct.is_some() {
	                completion_tokens = ct;
	              }
	            }
	            continue;
	          }

	          if event_type == "message_stop" {
	            saw_message_stop = true;
	            continue;
	          }

	          if event_type == "content_block_start" {
	            let idx = parsed.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
	            if blocks.len() <= idx {
	              blocks.resize_with(idx + 1, || None);
	            }
	            let block = parsed.get("content_block").cloned().unwrap_or(serde_json::Value::Null);
	            let kind = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
	            if kind == "text" {
	              let text = block.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
	              blocks[idx] = Some(StreamedBlock::Text { text });
	            } else if kind == "tool_use" {
	              let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
	              let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
	              let input = block.get("input").cloned().unwrap_or(serde_json::Value::Null);
	              blocks[idx] = Some(StreamedBlock::ToolUse { id, name, input, input_json: String::new() });
	            }
	            continue;
	          }

	          if event_type == "content_block_delta" {
	            let idx = parsed.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
	            let delta = parsed.get("delta").cloned().unwrap_or(serde_json::Value::Null);
	            let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
	            if delta_type == "text_delta" {
	              let delta_text = delta.get("text").and_then(|v| v.as_str()).unwrap_or("");
	              if delta_text.is_empty() {
	                continue;
	              }
	              if blocks.len() <= idx {
	                blocks.resize_with(idx + 1, || None);
	              }
	              match blocks.get_mut(idx).and_then(|v| v.as_mut()) {
	                Some(StreamedBlock::Text { text }) => {
	                  text.push_str(delta_text);
	                }
	                _ => {
	                  blocks[idx] = Some(StreamedBlock::Text { text: delta_text.to_string() });
	                }
	              }
	              assistant.push_str(delta_text);
	              stream_seq += 1;
	              let _ = window.emit(
	                "openrouter-stream",
	                OpenRouterStreamPayload {
	                  session_id: thread_id.to_string(),
	                  run_id: run_id.clone(),
	                  engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	                  model_id: selected_model_id.to_string(),
	                  chunk: delta_text.to_string(),
	                  full_content: assistant.clone(),
	                  seq: stream_seq,
	                  prompt_tokens,
	                  completion_tokens,
	                  max_tokens: request_max_tokens,
	                },
	              );
	            } else if delta_type == "input_json_delta" {
	              let partial_json = delta.get("partial_json").and_then(|v| v.as_str()).unwrap_or("");
	              if partial_json.is_empty() {
	                continue;
	              }
	              if blocks.len() <= idx {
	                blocks.resize_with(idx + 1, || None);
	              }
	              if let Some(StreamedBlock::ToolUse { input_json, .. }) = blocks.get_mut(idx).and_then(|v| v.as_mut()) {
	                input_json.push_str(partial_json);
	              }
	            }
	            continue;
	          }
	        }
	      }

	      let content_blocks = blocks
	        .into_iter()
	        .filter_map(|block| match block {
	          Some(StreamedBlock::Text { text }) => Some(serde_json::json!({ "type": "text", "text": text })),
	          Some(StreamedBlock::ToolUse { id, name, input, input_json }) => {
	            let parsed_input = if input_json.trim().is_empty() {
	              None
	            } else {
	              serde_json::from_str::<serde_json::Value>(&input_json).ok()
	            };
	            Some(serde_json::json!({
	              "type": "tool_use",
	              "id": id,
	              "name": name,
	              "input": parsed_input.unwrap_or(input)
	            }))
	          }
	          None => None,
	        })
	        .collect::<Vec<_>>();

	      let resp_bytes = serde_json::to_vec(&serde_json::json!({
	        "content": content_blocks,
	        "usage": { "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens }
	      }))
	      .unwrap_or_default();

	      break (engine_input_event, status, resp_bytes);
	    };
	
	    if !status.is_success() {
	      let friendly = format_openrouter_error(&resp_bytes);
	      append_openrouter_messages_assistant_message(
	        &conn,
	        db_path,
	        thread_id,
	        &format!("Engine error: OpenRouter error {}: {}", status.as_u16(), friendly),
	        selected_model_id,
	        &run_id,
	        &evidence_event_ids,
	        Some(&openrouter_model_id),
	        request_max_tokens,
	      );
	      append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("openrouter_http_error"));
	      let _ = window.emit(
	        "openrouter-turn-finished",
	        SessionIdPayload {
	          session_id: thread_id.to_string(),
	        },
	      );
	      return Ok(SendTurnResult {
	        thread_id: thread_id.to_string(),
	        engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
	        engine_input_event_id: Some(engine_input_event.id),
	        engine_input_seq: Some(engine_input_event.seq),
	        run_id: Some(run_id),
	      });
	    }

	    if *cancel_rx.borrow() {
	      return Ok(finish_cancelled_openrouter_messages_agent(
	        window,
	        &conn,
	        db_path,
	        thread_id,
	        &run_id,
	        first_engine_input_event_id.clone(),
	        first_engine_input_seq,
	      ));
	    }

	    let parsed: serde_json::Value = serde_json::from_slice(&resp_bytes)
	      .map_err(|e| format!("OpenRouter response parse failed: {}", e))?;
    let content_blocks = parsed.get("content").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let mut tool_results: Vec<serde_json::Value> = Vec::new();
    let mut saw_tool_use = false;
    let mut text_out = String::new();

	    for block in &content_blocks {
	      let kind = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
	      if kind == "text" {
	        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
	          text_out.push_str(text);
	        }
	        continue;
	      }

      if kind != "tool_use" {
        continue;
      }
	
		      saw_tool_use = true;
		      let tool_use_id = block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
		      let raw_tool_name = block.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
		      let tool_args = block.get("input").cloned().unwrap_or(serde_json::Value::Null);
		      if tool_use_id.is_empty() || raw_tool_name.trim().is_empty() {
		        tool_results.push(serde_json::json!({
		          "type": "tool_result",
		          "tool_use_id": tool_use_id,
		          "content": "error: invalid tool_use block"
		        }));
		        continue;
		      }
			      let outcome = execute_agent_tool_call(
			        window,
			        &mut conn,
			        db_path,
			        thread_id,
			        workspace,
		        mode,
		        &run_id,
		        &workspace_scope_id,
		        &tool_use_id,
		        &raw_tool_name,
		        tool_args,
		        &auto_approve_key,
		        &mut auto_approve_write_edit,
		        cancel_rx.clone(),
		      )
		      .await;
		      if outcome.cancelled {
		        return Ok(finish_cancelled_openrouter_messages_agent(
		          window,
		          &conn,
		          db_path,
		          thread_id,
		          &run_id,
		          first_engine_input_event_id.clone(),
		          first_engine_input_seq,
		        ));
		      }

		      tool_results.push(serde_json::json!({
		        "type": "tool_result",
		        "tool_use_id": tool_use_id,
		        "content": outcome.tool_result_content
		      }));

	      if *cancel_rx.borrow() {
	        return Ok(finish_cancelled_openrouter_messages_agent(
	          window,
          &conn,
          db_path,
          thread_id,
          &run_id,
          first_engine_input_event_id.clone(),
          first_engine_input_seq,
        ));
      }
    }

    if !saw_tool_use {
      final_text = Some(text_out.trim().to_string());
      break;
    }

    messages.push(serde_json::json!({ "role": "assistant", "content": content_blocks }));
    messages.push(serde_json::json!({ "role": "user", "content": tool_results }));
  }

  let content = final_text.unwrap_or_else(|| "".to_string());
  if *cancel_rx.borrow() {
    return Ok(finish_cancelled_openrouter_messages_agent(
      window,
      &conn,
      db_path,
      thread_id,
      &run_id,
      first_engine_input_event_id.clone(),
      first_engine_input_seq,
    ));
  }
	  if content.trim().is_empty() {
	    append_openrouter_messages_assistant_message(
	      &conn,
	      db_path,
	      thread_id,
	      "Engine error: OpenRouter returned an empty response.",
	      selected_model_id,
	      &run_id,
	      &evidence_event_ids,
	      Some(&openrouter_model_id),
	      OPENROUTER_MAX_TOKENS,
	    );
	    append_run_finished(&conn, db_path, thread_id, &run_id, "error", Some("empty_response"));
	    let _ = window.emit(
	      "openrouter-turn-finished",
	      SessionIdPayload {
	        session_id: thread_id.to_string(),
      },
    );
    return Ok(SendTurnResult {
      thread_id: thread_id.to_string(),
      engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
      engine_input_event_id: first_engine_input_event_id.clone(),
      engine_input_seq: first_engine_input_seq,
      run_id: Some(run_id),
    });
	  }

	  append_openrouter_messages_assistant_message(
	    &conn,
	    db_path,
	    thread_id,
	    &content,
	    selected_model_id,
	    &run_id,
	    &evidence_event_ids,
	    Some(&openrouter_model_id),
	    OPENROUTER_MAX_TOKENS,
	  );
	  append_run_finished(&conn, db_path, thread_id, &run_id, "ok", None);

  // Emit "idle" status when done
  let _ = window.emit(
    "agent-status",
    AgentStatusPayload {
      session_id: thread_id.to_string(),
      status: "idle".to_string(),
      tool_name: None,
      tool_args_preview: None,
    },
  );

  let _ = window.emit(
    "openrouter-turn-finished",
    SessionIdPayload {
      session_id: thread_id.to_string(),
    },
  );
  Ok(SendTurnResult {
    thread_id: thread_id.to_string(),
    engine_id: ENGINE_OPENROUTER_MESSAGES_AGENT.to_string(),
    engine_input_event_id: first_engine_input_event_id,
    engine_input_seq: first_engine_input_seq,
    run_id: Some(run_id),
  })
}

#[tauri::command]
async fn send_turn_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  thread_id: String,
  cwd: String,
  input: String,
) -> Result<SendTurnResult, String> {
  let _thread_lock = lock_thread_run(&thread_id).await;
  let (_cancel_reg, cancel_rx) = CancelRegistration::register(thread_id.trim()).await;
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

  let run_mode = get_ui_state(&conn, &format!("agent_mode::{}", thread_id))
    .ok()
    .flatten()
    .and_then(|v| normalize_agent_mode(&v))
    .map(|mode| if mode == "explore" { "explore" } else { "build" })
    .unwrap_or("build");

	  // Shared memory injection (both harness + OpenRouter chat).
	  let built = context_builder::build_turn_handoff_prefix(&conn, workspace)
	    .map_err(|e| e.to_string())?;
	  let atom_system_prompt =
	    build_atom_system_prompt(workspace, &built.used_personal_memory, thread.community_id.as_deref());
	  let retrieval_payload = serde_json::json!({
	    "v": 1,
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
    &state.db_path,
    &thread_id,
    "memory_retrieval",
    Some("personal_memory"),
    Some(&retrieval_payload.to_string()),
    None,
  );

  let selected_model_id = thread
    .model_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .ok_or_else(|| "OpenRouter model is required".to_string())?;

	  if thread.engine_id == ENGINE_OPENROUTER_MESSAGES_AGENT {
	    return send_turn_openrouter_messages_agent(
	      &window,
	      conn,
	      &state.db_path,
	      &thread_id,
	      workspace,
	      run_mode,
	      selected_model_id,
	      &input,
	      &atom_system_prompt,
	      cancel_rx.clone(),
	    )
	    .await;
	  }

  if thread.engine_id != ENGINE_OPENROUTER_CHAT {
    return Err(format!("Unsupported engine_id: {}", thread.engine_id));
  }

  let run_id = uuid::Uuid::new_v4().to_string();
  let workspace_scope_id = workspace_scope_id_from_path(workspace);
  append_run_started(
    &conn,
    &state.db_path,
    &thread_id,
    &run_id,
    &workspace_scope_id,
    run_mode,
    &thread.engine_id,
    Some(selected_model_id),
  );

  let mut cancel_rx = cancel_rx;
  if *cancel_rx.borrow() {
    append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "cancelled", Some("user_cancel"));
    let _ = window.emit(
      "agent-status",
      AgentStatusPayload {
        session_id: thread_id.clone(),
        status: "idle".to_string(),
        tool_name: None,
        tool_args_preview: None,
      },
    );
    let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
    return Ok(SendTurnResult {
      thread_id,
      engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
      engine_input_event_id: None,
      engine_input_seq: None,
      run_id: Some(run_id),
    });
  }

  let input_trim = input.trim();
  let (input_redacted, input_report) = context::redact_secrets(input_trim);
  if input_report.blocked {
      append_openrouter_assistant_message(
        &conn,
        &state.db_path,
        &thread_id,
        "Blocked: sensitive content detected in message. Remove secrets before sending.",
        selected_model_id,
        &run_id,
        &[],
        None,
        None,
        None,
        OPENROUTER_MAX_TOKENS,
      );
    append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("secret_redaction"));
    let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
    return Ok(SendTurnResult {
      thread_id,
      engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
      engine_input_event_id: None,
      engine_input_seq: None,
      run_id: Some(run_id),
    });
  }
  let input_to_send = if input_report.redactions.is_empty() {
    input_trim.to_string()
  } else {
    input_redacted.trim().to_string()
  };

  let openrouter_key = {
    let entry = Entry::new("com.arx.app", "openrouter").map_err(|e| e.to_string())?;
    match entry.get_password() {
      Ok(value) => value,
      Err(_) => {
        append_openrouter_assistant_message(
          &conn,
          &state.db_path,
          &thread_id,
          "Missing API key. Add it in Settings.",
          selected_model_id,
          &run_id,
          &[],
          None,
          None,
          None,
          OPENROUTER_MAX_TOKENS,
        );
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("missing_api_key"));
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: None,
          engine_input_seq: None,
          run_id: Some(run_id),
        });
      }
    }
  };

  let openrouter_model_id = {
    let trimmed = selected_model_id.trim();
    if trimmed.contains('/') {
      trimmed.to_string()
    } else if let Some(map) = load_openrouter_model_map(&conn) {
      map.get(trimmed)
        .and_then(|v| if v.contains('/') { Some(v.clone()) } else { None })
        .unwrap_or_else(|| trimmed.to_string())
    } else {
      trimmed.to_string()
    }
  };

  let openrouter_model_id = if openrouter_model_id.contains('/') {
    openrouter_model_id
  } else {
    // Resolve short IDs by fetching OpenRouter /models once on-demand.
    let map = match fetch_openrouter_model_map(&openrouter_key).await {
      Ok(map) => map,
      Err(err) => {
      append_openrouter_assistant_message(
        &conn,
        &state.db_path,
        &thread_id,
        &format!("Engine error: OpenRouter model lookup failed: {}", err),
        selected_model_id,
        &run_id,
        &[],
        None,
        None,
        None,
        OPENROUTER_MAX_TOKENS,
      );
      append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("model_lookup_failed"));
      let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
      return Ok(SendTurnResult {
        thread_id,
        engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
        engine_input_event_id: None,
        engine_input_seq: None,
        run_id: Some(run_id),
      });
    }
  };
  save_openrouter_model_map(&conn, &map);
    match map.get(selected_model_id.trim()).cloned().filter(|v| v.contains('/')) {
      Some(value) => value,
      None => {
        append_openrouter_assistant_message(
          &conn,
          &state.db_path,
          &thread_id,
          &format!(
            "Engine error: Model '{}' is not available for this OpenRouter key.",
            selected_model_id
          ),
          selected_model_id,
          &run_id,
          &[],
          None,
          None,
          None,
          OPENROUTER_MAX_TOKENS,
        );
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("model_unavailable"));
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: None,
          engine_input_seq: None,
          run_id: Some(run_id),
        });
      }
    }
  };

  #[derive(Clone, Serialize)]
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
    content: atom_system_prompt,
  });
  if let Ok(history) = list_messages(&conn, &thread_id) {
    for msg in history.into_iter().rev().take(20).rev() {
      let value: serde_json::Value = serde_json::from_str(&msg.content_json).unwrap_or(serde_json::Value::Null);
      let text = value.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
      if text.is_empty() {
        continue;
      }
      let (redacted, _report) = context::redact_secrets(&text);
      let redacted = redacted.trim().to_string();
      if redacted.is_empty() {
        continue;
      }
      messages.push(OpenRouterMessage {
        role: msg.role,
        content: redacted,
      });
    }
  }
  // Ensure current input is present as the last user message.
  if messages.last().map(|m| m.role.as_str()) != Some("user")
    || messages.last().map(|m| m.content.as_str()) != Some(input_to_send.as_str())
  {
    messages.push(OpenRouterMessage {
      role: "user".to_string(),
      content: input_to_send.clone(),
    });
  }

  let client = reqwest::Client::new();
  let mut request_max_tokens = OPENROUTER_MAX_TOKENS;
  let mut request_attempt: u32 = 1;

  let (res, engine_input_event) = loop {
    let request = OpenRouterRequest {
      model: openrouter_model_id.to_string(),
      messages: messages.clone(),
      max_tokens: request_max_tokens,
      stream: true,
    };
    let request_bytes = serde_json::to_vec(&request)
      .map_err(|e| format!("OpenRouter request serialization failed: {}", e))?;

    let request_blob = blob_store::write_blob(&state.db_path, &request_bytes)
      .map_err(|e| format!("OpenRouter request blob write failed: {}", e))?;
    let _ = db::record_blob(&conn, &request_blob.id, &request_blob.rel_path, request_blob.byte_len);

    let engine_input_payload_str = serde_json::json!({
      "v": 1,
      "engine_id": ENGINE_OPENROUTER_CHAT,
      "provider_id": "openrouter",
      "model_id": selected_model_id,
      "openrouter_model_id": openrouter_model_id,
      "run_id": run_id,
      "attempt": request_attempt,
      "request_format": "openrouter.chat_completions.json",
      "sent_blob_id": request_blob.id,
      "sent_blob_ref": request_blob.rel_path,
      "sent_byte_len": request_blob.byte_len,
      "max_tokens": request_max_tokens,
      "stream": true,
      "input_redaction_report": {
        "blocked": input_report.blocked,
        "redactions": input_report.redactions.iter().map(|(kind, count)| serde_json::json!({"kind": kind, "count": count})).collect::<Vec<_>>()
      }
    }).to_string();

    let engine_input_event = match db::append_event(
      &conn,
      &state.db_path,
      &thread_id,
      "engine_input",
      None,
      Some(&engine_input_payload_str),
      Some(&request_blob.rel_path),
    ) {
      Ok(evt) => evt,
      Err(err) => {
        append_openrouter_assistant_message(
          &conn,
          &state.db_path,
          &thread_id,
          &format!("Storage error: failed to record engine_input: {}", err),
          selected_model_id,
          &run_id,
          &[],
          Some(&openrouter_model_id),
          None,
          None,
          request_max_tokens,
        );
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("engine_input_record_failed"));
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: None,
          engine_input_seq: None,
          run_id: Some(run_id),
        });
      }
    };

    if *cancel_rx.borrow() {
      append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "cancelled", Some("user_cancel"));
      let _ = window.emit(
        "agent-status",
        AgentStatusPayload {
          session_id: thread_id.clone(),
          status: "idle".to_string(),
          tool_name: None,
          tool_args_preview: None,
        },
      );
      let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
      return Ok(SendTurnResult {
        thread_id,
        engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
        engine_input_event_id: Some(engine_input_event.id),
        engine_input_seq: Some(engine_input_event.seq),
        run_id: Some(run_id),
      });
    }

    let send_fut = client
      .post("https://openrouter.ai/api/v1/chat/completions")
      .header("Authorization", format!("Bearer {}", openrouter_key))
      .header("Content-Type", "application/json")
      .body(request_bytes)
      .send();

    let res = tokio::select! {
      _ = cancel_rx.changed() => {
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "cancelled", Some("user_cancel"));
        let _ = window.emit(
          "agent-status",
          AgentStatusPayload {
            session_id: thread_id.clone(),
            status: "idle".to_string(),
            tool_name: None,
            tool_args_preview: None,
          },
        );
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: Some(engine_input_event.id),
          engine_input_seq: Some(engine_input_event.seq),
          run_id: Some(run_id),
        });
      }
      res = send_fut => res,
    };

    let res = match res {
      Ok(res) => res,
      Err(err) => {
        append_openrouter_assistant_message(
          &conn,
          &state.db_path,
          &thread_id,
          &format!("Engine error: OpenRouter request failed: {}", err),
          selected_model_id,
          &run_id,
          &[],
          Some(&openrouter_model_id),
          None,
          None,
          request_max_tokens,
        );
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("openrouter_request_failed"));
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: Some(engine_input_event.id),
          engine_input_seq: Some(engine_input_event.seq),
          run_id: Some(run_id),
        });
      }
    };

    if res.status().is_success() {
      break (res, Some(engine_input_event));
    }

    let status = res.status();
    let resp_bytes = res.bytes().await.unwrap_or_default().to_vec();
    let friendly = format_openrouter_error(&resp_bytes);

    if !resp_bytes.is_empty() {
      if let Ok(resp_blob) = blob_store::write_blob(&state.db_path, &resp_bytes) {
        let _ = db::record_blob(&conn, &resp_blob.id, &resp_blob.rel_path, resp_blob.byte_len);
        let engine_io_payload = serde_json::json!({
          "v": 1,
          "engine_id": ENGINE_OPENROUTER_CHAT,
          "provider_id": "openrouter",
          "model_id": selected_model_id,
          "openrouter_model_id": openrouter_model_id,
          "run_id": run_id,
          "attempt": request_attempt,
          "http_status": status.as_u16(),
          "chunk_blob_id": resp_blob.id,
          "chunk_blob_ref": resp_blob.rel_path,
          "chunk_byte_len": resp_blob.byte_len
        });
        let _ = db::append_event(
          &conn,
          &state.db_path,
          &thread_id,
          "engine_io_chunk",
          None,
          Some(&engine_io_payload.to_string()),
          Some(&resp_blob.rel_path),
        );
      }
    }

    if status.as_u16() == 402 && request_attempt == 1 {
      if let Some(afford) = parse_openrouter_affordable_max_tokens(&friendly) {
        if afford < request_max_tokens {
          request_max_tokens = afford;
          request_attempt = 2;
          continue;
        }
      }
    }

    append_openrouter_assistant_message(
      &conn,
      &state.db_path,
      &thread_id,
      &format!("Engine error: OpenRouter error {}: {}", status.as_u16(), friendly),
      selected_model_id,
      &run_id,
      &[],
      Some(&openrouter_model_id),
      None,
      None,
      request_max_tokens,
    );
    append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("openrouter_http_error"));
    let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
    return Ok(SendTurnResult {
      thread_id,
      engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
      engine_input_event_id: Some(engine_input_event.id),
      engine_input_seq: Some(engine_input_event.seq),
      run_id: Some(run_id),
    });
  };

  let mut seq: u64 = 0;
  let mut chunk_seq: u64 = 0;
  let mut assistant = String::new();
  let mut pending = String::new();
  let mut prompt_tokens: Option<u64> = None;
  let mut completion_tokens: Option<u64> = None;
  let mut evidence_event_ids: Vec<String> = Vec::new();

  let mut stream = res.bytes_stream();
  loop {
    let next = tokio::select! {
      _ = cancel_rx.changed() => {
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "cancelled", Some("user_cancel"));
        let _ = window.emit(
          "agent-status",
          AgentStatusPayload {
            session_id: thread_id.clone(),
            status: "idle".to_string(),
            tool_name: None,
            tool_args_preview: None,
          },
        );
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: engine_input_event.as_ref().map(|evt| evt.id.clone()),
          engine_input_seq: engine_input_event.as_ref().map(|evt| evt.seq),
          run_id: Some(run_id),
        });
      }
      next = stream.next() => next,
    };

    let Some(next) = next else { break };

    let bytes = match next {
      Ok(bytes) => bytes,
      Err(err) => {
        append_openrouter_assistant_message(
          &conn,
          &state.db_path,
          &thread_id,
          &format!("Engine error: OpenRouter stream error: {}", err),
          selected_model_id,
          &run_id,
          &evidence_event_ids,
          Some(&openrouter_model_id),
          prompt_tokens,
          completion_tokens,
          OPENROUTER_MAX_TOKENS,
        );
        append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("openrouter_stream_error"));
        let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
        return Ok(SendTurnResult {
          thread_id,
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          engine_input_event_id: engine_input_event.as_ref().map(|evt| evt.id.clone()),
          engine_input_seq: engine_input_event.as_ref().map(|evt| evt.seq),
          run_id: Some(run_id),
        });
      }
    };
    let (chunk_text, chunk_lossy) = match std::str::from_utf8(&bytes) {
      Ok(s) => (s.to_string(), false),
      Err(_) => (String::from_utf8_lossy(&bytes).to_string(), true),
    };
    pending.push_str(&chunk_text);

    chunk_seq += 1;
    let mut chunk_blob_ref: Option<String> = None;
      let chunk_payload = if chunk_lossy || bytes.len() > IO_BLOB_THRESHOLD_BYTES {
        if let Ok(blob) = blob_store::write_blob(&state.db_path, bytes.as_ref()) {
          chunk_blob_ref = Some(blob.rel_path.clone());
          let _ = db::record_blob(&conn, &blob.id, &blob.rel_path, blob.byte_len);
          serde_json::json!({
            "v": 1,
            "engine_id": ENGINE_OPENROUTER_CHAT,
            "model_id": selected_model_id,
            "openrouter_model_id": openrouter_model_id,
            "run_id": run_id,
            "seq": chunk_seq,
            "chunk_blob_ref": blob.rel_path,
            "chunk_byte_len": blob.byte_len,
            "chunk_text_preview": chunk_text,
          })
        } else {
          serde_json::json!({
            "v": 1,
            "engine_id": ENGINE_OPENROUTER_CHAT,
            "model_id": selected_model_id,
            "openrouter_model_id": openrouter_model_id,
            "run_id": run_id,
            "seq": chunk_seq,
            "chunk": chunk_text,
          })
        }
      } else {
        serde_json::json!({
          "v": 1,
          "engine_id": ENGINE_OPENROUTER_CHAT,
          "model_id": selected_model_id,
          "openrouter_model_id": openrouter_model_id,
          "run_id": run_id,
          "seq": chunk_seq,
          "chunk": chunk_text,
        })
      };
    if let Ok(evt) = db::append_event(
      &conn,
      &state.db_path,
      &thread_id,
      "engine_io_chunk",
      None,
      Some(&chunk_payload.to_string()),
      chunk_blob_ref.as_deref(),
    ) {
      evidence_event_ids.push(evt.id);
    }

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
          run_id: run_id.clone(),
          engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
          model_id: selected_model_id.to_string(),
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
    append_openrouter_assistant_message(
      &conn,
      &state.db_path,
      &thread_id,
      "Engine error: OpenRouter returned an empty response.",
      selected_model_id,
      &run_id,
      &evidence_event_ids,
      Some(&openrouter_model_id),
      prompt_tokens,
      completion_tokens,
      OPENROUTER_MAX_TOKENS,
    );
    append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "error", Some("empty_response"));
    let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
    return Ok(SendTurnResult {
      thread_id,
      engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
      engine_input_event_id: engine_input_event.as_ref().map(|evt| evt.id.clone()),
      engine_input_seq: engine_input_event.as_ref().map(|evt| evt.seq),
      run_id: Some(run_id),
    });
  }

  append_openrouter_assistant_message(
    &conn,
    &state.db_path,
    &thread_id,
    &content,
    selected_model_id,
    &run_id,
    &evidence_event_ids,
    Some(&openrouter_model_id),
    prompt_tokens,
    completion_tokens,
    OPENROUTER_MAX_TOKENS,
  );

  append_run_finished(&conn, &state.db_path, &thread_id, &run_id, "ok", None);
  let _ = window.emit("openrouter-turn-finished", SessionIdPayload { session_id: thread_id.clone() });
  Ok(SendTurnResult {
    thread_id,
    engine_id: ENGINE_OPENROUTER_CHAT.to_string(),
    engine_input_event_id: engine_input_event.as_ref().map(|evt| evt.id.clone()),
    engine_input_seq: engine_input_event.as_ref().map(|evt| evt.seq),
    run_id: Some(run_id),
  })
}

/// Legacy alias for backward compatibility
#[tauri::command]
async fn engine_send_turn_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  thread_id: String,
  cwd: String,
  input: String,
) -> Result<SendTurnResult, String> {
  send_turn_cmd(window, state, thread_id, cwd, input).await
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
    .unwrap_or(ENGINE_OPENROUTER_CHAT);

  let model_id = model_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty());

  if (engine_id == ENGINE_OPENROUTER_CHAT || engine_id == ENGINE_OPENROUTER_MESSAGES_AGENT)
    && model_id.is_none()
  {
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
fn get_event_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  event_id: String,
) -> Result<Option<db::EventRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  db::get_event_by_id(&conn, &thread_id, &event_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_turns_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  limit: usize,
) -> Result<Vec<db::TurnRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  db::list_turns(&conn, &thread_id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn gc_blobs_cmd(state: tauri::State<DbState>) -> Result<db::BlobGcReport, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  db::gc_blobs(&conn, &state.db_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rebuild_projections_cmd(state: tauri::State<DbState>) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  db::rebuild_projections(&conn).map_err(|e| e.to_string())
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
    "v": 1,
    "workspace_path": cleaned,
  });
  let _ = db::append_event(
    &conn,
    &state.db_path,
    &thread_id,
    "thread_metadata_changed",
    Some("workspace_path"),
    Some(&payload.to_string()),
    None,
  );
  Ok(())
}

#[tauri::command]
fn set_thread_community_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  community_id: Option<String>,
) -> Result<db::ThreadRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let cleaned = community_id.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty());
  set_thread_community_id(&conn, &thread_id, cleaned).map_err(|e| e.to_string())?;
  let payload = serde_json::json!({
    "v": 1,
    "community_id": cleaned,
  });
  let _ = db::append_event(
    &conn,
    &state.db_path,
    &thread_id,
    "thread_metadata_changed",
    Some("community_id"),
    Some(&payload.to_string()),
    None,
  );

  get_thread_by_id(&conn, &thread_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "thread not found".to_string())
}

#[tauri::command]
fn set_thread_engine_cmd(
  state: tauri::State<DbState>,
  thread_id: String,
  engine_id: String,
  model_id: Option<String>,
) -> Result<db::ThreadRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let cleaned_engine = engine_id.trim();
  if cleaned_engine.is_empty() {
    return Err("engine_id is required".to_string());
  }
  let cleaned_model = model_id.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty());
  let requires_model = cleaned_engine == ENGINE_OPENROUTER_CHAT
    || cleaned_engine == ENGINE_OPENROUTER_MESSAGES_AGENT;
  let final_model = if requires_model {
    cleaned_model.ok_or_else(|| "model_id is required for OpenRouter".to_string())?
  } else {
    ""
  };

  set_thread_engine_model(
    &conn,
    &thread_id,
    cleaned_engine,
    if requires_model { Some(final_model) } else { None },
  )
  .map_err(|e| e.to_string())?;

  let payload = serde_json::json!({
    "v": 1,
    "engine_id": cleaned_engine,
    "model_id": if requires_model { Some(final_model) } else { None },
  });
  let _ = db::append_event(
    &conn,
    &state.db_path,
    &thread_id,
    "thread_metadata_changed",
    Some("engine"),
    Some(&payload.to_string()),
    None,
  );

  get_thread_by_id(&conn, &thread_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "thread not found".to_string())
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
  thread_id: Option<String>,
  content: String,
  scope: String,
  scope_id: Option<String>,
  pinned: Option<bool>,
  provenance_event_id: Option<String>,
) -> Result<db::PersonalMemoryItemRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let record = create_personal_memory_item(
    &conn,
    &content,
    &scope,
    scope_id.as_deref(),
    pinned.unwrap_or(false),
    provenance_event_id.as_deref(),
  )
  .map_err(|e| e.to_string())?;

  let thread_id = thread_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .unwrap_or(db::SYSTEM_THREAD_ID);
  let _ = db::ensure_system_thread(&conn);
  append_memory_write_event(
    &conn,
    &state.db_path,
    thread_id,
    "create",
    &record,
    provenance_event_id.as_deref(),
  );

  Ok(record)
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
  thread_id: Option<String>,
  id: String,
  pinned: bool,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  set_personal_memory_item_pinned(&conn, &id, pinned).map_err(|e| e.to_string())?;
  let thread_id = thread_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .unwrap_or(db::SYSTEM_THREAD_ID);
  let _ = db::ensure_system_thread(&conn);
  if let Ok(Some(item)) = db::get_personal_memory_item_by_id(&conn, &id) {
    append_memory_write_event(&conn, &state.db_path, thread_id, "pin", &item, None);
  }
  Ok(())
}

#[tauri::command]
fn delete_personal_memory_item_cmd(
  state: tauri::State<DbState>,
  thread_id: Option<String>,
  id: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let before = db::get_personal_memory_item_by_id(&conn, &id)
    .map_err(|e| e.to_string())?;
  delete_personal_memory_item(&conn, &id).map_err(|e| e.to_string())?;
  let thread_id = thread_id
    .as_deref()
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .unwrap_or(db::SYSTEM_THREAD_ID);
  let _ = db::ensure_system_thread(&conn);
  if let Some(item) = before {
    append_memory_write_event(&conn, &state.db_path, thread_id, "delete", &item, None);
  }
  Ok(())
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
      enabled: true,
    },
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

#[derive(Serialize)]
struct ModelAvailability {
  id: String,
  available: bool,
}

#[tauri::command]
async fn refresh_openrouter_models_cmd(
  state: tauri::State<'_, DbState>,
) -> Result<Vec<ModelAvailability>, String> {
  let openrouter_key = {
    let entry = Entry::new("com.arx.app", "openrouter").map_err(|e| e.to_string())?;
    entry
      .get_password()
      .map_err(|_| "Missing API key. Add it in Settings.".to_string())?
  };

  let map = fetch_openrouter_model_map(&openrouter_key).await?;
  {
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    save_openrouter_model_map(&conn, &map);
  }

  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let value = get_ui_state(&conn, "model_toggles")
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| "[]".to_string());
  let mut toggles: Vec<ModelToggle> = serde_json::from_str(&value).unwrap_or_default();
  if toggles.is_empty() {
    toggles = default_model_toggles();
  }

  Ok(
    toggles
      .into_iter()
      .map(|t| ModelAvailability {
        id: t.id.clone(),
        available: map.get(&t.id).map(|v| v.contains('/')).unwrap_or(false),
      })
      .collect(),
  )
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
    // Persist defaults for a stable first-run UX after DB resets.
    if let Ok(serialized) = serde_json::to_string(&parsed) {
      let _ = set_ui_state(&conn, "model_toggles", &serialized);
    }
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

const UI_STATE_PENDING_INVITES_V1: &str = "pending_invites_v1";
const MAX_INVITE_KEY_LEN: usize = 128;

#[derive(Clone, Serialize, Deserialize)]
struct PendingInviteRecord {
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
  let Some(raw) = get_ui_state(conn, UI_STATE_PENDING_INVITES_V1).ok().flatten() else {
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
  set_ui_state(conn, UI_STATE_PENDING_INVITES_V1, &value).map_err(|e| e.to_string())
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
fn list_pending_invites_cmd(state: tauri::State<DbState>) -> Result<Vec<PendingInviteRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  Ok(load_pending_invites(&conn))
}

#[tauri::command]
fn upsert_pending_invite_cmd(
  state: tauri::State<DbState>,
  invite_key: String,
  source: Option<String>,
) -> Result<(), String> {
  let Some(invite_key) = normalize_invite_key(&invite_key) else {
    return Err("invite_key is required".to_string());
  };
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let now = db::now_ts();

  let mut invites = load_pending_invites(&conn);
  if let Some(existing) = invites.iter_mut().find(|item| item.invite_key == invite_key) {
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
fn dismiss_pending_invite_cmd(state: tauri::State<DbState>, invite_key: String) -> Result<(), String> {
  let Some(invite_key) = normalize_invite_key(&invite_key) else {
    return Err("invite_key is required".to_string());
  };
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let now = db::now_ts();

  let mut invites = load_pending_invites(&conn);
  if let Some(existing) = invites.iter_mut().find(|item| item.invite_key == invite_key) {
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
fn request_join_pending_invite_cmd(
  state: tauri::State<DbState>,
  invite_key: String,
) -> Result<(), String> {
  let Some(invite_key) = normalize_invite_key(&invite_key) else {
    return Err("invite_key is required".to_string());
  };
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let now = db::now_ts();

  let mut invites = load_pending_invites(&conn);
  if let Some(existing) = invites.iter_mut().find(|item| item.invite_key == invite_key) {
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
fn mark_pending_invite_joined_cmd(
  state: tauri::State<DbState>,
  invite_key: String,
  community_id: Option<String>,
  community_name: Option<String>,
) -> Result<(), String> {
  let Some(invite_key) = normalize_invite_key(&invite_key) else {
    return Err("invite_key is required".to_string());
  };
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let now = db::now_ts();

  let mut invites = load_pending_invites(&conn);
  if let Some(existing) = invites.iter_mut().find(|item| item.invite_key == invite_key) {
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
fn mark_pending_invite_expired_cmd(
  state: tauri::State<DbState>,
  invite_key: String,
) -> Result<(), String> {
  let Some(invite_key) = normalize_invite_key(&invite_key) else {
    return Err("invite_key is required".to_string());
  };
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let now = db::now_ts();

  let mut invites = load_pending_invites(&conn);
  if let Some(existing) = invites.iter_mut().find(|item| item.invite_key == invite_key) {
    if existing.status != "joined" {
      existing.status = "expired".to_string();
    }
    existing.expired_at = Some(now);
    existing.join_intent_at = None;
    existing.updated_at = now;
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

  // Happy path: existing target can be canonicalized.
  if let Ok(cwd_canon) = cwd_path.canonicalize() {
    return cwd_canon.starts_with(&root_canon);
  }

  // Allow non-existent paths (e.g. creating new files/dirs) by canonicalizing the nearest
  // existing ancestor and then appending the non-existent suffix.
  let mut cursor = cwd_path;
  let mut suffix: Vec<std::ffi::OsString> = Vec::new();
  loop {
    if let Ok(cursor_canon) = cursor.canonicalize() {
      let mut reconstructed = cursor_canon;
      for part in suffix.iter().rev() {
        reconstructed.push(part);
      }
      return reconstructed.starts_with(&root_canon);
    }

    let Some(name) = cursor.file_name().map(|v| v.to_os_string()) else {
      return false;
    };
    suffix.push(name);
    let Some(parent) = cursor.parent() else {
      return false;
    };
    cursor = parent;
  }
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
  let app = tauri::Builder::default()
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
          // Crash recovery reconciliation: ensure interrupted runs/tool calls are marked as finished.
          let _ = db::crash_recovery(&conn, &state.db_path);
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
      delete_thread_cmd,
      list_threads_cmd,
      get_thread_cmd,
      list_events_cmd,
      get_event_cmd,
      list_turns_cmd,
      gc_blobs_cmd,
      rebuild_projections_cmd,
      list_tools_cmd,
      get_agent_mode_cmd,
      set_agent_mode_cmd,
      respond_permission_cmd,
      decide_tool_call_cmd,
      get_auto_approve_write_edit_cmd,
      set_auto_approve_write_edit_cmd,
      cancel_run_cmd,
      send_turn_cmd,
      engine_send_turn_cmd,
	      get_supabase_session_cmd,
	      set_supabase_session_cmd,
	      clear_supabase_session_cmd,
	      list_pending_invites_cmd,
	      upsert_pending_invite_cmd,
	      dismiss_pending_invite_cmd,
	      request_join_pending_invite_cmd,
	      mark_pending_invite_joined_cmd,
	      mark_pending_invite_expired_cmd,
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
      refresh_openrouter_models_cmd,
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
      ingest_attachment_cmd,
      set_thread_workspace_cmd,
      set_thread_community_cmd,
      set_thread_engine_cmd
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    match event {
      #[cfg(target_os = "macos")]
      tauri::RunEvent::Opened { urls } => {
        #[derive(Clone, serde::Serialize)]
        struct OpenedUrlsPayload {
          urls: Vec<String>,
        }

        let payload = OpenedUrlsPayload {
          urls: urls.into_iter().map(|url| url.to_string()).collect(),
        };

        let _ = app_handle.emit("app-opened-urls", payload);
      }
      _ => {}
    }
  });
}
