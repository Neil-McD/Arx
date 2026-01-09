#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod agent;
mod apply_patch;
mod attachments;
mod cancellation;
mod context;
mod exec_policy;
mod logging;
mod memory_templates;
mod permissions;
mod pty_sessions;
mod tool_handlers;
mod workspace_paths;

use db::{
  add_message, append_audit_log, create_memory_note, create_session, get_session_resume, get_tool_call,
  get_tool_call_status, get_ui_state, list_audit_log, list_messages, list_sessions,
  list_tool_calls, list_tool_calls_by_status_since, list_memory_blocks, open_conn, propose_tool_call, set_ui_state,
  update_memory_block_direct, update_tool_call_output, update_tool_call_status, update_working_set_last_action, DbState, delete_ui_state, get_project_by_id,
  upsert_project, ensure_memory_block,
};
use tool_handlers::{build_default_registry, telemetry_preview, ToolContext};
use exec_policy::policy_manager;
use permissions::{grant_tool_call_permission, is_tool_call_allowed, parse_response_or_err, permission_response_to_scope, PermissionResponse};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use keyring::Entry;
use once_cell::sync::Lazy;
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;

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
  let output = Command::new("git")
    .arg("-C")
    .arg(dir)
    .args(args)
    .output()
    .ok()?;
  if !output.status.success() {
    return None;
  }
  let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if value.is_empty() {
    None
  } else {
    Some(value)
  }
}

#[tauri::command]
fn list_tools_cmd() -> Result<Vec<ToolUiSpec>, String> {
  let registry = build_default_registry();
  let mut out = Vec::new();
  for spec in registry.specs() {
    let name = spec.name.to_string();
    out.push(ToolUiSpec {
      name: name.clone(),
      description: spec.description.to_string(),
      parameters: spec.parameters.clone(),
      requires_approval: registry.requires_approval(&name),
      auto_apply: registry.auto_apply(&name),
      parallel_safe: registry.is_parallel_safe(&name),
    });
  }
  Ok(out)
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
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  agent_state: tauri::State<'_, agent::AgentState>,
  session_id: String,
  model_id: String,
  tool_call_id: String,
  response: String, // once | session | always | reject
  cwd: String,
) -> Result<String, String> {
  let resp = parse_response_or_err(&response)?;
  match resp {
    PermissionResponse::Reject => {
      reject_tool_call_cmd(
        window,
        state,
        agent_state,
        session_id,
        model_id,
        tool_call_id,
        Some("rejected by user".to_string()),
        cwd,
      )
      .await
    }
    PermissionResponse::Once => {
      approve_and_run_tool_call_cmd(window, state, agent_state, session_id, model_id, tool_call_id, cwd).await
    }
    PermissionResponse::Session | PermissionResponse::Always => {
      let scope = permission_response_to_scope(resp).ok_or_else(|| "invalid scope".to_string())?;
      let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
      let _pattern = grant_tool_call_permission(&conn, &session_id, &tool_call_id, scope)?;
      drop(conn);

      approve_and_run_tool_call_cmd(window, state, agent_state, session_id, model_id, tool_call_id, cwd).await
    }
  }
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
    let rel = canonical
      .strip_prefix(root_pathbuf)
      .unwrap_or_else(|_| Path::new(""));
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

fn ensure_memory_blocks_for_scope(
  conn: &rusqlite::Connection,
  templates: &[memory_templates::MemoryBlockTemplate],
  scope: &str,
  scope_id: Option<&str>,
) -> Result<(), String> {
  for template in templates {
    if template.scope != scope {
      continue;
    }
    ensure_memory_block(
      conn,
      &template.label,
      &template.scope,
      scope_id,
      &template.value,
      &template.format,
      template.char_limit,
      template.read_only,
      &template.egress_policy,
      template.description.as_deref(),
    )
    .map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn create_session_cmd(state: tauri::State<DbState>, title: String) -> Result<db::SessionRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let session = create_session(&conn, &title).map_err(|e| e.to_string())?;
  if let Some(root) = get_ui_state(&conn, "memory_templates_root").map_err(|e| e.to_string())? {
    let templates = memory_templates::load_templates(Path::new(&root))?;
    ensure_memory_blocks_for_scope(&conn, &templates, "session", Some(&session.id))?;
  }
  Ok(session)
}

#[tauri::command]
fn list_sessions_cmd(state: tauri::State<DbState>) -> Result<Vec<db::SessionRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_sessions(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_session_cmd(session_id: String) -> Result<bool, String> {
  let cancelled = cancellation::cancellation_manager()
    .cancel(&session_id)
    .await;
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
  Ok(is_within_root(&workspace_root, resolved.to_string_lossy().as_ref()))
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
      if let Some(root) = get_ui_state(&conn, "memory_templates_root").map_err(|e| e.to_string())? {
        let templates = memory_templates::load_templates(Path::new(&root))?;
        ensure_memory_blocks_for_scope(&conn, &templates, "project", Some(&value))?;
      }
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
    set_ui_state(&conn, "active_project_id", &project.id).map_err(|e| e.to_string())?;
    let _ = delete_ui_state(&conn, "active_project_path");
    return Ok(Some(project));
  }

  Ok(None)
}

#[tauri::command]
fn list_projects_cmd(
  state: tauri::State<DbState>,
) -> Result<Vec<db::ProjectRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let mut entries = HashMap::new();
  let dir = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
  for entry in dir {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if path.is_dir() {
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
      entries.insert(record.id.clone(), record);
    }
  }
  let mut out: Vec<db::ProjectRecord> = entries.into_values().collect();
  out.sort_by(|a, b| {
    let name_a = a.name.as_deref().unwrap_or("");
    let name_b = b.name.as_deref().unwrap_or("");
    name_a
      .cmp(name_b)
      .then_with(|| a.root_path.cmp(&b.root_path))
  });
  Ok(out)
}

#[tauri::command]
fn create_project_cmd(
  state: tauri::State<DbState>,
  name: String,
) -> Result<db::ProjectRecord, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("project name required".to_string());
  }
  if trimmed.contains(std::path::MAIN_SEPARATOR) || trimmed.contains('/') || trimmed.contains('\\') {
    return Err("project name must not contain path separators".to_string());
  }
  if trimmed == "." || trimmed == ".." {
    return Err("invalid project name".to_string());
  }

  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
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

  if let Some(root) = get_ui_state(&conn, "memory_templates_root").map_err(|e| e.to_string())? {
    let templates = memory_templates::load_templates(Path::new(&root))?;
    ensure_memory_blocks_for_scope(&conn, &templates, "project", Some(&record.id))?;
  }

  Ok(record)
}
#[tauri::command]
fn list_tool_calls_cmd(
  state: tauri::State<DbState>,
  session_id: String,
) -> Result<Vec<db::ToolCallRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_tool_calls(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_audit_log_cmd(
  state: tauri::State<DbState>,
  session_id: String,
) -> Result<Vec<db::AuditRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_audit_log(&conn, &session_id).map_err(|e| e.to_string())
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
fn list_memory_blocks_cmd(
  state: tauri::State<DbState>,
  scope: String,
  scope_id: Option<String>,
) -> Result<Vec<db::MemoryBlockRecord>, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  list_memory_blocks(&conn, &scope, scope_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_memory_note_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  title: String,
  body_md: String,
  tags: Option<Vec<String>>,
) -> Result<db::MemoryNoteRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  create_memory_note(&conn, &title, &body_md, Some(&session_id), tags)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_memory_block_update_cmd(
  state: tauri::State<DbState>,
  session_id: Option<String>,
  label: String,
  scope: Option<String>,
  scope_id: Option<String>,
  value: String,
  rationale: Option<String>,
) -> Result<db::MemoryBlockRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let label = label.trim().to_string();
  if label.is_empty() {
    return Err("memory block label required".to_string());
  }
  let allowed = matches!(label.as_str(), "persona" | "preferences" | "codebase_context");
  if !allowed {
    return Err("memory block label not allowed for update".to_string());
  }
  let mut scope = scope.unwrap_or_default().trim().to_string();
  if scope.is_empty() {
    scope = if label == "codebase_context" {
      "project".to_string()
    } else {
      "global".to_string()
    };
  }
  if label == "codebase_context" && scope != "project" {
    return Err("codebase_context must use project scope".to_string());
  }
  if (label == "persona" || label == "preferences") && scope != "global" {
    return Err("persona/preferences must use global scope".to_string());
  }
  let resolved_scope_id = if scope == "project" {
    if let Some(id) = scope_id {
      Some(id)
    } else {
      get_ui_state(&conn, "active_project_id")
        .map_err(|e| e.to_string())?
    }
  } else {
    None
  };
  if scope == "project" && resolved_scope_id.is_none() {
    return Err("project scope requires scope_id or active project".to_string());
  }
  let _ = session_id;
  let _ = rationale;
  update_memory_block_direct(
    &conn,
    &label,
    &scope,
    resolved_scope_id.as_deref(),
    &value,
  )
  .map_err(|e| e.to_string())
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
      label: "GPT-5.1".to_string(),
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
      id: "gpt-5.2".to_string(),
      label: "GPT-5.2".to_string(),
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
fn set_exec_policy_rules_cmd(
  state: tauri::State<DbState>,
  rules: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  if rules.len() > 10000 {
    return Err("rules too large".to_string());
  }
  if exec_policy::parse_rules(&rules).is_err() {
    return Err("invalid rules format".to_string());
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
  if !rules.trim().is_empty() && exec_policy::parse_rules(&rules).is_err() {
    return Err("invalid rules format".to_string());
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
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let global_rules = get_ui_state(&conn, "exec_policy_rules")
    .map_err(|e| e.to_string())?
    .unwrap_or_default();
  let session_key = format!("exec_policy_session_rules::{}", session_id);
  let session_rules = get_ui_state(&conn, &session_key)
    .map_err(|e| e.to_string())?
    .unwrap_or_default();
  let parsed_global = exec_policy::parse_rules(&global_rules).unwrap_or_default();
  let parsed_session = exec_policy::parse_rules(&session_rules).unwrap_or_default();
  let tokens = exec_policy::shell_split(&command);
  // Session rules > Global rules > Default safe rules
  let mut combined = Vec::new();
  combined.extend(parsed_session);
  combined.extend(parsed_global);
  combined.extend(exec_policy::default_rules());
  let result = exec_policy::classify_command_with_reason(&tokens, &combined);
  Ok(ExecPolicyDecision {
    decision: exec_policy::decision_as_str(result.decision).to_string(),
    reason: result.reason,
    matched_rule: result.matched_rule,
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
fn export_event_log_cmd(
  state: tauri::State<DbState>,
  session_id: String,
) -> Result<String, String> {
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

#[derive(Serialize, Clone)]
struct OpenAiMessage {
  role: String,
  content: String,
}

#[derive(Serialize)]
struct OpenAiRequest {
  model: String,
  messages: Vec<OpenAiMessage>,
  temperature: f32,
}

#[derive(Deserialize)]
struct OpenAiResponse {
  choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
  message: OpenAiChoiceMessage,
}

#[derive(Deserialize)]
struct OpenAiChoiceMessage {
  content: String,
}

#[derive(Serialize)]
struct AnthropicRequest {
  model: String,
  max_tokens: u32,
  temperature: f32,
  messages: Vec<AnthropicMessage>,
  #[serde(skip_serializing_if = "Option::is_none")]
  system: Option<String>,
}

#[derive(Serialize)]
struct AnthropicMessage {
  role: String,
  content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
struct AnthropicContent {
  #[serde(rename = "type")]
  kind: String,
  text: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
  content: Vec<AnthropicContentResponse>,
}

#[derive(Deserialize)]
struct AnthropicContentResponse {
  text: String,
}

#[derive(Serialize)]
struct GeminiRequest {
  contents: Vec<GeminiContent>,
  #[serde(skip_serializing_if = "Option::is_none")]
  system_instruction: Option<GeminiContent>,
}

#[derive(Serialize)]
struct GeminiContent {
  role: String,
  parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiPart {
  text: String,
}

#[derive(Deserialize)]
struct GeminiResponse {
  candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
  content: GeminiContentResponse,
}

#[derive(Deserialize)]
struct GeminiContentResponse {
  parts: Vec<GeminiPartResponse>,
}

#[derive(Deserialize)]
struct GeminiPartResponse {
  text: Option<String>,
}

#[tauri::command]
async fn generate_assistant_message_cmd(
  _state: tauri::State<'_, DbState>,
  agent_state: tauri::State<'_, agent::AgentState>,
  session_id: String,
  model_id: String,
  cwd: String,
) -> Result<String, String> {
  agent::submit_turn(&agent_state, session_id, model_id, cwd).await
}

#[tauri::command]
fn propose_tool_call_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  tool_name: String,
  args_json: String,
  risk_level: String,
  command_preview_redacted: String,
) -> Result<db::ToolCallRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let record = propose_tool_call(
    &conn,
    &session_id,
    &tool_name,
    &args_json,
    &risk_level,
    &command_preview_redacted,
    None,
  )
  .map_err(|e| e.to_string())?;
  let _ = logging::append_event(
    &state.db_path,
    logging::LogEvent::ToolProposed {
      session_id,
      tool_call_id: record.id.clone(),
      tool_name: record.tool_name.clone(),
    },
  );
  Ok(record)
}

fn approve_tool_call_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  risk_level: &str,
) -> Result<db::ToolCallRecord, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let tool_record = get_tool_call(&conn, tool_call_id).map_err(|e| e.to_string())?;
  update_tool_call_status(&conn, tool_call_id, "approved").map_err(|e| e.to_string())?;
  append_audit_log(
    &conn,
    session_id,
    "approve",
    Some(&tool_record.tool_name),
    risk_level,
    1,
    None,
    None,
    None,
  )
  .map_err(|e| e.to_string())?;
  let _ = logging::append_event(
    &state.db_path,
    logging::LogEvent::ToolApproved {
      session_id: session_id.to_string(),
      tool_call_id: tool_call_id.to_string(),
      tool_name: tool_record.tool_name.clone(),
    },
  );
  Ok(tool_record)
}

#[tauri::command]
fn approve_tool_call_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  tool_call_id: String,
) -> Result<(), String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let tool_record = get_tool_call(&conn, &tool_call_id).map_err(|e| e.to_string())?;
  let registry = build_default_registry();
  let risk_level = registry
    .get(&tool_record.tool_name)
    .map(|h| if h.requires_approval() { "high" } else { "low" })
    .unwrap_or("high");
  approve_tool_call_impl(&state, &session_id, &tool_call_id, risk_level).map(|_| ())
}

#[derive(Deserialize)]
struct OrchestratorShellArgs {
  #[serde(default)]
  command: String,
  #[serde(default)]
  shell: Option<String>,
  #[serde(default)]
  cwd: Option<String>,
  #[serde(default)]
  workdir: Option<String>,
  #[serde(default)]
  timeout_ms: Option<u64>,
}

/// Backend-driven approval→execute→agent-followup.
///
/// This replaces UI-side stitching of:
/// approve_tool_call_cmd → execute tool cmd → submit_tool_output_cmd.
/// Maximum number of auto-exec continuation iterations in the orchestrator loop.
const MAX_ORCHESTRATOR_ITERATIONS: u32 = 10;

/// Build a ToolContext for registry dispatch.
fn build_tool_context(
  state: &DbState,
  session_id: &str,
  cwd: &str,
) -> Result<ToolContext, String> {
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let project_id = get_ui_state(&conn, "active_project_id")
    .map_err(|e| e.to_string())?;

  Ok(ToolContext {
    session_id: session_id.to_string(),
    cwd: cwd.to_string(),
    workspace_root: Some(workspace_root),
    project_id,
    db_path: state.db_path.clone(),
    db_key: state.key.clone(),
  })
}

/// Execute a single tool call and return (command_for_agent, output_for_agent).
async fn execute_tool_for_orchestrator(
  window: tauri::Window,
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  tool_name: &str,
  args_json: &str,
  cwd: &str,
) -> Result<(String, String), String> {
  if tool_name == "run_shell_command" {
    let args: OrchestratorShellArgs = serde_json::from_str(args_json).map_err(|e| e.to_string())?;
    let shell = args.shell.unwrap_or_else(|| "zsh".to_string());
    let effective_cwd = args.cwd.or(args.workdir).unwrap_or_else(|| cwd.to_string());
    if args.command.trim().is_empty() {
      return Err("command is empty".to_string());
    }
    let result = run_shell_command_wait_impl(
      window,
      state,
      session_id,
      tool_call_id,
      &args.command,
      &shell,
      &effective_cwd,
      args.timeout_ms,
    )
    .await?;
    return Ok((args.command, result.output_excerpt));
  }

  let registry = build_default_registry();
  let handler = registry
    .get(tool_name)
    .ok_or_else(|| format!("unsupported tool for orchestrator: {}", tool_name))?;
  if handler.auto_apply() {
    return Err("unexpected auto-apply tool in orchestrator".to_string());
  }

  let ctx = build_tool_context(state, session_id, cwd)?;
  let risk_level = if handler.requires_approval() { "high" } else { "low" };
  let recorded = tool_handlers::execute_and_record_tool_call(
    &state.db_path,
    &state.key,
    session_id,
    tool_call_id,
    tool_name,
    args_json,
    &ctx.cwd,
    ctx.workspace_root.clone(),
    ctx.project_id.clone(),
    risk_level,
    true,
  )
  .await?;

  Ok((tool_name.to_string(), recorded.content))
}

// Legacy orchestrator helpers from earlier iterations. Kept behind a feature flag for now to
// avoid drift and reduce maintenance surface. All execution should flow through tool handlers.
#[cfg(feature = "legacy_orchestrator_helpers")]
mod legacy_orchestrator_helpers {
  use super::*;

fn resolve_workspace_write_path(
  workspace_root: &str,
  cwd: &str,
  file_path: &str,
) -> Result<std::path::PathBuf, String> {
  let file_path = file_path.trim();
  if file_path.is_empty() {
    return Err("file_path is empty".to_string());
  }

  let rel = std::path::Path::new(file_path);
  let root_canon = std::path::Path::new(workspace_root)
    .canonicalize()
    .map_err(|e| format!("invalid workspace root: {}", e))?;

  let cwd_canon = std::path::Path::new(cwd)
    .canonicalize()
    .map_err(|e| format!("invalid cwd: {}", e))?;
  if !cwd_canon.starts_with(&root_canon) {
    return Err("cwd outside workspace root".to_string());
  }

  if rel.is_absolute() {
    let target = rel.to_path_buf();
    if !target.starts_with(&root_canon) {
      return Err("path outside workspace root".to_string());
    }
    let rel_to_root = target
      .strip_prefix(&root_canon)
      .map_err(|_| "path outside workspace root".to_string())?;
    let mut joined = root_canon.clone();
    for component in rel_to_root.components() {
      match component {
        std::path::Component::CurDir => {}
        std::path::Component::Normal(seg) => {
          joined.push(seg);
          if let Ok(meta) = std::fs::symlink_metadata(&joined) {
            if meta.file_type().is_symlink() {
              return Err("symlink segments are not allowed".to_string());
            }
          }
        }
        std::path::Component::ParentDir => {
          if joined == root_canon {
            return Err("path escapes workspace root".to_string());
          }
          joined.pop();
        }
        std::path::Component::RootDir | std::path::Component::Prefix(_) => {
          return Err("unsupported path component".to_string());
        }
      }
    }
    return Ok(joined);
  }

  // Resolve relative to the current working directory, while preventing
  // escapes above the workspace root.
  let mut joined = cwd_canon.clone();
  for component in rel.components() {
    match component {
      std::path::Component::CurDir => {}
      std::path::Component::Normal(seg) => {
        joined.push(seg);
        if let Ok(meta) = std::fs::symlink_metadata(&joined) {
          if meta.file_type().is_symlink() {
            return Err("symlink segments are not allowed".to_string());
          }
        }
      }
      std::path::Component::ParentDir => {
        if joined == root_canon {
          return Err("path escapes workspace root".to_string());
        }
        joined.pop();
      }
      std::path::Component::RootDir | std::path::Component::Prefix(_) => {
        return Err("unsupported path component".to_string());
      }
    }
  }

  if !joined.starts_with(&root_canon) {
    return Err("path escapes workspace root".to_string());
  }

  Ok(joined)
}

fn resolve_workspace_existing_path(
  workspace_root: &str,
  cwd: &str,
  file_path: &str,
  allow_final_symlink: bool,
) -> Result<std::path::PathBuf, String> {
  let file_path = file_path.trim();
  if file_path.is_empty() {
    return Err("file_path is empty".to_string());
  }

  let rel = std::path::Path::new(file_path);
  let root_canon = std::path::Path::new(workspace_root)
    .canonicalize()
    .map_err(|e| format!("invalid workspace root: {}", e))?;
  let cwd_canon = std::path::Path::new(cwd)
    .canonicalize()
    .map_err(|e| format!("invalid cwd: {}", e))?;
  if !cwd_canon.starts_with(&root_canon) {
    return Err("cwd outside workspace root".to_string());
  }

  let (base, rel_components): (std::path::PathBuf, Vec<std::path::Component<'_>>) = if rel.is_absolute() {
    if !rel.starts_with(&root_canon) {
      return Err("path outside workspace root".to_string());
    }
    let rel_to_root = rel
      .strip_prefix(&root_canon)
      .map_err(|_| "path outside workspace root".to_string())?;
    (root_canon.clone(), rel_to_root.components().collect())
  } else {
    (cwd_canon.clone(), rel.components().collect())
  };

  let total = rel_components.len();
  let mut joined = base;
  for (idx, component) in rel_components.into_iter().enumerate() {
    let is_last = idx + 1 == total;
    match component {
      std::path::Component::CurDir => {}
      std::path::Component::Normal(seg) => {
        joined.push(seg);
        if let Ok(meta) = std::fs::symlink_metadata(&joined) {
          if meta.file_type().is_symlink() && !(allow_final_symlink && is_last) {
            return Err("symlink segments are not allowed".to_string());
          }
        }
      }
      std::path::Component::ParentDir => {
        if joined == root_canon {
          return Err("path escapes workspace root".to_string());
        }
        joined.pop();
      }
      std::path::Component::RootDir | std::path::Component::Prefix(_) => {
        return Err("unsupported path component".to_string());
      }
    }
  }

  if !joined.starts_with(&root_canon) {
    return Err("path escapes workspace root".to_string());
  }

  Ok(joined)
}

fn record_simple_success(
  conn: &rusqlite::Connection,
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  tool_name: &str,
  risk_level: &str,
  summary: &str,
  duration_ms: i64,
) -> Result<(), String> {
  let (redacted, report) = context::redact_secrets(summary);
  if report.blocked {
    record_tool_failure(
      conn,
      &state.db_path,
      session_id,
      tool_call_id,
      tool_name,
      risk_level,
      "blocked: sensitive content detected",
      duration_ms as u64,
    );
    return Err("blocked: sensitive content detected".to_string());
  }

  let excerpt = truncate_chars_for_excerpt(&redacted, 8000);
  let summary_obj = build_output_summary(0, duration_ms as u64, excerpt.as_str(), &report);
  let summary_json = serde_json::to_string(&summary_obj).unwrap_or_else(|_| "{}".to_string());

  let _ = update_tool_call_status(conn, tool_call_id, "executed");
  let _ = update_tool_call_output(
    conn,
    tool_call_id,
    Some(&summary_json),
    if excerpt.is_empty() { None } else { Some(excerpt.as_str()) },
    None,
    Some(0),
    Some(duration_ms),
    None,
    Some("redact_then_send"),
  );
  let _ = append_audit_log(
    conn,
    session_id,
    "execute",
    Some(tool_name),
    risk_level,
    1,
    None,
    None,
    None,
  );
  let _ = logging::append_event(
    &state.db_path,
    logging::LogEvent::ToolExecuted {
      session_id: session_id.to_string(),
      tool_call_id: tool_call_id.to_string(),
      tool_name: tool_name.to_string(),
    },
  );
  Ok(())
}

fn write_file_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  file_path: &str,
  content: &str,
  mode: &str,
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  let target = resolve_workspace_write_path(&workspace_root, cwd, file_path)?;

  if mode == "create" && target.exists() {
    record_tool_failure(
      &conn,
      &state.db_path,
      session_id,
      tool_call_id,
      "write_file",
      "high",
      "file already exists",
      0,
    );
    return Err("file already exists".to_string());
  }
  if mode != "create" && mode != "overwrite" && mode != "append" && mode != "prepend" {
    return Err("invalid mode (expected 'create', 'overwrite', 'append', or 'prepend')".to_string());
  }

  if let Some(parent) = target.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  match mode {
    "append" => {
      use std::io::Write;
      let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&target)
        .map_err(|e| e.to_string())?;
      file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    }
    "prepend" => {
      let existing = std::fs::read(&target).unwrap_or_default();
      let mut combined = Vec::with_capacity(content.as_bytes().len() + existing.len());
      combined.extend_from_slice(content.as_bytes());
      combined.extend_from_slice(&existing);
      std::fs::write(&target, combined).map_err(|e| e.to_string())?;
    }
    _ => {
      std::fs::write(&target, content).map_err(|e| e.to_string())?;
    }
  }

  let bytes = content.as_bytes().len();
  let summary = format!("Wrote {} ({} bytes, mode: {})", target.display(), bytes, mode);

  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "write_file", "high", &summary, duration_ms)?;

  Ok(summary)
}

fn edit_file_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  file_path: &str,
  edits: &[OrchestratorEdit],
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  if edits.is_empty() {
    return Err("edits is empty".to_string());
  }

  let target = resolve_workspace_write_path(&workspace_root, cwd, file_path)?;
  let meta = std::fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
  if meta.file_type().is_symlink() {
    return Err("refusing to edit symlink".to_string());
  }
  if !target.exists() {
    return Err("file not found".to_string());
  }

  let mut content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
  let (next, total_replacements) = apply_string_edits(&content, edits)?;
  content = next;

  std::fs::write(&target, content).map_err(|e| e.to_string())?;

  let summary = format!(
    "Edited {} ({} replacement(s) applied)",
    target.display(),
    total_replacements
  );

  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "edit_file", "high", &summary, duration_ms)?;

  Ok(summary)
}

fn apply_string_edits(
  content: &str,
  edits: &[OrchestratorEdit],
) -> Result<(String, usize), String> {
  fn line_number_at(content: &str, byte_index: usize) -> usize {
    content.as_bytes()[..byte_index.min(content.len())]
      .iter()
      .filter(|b| **b == b'\n')
      .count()
      + 1
  }

  let mut working = content.to_string();
  let mut total_replacements = 0usize;
  for (idx, edit) in edits.iter().enumerate() {
    if edit.old_text.is_empty() {
      return Err(format!("edits[{}].old_text is empty", idx));
    }
    if edit.replace_all && edit.occurrence.is_some() {
      return Err(format!("edits[{}] cannot set both replace_all and occurrence", idx));
    }

    let matches: Vec<usize> = working.match_indices(&edit.old_text).map(|(i, _)| i).collect();
    if matches.is_empty() {
      let excerpt: String = edit.old_text.chars().take(80).collect();
      return Err(format!(
        "edits[{}] old_text not found (old_text_len={}, excerpt='{}')",
        idx,
        edit.old_text.chars().count(),
        excerpt
      ));
    }

    if edit.replace_all {
      working = working.replace(&edit.old_text, &edit.new_text);
      total_replacements += matches.len();
      continue;
    }

    let target_index = if let Some(n) = edit.occurrence {
      if n == 0 || n > matches.len() {
        return Err(format!(
          "edits[{}] occurrence out of range (requested {}, matches {})",
          idx,
          n,
          matches.len()
        ));
      }
      matches[n - 1]
    } else {
      if matches.len() != 1 {
        let line_hints = matches
          .iter()
          .take(5)
          .map(|pos| line_number_at(&working, *pos))
          .collect::<Vec<_>>();
        return Err(format!(
          "edits[{}] old_text matched {} times at lines {:?}; set occurrence or replace_all",
          idx,
          matches.len(),
          line_hints
        ));
      }
      matches[0]
    };

    let before = &working[..target_index];
    let after = &working[target_index + edit.old_text.len()..];
    let mut next = String::with_capacity(working.len() - edit.old_text.len() + edit.new_text.len());
    next.push_str(before);
    next.push_str(&edit.new_text);
    next.push_str(after);
    working = next;
    total_replacements += 1;
  }

  Ok((working, total_replacements))
}

fn mkdir_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  dir_path: &str,
  parents: bool,
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  let target = resolve_workspace_write_path(&workspace_root, cwd, dir_path)?;

  if parents {
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
  } else {
    std::fs::create_dir(&target).map_err(|e| e.to_string())?;
  }

  let summary = format!("Created directory {}", target.display());
  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "mkdir", "high", &summary, duration_ms)?;
  Ok(summary)
}

fn delete_file_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  file_path: &str,
  missing_ok: bool,
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  let target = resolve_workspace_existing_path(&workspace_root, cwd, file_path, true)?;
  if !target.exists() {
    if missing_ok {
      let summary = format!("File missing (ok): {}", target.display());
      let duration_ms = start.elapsed().as_millis() as i64;
      record_simple_success(&conn, state, session_id, tool_call_id, "delete_file", "high", &summary, duration_ms)?;
      return Ok(summary);
    }
    record_tool_failure(
      &conn,
      &state.db_path,
      session_id,
      tool_call_id,
      "delete_file",
      "high",
      "file not found",
      start.elapsed().as_millis() as u64,
    );
    return Err("file not found".to_string());
  }

  let meta = std::fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
  if meta.is_dir() {
    return Err("refusing to delete directory (use apply_patch or shell)".to_string());
  }

  std::fs::remove_file(&target).map_err(|e| e.to_string())?;
  let summary = format!("Deleted file {}", target.display());
  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "delete_file", "high", &summary, duration_ms)?;
  Ok(summary)
}

fn copy_file_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  src_path: &str,
  dest_path: &str,
  overwrite: bool,
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  let src = resolve_workspace_existing_path(&workspace_root, cwd, src_path, false)?;
  if !src.exists() {
    return Err("source not found".to_string());
  }
  let src_meta = std::fs::symlink_metadata(&src).map_err(|e| e.to_string())?;
  if src_meta.file_type().is_symlink() {
    return Err("refusing to copy symlink".to_string());
  }
  if !src_meta.is_file() {
    return Err("source is not a file".to_string());
  }

  let dest = resolve_workspace_write_path(&workspace_root, cwd, dest_path)?;
  if dest.exists() && !overwrite {
    return Err("destination already exists".to_string());
  }
  if dest.exists() && overwrite {
    let dest_meta = std::fs::symlink_metadata(&dest).map_err(|e| e.to_string())?;
    if !dest_meta.is_file() {
      return Err("destination is not a file".to_string());
    }
    std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
  }
  if let Some(parent) = dest.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }

  let bytes = std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
  let summary = format!("Copied {} -> {} ({} bytes)", src.display(), dest.display(), bytes);
  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "copy_file", "high", &summary, duration_ms)?;
  Ok(summary)
}

fn move_file_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  src_path: &str,
  dest_path: &str,
  overwrite: bool,
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  let src = resolve_workspace_existing_path(&workspace_root, cwd, src_path, false)?;
  if !src.exists() {
    return Err("source not found".to_string());
  }
  let src_meta = std::fs::symlink_metadata(&src).map_err(|e| e.to_string())?;
  if src_meta.file_type().is_symlink() {
    return Err("refusing to move symlink".to_string());
  }
  if !src_meta.is_file() {
    return Err("source is not a file".to_string());
  }

  let dest = resolve_workspace_write_path(&workspace_root, cwd, dest_path)?;
  if dest.exists() && !overwrite {
    return Err("destination already exists".to_string());
  }
  if dest.exists() && overwrite {
    let dest_meta = std::fs::symlink_metadata(&dest).map_err(|e| e.to_string())?;
    if !dest_meta.is_file() {
      return Err("destination is not a file".to_string());
    }
    std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
  }
  if let Some(parent) = dest.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }

  if let Err(err) = std::fs::rename(&src, &dest) {
    // Cross-device rename fallback.
    let bytes = std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    std::fs::remove_file(&src).map_err(|e| e.to_string())?;
    let summary = format!(
      "Moved {} -> {} (copied {} bytes; rename failed: {})",
      src.display(),
      dest.display(),
      bytes,
      err
    );
    let duration_ms = start.elapsed().as_millis() as i64;
    record_simple_success(&conn, state, session_id, tool_call_id, "move_file", "high", &summary, duration_ms)?;
    return Ok(summary);
  }

  let summary = format!("Moved {} -> {}", src.display(), dest.display());
  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "move_file", "high", &summary, duration_ms)?;
  Ok(summary)
}

fn multi_edit_execute_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  cwd: &str,
  files: &[OrchestratorMultiEditFile],
) -> Result<String, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;

  if files.is_empty() {
    return Err("files is empty".to_string());
  }

  // Phase 1: resolve + compute edits, fail closed before writing anything.
  let mut planned: Vec<(std::path::PathBuf, String, usize)> = Vec::new(); // (path, new_content, replacements)
  let mut total_replacements = 0usize;
  for (idx, item) in files.iter().enumerate() {
    if item.file_path.trim().is_empty() {
      return Err(format!("files[{}].file_path is empty", idx));
    }
    if item.edits.is_empty() {
      return Err(format!("files[{}].edits is empty", idx));
    }

    let target = resolve_workspace_existing_path(&workspace_root, cwd, &item.file_path, false)?;
    let meta = std::fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
      return Err(format!("refusing to edit symlink: {}", target.display()));
    }
    if !meta.is_file() {
      return Err(format!("not a file: {}", target.display()));
    }
    let content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
    let (next, replacements) = apply_string_edits(&content, &item.edits)?;
    total_replacements += replacements;
    planned.push((target, next, replacements));
  }

  // Phase 2: write changes.
  for (path, content, _) in &planned {
    std::fs::write(path, content).map_err(|e| e.to_string())?;
  }

  let changed_files = planned.len();
  let summary = format!(
    "Multi-edit applied: {} file(s) changed, {} replacement(s)",
    changed_files,
    total_replacements
  );
  let duration_ms = start.elapsed().as_millis() as i64;
  record_simple_success(&conn, state, session_id, tool_call_id, "multi_edit", "high", &summary, duration_ms)?;
  Ok(summary)
}

} // end legacy_orchestrator_helpers

#[tauri::command]
async fn approve_and_run_tool_call_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  agent_state: tauri::State<'_, agent::AgentState>,
  session_id: String,
  model_id: String,
  tool_call_id: String,
  cwd: String,
) -> Result<String, String> {
  // Load tool call and enforce idempotency.
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let status = get_tool_call_status(&conn, &tool_call_id).map_err(|e| e.to_string())?;
  let tool_record_pre = get_tool_call(&conn, &tool_call_id).map_err(|e| e.to_string())?;
  let chain_started_at = tool_record_pre.created_at;
  if matches!(status.as_str(), "executed" | "failed" | "canceled") {
    return Err(format!("tool call already completed (status: {})", status));
  }
  drop(conn);

  // Approve if needed.
  let registry = build_default_registry();
  let risk_level = if registry.requires_approval(&tool_record_pre.tool_name) {
    "high"
  } else {
    "low"
  };
  let tool_record = if status == "approved" {
    tool_record_pre
  } else {
    approve_tool_call_impl(&state, &session_id, &tool_call_id, risk_level)?
  };

  // Check if tool exists in registry and if it's auto-apply
  if let Some(handler) = registry.get(&tool_record.tool_name) {
    if handler.auto_apply() {
      // Memory updates already executed during proposal phase
      // Just return empty - no follow-up needed
      return Ok(String::new());
    }
  }
  // Note: Unknown tools will fail in execute_tool_for_orchestrator

  // Execute initial tool
  let (mut current_command, mut current_output) = execute_tool_for_orchestrator(
    window.clone(),
    &state,
    &session_id,
    &tool_call_id,
    &tool_record.tool_name,
    &tool_record.args_json,
    &cwd,
  )
  .await?;

  let mut current_tool_call_id = tool_call_id.clone();
  let mut accumulated_text = String::new();

  // Multi-turn continuation loop
  for _iteration in 0..MAX_ORCHESTRATOR_ITERATIONS {
    // Submit tool output and get response
    let response = agent::submit_tool_output(
      &agent_state,
      session_id.clone(),
      model_id.clone(),
      current_command.clone(),
      current_output.clone(),
      current_tool_call_id.clone(),
      cwd.clone(),
    )
    .await?;

    accumulated_text.push_str(&response);

    // Check if there are new proposed tool calls (and whether they can run without UI involvement).
    let (new_tool_calls, all_auto_exec) = {
      let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
      let new_tool_calls =
        list_tool_calls_by_status_since(&conn, &session_id, "proposed", chain_started_at)
        .map_err(|e| e.to_string())?;
      let all_auto_exec = new_tool_calls.iter().all(|tc| {
        // Do not auto-execute doom-loop-guarded tool calls.
        if let Some(summary_json) = &tc.output_summary_json {
          if serde_json::from_str::<serde_json::Value>(summary_json)
            .ok()
            .and_then(|v| v.get("guard").and_then(|g| g.as_str()).map(|s| s == "doom_loop"))
            .unwrap_or(false)
          {
            return false;
          }
        }
        policy_manager().can_auto_execute(&tc.tool_name)
          || is_tool_call_allowed(&conn, &session_id, &tc.tool_name, &tc.args_json)
      });
      (new_tool_calls, all_auto_exec)
    };

    if new_tool_calls.is_empty() {
      break; // No more tools, done
    }

    if !all_auto_exec {
      break; // Has approval-required tools, return to UI
    }

    // Execute all auto-exec tools and continue with the last one
    let mut last_command = String::new();
    let mut last_output = String::new();
    let mut last_tool_call_id = String::new();

    for tc in new_tool_calls {
      // Auto-approve through the same pipeline (audit + event).
      let risk = if registry.requires_approval(&tc.tool_name) { "high" } else { "low" };
      let _ = approve_tool_call_impl(&state, &session_id, &tc.id, risk)?;

      // Check if it's auto-apply (memory updates)
      if let Some(handler) = registry.get(&tc.tool_name) {
        if handler.auto_apply() {
          // Already executed, skip
          continue;
        }
      }

      // Execute the tool
      match execute_tool_for_orchestrator(
        window.clone(),
        &state,
        &session_id,
        &tc.id,
        &tc.tool_name,
        &tc.args_json,
        &cwd,
      )
      .await
      {
        Ok((cmd, out)) => {
          last_command = cmd;
          last_output = out;
          last_tool_call_id = tc.id.clone();
        }
        Err(e) => {
          last_command = tc.tool_name.clone();
          last_output = format!("Error: {}", e);
          last_tool_call_id = tc.id.clone();
        }
      }
    }
    // If we executed at least one tool, continue the loop
    if last_tool_call_id.is_empty() {
      break;
    }

    current_command = last_command;
    current_output = last_output;
    current_tool_call_id = last_tool_call_id;

    accumulated_text.push('\n');
  }

  Ok(accumulated_text)
}

#[tauri::command]
async fn reject_tool_call_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  agent_state: tauri::State<'_, agent::AgentState>,
  session_id: String,
  model_id: String,
  tool_call_id: String,
  reason: Option<String>,
  cwd: String,
) -> Result<String, String> {
  let reason = reason.unwrap_or_else(|| "rejected by user".to_string());

  // Load tool call and enforce idempotency.
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let status = get_tool_call_status(&conn, &tool_call_id).map_err(|e| e.to_string())?;
  if matches!(status.as_str(), "executed" | "failed" | "canceled") {
    return Err(format!("tool call already completed (status: {})", status));
  }
  let tool_record = get_tool_call(&conn, &tool_call_id).map_err(|e| e.to_string())?;
  let chain_started_at = tool_record.created_at;
  drop(conn);

  // Mark as canceled and record rejection as a tool failure output.
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  update_tool_call_status(&conn, &tool_call_id, "canceled").map_err(|e| e.to_string())?;
  let preview = telemetry_preview(&format!("rejected: {}", reason));
  update_tool_call_output(
    &conn,
    &tool_call_id,
    None,
    None,
    Some(&preview),
    Some(1),
    Some(0),
    None,
    Some("redact_then_send"),
  )
  .map_err(|e| e.to_string())?;

  // Audit as a denied approval.
  let _ = append_audit_log(
    &conn,
    &session_id,
    "approve",
    Some(&tool_record.tool_name),
    "high",
    0,
    None,
    Some(&preview),
    None,
  );

  let _ = logging::append_event(
    &state.db_path,
    logging::LogEvent::ToolDenied {
      session_id: session_id.clone(),
      tool_call_id: tool_call_id.clone(),
      tool_name: tool_record.tool_name.clone(),
      reason: reason.clone(),
    },
  );
  drop(conn);

  // Feed the rejection back to the model and continue the orchestrator loop for auto-exec tools.
  let mut current_command = tool_record.tool_name.clone();
  let mut current_output = format!("Rejected by user: {}", reason);
  let mut current_tool_call_id = tool_call_id.clone();
  let mut accumulated_text = String::new();

  let registry = build_default_registry();

  for _iteration in 0..MAX_ORCHESTRATOR_ITERATIONS {
    let response = agent::submit_tool_output(
      &agent_state,
      session_id.clone(),
      model_id.clone(),
      current_command.clone(),
      current_output.clone(),
      current_tool_call_id.clone(),
      cwd.clone(),
    )
    .await?;

    accumulated_text.push_str(&response);

    // Check if there are new proposed tool calls since the rejection (and whether they can run without UI involvement).
    let (new_tool_calls, all_auto_exec) = {
      let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
      let new_tool_calls =
        list_tool_calls_by_status_since(&conn, &session_id, "proposed", chain_started_at)
          .map_err(|e| e.to_string())?;
      let all_auto_exec = new_tool_calls.iter().all(|tc| {
        // Do not auto-execute doom-loop-guarded tool calls.
        if let Some(summary_json) = &tc.output_summary_json {
          if serde_json::from_str::<serde_json::Value>(summary_json)
            .ok()
            .and_then(|v| v.get("guard").and_then(|g| g.as_str()).map(|s| s == "doom_loop"))
            .unwrap_or(false)
          {
            return false;
          }
        }
        policy_manager().can_auto_execute(&tc.tool_name)
          || is_tool_call_allowed(&conn, &session_id, &tc.tool_name, &tc.args_json)
      });
      (new_tool_calls, all_auto_exec)
    };

    if new_tool_calls.is_empty() {
      break;
    }
    if !all_auto_exec {
      break;
    }

    let mut last_command = String::new();
    let mut last_output = String::new();
    let mut last_tool_call_id = String::new();

    for tc in new_tool_calls {
      let risk = if registry.requires_approval(&tc.tool_name) { "high" } else { "low" };
      let _ = approve_tool_call_impl(&state, &session_id, &tc.id, risk)?;

      if let Some(handler) = registry.get(&tc.tool_name) {
        if handler.auto_apply() {
          continue;
        }
      }

      match execute_tool_for_orchestrator(
        window.clone(),
        &state,
        &session_id,
        &tc.id,
        &tc.tool_name,
        &tc.args_json,
        &cwd,
      )
      .await
      {
        Ok((cmd, out)) => {
          last_command = cmd;
          last_output = out;
          last_tool_call_id = tc.id.clone();
        }
        Err(e) => {
          last_command = tc.tool_name.clone();
          last_output = format!("Error: {}", e);
          last_tool_call_id = tc.id.clone();
        }
      }
    }
    if last_tool_call_id.is_empty() {
      break;
    }

    current_command = last_command;
    current_output = last_output;
    current_tool_call_id = last_tool_call_id;
    accumulated_text.push('\n');
  }

  Ok(accumulated_text)
}

static ACTIVE_KILLERS: Lazy<Mutex<HashMap<String, Box<dyn portable_pty::ChildKiller + Send + Sync>>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, serde::Serialize)]
struct ShellWaitResult {
  exit_code: i32,
  output_excerpt: String,
  duration_ms: u64,
}

#[derive(Clone, serde::Serialize)]
struct PtyOutputPayload {
  tool_call_id: String,
  chunk: String,
  seq: u64,
}

#[derive(Clone, serde::Serialize)]
struct PtyExitPayload {
  tool_call_id: String,
  exit_code: i32,
  seq: u64,
}

struct OutputCapture {
  head: Vec<String>,
  tail: VecDeque<String>,
  head_limit: usize,
  tail_limit: usize,
  line_buffer: String,
  total_lines: usize,
}

impl OutputCapture {
  fn new(head_limit: usize, tail_limit: usize) -> Self {
    Self {
      head: Vec::new(),
      tail: VecDeque::new(),
      head_limit,
      tail_limit,
      line_buffer: String::new(),
      total_lines: 0,
    }
  }

  fn push_chunk(&mut self, chunk: &str) {
    if chunk.is_empty() {
      return;
    }
    let mut combined = String::new();
    if !self.line_buffer.is_empty() {
      combined.push_str(&self.line_buffer);
    }
    combined.push_str(chunk);
    let ends_with_newline = combined.ends_with('\n');
    let mut parts: Vec<&str> = combined.split('\n').collect();
    if ends_with_newline {
      if matches!(parts.last(), Some(&"")) {
        parts.pop();
      }
      self.line_buffer.clear();
    } else {
      self.line_buffer = parts.pop().unwrap_or("").to_string();
    }
    for part in parts {
      self.push_line(part.to_string());
    }
  }

  fn push_line(&mut self, mut line: String) {
    if line.ends_with('\r') {
      line.pop();
    }
    if line.len() > 2000 {
      line.truncate(2000);
      line.push_str("...");
    }
    self.total_lines = self.total_lines.saturating_add(1);
    if self.head.len() < self.head_limit {
      self.head.push(line.clone());
    }
    if self.tail_limit > 0 {
      if self.tail.len() == self.tail_limit {
        self.tail.pop_front();
      }
      self.tail.push_back(line);
    }
  }

  fn finish(&mut self) {
    if !self.line_buffer.is_empty() {
      let line = self.line_buffer.clone();
      self.line_buffer.clear();
      self.push_line(line);
    }
  }

  fn build_excerpt(&self) -> String {
    let tail_lines: Vec<String> = self.tail.iter().cloned().collect();
    if self.total_lines == 0 {
      return String::new();
    }
    if self.total_lines <= self.head_limit {
      return tail_lines.join("\n");
    }
    if self.total_lines <= self.head_limit + self.tail_limit {
      let overlap = self.head_limit + self.tail_limit - self.total_lines;
      let start = overlap.min(tail_lines.len());
      let mut lines = self.head.clone();
      lines.extend_from_slice(&tail_lines[start..]);
      return lines.join("\n");
    }
    let mut lines = self.head.clone();
    if !lines.is_empty() && !tail_lines.is_empty() {
      lines.push("...".to_string());
    }
    lines.extend_from_slice(&tail_lines);
    lines.join("\n")
  }
}

fn classify_primary_signal(exit_code: i32, excerpt: &str) -> String {
  if exit_code == 0 {
    return "success".to_string();
  }
  let lower = excerpt.to_lowercase();
  if lower.contains("command not found") {
    "command_not_found"
  } else if lower.contains("permission denied") || lower.contains("eacces") {
    "permission_denied"
  } else if lower.contains("no such file") {
    "missing_file"
  } else if lower.contains("not found") {
    "not_found"
  } else if lower.contains("panic") || lower.contains("traceback") || lower.contains("exception") {
    "exception"
  } else if lower.contains("failed") {
    "failed"
  } else {
    "error"
  }
  .to_string()
}

fn extract_highlights(excerpt: &str, limit: usize) -> Vec<String> {
  let mut out = Vec::new();
  for line in excerpt.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed == "..." {
      continue;
    }
    out.push(trimmed.to_string());
    if out.len() >= limit {
      break;
    }
  }
  out
}

fn extract_error_lines(excerpt: &str, limit: usize) -> Vec<String> {
  let mut matches = Vec::new();
  for line in excerpt.lines() {
    let lower = line.to_lowercase();
    if lower.contains("error")
      || lower.contains("failed")
      || lower.contains("fatal")
      || lower.contains("panic")
      || lower.contains("exception")
      || lower.contains("traceback")
      || lower.contains("permission denied")
      || lower.contains("no such file")
    {
      matches.push(line.trim().to_string());
    }
  }
  if matches.len() > limit {
    matches.split_off(matches.len() - limit)
  } else {
    matches
  }
}

fn build_output_summary(
  exit_code: i32,
  duration_ms: u64,
  excerpt: &str,
  report: &context::RedactionReport,
) -> serde_json::Value {
  let status = if exit_code == 0 { "success" } else { "failed" };
  let primary_signal = classify_primary_signal(exit_code, excerpt);
  let highlights = extract_highlights(excerpt, 6);
  let errors = extract_error_lines(excerpt, 6);
  let redactions = report
    .redactions
    .iter()
    .map(|(kind, count)| serde_json::json!({ "kind": kind, "count": count }))
    .collect::<Vec<_>>();
  serde_json::json!({
    "version": 1,
    "status": status,
    "exit_code": exit_code,
    "duration_ms": duration_ms,
    "primary_signal": primary_signal,
    "highlights": highlights,
    "errors": errors,
    "redactions": redactions,
    "blocked": report.blocked,
  })
}

fn record_tool_failure(
  conn: &Connection,
  db_path: &std::path::Path,
  session_id: &str,
  tool_call_id: &str,
  tool_name: &str,
  risk_level: &str,
  message: &str,
  duration_ms: u64,
) {
  let (redacted, report) = context::redact_secrets(message);
  let egress_policy = if report.blocked {
    "never_send"
  } else {
    "redact_then_send"
  };
  let summary = build_output_summary(1, duration_ms, &redacted, &report);
  let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());
  let stderr_excerpt = if redacted.is_empty() { None } else { Some(redacted.as_str()) };
  let _ = update_tool_call_status(conn, tool_call_id, "failed");
  let _ = update_tool_call_output(
    conn,
    tool_call_id,
    Some(&summary_json),
    None,
    stderr_excerpt,
    Some(1),
    Some(duration_ms as i64),
    None,
    Some(egress_policy),
  );
  let audit_message = if report.blocked {
    "blocked: sensitive content"
  } else {
    redacted.as_str()
  };
  let _ = append_audit_log(
    conn,
    session_id,
    "error",
    Some(tool_name),
    risk_level,
    0,
    None,
    Some(audit_message),
    None,
  );
  let _ = logging::append_event(
    db_path,
    logging::LogEvent::ToolFailed {
      session_id: session_id.to_string(),
      tool_call_id: tool_call_id.to_string(),
      tool_name: tool_name.to_string(),
      error: audit_message.to_string(),
    },
  );
}

#[tauri::command]
fn run_shell_command_cmd(
  window: tauri::Window,
  state: tauri::State<DbState>,
  session_id: String,
  tool_call_id: String,
  command: String,
  shell: String,
  cwd: String,
  timeout_ms: Option<u64>,
) -> Result<(), String> {
  let start = Instant::now();
  let db_path = state.db_path.clone();
  let key = state.key.clone();

  let conn = open_conn(&db_path, &key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let status = get_tool_call_status(&conn, &tool_call_id).map_err(|e| e.to_string())?;
  if status != "approved" {
    append_audit_log(
      &conn,
      &session_id,
      "error",
      Some("run_shell_command"),
      "high",
      0,
      None,
      Some("blocked: tool call not approved"),
      None,
    )
    .map_err(|e| e.to_string())?;
    record_tool_failure(
      &conn,
      &state.db_path,
      &session_id,
      &tool_call_id,
      "run_shell_command",
      "high",
      "blocked: tool call not approved",
      start.elapsed().as_millis() as u64,
    );
    return Err("tool call not approved".to_string());
  }

  if !is_within_root(&workspace_root, &cwd) {
    append_audit_log(
      &conn,
      &session_id,
      "error",
      Some("run_shell_command"),
      "high",
      0,
      None,
      Some("blocked: cwd outside workspace root"),
      None,
    )
    .map_err(|e| e.to_string())?;
    record_tool_failure(
      &conn,
      &state.db_path,
      &session_id,
      &tool_call_id,
      "run_shell_command",
      "high",
      "blocked: cwd outside workspace root",
      start.elapsed().as_millis() as u64,
    );
    return Err("cwd outside workspace root".to_string());
  }

  let tokens = exec_policy::shell_split(&command);
  let rules = get_ui_state(&conn, "exec_policy_rules")
    .map_err(|e| e.to_string())?
    .unwrap_or_default();
  let session_key = format!("exec_policy_session_rules::{}", session_id);
  let session_rules = get_ui_state(&conn, &session_key)
    .map_err(|e| e.to_string())?
    .unwrap_or_default();
  let parsed_rules = exec_policy::parse_rules(&rules).unwrap_or_default();
  let parsed_session_rules = exec_policy::parse_rules(&session_rules).unwrap_or_default();
  // Session rules > Global rules > Default safe rules
  let mut combined = Vec::new();
  combined.extend(parsed_session_rules);
  combined.extend(parsed_rules);
  combined.extend(exec_policy::default_rules());
  match exec_policy::classify_command(&tokens, &combined) {
    exec_policy::ExecDecision::Forbid => {
      append_audit_log(
        &conn,
        &session_id,
        "error",
        Some("run_shell_command"),
        "high",
        0,
        None,
        Some("blocked: forbidden command"),
        None,
      )
      .map_err(|e| e.to_string())?;
      record_tool_failure(
        &conn,
        &state.db_path,
        &session_id,
        &tool_call_id,
        "run_shell_command",
        "high",
        "blocked: forbidden command",
        start.elapsed().as_millis() as u64,
      );
      return Err("command blocked by policy".to_string());
    }
    exec_policy::ExecDecision::Allow | exec_policy::ExecDecision::Prompt => {}
  }

  std::thread::spawn(move || {
    let start = Instant::now();
    let mut capture = OutputCapture::new(40, 80);
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
      rows: 24,
      cols: 80,
      pixel_width: 0,
      pixel_height: 0,
    }) {
      Ok(pair) => pair,
      Err(err) => {
        if let Ok(conn) = open_conn(&db_path, &key) {
          record_tool_failure(
            &conn,
            &db_path,
            &session_id,
            &tool_call_id,
            "run_shell_command",
            "high",
            &format!("PTY error: {err}"),
            start.elapsed().as_millis() as u64,
          );
        }
        let _ = window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: tool_call_id.clone(),
            chunk: format!("PTY error: {err}"),
            seq: 0,
          },
        );
        return;
      }
    };

    let mut cmd = CommandBuilder::new(shell);
    cmd.arg("-lc");
    cmd.arg(command.as_str());
    cmd.cwd(cwd);

    let mut child = match pair.slave.spawn_command(cmd) {
      Ok(child) => child,
      Err(err) => {
        if let Ok(conn) = open_conn(&db_path, &key) {
          record_tool_failure(
            &conn,
            &db_path,
            &session_id,
            &tool_call_id,
            "run_shell_command",
            "high",
            &format!("Spawn error: {err}"),
            start.elapsed().as_millis() as u64,
          );
        }
        let _ = window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: tool_call_id.clone(),
            chunk: format!("Spawn error: {err}"),
            seq: 0,
          },
        );
        return;
      }
    };

    let killer = child.clone_killer();
    {
      let mut map = ACTIVE_KILLERS.lock().unwrap();
      map.insert(tool_call_id.clone(), killer);
    }

    let timeout = timeout_ms.unwrap_or(120_000u64);
    let timeout_window = window.clone();
    let timeout_tool = tool_call_id.clone();
    let timeout_session = session_id.clone();
    let timeout_db = db_path.clone();
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(timeout));
      let mut map = ACTIVE_KILLERS.lock().unwrap();
      if let Some(mut killer) = map.remove(&timeout_tool) {
        let _ = killer.kill();
        let _ = timeout_window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: timeout_tool.clone(),
            chunk: format!("Command timed out after {}ms", timeout),
            seq: 0,
          },
        );
        let _ = logging::append_event(
          &timeout_db,
          logging::LogEvent::ToolFailed {
            session_id: timeout_session,
            tool_call_id: timeout_tool,
            tool_name: "run_shell_command".to_string(),
            error: "timeout".to_string(),
          },
        );
      }
    });

    let mut reader = match pair.master.try_clone_reader() {
      Ok(reader) => reader,
      Err(err) => {
        if let Ok(conn) = open_conn(&db_path, &key) {
          record_tool_failure(
            &conn,
            &db_path,
            &session_id,
            &tool_call_id,
            "run_shell_command",
            "high",
            &format!("Reader error: {err}"),
            start.elapsed().as_millis() as u64,
          );
        }
        let _ = window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: tool_call_id.clone(),
            chunk: format!("Reader error: {err}"),
            seq: 1,
          },
        );
        return;
      }
    };

    let mut buffer = [0u8; 1024];
    let mut seq: u64 = 0;
    loop {
      match std::io::Read::read(&mut reader, &mut buffer) {
        Ok(0) => break,
        Ok(n) => {
          let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
          capture.push_chunk(&chunk);
          seq = seq.saturating_add(1);
          let _ = window.emit(
            "pty-output",
            PtyOutputPayload {
              tool_call_id: tool_call_id.clone(),
              chunk,
              seq,
            },
          );
        }
        Err(_) => break,
      }
    }

    let exit_code = match child.wait() {
      Ok(status) => status.exit_code() as i32,
      Err(_) => -1,
    };
    let duration_ms = start.elapsed().as_millis() as u64;
    capture.finish();
    let excerpt = capture.build_excerpt();
    let (redacted_command, command_report) = context::redact_secrets(&command);
    let (redacted_excerpt, report) = context::redact_secrets(&excerpt);
    let egress_policy = if report.blocked {
      "never_send"
    } else {
      "redact_then_send"
    };
    let summary = build_output_summary(exit_code, duration_ms, &redacted_excerpt, &report);
    let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());

    {
      let mut map = ACTIVE_KILLERS.lock().unwrap();
      map.remove(&tool_call_id);
    }

    if let Ok(conn) = open_conn(&db_path, &key) {
      let _ = update_tool_call_status(&conn, &tool_call_id, "executed");
      let _ = update_tool_call_output(
        &conn,
        &tool_call_id,
        Some(&summary_json),
        if redacted_excerpt.is_empty() {
          None
        } else {
          Some(redacted_excerpt.as_str())
        },
        None,
        Some(exit_code),
        Some(duration_ms as i64),
        None,
        Some(egress_policy),
      );
      if !command_report.blocked {
        if let Ok(Some(project_id)) = get_ui_state(&conn, "active_project_id") {
          let action = format!(
            "run_shell_command (exit={}): {}",
            exit_code,
            redacted_command.trim()
          );
          let _ = update_working_set_last_action(&conn, &project_id, &action);
        }
      }
      let _ = append_audit_log(
        &conn,
        &session_id,
        "execute",
        Some("run_shell_command"),
        "high",
        1,
        None,
        None,
        None,
      );
      let _ = logging::append_event(
        &db_path,
        logging::LogEvent::ToolExecuted {
          session_id: session_id.clone(),
          tool_call_id: tool_call_id.clone(),
          tool_name: "run_shell_command".to_string(),
        },
      );
    }

    seq = seq.saturating_add(1);
    let _ = window.emit(
      "pty-exit",
      PtyExitPayload {
        tool_call_id,
        exit_code,
        seq,
      },
    );
  });

  Ok(())
}

async fn run_shell_command_wait_impl(
  window: tauri::Window,
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  command: &str,
  shell: &str,
  cwd: &str,
  timeout_ms: Option<u64>,
) -> Result<ShellWaitResult, String> {
  let start = Instant::now();

  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let status = get_tool_call_status(&conn, tool_call_id).map_err(|e| e.to_string())?;
  if status != "approved" {
    append_audit_log(
      &conn,
      session_id,
      "error",
      Some("run_shell_command"),
      "high",
      0,
      None,
      Some("blocked: tool call not approved"),
      None,
    )
    .map_err(|e| e.to_string())?;
    record_tool_failure(
      &conn,
      &state.db_path,
      session_id,
      tool_call_id,
      "run_shell_command",
      "high",
      "blocked: tool call not approved",
      start.elapsed().as_millis() as u64,
    );
    return Err("tool call not approved".to_string());
  }

  if !is_within_root(&workspace_root, cwd) {
    append_audit_log(
      &conn,
      session_id,
      "error",
      Some("run_shell_command"),
      "high",
      0,
      None,
      Some("blocked: cwd outside workspace root"),
      None,
    )
    .map_err(|e| e.to_string())?;
    record_tool_failure(
      &conn,
      &state.db_path,
      session_id,
      tool_call_id,
      "run_shell_command",
      "high",
      "blocked: cwd outside workspace root",
      start.elapsed().as_millis() as u64,
    );
    return Err("cwd outside workspace root".to_string());
  }

  let tokens = exec_policy::shell_split(command);
  let rules = get_ui_state(&conn, "exec_policy_rules")
    .map_err(|e| e.to_string())?
    .unwrap_or_default();
  let session_key = format!("exec_policy_session_rules::{}", session_id);
  let session_rules = get_ui_state(&conn, &session_key)
    .map_err(|e| e.to_string())?
    .unwrap_or_default();
  let parsed_rules = exec_policy::parse_rules(&rules).unwrap_or_default();
  let parsed_session_rules = exec_policy::parse_rules(&session_rules).unwrap_or_default();
  // Session rules > Global rules > Default safe rules
  let mut combined = Vec::new();
  combined.extend(parsed_session_rules);
  combined.extend(parsed_rules);
  combined.extend(exec_policy::default_rules());
  match exec_policy::classify_command(&tokens, &combined) {
    exec_policy::ExecDecision::Forbid => {
      append_audit_log(
        &conn,
        session_id,
        "error",
        Some("run_shell_command"),
        "high",
        0,
        None,
        Some("blocked: forbidden command"),
        None,
      )
      .map_err(|e| e.to_string())?;
      record_tool_failure(
        &conn,
        &state.db_path,
        session_id,
        tool_call_id,
        "run_shell_command",
        "high",
        "blocked: forbidden command",
        start.elapsed().as_millis() as u64,
      );
      return Err("command blocked by policy".to_string());
    }
    exec_policy::ExecDecision::Allow | exec_policy::ExecDecision::Prompt => {}
  }

  let db_path = state.db_path.clone();
  let key = state.key.clone();
  let session_id = session_id.to_string();
  let tool_call_id = tool_call_id.to_string();
  let command = command.to_string();
  let shell = shell.to_string();
  let cwd = cwd.to_string();

  let (tx, rx) = oneshot::channel::<ShellWaitResult>();

  std::thread::spawn(move || {
    let start = Instant::now();
    let mut completion_tx = Some(tx);
    let mut capture = OutputCapture::new(40, 80);
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
      rows: 24,
      cols: 80,
      pixel_width: 0,
      pixel_height: 0,
    }) {
      Ok(pair) => pair,
      Err(err) => {
        if let Ok(conn) = open_conn(&db_path, &key) {
          record_tool_failure(
            &conn,
            &db_path,
            &session_id,
            &tool_call_id,
            "run_shell_command",
            "high",
            &format!("PTY error: {err}"),
            start.elapsed().as_millis() as u64,
          );
        }
        let _ = window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: tool_call_id.clone(),
            chunk: format!("PTY error: {err}"),
            seq: 0,
          },
        );
        if let Some(tx) = completion_tx.take() {
          let _ = tx.send(ShellWaitResult {
            exit_code: 1,
            output_excerpt: format!("PTY error: {err}"),
            duration_ms: start.elapsed().as_millis() as u64,
          });
        }
        return;
      }
    };

    let mut cmd = CommandBuilder::new(shell);
    cmd.arg("-lc");
    cmd.arg(command.as_str());
    cmd.cwd(cwd);

    let mut child = match pair.slave.spawn_command(cmd) {
      Ok(child) => child,
      Err(err) => {
        if let Ok(conn) = open_conn(&db_path, &key) {
          record_tool_failure(
            &conn,
            &db_path,
            &session_id,
            &tool_call_id,
            "run_shell_command",
            "high",
            &format!("Spawn error: {err}"),
            start.elapsed().as_millis() as u64,
          );
        }
        let _ = window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: tool_call_id.clone(),
            chunk: format!("Spawn error: {err}"),
            seq: 0,
          },
        );
        if let Some(tx) = completion_tx.take() {
          let _ = tx.send(ShellWaitResult {
            exit_code: 1,
            output_excerpt: format!("Spawn error: {err}"),
            duration_ms: start.elapsed().as_millis() as u64,
          });
        }
        return;
      }
    };

    let killer = child.clone_killer();
    {
      let mut map = ACTIVE_KILLERS.lock().unwrap();
      map.insert(tool_call_id.clone(), killer);
    }

    let timeout = timeout_ms.unwrap_or(120_000u64);
    let timeout_window = window.clone();
    let timeout_tool = tool_call_id.clone();
    let timeout_session = session_id.clone();
    let timeout_db = db_path.clone();
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(timeout));
      let mut map = ACTIVE_KILLERS.lock().unwrap();
      if let Some(mut killer) = map.remove(&timeout_tool) {
        let _ = killer.kill();
        let _ = timeout_window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: timeout_tool.clone(),
            chunk: format!("Command timed out after {}ms", timeout),
            seq: 0,
          },
        );
        let _ = logging::append_event(
          &timeout_db,
          logging::LogEvent::ToolFailed {
            session_id: timeout_session,
            tool_call_id: timeout_tool,
            tool_name: "run_shell_command".to_string(),
            error: "timeout".to_string(),
          },
        );
      }
    });

    let mut reader = match pair.master.try_clone_reader() {
      Ok(reader) => reader,
      Err(err) => {
        if let Ok(conn) = open_conn(&db_path, &key) {
          record_tool_failure(
            &conn,
            &db_path,
            &session_id,
            &tool_call_id,
            "run_shell_command",
            "high",
            &format!("Reader error: {err}"),
            start.elapsed().as_millis() as u64,
          );
        }
        let _ = window.emit(
          "pty-output",
          PtyOutputPayload {
            tool_call_id: tool_call_id.clone(),
            chunk: format!("Reader error: {err}"),
            seq: 1,
          },
        );
        if let Some(tx) = completion_tx.take() {
          let _ = tx.send(ShellWaitResult {
            exit_code: 1,
            output_excerpt: format!("Reader error: {err}"),
            duration_ms: start.elapsed().as_millis() as u64,
          });
        }
        return;
      }
    };

    let mut buffer = [0u8; 1024];
    let mut seq: u64 = 0;
    loop {
      match std::io::Read::read(&mut reader, &mut buffer) {
        Ok(0) => break,
        Ok(n) => {
          let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
          capture.push_chunk(&chunk);
          seq = seq.saturating_add(1);
          let _ = window.emit(
            "pty-output",
            PtyOutputPayload {
              tool_call_id: tool_call_id.clone(),
              chunk,
              seq,
            },
          );
        }
        Err(_) => break,
      }
    }

    let exit_code = match child.wait() {
      Ok(status) => status.exit_code() as i32,
      Err(_) => -1,
    };
    let duration_ms = start.elapsed().as_millis() as u64;
    capture.finish();
    let excerpt = capture.build_excerpt();
    let (redacted_command, command_report) = context::redact_secrets(&command);
    let (redacted_excerpt, report) = context::redact_secrets(&excerpt);
    let egress_policy = if report.blocked {
      "never_send"
    } else {
      "redact_then_send"
    };
    let summary = build_output_summary(exit_code, duration_ms, &redacted_excerpt, &report);
    let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());

    {
      let mut map = ACTIVE_KILLERS.lock().unwrap();
      map.remove(&tool_call_id);
    }

    if let Ok(conn) = open_conn(&db_path, &key) {
      let _ = update_tool_call_status(&conn, &tool_call_id, "executed");
      let _ = update_tool_call_output(
        &conn,
        &tool_call_id,
        Some(&summary_json),
        if redacted_excerpt.is_empty() {
          None
        } else {
          Some(redacted_excerpt.as_str())
        },
        None,
        Some(exit_code),
        Some(duration_ms as i64),
        None,
        Some(egress_policy),
      );
      if !command_report.blocked {
        if let Ok(Some(project_id)) = get_ui_state(&conn, "active_project_id") {
          let action = format!(
            "run_shell_command (exit={}): {}",
            exit_code,
            redacted_command.trim()
          );
          let _ = update_working_set_last_action(&conn, &project_id, &action);
        }
      }
      let _ = append_audit_log(
        &conn,
        &session_id,
        "execute",
        Some("run_shell_command"),
        "high",
        1,
        None,
        None,
        None,
      );
      let _ = logging::append_event(
        &db_path,
        logging::LogEvent::ToolExecuted {
          session_id: session_id.clone(),
          tool_call_id: tool_call_id.clone(),
          tool_name: "run_shell_command".to_string(),
        },
      );
    }

    seq = seq.saturating_add(1);
    let _ = window.emit(
      "pty-exit",
      PtyExitPayload {
        tool_call_id: tool_call_id.clone(),
        exit_code,
        seq,
      },
    );

    if let Some(tx) = completion_tx.take() {
      let _ = tx.send(ShellWaitResult {
        exit_code,
        output_excerpt: redacted_excerpt,
        duration_ms,
      });
    }
  });

  rx.await.map_err(|_| "shell command did not return a result".to_string())
}

#[tauri::command]
async fn run_shell_command_wait_cmd(
  window: tauri::Window,
  state: tauri::State<'_, DbState>,
  session_id: String,
  tool_call_id: String,
  command: String,
  shell: String,
  cwd: String,
  timeout_ms: Option<u64>,
) -> Result<ShellWaitResult, String> {
  run_shell_command_wait_impl(
    window,
    &state,
    &session_id,
    &tool_call_id,
    &command,
    &shell,
    &cwd,
    timeout_ms,
  )
  .await
}

#[tauri::command]
fn cancel_tool_call_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  tool_call_id: String,
) -> Result<(), String> {
  let mut map = ACTIVE_KILLERS.lock().unwrap();
  if let Some(mut killer) = map.remove(&tool_call_id) {
    let _ = killer.kill();
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    update_tool_call_status(&conn, &tool_call_id, "canceled").map_err(|e| e.to_string())?;
    let _ = append_audit_log(
      &conn,
      &session_id,
      "execute",
      Some("run_shell_command"),
      "high",
      1,
      None,
      Some("canceled by user"),
      None,
    );
    let _ = logging::append_event(
      &state.db_path,
      logging::LogEvent::ToolCanceled {
        session_id,
        tool_call_id,
        tool_name: "run_shell_command".to_string(),
      },
    );
    return Ok(());
  }
  Err("no active process".to_string())
}

#[tauri::command]
fn read_file_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  tool_call_id: Option<String>,
  path: String,
  max_bytes: usize,
  offset_bytes: Option<u64>,
) -> Result<serde_json::Value, String> {
  read_file_impl(
    &state,
    &session_id,
    tool_call_id.as_deref(),
    &path,
    max_bytes,
    offset_bytes,
  )
}

fn read_file_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: Option<&str>,
  path: &str,
  max_bytes: usize,
  offset_bytes: Option<u64>,
) -> Result<serde_json::Value, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let resolved_path = resolve_path_under_root(&workspace_root, path);
  let resolved_str = resolved_path.to_string_lossy();
  if !is_within_root(&workspace_root, resolved_str.as_ref()) {
    append_audit_log(
      &conn,
      session_id,
      "error",
      Some("read_file"),
      "medium",
      0,
      None,
      Some("blocked: path outside workspace root"),
      None,
    )
    .map_err(|e| e.to_string())?;
    if let Some(tool_call_id) = tool_call_id {
      record_tool_failure(
        &conn,
        &state.db_path,
        session_id,
        tool_call_id,
        "read_file",
        "medium",
        "blocked: path outside workspace root",
        start.elapsed().as_millis() as u64,
      );
    }
    return Err("path outside workspace root".to_string());
  }

  let already_read = context::already_read(resolved_str.as_ref());
  let clamped_bytes = std::cmp::min(max_bytes, context::MAX_READ_BYTES);
  if clamped_bytes == 0 {
    return Err("max_bytes must be > 0".to_string());
  }

  let read_result = match context::read_with_range(resolved_str.as_ref(), offset_bytes, clamped_bytes)
  {
    Ok(result) => result,
    Err(err) => {
      let message = err.to_string();
      if let Some(tool_call_id) = tool_call_id {
        record_tool_failure(
          &conn,
          &state.db_path,
          session_id,
          tool_call_id,
          "read_file",
          "medium",
          &message,
          start.elapsed().as_millis() as u64,
        );
      }
      return Err(message);
    }
  };
  let snippet = read_result.snippet;
  let (content, report) = context::redact_secrets(&snippet.content);
  if report.blocked {
    append_audit_log(
      &conn,
      session_id,
      "error",
      Some("read_file"),
      "medium",
      0,
      None,
      Some("blocked: sensitive content detected"),
      None,
    )
    .map_err(|e| e.to_string())?;
    if let Some(tool_call_id) = tool_call_id {
      record_tool_failure(
        &conn,
        &state.db_path,
        session_id,
        tool_call_id,
        "read_file",
        "medium",
        "blocked: sensitive content detected",
        start.elapsed().as_millis() as u64,
      );
    }
    return Err("blocked: sensitive content detected".to_string());
  }
  let header = format!(
    "<<<BEGIN FILE {} (bytes {}-{} of {})>>>",
    snippet.path, snippet.start, snippet.end, snippet.total_bytes
  );
  let footer = "<<<END FILE>>>";
  let truncation_notice = if snippet.truncated {
    Some(format!(
      "<<<TRUNCATED: read {} bytes; use offset_bytes to continue>>>",
      snippet.end.saturating_sub(snippet.start)
    ))
  } else {
    None
  };
  let mut wrapped = format!("{header}\n{content}\n{footer}");
  if let Some(notice) = truncation_notice.as_deref() {
    wrapped.push('\n');
    wrapped.push_str(notice);
  }
  if let Some(tool_call_id) = tool_call_id {
    let duration_ms = start.elapsed().as_millis() as u64;
    let excerpt = format!(
      "Read file {} (bytes {}-{} of {}){}",
      snippet.path,
      snippet.start,
      snippet.end,
      snippet.total_bytes,
      if snippet.truncated { " [truncated]" } else { "" }
    );
    let (redacted_excerpt, report) = context::redact_secrets(&excerpt);
    let egress_policy = if report.blocked {
      "never_send"
    } else {
      "redact_then_send"
    };
    let summary = build_output_summary(0, duration_ms, &redacted_excerpt, &report);
    let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());
    let _ = update_tool_call_status(&conn, tool_call_id, "executed");
    let _ = update_tool_call_output(
      &conn,
      tool_call_id,
      Some(&summary_json),
      if redacted_excerpt.is_empty() {
        None
      } else {
        Some(redacted_excerpt.as_str())
      },
      None,
      Some(0),
      Some(duration_ms as i64),
      None,
      Some(egress_policy),
    );
    let _ = append_audit_log(
      &conn,
      session_id,
      "execute",
      Some("read_file"),
      "medium",
      1,
      None,
      None,
      None,
    );
    let _ = logging::append_event(
      &state.db_path,
      logging::LogEvent::ToolExecuted {
        session_id: session_id.to_string(),
        tool_call_id: tool_call_id.to_string(),
        tool_name: "read_file".to_string(),
      },
    );
  }
  let result = serde_json::json!({
    "path": snippet.path,
    "content_trunc": wrapped,
    "truncated": snippet.truncated,
    "redactions": report.redactions,
    "from_cache": read_result.from_cache,
    "already_read": already_read,
    "total_bytes": snippet.total_bytes,
    "start": snippet.start,
    "end": snippet.end,
    "max_bytes": clamped_bytes,
    "offset_bytes": offset_bytes,
    "truncation_notice": truncation_notice
  });
  Ok(result)
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
  use std::fs;
  use base64::{engine::general_purpose::STANDARD, Engine};

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
    // Read and encode image (limit to 256KB for preview)
    let bytes = fs::read(&file_path).ok();
    bytes.and_then(|data| {
      // For larger images, we'd want to resize, but for now just base64 encode
      // Limit preview to first 256KB
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
      // Only create data URL for reasonably sized images
      if data.len() <= 256 * 1024 {
        Some(format!("data:{};base64,{}", mime, STANDARD.encode(preview_bytes)))
      } else {
        None
      }
    })
  } else {
    None
  };

  // Generate unique ID
  let id = format!("att_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());

  Ok(AttachmentResult {
    id,
    path: path.clone(),
    name,
    file_type: file_type.to_string(),
    size,
    preview_data_url,
  })
}

#[tauri::command]
fn apply_patch_cmd(
  state: tauri::State<DbState>,
  session_id: String,
  tool_call_id: String,
  patch: String,
) -> Result<apply_patch::ApplyPatchResult, String> {
  apply_patch_impl(&state, &session_id, &tool_call_id, &patch)
}

fn apply_patch_impl(
  state: &DbState,
  session_id: &str,
  tool_call_id: &str,
  patch: &str,
) -> Result<apply_patch::ApplyPatchResult, String> {
  let start = Instant::now();
  let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
  let workspace_root = get_ui_state(&conn, "workspace_root")
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "workspace root not set".to_string())?;
  let status = get_tool_call_status(&conn, tool_call_id).map_err(|e| e.to_string())?;
  if status != "approved" {
    append_audit_log(
      &conn,
      session_id,
      "error",
      Some("apply_patch"),
      "high",
      0,
      None,
      Some("blocked: tool call not approved"),
      None,
    )
    .map_err(|e| e.to_string())?;
    return Err("tool call not approved".to_string());
  }

  let root_path = Path::new(&workspace_root);
  let result = apply_patch::apply_patch_to_root(root_path, patch);
  let duration_ms = start.elapsed().as_millis() as u64;
  let (exit_code, excerpt) = if result.applied {
    let file_count = result.changed_files.len();
    let list = if result.changed_files.is_empty() {
      "no files changed".to_string()
    } else {
      result.changed_files.join(", ")
    };
    (
      0,
      format!("Patch applied to {} file(s): {}", file_count, list),
    )
  } else {
    let error = if result.errors.is_empty() {
      "unknown error".to_string()
    } else {
      result.errors.join("; ")
    };
    (1, format!("Patch failed: {}", error))
  };
  let (redacted_excerpt, report) = context::redact_secrets(&excerpt);
  let egress_policy = if report.blocked {
    "never_send"
  } else {
    "redact_then_send"
  };
  let summary = build_output_summary(exit_code, duration_ms, &redacted_excerpt, &report);
  let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());
  if result.applied {
    let _ = update_tool_call_status(&conn, tool_call_id, "executed");
    let _ = update_tool_call_output(
      &conn,
      tool_call_id,
      Some(&summary_json),
      if redacted_excerpt.is_empty() {
        None
      } else {
        Some(redacted_excerpt.as_str())
      },
      None,
      Some(exit_code),
      Some(duration_ms as i64),
      None,
      Some(egress_policy),
    );
    let _ = append_audit_log(
      &conn,
      session_id,
      "execute",
      Some("apply_patch"),
      "high",
      1,
      None,
      None,
      None,
    );
    let _ = logging::append_event(
      &state.db_path,
      logging::LogEvent::ToolExecuted {
        session_id: session_id.to_string(),
        tool_call_id: tool_call_id.to_string(),
        tool_name: "apply_patch".to_string(),
      },
    );
  } else {
    let _ = update_tool_call_status(&conn, tool_call_id, "failed");
    let _ = update_tool_call_output(
      &conn,
      tool_call_id,
      Some(&summary_json),
      None,
      if redacted_excerpt.is_empty() {
        None
      } else {
        Some(redacted_excerpt.as_str())
      },
      Some(exit_code),
      Some(duration_ms as i64),
      None,
      Some(egress_policy),
    );
    let error = result.errors.join("; ");
    let _ = append_audit_log(
      &conn,
      session_id,
      "error",
      Some("apply_patch"),
      "high",
      0,
      None,
      Some(&error),
      None,
    );
    let _ = logging::append_event(
      &state.db_path,
      logging::LogEvent::ToolFailed {
        session_id: session_id.to_string(),
        tool_call_id: tool_call_id.to_string(),
        tool_name: "apply_patch".to_string(),
        error,
      },
    );
  }
  let (action, action_report) = context::redact_secrets(&excerpt);
  if !action_report.blocked {
    if let Ok(Some(project_id)) = get_ui_state(&conn, "active_project_id") {
      let _ = update_working_set_last_action(&conn, &project_id, action.trim());
    }
  }

  Ok(result)
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


fn resolve_model(model_id: &str) -> Result<(String, String), String> {
  match model_id {
    "gpt-5.1" => Ok(("openai".to_string(), "gpt-5.1-2025-11-13".to_string())),
    "gpt-5.2" => Ok(("openai".to_string(), "gpt-5.2".to_string())),
    "sonnet-4.5" => Ok(("anthropic".to_string(), "claude-3-5-sonnet-20240620".to_string())),
    "opus-4.5" => Ok(("anthropic".to_string(), "claude-3-opus-20240229".to_string())),
    "gemini-3-flash" => Ok(("google".to_string(), "gemini-1.5-flash".to_string())),
    "gemini-3-pro" => Ok(("google".to_string(), "gemini-1.5-pro".to_string())),
    "grok-4.1" => Ok(("xai".to_string(), "grok-beta".to_string())),
    _ => Err("Unknown model selection".to_string()),
  }
}

async fn call_openai(messages: &[OpenAiMessage], model: &str) -> Result<String, String> {
  let api_key = get_provider_key("openai")
    .ok()
    .flatten()
    .or_else(|| std::env::var("ARX_OPENAI_API_KEY").ok())
    .ok_or_else(|| "OpenAI not configured".to_string())?;
  let base_url = std::env::var("ARX_OPENAI_BASE_URL")
    .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

  let payload = OpenAiRequest {
    model: model.to_string(),
    messages: messages.to_vec(),
    temperature: 0.2,
  };

  let client = reqwest::Client::builder()
    .connect_timeout(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| e.to_string())?;
  let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
  let response = client
    .post(url)
    .bearer_auth(api_key)
    .json(&payload)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("OpenAI error {}: {}", status.as_u16(), body));
  }

  let parsed: OpenAiResponse = response.json().await.map_err(|e| e.to_string())?;
  let content = parsed
    .choices
    .first()
    .map(|choice| choice.message.content.clone())
    .unwrap_or_else(|| "No response".to_string());
  Ok(content)
}

fn split_system(messages: &[OpenAiMessage]) -> (Option<String>, Vec<OpenAiMessage>) {
  let mut system = None;
  let mut out = Vec::new();
  for msg in messages {
    if msg.role == "system" && system.is_none() {
      system = Some(msg.content.clone());
      continue;
    }
    out.push(OpenAiMessage {
      role: msg.role.clone(),
      content: msg.content.clone(),
    });
  }
  (system, out)
}

async fn call_anthropic(messages: &[OpenAiMessage], model: &str) -> Result<String, String> {
  let api_key = get_provider_key("anthropic")
    .ok()
    .flatten()
    .or_else(|| std::env::var("ARX_ANTHROPIC_API_KEY").ok())
    .ok_or_else(|| "Anthropic not configured".to_string())?;
  let base_url = std::env::var("ARX_ANTHROPIC_BASE_URL")
    .unwrap_or_else(|_| "https://api.anthropic.com/v1".to_string());

  let (system, rest) = split_system(messages);
  let anth_messages = rest
    .into_iter()
    .filter(|msg| msg.role == "user" || msg.role == "assistant")
    .map(|msg| AnthropicMessage {
      role: msg.role,
      content: vec![AnthropicContent {
        kind: "text".to_string(),
        text: msg.content,
      }],
    })
    .collect();

  let payload = AnthropicRequest {
    model: model.to_string(),
    max_tokens: 512,
    temperature: 0.2,
    messages: anth_messages,
    system,
  };

  let client = reqwest::Client::builder()
    .connect_timeout(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| e.to_string())?;
  let url = format!("{}/messages", base_url.trim_end_matches('/'));
  let response = client
    .post(url)
    .header("x-api-key", api_key)
    .header("anthropic-version", "2023-06-01")
    .json(&payload)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("Anthropic error {}: {}", status.as_u16(), body));
  }

  let parsed: AnthropicResponse = response.json().await.map_err(|e| e.to_string())?;
  let content = parsed
    .content
    .get(0)
    .map(|item| item.text.clone())
    .unwrap_or_else(|| "No response".to_string());
  Ok(content)
}

async fn call_google(messages: &[OpenAiMessage], model: &str) -> Result<String, String> {
  let api_key = get_provider_key("google")
    .ok()
    .flatten()
    .or_else(|| std::env::var("ARX_GOOGLE_API_KEY").ok())
    .ok_or_else(|| "Google not configured".to_string())?;
  let base_url = std::env::var("ARX_GOOGLE_BASE_URL")
    .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

  let (system, rest) = split_system(messages);
  let mut contents = Vec::new();
  for msg in rest {
    if msg.role != "user" && msg.role != "assistant" {
      continue;
    }
    let role = if msg.role == "assistant" { "model" } else { "user" };
    contents.push(GeminiContent {
      role: role.to_string(),
      parts: vec![GeminiPart { text: msg.content }],
    });
  }

  let payload = GeminiRequest {
    contents,
    system_instruction: system.map(|text| GeminiContent {
      role: "system".to_string(),
      parts: vec![GeminiPart { text }],
    }),
  };

  let client = reqwest::Client::builder()
    .connect_timeout(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| e.to_string())?;
  let url = format!(
    "{}/models/{}:generateContent?key={}",
    base_url.trim_end_matches('/'),
    model,
    api_key
  );
  let response = client
    .post(url)
    .json(&payload)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("Google error {}: {}", status.as_u16(), body));
  }

  let parsed: GeminiResponse = response.json().await.map_err(|e| e.to_string())?;
  let content = parsed
    .candidates
    .get(0)
    .and_then(|candidate| candidate.content.parts.get(0))
    .and_then(|part| part.text.clone())
    .unwrap_or_else(|| "No response".to_string());
  Ok(content)
}

async fn call_xai(messages: &[OpenAiMessage], model: &str) -> Result<String, String> {
  let api_key = get_provider_key("xai")
    .ok()
    .flatten()
    .or_else(|| std::env::var("ARX_XAI_API_KEY").ok())
    .ok_or_else(|| "xAI not configured".to_string())?;
  let base_url = std::env::var("ARX_XAI_BASE_URL")
    .unwrap_or_else(|_| "https://api.x.ai/v1".to_string());

  let payload = OpenAiRequest {
    model: model.to_string(),
    messages: messages.to_vec(),
    temperature: 0.2,
  };

  let client = reqwest::Client::builder()
    .connect_timeout(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| e.to_string())?;
  let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
  let response = client
    .post(url)
    .bearer_auth(api_key)
    .json(&payload)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("xAI error {}: {}", status.as_u16(), body));
  }

  let parsed: OpenAiResponse = response.json().await.map_err(|e| e.to_string())?;
  let content = parsed
    .choices
    .first()
    .map(|choice| choice.message.content.clone())
    .unwrap_or_else(|| "No response".to_string());
  Ok(content)
}

#[tauri::command]
async fn summarize_command_output_cmd(
  model_id: String,
  command: String,
  output: String,
) -> Result<String, String> {
  let (provider, model) = resolve_model(&model_id)?;
  let prompt = format!(
    "Command: {}\nOutput:\n{}\n\nSummarize the result for the user. Mention errors if present. Keep it brief.",
    command, output
  );
  let messages = vec![
    OpenAiMessage {
      role: "system".to_string(),
      content: "You are Atom. Summarize command output for a user. Do not include secrets or long dumps.".to_string(),
    },
    OpenAiMessage {
      role: "user".to_string(),
      content: prompt,
    },
  ];
  match provider.as_str() {
    "openai" => call_openai(&messages, &model).await,
    "anthropic" => call_anthropic(&messages, &model).await,
    "google" => call_google(&messages, &model).await,
    "xai" => call_xai(&messages, &model).await,
    _ => Err("Unknown provider".to_string()),
  }
}

#[tauri::command]
async fn submit_tool_output_cmd(
  agent_state: tauri::State<'_, agent::AgentState>,
  session_id: String,
  model_id: String,
  command: String,
  output: String,
  tool_call_id: String,
  cwd: String,
) -> Result<String, String> {
  agent::submit_tool_output(&agent_state, session_id, model_id, command, output, tool_call_id, cwd).await
}

fn get_provider_key(provider: &str) -> Result<Option<String>, String> {
  let entry = Entry::new("com.arx.app", provider).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(err) => Err(err.to_string()),
  }
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
      let state = db::init_db(&db_dir, &key)?;
      let conn = open_conn(&state.db_path, &state.key)?;
      let templates_root = memory_templates::templates_root(&base_dir);
      memory_templates::ensure_default_templates(&templates_root)?;
      set_ui_state(
        &conn,
        "memory_templates_root",
        templates_root.to_string_lossy().as_ref(),
      )?;
      let templates = memory_templates::load_templates(&templates_root)?;
      ensure_memory_blocks_for_scope(&conn, &templates, "global", None)?;
      if get_ui_state(&conn, "workspace_root")?.is_none() {
        let default_root = app
          .path()
          .home_dir()
          .map_err(|e| anyhow::anyhow!(e))?
          .join("Arx Workspace");
        std::fs::create_dir_all(&default_root)?;
        set_ui_state(
          &conn,
          "workspace_root",
          default_root.to_string_lossy().as_ref(),
        )?;
      }
      let agent_state = agent::init_agent_loop(app.handle().clone(), state.clone());
      app.manage(state);
      app.manage(agent_state);

      // Position traffic lights to align with header buttons (52px header, centered)
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
      create_session_cmd,
      list_sessions_cmd,
      list_tools_cmd,
      get_agent_mode_cmd,
      set_agent_mode_cmd,
      respond_permission_cmd,
      get_workspace_root_cmd,
      set_workspace_root_cmd,
      is_path_within_workspace_cmd,
      get_active_project_cmd,
      set_active_project_cmd,
      list_projects_cmd,
      create_project_cmd,
      list_tool_calls_cmd,
      list_audit_log_cmd,
      add_message_cmd,
      list_messages_cmd,
      list_memory_blocks_cmd,
      create_memory_note_cmd,
      save_memory_block_update_cmd,
      get_model_toggles_cmd,
      set_model_toggles_cmd,
      get_active_model_cmd,
      set_active_model_cmd,
      set_provider_key_cmd,
      clear_provider_key_cmd,
      has_provider_key_cmd,
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
      summarize_command_output_cmd,
      submit_tool_output_cmd,
      generate_assistant_message_cmd,
      propose_tool_call_cmd,
      approve_tool_call_cmd,
      approve_and_run_tool_call_cmd,
      reject_tool_call_cmd,
      apply_patch_cmd,
      run_shell_command_cmd,
      run_shell_command_wait_cmd,
      cancel_tool_call_cmd,
      cancel_session_cmd,
      read_file_cmd,
      ingest_attachment_cmd
    ])
    .on_window_event(|window, event| {
      #[cfg(target_os = "macos")]
      {
        // Re-apply traffic lights position on events that can reset it
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
