#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod blob_store;
mod context;
mod context_builder;
mod db;

use db::{
    add_message, create_personal_memory_item, create_thread, delete_personal_memory_item,
    delete_thread, delete_ui_state, get_project_by_id, get_session_resume, get_thread_by_id,
    get_ui_state, list_events, list_events_since, list_messages, list_personal_memory_items,
    list_threads, list_tool_calls, open_conn, search_personal_memory_items,
    set_personal_memory_item_pinned, set_thread_community_id, set_thread_engine_model,
    set_thread_workspace_path, set_ui_state, upsert_project, upsert_workspace_binding, DbState,
};
use futures::StreamExt;
use keyring::Entry;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::collections::{HashMap, VecDeque};
use std::io::BufRead;
use std::path::Path;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::Instant;
use tauri::Emitter;
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command as TokioCommand;
use tokio::sync::{oneshot, watch, Mutex};

const ENGINE_MESSAGES_AGENT: &str = "messages_agent";
const ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT: &str = "openrouter_messages_agent";
const ENGINE_LEGACY_OPENROUTER_CHAT: &str = "openrouter_chat";
const ARP_PROTOCOL_VERSION: i64 = 1;
const DEFAULT_MAX_TOKENS: u32 = 1024;
const IO_BLOB_THRESHOLD_BYTES: usize = 16 * 1024;
const RIPGREP_VERSION: &str = "14.1.1";
const BYOK_ENABLED: bool = false;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PlatformProvider {
    OpenAi,
    Anthropic,
    Google,
    XAi,
}

#[derive(Clone, Debug)]
struct PlatformModelRef {
    provider: PlatformProvider,
    model: String,
    ref_str: String,
}

#[derive(Clone, Debug)]
struct PlatformProxyConfig {
    supabase_url: String,
    supabase_anon_key: String,
    access_token: String,
}

#[derive(Clone, Debug, Deserialize)]
struct ModelRegistryApiRow {
    id: String,
    provider: Option<String>,
    provider_model: Option<String>,
    enabled: Option<bool>,
    platform_enabled: Option<bool>,
    byok_enabled: Option<bool>,
}

fn normalize_platform_provider(input: &str) -> Result<PlatformProvider, String> {
    let raw = input.trim().to_lowercase();
    match raw.as_str() {
        "openai" => Ok(PlatformProvider::OpenAi),
        "anthropic" => Ok(PlatformProvider::Anthropic),
        "google" => Ok(PlatformProvider::Google),
        "xai" | "x-ai" => Ok(PlatformProvider::XAi),
        _ => Err("Unsupported platform model provider".to_string()),
    }
}

fn parse_platform_model_ref(ref_str: &str) -> Result<PlatformModelRef, String> {
    let raw = ref_str.trim();
    let Some((provider_raw, model_raw)) = raw.split_once('/') else {
        return Err("Invalid platform model mapping".to_string());
    };
    let provider = normalize_platform_provider(provider_raw)?;
    let model = model_raw.trim();
    if model.is_empty() {
        return Err("Invalid platform model mapping".to_string());
    }
    Ok(PlatformModelRef {
        provider,
        model: model.to_string(),
        ref_str: format!("{}/{}", provider_raw.trim().to_lowercase(), model),
    })
}

fn load_platform_model_map() -> Result<std::collections::HashMap<String, String>, String> {
    let raw = std::env::var("PLATFORM_MODEL_MAP_JSON").unwrap_or_default();
    let raw = raw.trim().to_string();
    if raw.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "Invalid PLATFORM_MODEL_MAP_JSON".to_string())?;
    let obj = parsed
        .as_object()
        .ok_or_else(|| "Invalid PLATFORM_MODEL_MAP_JSON".to_string())?;
    let mut out: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for (k, v) in obj.iter() {
        let id = k.trim();
        let Some(v) = v.as_str() else { continue };
        let ref_str = v.trim();
        if id.is_empty() || ref_str.is_empty() {
            continue;
        }
        out.insert(id.to_string(), ref_str.to_string());
    }
    Ok(out)
}

fn model_alias_looks_openai(alias_model_id: &str) -> bool {
    let cleaned = alias_model_id.trim().to_lowercase();
    if cleaned.is_empty() || cleaned.contains('/') {
        return false;
    }
    cleaned.starts_with("gpt-")
        || cleaned.starts_with("o1")
        || cleaned.starts_with("o3")
        || cleaned.starts_with("o4")
        || cleaned.starts_with("chatgpt-")
}

fn infer_openai_model_ref_from_alias(alias_model_id: &str) -> Option<PlatformModelRef> {
    if !model_alias_looks_openai(alias_model_id) {
        return None;
    }
    let cleaned = alias_model_id.trim();
    Some(PlatformModelRef {
        provider: PlatformProvider::OpenAi,
        model: cleaned.to_string(),
        ref_str: format!("openai/{}", cleaned),
    })
}

#[cfg(test)]
mod model_resolution_tests {
    use super::*;

    #[test]
    fn openai_alias_detection_matches_expected_prefixes() {
        assert!(model_alias_looks_openai("gpt-5.2"));
        assert!(model_alias_looks_openai("gpt-5.2-codex"));
        assert!(model_alias_looks_openai("o3-mini"));
        assert!(model_alias_looks_openai("chatgpt-4o-latest"));
        assert!(!model_alias_looks_openai("claude-sonnet-4.5"));
        assert!(!model_alias_looks_openai("anthropic/claude-sonnet-4.5"));
    }

    #[test]
    fn infer_openai_alias_model_ref_builds_openai_ref() {
        let inferred = infer_openai_model_ref_from_alias("gpt-5.2").expect("expected inference");
        assert_eq!(inferred.provider, PlatformProvider::OpenAi);
        assert_eq!(inferred.model, "gpt-5.2");
        assert_eq!(inferred.ref_str, "openai/gpt-5.2");
    }
}

fn resolve_platform_model_for_alias(alias_model_id: &str) -> Result<PlatformModelRef, String> {
    let cleaned = alias_model_id.trim();
    if cleaned.is_empty() {
        return Err("model_id is required".to_string());
    }
    if cleaned.contains('/') {
        return parse_platform_model_ref(cleaned);
    }

    let map = load_platform_model_map()?;
    if !map.is_empty() {
        let Some(raw) = map.get(cleaned) else {
            return Err(format!("Platform model not configured for '{}'", cleaned));
        };
        return parse_platform_model_ref(raw);
    }

    Err("Missing PLATFORM_MODEL_MAP_JSON".to_string())
}

async fn fetch_model_registry_row(
    proxy: &PlatformProxyConfig,
    model_id: &str,
) -> Option<ModelRegistryApiRow> {
    let cleaned = model_id.trim();
    if cleaned.is_empty() {
        return None;
    }

    let base = format!(
        "{}/rest/v1/model_registry",
        proxy.supabase_url.trim_end_matches('/')
    );
    let id_filter = format!("eq.{}", cleaned);
    let url = reqwest::Url::parse_with_params(
        &base,
        [
            (
                "select",
                "id,provider,provider_model,enabled,platform_enabled,byok_enabled",
            ),
            ("id", id_filter.as_str()),
            ("limit", "1"),
        ],
    )
    .ok()?;

    let res = reqwest::Client::new()
        .get(url)
        .header("apikey", proxy.supabase_anon_key.clone())
        .bearer_auth(proxy.access_token.clone())
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }

    let rows: Vec<ModelRegistryApiRow> = res.json().await.ok()?;
    rows.into_iter().next()
}

fn parse_boolish_i64(value: Option<&serde_json::Value>) -> i64 {
    match value {
        Some(serde_json::Value::Bool(flag)) => {
            if *flag {
                1
            } else {
                0
            }
        }
        Some(serde_json::Value::Number(num)) => num.as_i64().unwrap_or(0),
        Some(serde_json::Value::String(raw)) => {
            let trimmed = raw.trim().to_lowercase();
            if trimmed == "true" || trimmed == "yes" || trimmed == "on" {
                1
            } else if trimmed == "false" || trimmed == "no" || trimmed == "off" {
                0
            } else {
                trimmed.parse::<i64>().unwrap_or(0)
            }
        }
        _ => 0,
    }
}

fn parse_epoch_i64(value: Option<&serde_json::Value>) -> Option<i64> {
    match value {
        Some(serde_json::Value::Number(num)) => num.as_i64(),
        Some(serde_json::Value::String(raw)) => raw
            .trim()
            .parse::<i64>()
            .ok(),
        _ => None,
    }
}

async fn fetch_cloud_personal_memory_items_json(
    proxy: &PlatformProxyConfig,
    user_id: &str,
) -> Option<String> {
    let cleaned = user_id.trim();
    if cleaned.is_empty() {
        return None;
    }

    let base = format!(
        "{}/rest/v1/personal_memory_items",
        proxy.supabase_url.trim_end_matches('/')
    );
    let user_filter = format!("eq.{}", cleaned);
    let url = reqwest::Url::parse_with_params(
        &base,
        [
            ("select", "id,content,scope,scope_id,pinned,updated_at"),
            ("user_id", user_filter.as_str()),
            ("order", "pinned.desc,updated_at.desc"),
            ("limit", "200"),
        ],
    )
    .ok()?;

    let response = reqwest::Client::new()
        .get(url)
        .header("apikey", proxy.supabase_anon_key.clone())
        .bearer_auth(proxy.access_token.clone())
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let rows: Vec<serde_json::Value> = response.json().await.ok()?;
    let now_ts = db::now_ts();
    let normalized = rows
        .into_iter()
        .enumerate()
        .filter_map(|(idx, row)| {
            let id = row.get("id").and_then(|v| v.as_str())?.trim().to_string();
            let content = row
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let scope = row
                .get("scope")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if id.is_empty() || content.trim().is_empty() || scope.trim().is_empty() {
                return None;
            }
            let scope_id = row
                .get("scope_id")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let pinned = parse_boolish_i64(row.get("pinned"));
            let updated_at = parse_epoch_i64(row.get("updated_at"))
                .unwrap_or_else(|| now_ts.saturating_sub(idx as i64));
            Some(serde_json::json!({
                "id": id,
                "content": content,
                "scope": scope,
                "scope_id": scope_id,
                "pinned": pinned,
                "updated_at": updated_at
            }))
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&normalized).ok()
}

async fn fetch_active_community_system_prompt(
    proxy: &PlatformProxyConfig,
    user_id: &str,
    community_id: &str,
) -> Option<String> {
    let cleaned_user = user_id.trim();
    let cleaned_community = community_id.trim();
    if cleaned_user.is_empty() || cleaned_community.is_empty() {
        return None;
    }

    let url = format!(
        "{}/rest/v1/rpc/get_active_community_agent_system_prompt",
        proxy.supabase_url.trim_end_matches('/')
    );
    let body = serde_json::json!({
        "p_user_id": cleaned_user,
        "p_community_id": cleaned_community,
    });
    let response = reqwest::Client::new()
        .post(url)
        .header("apikey", proxy.supabase_anon_key.clone())
        .bearer_auth(proxy.access_token.clone())
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let payload: serde_json::Value = response.json().await.ok()?;
    let prompt = match payload {
        serde_json::Value::Array(rows) => rows
            .first()
            .and_then(|row| row.get("system_prompt"))
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .unwrap_or_default(),
        serde_json::Value::Object(map) => map
            .get("system_prompt")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .unwrap_or_default(),
        _ => String::new(),
    };

    if prompt.is_empty() {
        None
    } else {
        Some(prompt)
    }
}

async fn resolve_platform_model_for_alias_with_registry(
    alias_model_id: &str,
    platform_proxy: Option<&PlatformProxyConfig>,
    allow_openai_alias_inference: bool,
) -> Result<PlatformModelRef, String> {
    let cleaned = alias_model_id.trim();
    if cleaned.is_empty() {
        return Err("model_id is required".to_string());
    }
    if cleaned.contains('/') {
        return parse_platform_model_ref(cleaned);
    }

    if let Some(proxy) = platform_proxy {
        if let Some(row) = fetch_model_registry_row(proxy, cleaned).await {
            if row.enabled == Some(false) {
                return Err("Model is not available.".to_string());
            }
            let provider_raw = row.provider.unwrap_or_default();
            let provider = normalize_platform_provider(&provider_raw)?;
            let provider_model = row.provider_model.unwrap_or_default().trim().to_string();
            if !provider_model.is_empty() {
                return Ok(PlatformModelRef {
                    provider,
                    model: provider_model.clone(),
                    ref_str: format!("{}/{}", platform_provider_id(provider), provider_model),
                });
            }
        }
    }

    // Transition fallback: allow legacy env mapping until provider_model is populated in model_registry.
    match resolve_platform_model_for_alias(cleaned) {
        Ok(value) => Ok(value),
        Err(err) => {
            if allow_openai_alias_inference
                && (err == "Missing PLATFORM_MODEL_MAP_JSON"
                    || err.starts_with("Platform model not configured for"))
            {
                if let Some(inferred) = infer_openai_model_ref_from_alias(cleaned) {
                    return Ok(inferred);
                }
            }
            Err(err)
        }
    }
}

fn platform_provider_key_name(provider: PlatformProvider) -> &'static str {
    match provider {
        PlatformProvider::OpenAi => "openai",
        PlatformProvider::Anthropic => "anthropic",
        PlatformProvider::Google => "google",
        PlatformProvider::XAi => "x-ai",
    }
}

fn platform_provider_id(provider: PlatformProvider) -> &'static str {
    match provider {
        PlatformProvider::OpenAi => "openai",
        PlatformProvider::Anthropic => "anthropic",
        PlatformProvider::Google => "google",
        PlatformProvider::XAi => "x-ai",
    }
}

fn platform_provider_display_name(provider: PlatformProvider) -> &'static str {
    match provider {
        PlatformProvider::OpenAi => "OpenAI",
        PlatformProvider::Anthropic => "Anthropic",
        PlatformProvider::Google => "Google",
        PlatformProvider::XAi => "xAI",
    }
}

fn platform_openai_compatible_base_url(provider: PlatformProvider) -> Option<&'static str> {
    match provider {
        PlatformProvider::OpenAi => Some("https://api.openai.com/v1"),
        PlatformProvider::Google => Some("https://generativelanguage.googleapis.com/v1beta/openai"),
        PlatformProvider::XAi => Some("https://api.x.ai/v1"),
        PlatformProvider::Anthropic => None,
    }
}

static THREAD_RUN_LOCKS: Lazy<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static PENDING_TOOL_APPROVALS: Lazy<Mutex<HashMap<String, oneshot::Sender<ToolApprovalDecision>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static PENDING_INFERENCE_APPROVALS: Lazy<Mutex<HashMap<String, oneshot::Sender<bool>>>> =
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
        (
            Self {
                thread_id: thread_id.to_string(),
            },
            rx,
        )
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

fn parse_affordable_max_tokens(message: &str) -> Option<u32> {
    let lower = message.to_lowercase();
    let needle = "can only afford";
    let idx = lower.find(needle)?;
    let after = &lower[idx + needle.len()..];
    let start = after.find(|c: char| c.is_ascii_digit())?;
    let after = &after[start..];
    let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.trim().parse::<u32>().ok().filter(|v| *v > 0)
}

fn format_provider_error(resp_bytes: &[u8]) -> String {
    let fallback = String::from_utf8_lossy(resp_bytes).trim().to_string();
    let value = match serde_json::from_slice::<serde_json::Value>(resp_bytes) {
        Ok(v) => v,
        Err(_) => {
            return if fallback.is_empty() {
                "(no response body)".to_string()
            } else {
                fallback
            }
        }
    };

    let Some(err) = value.get("error") else {
        return if fallback.is_empty() {
            value.to_string()
        } else {
            fallback
        };
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
        return if fallback.is_empty() {
            value.to_string()
        } else {
            fallback
        };
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

fn is_platform_inference_quota_exceeded(resp_bytes: &[u8]) -> bool {
    String::from_utf8_lossy(resp_bytes)
        .to_lowercase()
        .contains("platform_inference_quota_exceeded")
}

fn is_platform_inference_not_allowed(resp_bytes: &[u8]) -> bool {
    let lower = String::from_utf8_lossy(resp_bytes).to_lowercase();
    lower.contains("platform_inference_not_allowed")
        || lower.contains("platform_inference_disabled")
        || lower.contains("missing bearer token")
        || lower.contains("invalid jwt")
        || lower.contains("session expired")
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
    let _ = db::append_event(
        conn,
        db_path,
        thread_id,
        "run_started",
        None,
        Some(&payload.to_string()),
        None,
    );
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
    let _ = db::append_event(
        conn,
        db_path,
        thread_id,
        "run_finished",
        None,
        Some(&payload.to_string()),
        None,
    );
}

fn finish_cancelled_messages_agent(
    window: &tauri::Window,
    conn: &rusqlite::Connection,
    db_path: &Path,
    thread_id: &str,
    run_id: &str,
    engine_input_event_id: Option<String>,
    engine_input_seq: Option<i64>,
) -> SendTurnResult {
    append_run_finished(
        conn,
        db_path,
        thread_id,
        run_id,
        "cancelled",
        Some("user_cancel"),
    );
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
        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
    // MVP: engines own execution. Arx does not expose an internal tool registry.
    Ok(Vec::new())
}

#[derive(Serialize)]
struct RuntimeCapabilities {
    transport: String,
    cursor_resume: bool,
    tool_approvals: bool,
    local_db_events: bool,
    streaming_tokens: bool,
}

#[derive(Serialize)]
struct InitializeResponse {
    protocol_version: i64,
    runtime_id: String,
    capabilities: RuntimeCapabilities,
}

#[tauri::command]
fn initialize_cmd() -> Result<InitializeResponse, String> {
    Ok(InitializeResponse {
        protocol_version: ARP_PROTOCOL_VERSION,
        runtime_id: "arx_harness_tauri".to_string(),
        capabilities: RuntimeCapabilities {
            transport: "tauri".to_string(),
            cursor_resume: true,
            tool_approvals: true,
            local_db_events: true,
            streaming_tokens: true,
        },
    })
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
async fn decide_inference_fallback_cmd(approval_id: String, approved: bool) -> Result<(), String> {
    let approval_id = approval_id.trim().to_string();
    if approval_id.is_empty() {
        return Err("approval_id is required".to_string());
    }
    let sender = {
        let mut map = PENDING_INFERENCE_APPROVALS.lock().await;
        map.remove(&approval_id)
    };
    let Some(sender) = sender else {
        return Err("inference fallback not awaiting approval".to_string());
    };
    sender
        .send(approved)
        .map_err(|_| "inference fallback approval receiver dropped".to_string())
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
    Ok(get_ui_state(&conn, &key)
        .ok()
        .flatten()
        .map(|value| parse_boolish(&value))
        .unwrap_or(false))
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

fn compute_tool_call_key(
    tool_name: &str,
    args: &serde_json::Value,
    workspace_scope_id: &str,
) -> String {
    let canonical = canonical_json_string(args);
    hex_sha256(format!("{}\n{}\n{}", tool_name, workspace_scope_id, canonical).as_bytes())
}

const AGENT_TOOL_KEY_HISTORY_WINDOW: usize = 8;

fn detect_repeating_tool_cycle(recent_tool_call_keys: &VecDeque<String>) -> bool {
    let len = recent_tool_call_keys.len();
    if len < 4 {
        return false;
    }

    let keys = recent_tool_call_keys
        .iter()
        .map(|value| value.as_str())
        .collect::<Vec<_>>();

    // ABAB cycle.
    if len >= 4 {
        let a = keys[len - 4];
        let b = keys[len - 3];
        let c = keys[len - 2];
        let d = keys[len - 1];
        if a == c && b == d && a != b {
            return true;
        }
    }

    // ABCABC cycle.
    if len >= 6 {
        let a = keys[len - 6];
        let b = keys[len - 5];
        let c = keys[len - 4];
        let d = keys[len - 3];
        let e = keys[len - 2];
        let f = keys[len - 1];
        if a == d && b == e && c == f && (a != b || b != c) {
            return true;
        }
    }

    false
}

fn push_tool_key_and_detect_cycle(
    recent_tool_call_keys: &mut VecDeque<String>,
    tool_call_key: &str,
) -> bool {
    recent_tool_call_keys.push_back(tool_call_key.to_string());
    while recent_tool_call_keys.len() > AGENT_TOOL_KEY_HISTORY_WINDOW {
        recent_tool_call_keys.pop_front();
    }
    detect_repeating_tool_cycle(recent_tool_call_keys)
}

#[cfg(test)]
mod tool_cycle_tests {
    use super::{detect_repeating_tool_cycle, push_tool_key_and_detect_cycle};
    use std::collections::VecDeque;

    #[test]
    fn detects_abab_cycle() {
        let mut recent = VecDeque::new();
        for key in ["a", "b", "a", "b"] {
            recent.push_back(key.to_string());
        }
        assert!(detect_repeating_tool_cycle(&recent));
    }

    #[test]
    fn detects_abcabc_cycle() {
        let mut recent = VecDeque::new();
        for key in ["a", "b", "c", "a", "b", "c"] {
            recent.push_back(key.to_string());
        }
        assert!(detect_repeating_tool_cycle(&recent));
    }

    #[test]
    fn ignores_non_cycle_sequences_and_enforces_window() {
        let mut recent = VecDeque::new();
        for key in ["a", "b", "c", "d", "e", "f", "g", "h", "i"] {
            let _ = push_tool_key_and_detect_cycle(&mut recent, key);
        }
        assert_eq!(recent.len(), 8);
        assert!(!detect_repeating_tool_cycle(&recent));
    }
}

fn tool_requires_approval(tool_name: &str) -> bool {
    matches!(tool_name, "write" | "edit" | "bash")
}

#[derive(Clone, Deserialize, Serialize)]
struct TaskPlanItem {
    step: String,
    status: String, // "pending" | "in_progress" | "completed"
}

#[derive(Clone, Deserialize, Serialize)]
struct TaskPlanPayload {
    explanation: Option<String>,
    plan: Vec<TaskPlanItem>,
}

#[derive(Clone, Serialize)]
struct PlanUpdatedPayload {
    session_id: String,
    args: TaskPlanPayload,
}

fn normalize_task_plan_status(raw: &str) -> Option<String> {
    let lower = raw.trim().to_lowercase();
    match lower.as_str() {
        "pending" => Some("pending".to_string()),
        "in_progress" | "inprogress" | "in-progress" => Some("in_progress".to_string()),
        "completed" | "complete" | "done" => Some("completed".to_string()),
        _ => None,
    }
}

fn parse_task_plan_payload(args: &serde_json::Value) -> Result<TaskPlanPayload, String> {
    let obj = args
        .as_object()
        .ok_or_else(|| "args must be an object".to_string())?;
    let explanation = obj
        .get("explanation")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let plan_val = obj
        .get("plan")
        .ok_or_else(|| "plan is required".to_string())?;
    let plan_arr = plan_val
        .as_array()
        .ok_or_else(|| "plan must be an array".to_string())?;
    if plan_arr.is_empty() {
        return Err("plan must be a non-empty array".to_string());
    }

    let mut items: Vec<TaskPlanItem> = Vec::new();
    for (idx, entry) in plan_arr.iter().enumerate() {
        let entry_obj = entry
            .as_object()
            .ok_or_else(|| format!("plan[{}] must be an object", idx))?;
        let step = entry_obj
            .get("step")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if step.is_empty() {
            return Err(format!("plan[{}].step is required", idx));
        }
        let raw_status = entry_obj
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let status = normalize_task_plan_status(raw_status)
            .ok_or_else(|| format!("plan[{}].status must be pending|in_progress|completed", idx))?;
        items.push(TaskPlanItem { step, status });
    }

    if items.len() > 24 {
        items.truncate(24);
    }

    Ok(TaskPlanPayload {
        explanation,
        plan: items,
    })
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
    tool_args: serde_json::Value,
    auto_approve_key: &str,
    auto_approve_write_edit: &mut bool,
    cancel_rx: watch::Receiver<bool>,
) -> AgentToolCallOutcome {
    let mut tool_name = normalize_agent_tool_name(raw_tool_name);
    let tool_args_for_exec = tool_args.clone();
    let original_args_json = canonical_json_string(&tool_args);

    let mut tool_args_for_events = tool_args;
    let mut synthetic_exec: Option<ToolExecResult> = None;

    let tool_args_error = tool_args_for_exec
        .as_object()
        .and_then(|obj| obj.get("__arx_tool_args_error"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let tool_args_input = tool_args_for_exec
        .as_object()
        .and_then(|obj| obj.get("__arx_tool_args_input"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(detail) = tool_args_error {
        if tool_name.is_empty() {
            tool_name = "unknown".to_string();
        }
        let mut msg = String::new();
        msg.push_str(&format!(
            "invalid tool arguments for \"{}\".\n",
            raw_tool_name.trim()
        ));
        msg.push_str(&detail);
        if let Some(input) = tool_args_input.as_deref() {
            msg.push_str("\n\ninput:\n");
            msg.push_str(input);
        }
        if !msg.ends_with('\n') {
            msg.push('\n');
        }
        msg.push_str("available_tools: read, list_dir, glob, grep, sha256, write, edit, bash\n");
        msg.push_str("hint: use write (or writes: [...]) for creating files; use edit for small in-file changes.\n");

        tool_args_for_events = serde_json::json!({
          "tool": raw_tool_name,
          "error": "invalid tool arguments",
          "detail": detail,
          "input": tool_args_input.unwrap_or(original_args_json.clone())
        });
        synthetic_exec = Some(tool_error(msg.trim().to_string()));
    } else if tool_name.is_empty() {
        tool_name = "unknown".to_string();
        let mut msg = String::new();
        msg.push_str("invalid tool name.\n");
        if !msg.ends_with('\n') {
            msg.push('\n');
        }
        msg.push_str("available_tools: read, list_dir, glob, grep, sha256, write, edit, bash\n");
        msg.push_str("hint: use write (or writes: [...]) for creating files; use edit for small in-file changes.\n");

        tool_args_for_events = serde_json::json!({
          "tool": raw_tool_name,
          "error": "invalid tool name",
          "input": original_args_json
        });
        synthetic_exec = Some(tool_error(msg.trim().to_string()));
    } else if !is_known_agent_tool_name(tool_name.as_str()) {
        let mut msg = String::new();
        msg.push_str(&format!("unknown tool: {}\n", tool_name));
        msg.push_str("available_tools: read, list_dir, glob, grep, sha256, write, edit, bash\n");
        msg.push_str("hint: use write (or writes: [...]) for creating files; use edit for small in-file changes.\n");

        tool_args_for_events = serde_json::json!({
          "tool": raw_tool_name,
          "error": "unknown tool",
          "input": original_args_json
        });
        synthetic_exec = Some(tool_error(msg.trim().to_string()));
    }

    let tool_call_id = uuid::Uuid::new_v4().to_string();
    let tool_call_key =
        compute_tool_call_key(&tool_name, &tool_args_for_events, workspace_scope_id);
    let args_json = canonical_json_string(&tool_args_for_events);
    let requires_approval = tool_requires_approval(&tool_name);
    let denied_by_mode = mode == "explore" && requires_approval;
    let is_write_edit = matches!(tool_name.as_str(), "write" | "edit");
    let is_non_idempotent_tool = matches!(tool_name.as_str(), "bash" | "write" | "edit");
    let auto_approved_by_session =
        !denied_by_mode && requires_approval && is_write_edit && *auto_approve_write_edit;

    let requested_payload = serde_json::json!({
      "v": 1,
      "run_id": run_id,
      "tool_call_id": tool_call_id.clone(),
      "tool_call_key": tool_call_key,
      "tool_name": tool_name.clone(),
      "args": tool_args_for_events.clone(),
      "requires_approval": requires_approval,
      "policy_basis": "mvp_default"
    });
    if db::append_event(
        conn,
        db_path,
        thread_id,
        "tool_call_requested",
        None,
        Some(&requested_payload.to_string()),
        None,
    )
    .is_ok()
    {
        emit_tool_calls_updated(window, thread_id);
    }

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
        if db::append_event(
            conn,
            db_path,
            thread_id,
            "tool_call_denied",
            None,
            Some(&decision_payload.to_string()),
            None,
        )
        .is_ok()
        {
            emit_tool_calls_updated(window, thread_id);
        }
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
        if db::append_event(
            conn,
            db_path,
            thread_id,
            if approved {
                "tool_call_approved"
            } else {
                "tool_call_denied"
            },
            None,
            Some(&decision_payload.to_string()),
            None,
        )
        .is_ok()
        {
            emit_tool_calls_updated(window, thread_id);
        }
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

    if is_non_idempotent_tool {
        if let Ok(Some(previous)) =
            db::find_latest_finished_tool_call_by_key(conn, thread_id, &tool_call_key)
        {
            if previous.status != "ok" {
                let finished_payload = serde_json::json!({
                  "v": 1,
                  "run_id": run_id,
                  "tool_call_id": tool_call_id.clone(),
                  "attempt": 0,
                  "status": "error",
                  "reason": "retry_requires_confirmation_non_idempotent",
                  "tool_use_id": tool_use_id,
                  "blocked_retry_of_tool_call_id": previous.tool_call_id,
                  "blocked_retry_of_status": previous.status.clone(),
                  "blocked_retry_of_reason": previous.reason.clone(),
                  "artifacts": []
                });
                if db::append_event(
                    conn,
                    db_path,
                    thread_id,
                    "tool_call_finished",
                    None,
                    Some(&finished_payload.to_string()),
                    None,
                )
                .is_ok()
                {
                    emit_tool_calls_updated(window, thread_id);
                }

                let _ = window.emit(
                    "tool-call-progress",
                    ToolCallProgressPayload {
                        session_id: thread_id.to_string(),
                        tool_call_id: tool_call_id.clone(),
                        tool_name: tool_name.clone(),
                        tool_args_preview: None,
                        status: "finished".to_string(),
                        result: Some("error".to_string()),
                    },
                );

                return AgentToolCallOutcome {
                    tool_result_content: format!(
                        "error: blocked automatic retry for non-idempotent tool `{}` because the previous identical logical call ended with status `{}`. Provide explicit new intent (for example by changing arguments) before retrying.",
                        tool_name, previous.status
                    ),
                    cancelled: false,
                };
            }
        }
    }

    if let Ok(Some(reuse_hit)) =
        db::find_latest_successful_tool_call_by_key(conn, thread_id, &tool_call_key)
    {
        let mut reused_tool_result = reuse_hit
            .tool_result
            .as_deref()
            .map(|v| v.to_string())
            .or_else(|| reuse_hit.result_preview.as_deref().map(|v| v.to_string()))
            .unwrap_or_else(|| "ok".to_string());
        if let Some(blob_ref) = reuse_hit.tool_result_blob_ref.as_deref() {
            if let Ok(abs_blob_path) = blob_store::blob_abs_path(db_path, blob_ref) {
                if let Ok(bytes) = std::fs::read(abs_blob_path) {
                    reused_tool_result = String::from_utf8_lossy(&bytes).to_string();
                }
            }
        }
        if reused_tool_result.trim().is_empty() {
            reused_tool_result = "ok".to_string();
        }

        let reused_tool_result_blob =
            if reused_tool_result.as_bytes().len() > IO_BLOB_THRESHOLD_BYTES {
                write_blob_and_record(conn, db_path, reused_tool_result.as_bytes())
            } else {
                None
            };
        let (redacted_preview, _preview_report) = context::redact_secrets(&reused_tool_result);
        let result_preview = redacted_preview.chars().take(1200).collect::<String>();

        let finished_payload = serde_json::json!({
          "v": 1,
          "run_id": run_id,
          "tool_call_id": tool_call_id.clone(),
          "attempt": 0,
          "status": "ok",
          "reason": "reused_prior_success",
          "tool_use_id": tool_use_id,
          "reused_from_tool_call_id": reuse_hit.tool_call_id,
          "reused_from_tool_call_key": tool_call_key,
          "result_preview": result_preview,
          "tool_result": if reused_tool_result_blob.is_none() { Some(reused_tool_result.clone()) } else { None::<String> },
          "tool_result_blob_id": reused_tool_result_blob.as_ref().map(|b| b.id.clone()),
          "tool_result_blob_ref": reused_tool_result_blob.as_ref().map(|b| b.rel_path.clone()),
          "artifacts": []
        });
        if db::append_event(
            conn,
            db_path,
            thread_id,
            "tool_call_finished",
            None,
            Some(&finished_payload.to_string()),
            None,
        )
        .is_ok()
        {
            emit_tool_calls_updated(window, thread_id);
        }

        let _ = window.emit(
            "tool-call-progress",
            ToolCallProgressPayload {
                session_id: thread_id.to_string(),
                tool_call_id: tool_call_id.clone(),
                tool_name: tool_name.clone(),
                tool_args_preview: None,
                status: "finished".to_string(),
                result: Some("ok".to_string()),
            },
        );

        return AgentToolCallOutcome {
            tool_result_content: reused_tool_result,
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
    if db::append_event(
        conn,
        db_path,
        thread_id,
        "tool_call_started",
        None,
        Some(&started_payload.to_string()),
        None,
    )
    .is_ok()
    {
        emit_tool_calls_updated(window, thread_id);
    }

    let tool_args_preview = {
        let path = tool_args_for_events
            .get("path")
            .or_else(|| tool_args_for_events.get("file_path"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let cmd = tool_args_for_events
            .get("cmd")
            .or_else(|| tool_args_for_events.get("command"))
            .and_then(|v| v.as_str())
            .map(|s| {
                let trimmed = s.trim();
                if trimmed.len() > 60 {
                    format!("{}...", &trimmed[..57])
                } else {
                    trimmed.to_string()
                }
            });
        let pat = tool_args_for_events
            .get("pat")
            .or_else(|| tool_args_for_events.get("pattern"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let writes = tool_args_for_events
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

    let exec = if let Some(exec) = synthetic_exec {
        exec
    } else if tool_name == "update_plan" {
        match parse_task_plan_payload(&tool_args_for_exec) {
            Ok(plan_payload) => {
                if let Ok(value) = serde_json::to_string(&plan_payload) {
                    let key = format!("task_plan::{}", thread_id);
                    let _ = set_ui_state(conn, &key, &value);
                }
                let _ = window.emit(
                    "plan-updated",
                    PlanUpdatedPayload {
                        session_id: thread_id.to_string(),
                        args: plan_payload,
                    },
                );
                tool_ok("ok".to_string())
            }
            Err(err) => tool_error(err),
        }
    } else {
        run_agent_tool(workspace, db_path, &tool_name, &tool_args_for_exec).await
    };
    let stdout_blob = write_blob_and_record(conn, db_path, &exec.stdout);
    let stderr_blob = write_blob_and_record(conn, db_path, &exec.stderr);
    let tool_result_blob = if exec.tool_result_content.as_bytes().len() > IO_BLOB_THRESHOLD_BYTES {
        write_blob_and_record(conn, db_path, exec.tool_result_content.as_bytes())
    } else {
        None
    };
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
      "tool_result": if tool_result_blob.is_none() { Some(exec.tool_result_content.clone()) } else { None::<String> },
      "tool_result_blob_id": tool_result_blob.as_ref().map(|b| b.id.clone()),
      "tool_result_blob_ref": tool_result_blob.as_ref().map(|b| b.rel_path.clone()),
      "stdout_blob_id": stdout_blob.as_ref().map(|b| b.id.clone()),
      "stdout_blob_ref": stdout_blob.as_ref().map(|b| b.rel_path.clone()),
      "stderr_blob_id": stderr_blob.as_ref().map(|b| b.id.clone()),
      "stderr_blob_ref": stderr_blob.as_ref().map(|b| b.rel_path.clone()),
      "artifacts": exec.artifacts
    });
    if db::append_event(
        conn,
        db_path,
        thread_id,
        "tool_call_finished",
        None,
        Some(&finished_payload.to_string()),
        None,
    )
    .is_ok()
    {
        emit_tool_calls_updated(window, thread_id);
    }

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
    user_system_prompt: Option<&str>,
    community_system_prompt: Option<&str>,
) -> String {
    let os = std::env::consts::OS;
    let workspace_trimmed = workspace_path.trim();
    let workspace_display = if workspace_trimmed.is_empty() {
        "(not bound)".to_string()
    } else {
        workspace_trimmed.to_string()
    };
    let git_repo = if workspace_trimmed.is_empty() {
        false
    } else {
        std::path::Path::new(workspace_trimmed)
            .join(".git")
            .exists()
    };

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

    let community_prompt_block = community_system_prompt
    .map(|v| v.trim())
    .filter(|v| !v.is_empty())
    .map(|v| {
      format!(
        "\nCommunity instructions (follow unless they conflict with the Rules or user preferences):\n{}\n",
        v
      )
    })
    .unwrap_or_default();

    let tool_rules = if workspace_trimmed.is_empty() {
        "- No workspace is bound; local filesystem tools are disabled.\n- Ask the user to bind a workspace before requesting read/list_dir/glob/grep/sha256/write/edit/bash.\n"
    } else {
        "- Stay within the workspace root; prefer relative paths; never access outside it.\n- Tools you can use: read, list_dir, glob, grep, sha256, write, edit, bash.\n  - read/list_dir/glob/grep/sha256 are safe.\n  - write/edit/bash may require approval. Do not ask “is it ok”; request the tool and proceed when allowed.\n  - For creating new files or rewriting full files: use write (it creates parent directories; no mkdir needed). You can also pass writes: [{path, content}, ...] for multiple files.\n  - For small targeted replacements inside a file: use edit.\n  - Use bash only for real shell tasks.\n"
    };

    let user_prompt_block = user_system_prompt
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(|v| {
            format!(
                "\nUser preferences (follow unless they conflict with the Rules):\n{}\n",
                v
            )
        })
        .unwrap_or_default();

    format!(
        "You are Atom, the AI coding agent of Arx.\n\nMission:\nDeliver correct, verifiable outcomes for the user with minimal unnecessary steps. Optimize for reliability over long time horizons: continuity, auditability, and safe side effects.\n\n<context>\nWorkspace: {}\nEnvironment:\n- Platform: {}\n- Git repo: {}\n\nPersonal memory (user-controlled):\n{}\n\nCommunity memory ({}):\n{}\n</context>\n{}\n{}\nPriority Order (highest to lowest):\n1) Safety, truthfulness, and hard runtime constraints.\n2) The user's explicit request and success criteria.\n3) Workspace/project constraints and repository conventions.\n4) User preferences.\n5) Community instructions.\n6) Style and brevity preferences.\n\nCore Operating Rules:\n- Never fabricate tool outputs, file contents, command results, or side effects.\n- Never claim success without evidence.\n- Prefer reversible, minimal-risk changes when uncertain.\n- Keep all actions inside the workspace boundary.\n- Never expose secrets; redact or ask for safe substitutes.\n- If blocked, ask at most one clarifying question and propose one concrete default next step.\n\nExecution Loop (apply every turn):\n1) Understand:\nIdentify objective, constraints, and acceptance criteria from the user request.\n2) Plan:\nChoose the smallest sequence of actions likely to satisfy the request.\n3) Act:\nExecute one coherent batch of tool actions.\n4) Verify:\nCheck outputs, run relevant tests/commands, and confirm behavior.\n5) Conclude:\nSummarize what changed, what was verified, and any remaining risk.\n\nMulti-Scale Analysis Mode (zoom in / zoom out):\n- Always be able to reason at both levels:\n  - Macro: whole-system architecture, invariants, component boundaries, data/control flow.\n  - Micro: exact files, functions, payloads, SQL rows, event sequences, and edge-case behavior.\n- When analyzing or debugging:\n  1) Start with first principles (goal, invariants, constraints).\n  2) Build a top-down system map (components + interfaces + flows).\n  3) Trace one concrete path end-to-end (happy path, then failure path).\n  4) Drill into the smallest failing unit (module/function/query/state transition).\n  5) Synthesize back to system impact and next best action.\n- Every substantial analysis response should include:\n  - System view: what this means globally.\n  - Local view: exact technical evidence.\n  - Risks/edge cases: what can break and why.\n  - Decision: recommended change and tradeoffs.\n- If uncertainty remains, state it explicitly and identify the minimum evidence needed to resolve it.\n\nTool Policy:\n{}- Prefer read/list_dir/glob/grep/sha256 for discovery.\n- Use write for file creation or full rewrites.\n- Use edit for targeted in-file replacements.\n- Use bash only for shell-native tasks.\n- For side-effectful operations, proceed through approval flow when required; do not bypass it.\n- If approval is denied, continue with the best read-only fallback or provide a concrete next option.\n\nAnti-Loop and Progress Rules:\n- Avoid repeating the same tool call with equivalent inputs.\n- If similar tool actions repeat without meaningful progress, stop and change strategy.\n- When a plan stalls, explicitly state what is blocking progress and what single change would unblock it.\n\nDefinition of Done:\nA task is done only when all are true:\n1) Requested behavior is implemented (or the requested analysis is delivered).\n2) Relevant verification has been executed and results reported.\n3) Any unresolved risks, assumptions, or follow-ups are stated explicitly.\n\nResponse Rules:\n- Be concise, direct, and technically precise.\n- Prefer structured Markdown when it improves clarity.\n- Include exact file paths and concrete evidence when reporting changes.\n- Do not include unnecessary filler.\n",
        workspace_display,
        os,
        if git_repo { "yes" } else { "no" },
        personal_memory_block,
        community_name,
        community_memory_block,
        community_prompt_block,
        user_prompt_block,
        tool_rules
    )
}

#[derive(Clone, Deserialize)]
struct HistoryOverrideMessage {
    role: String,
    content_json: serde_json::Value,
}

fn load_recent_history_messages(
    conn: &rusqlite::Connection,
    thread_id: &str,
    history_override_json: Option<&str>,
) -> Vec<(String, serde_json::Value)> {
    if let Some(json) = history_override_json {
        if let Ok(items) = serde_json::from_str::<Vec<HistoryOverrideMessage>>(json) {
            let mut filtered: Vec<(String, serde_json::Value)> = Vec::new();
            for item in items {
                let role = item.role.trim().to_string();
                if role != "user" && role != "assistant" {
                    continue;
                }
                let value = match item.content_json {
                    serde_json::Value::String(s) => {
                        serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)
                    }
                    other => other,
                };
                filtered.push((role, value));
            }
            if filtered.len() > 20 {
                filtered = filtered.into_iter().rev().take(20).collect::<Vec<_>>();
                filtered.reverse();
            }
            return filtered;
        }
    }

    if let Ok(history) = list_messages(conn, thread_id) {
        let mut filtered: Vec<(String, serde_json::Value)> = Vec::new();
        for msg in history {
            if msg.role != "user" && msg.role != "assistant" {
                continue;
            }
            let value: serde_json::Value =
                serde_json::from_str(&msg.content_json).unwrap_or(serde_json::Value::Null);
            filtered.push((msg.role, value));
        }
        if filtered.len() > 20 {
            filtered = filtered.into_iter().rev().take(20).collect::<Vec<_>>();
            filtered.reverse();
        }
        return filtered;
    }

    Vec::new()
}

const AGENT_MAX_PREFIX_MESSAGES_BEFORE_GOAL: usize = 12;
const AGENT_MAX_TAIL_MESSAGES_AFTER_GOAL: usize = 50;
const AGENT_HARD_COMPACT_TAIL_MESSAGES: usize = 14;
const AGENT_MAX_TOOL_RESULT_BYTES_FOR_PROMPT: usize = 20_000;
const AGENT_MAX_TOOL_ROUNDS_PER_RUN: u32 = 48;
const AGENT_MAX_IDENTICAL_TOOL_CALL_STREAK: u32 = 4;
const AGENT_MAX_COMPACTIONS_PER_RUN: u32 = 4;
const AGENT_AUTO_COMPACT_TOKEN_LIMIT: usize = 90_000;
const AGENT_AUTO_COMPACT_TARGET_TOKENS: usize = 72_000;
const AGENT_HARD_COMPACTION_SUMMARY_MAX_BYTES: usize = 12_000;
const AGENT_MAX_RUN_WALL_MS: u128 = 15 * 60 * 1000;

fn json_role(value: &serde_json::Value) -> Option<&str> {
    value.get("role").and_then(|v| v.as_str())
}

fn truncate_utf8_for_prompt(value: &str, max_bytes: usize) -> (String, bool) {
    let trimmed = value.trim();
    if trimmed.len() <= max_bytes {
        return (trimmed.to_string(), false);
    }
    let mut end = max_bytes;
    while end > 0 && !trimmed.is_char_boundary(end) {
        end -= 1;
    }
    let out = trimmed[..end].to_string();
    (out, true)
}

fn truncate_tool_result_for_prompt(value: &str) -> String {
    let (mut out, truncated) =
        truncate_utf8_for_prompt(value, AGENT_MAX_TOOL_RESULT_BYTES_FOR_PROMPT);
    if truncated {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str("\n(…output truncated for prompt; see tool logs for full output)");
    }
    out
}

fn estimate_tokens_from_text(value: &str) -> usize {
    let bytes = value.len();
    if bytes == 0 {
        0
    } else {
        // Lightweight approximation; sufficient for compaction guardrails.
        (bytes / 4).max(1)
    }
}

fn estimate_tokens_from_json(value: &serde_json::Value) -> usize {
    match serde_json::to_string(value) {
        Ok(serialized) => estimate_tokens_from_text(&serialized),
        Err(_) => 0,
    }
}

fn estimate_prompt_tokens(system_prompt: &str, messages: &[serde_json::Value]) -> usize {
    let mut total = estimate_tokens_from_text(system_prompt);
    for msg in messages {
        total = total.saturating_add(estimate_tokens_from_json(msg));
    }
    total
}

fn compose_system_prompt_with_handoff(
    base_system_prompt: &str,
    handoff_summary: Option<&str>,
) -> String {
    let base = base_system_prompt.trim();
    let summary = handoff_summary.map(|s| s.trim()).filter(|s| !s.is_empty());
    match summary {
        Some(summary) => format!(
            "{base}\n\n<session_handoff_summary>\n{summary}\n</session_handoff_summary>\nUse this as compressed prior context. Prefer concrete recent messages if conflicts arise."
        ),
        None => base.to_string(),
    }
}

fn load_latest_handoff_summary(conn: &rusqlite::Connection, thread_id: &str) -> Option<String> {
    let row = conn.query_row(
        "SELECT payload_json, text
         FROM events
         WHERE thread_id = ?1 AND type = 'handoff_summary'
         ORDER BY seq DESC
         LIMIT 1",
        [thread_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        },
    );
    let (payload_json, text) = match row {
        Ok(v) => v,
        Err(_) => return None,
    };

    if let Some(payload_json) = payload_json.as_deref() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload_json) {
            if let Some(summary) = value.get("summary").and_then(|v| v.as_str()) {
                let trimmed = summary.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    text.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn append_compaction_metadata_event(
    conn: &rusqlite::Connection,
    db_path: &Path,
    thread_id: &str,
    run_id: &str,
    mode: &str,
    trigger_reason: &str,
    before_estimated_tokens: usize,
    after_estimated_tokens: usize,
    pruned_tool_results: usize,
    pruned_text_messages: usize,
    removed_messages: usize,
    summary_event_id: Option<&str>,
) {
    let text = format!(
        "context_compaction mode={} before={} after={} removed_messages={} pruned_tool_results={}",
        mode,
        before_estimated_tokens,
        after_estimated_tokens,
        removed_messages,
        pruned_tool_results
    );
    let payload = serde_json::json!({
      "v": 1,
      "kind": "context_compaction",
      "run_id": run_id,
      "mode": mode,
      "trigger_reason": trigger_reason,
      "before_estimated_tokens": before_estimated_tokens,
      "after_estimated_tokens": after_estimated_tokens,
      "pruned_tool_results": pruned_tool_results,
      "pruned_text_messages": pruned_text_messages,
      "removed_messages": removed_messages,
      "summary_event_id": summary_event_id
    });
    let _ = db::append_event(
        conn,
        db_path,
        thread_id,
        "thread_metadata_changed",
        Some(&text),
        Some(&payload.to_string()),
        None,
    );
}

fn append_handoff_summary_event(
    conn: &rusqlite::Connection,
    db_path: &Path,
    thread_id: &str,
    run_id: &str,
    summary: &str,
    trigger_reason: &str,
    before_estimated_tokens: usize,
    after_estimated_tokens: usize,
) -> Option<String> {
    let payload = serde_json::json!({
      "v": 1,
      "run_id": run_id,
      "summary": summary,
      "trigger_reason": trigger_reason,
      "before_estimated_tokens": before_estimated_tokens,
      "after_estimated_tokens": after_estimated_tokens
    });
    db::append_event(
        conn,
        db_path,
        thread_id,
        "handoff_summary",
        Some(summary),
        Some(&payload.to_string()),
        None,
    )
    .ok()
    .map(|event| event.id)
}

fn build_handoff_summary_from_openai_messages(messages: &[serde_json::Value]) -> String {
    let mut user_points: Vec<String> = Vec::new();
    let mut assistant_points: Vec<String> = Vec::new();
    let mut tool_points: Vec<String> = Vec::new();

    for message in messages.iter().rev() {
        let role = json_role(message).unwrap_or("");
        match role {
            "user" => {
                if user_points.len() >= 6 {
                    continue;
                }
                if let Some(text) = message.get("content").and_then(|v| v.as_str()) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        let (preview, was_truncated) = truncate_utf8_for_prompt(trimmed, 280);
                        let line = if was_truncated {
                            format!("{}...", preview.trim_end())
                        } else {
                            preview
                        };
                        user_points.push(line);
                    }
                }
            }
            "assistant" => {
                if assistant_points.len() < 6 {
                    if let Some(text) = message.get("content").and_then(|v| v.as_str()) {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            let (preview, was_truncated) = truncate_utf8_for_prompt(trimmed, 280);
                            let line = if was_truncated {
                                format!("{}...", preview.trim_end())
                            } else {
                                preview
                            };
                            assistant_points.push(line);
                        }
                    }
                }
                if tool_points.len() < 8 {
                    if let Some(calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
                        for call in calls {
                            if tool_points.len() >= 8 {
                                break;
                            }
                            let name = call
                                .get("function")
                                .and_then(|f| f.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim();
                            if !name.is_empty() {
                                tool_points.push(format!("Called tool `{}`", name));
                            }
                        }
                    }
                }
            }
            "tool" => {
                if tool_points.len() >= 8 {
                    continue;
                }
                if let Some(text) = message.get("content").and_then(|v| v.as_str()) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        let (preview, was_truncated) = truncate_utf8_for_prompt(trimmed, 160);
                        let snippet = if was_truncated {
                            format!("{}...", preview.trim_end())
                        } else {
                            preview
                        };
                        tool_points.push(format!("Tool result: {}", snippet));
                    }
                }
            }
            _ => {}
        }
    }

    user_points.reverse();
    assistant_points.reverse();
    tool_points.reverse();

    let mut out = String::new();
    out.push_str("Session handoff summary\n");
    out.push_str(
        "- Goal: Continue the active task while preserving recent intent and constraints.\n",
    );
    if !user_points.is_empty() {
        out.push_str("\nRecent user intent:\n");
        for item in &user_points {
            out.push_str("- ");
            out.push_str(item);
            out.push('\n');
        }
    }
    if !assistant_points.is_empty() {
        out.push_str("\nRecent assistant state:\n");
        for item in &assistant_points {
            out.push_str("- ");
            out.push_str(item);
            out.push('\n');
        }
    }
    if !tool_points.is_empty() {
        out.push_str("\nRecent tool activity:\n");
        for item in &tool_points {
            out.push_str("- ");
            out.push_str(item);
            out.push('\n');
        }
    }
    let (trimmed, was_truncated) =
        truncate_utf8_for_prompt(&out, AGENT_HARD_COMPACTION_SUMMARY_MAX_BYTES);
    if was_truncated {
        format!(
            "{}\n\n(Compaction note: summary truncated to fit context budget.)",
            trimmed
        )
    } else {
        trimmed
    }
}

fn build_handoff_summary_from_anthropic_messages(messages: &[serde_json::Value]) -> String {
    let mut user_points: Vec<String> = Vec::new();
    let mut assistant_points: Vec<String> = Vec::new();
    let mut tool_points: Vec<String> = Vec::new();

    for message in messages.iter().rev() {
        let role = json_role(message).unwrap_or("");
        let blocks = message
            .get("content")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        match role {
            "user" => {
                for block in blocks {
                    if user_points.len() >= 6 {
                        break;
                    }
                    let kind = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if kind == "text" {
                        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                let (preview, was_truncated) =
                                    truncate_utf8_for_prompt(trimmed, 280);
                                let line = if was_truncated {
                                    format!("{}...", preview.trim_end())
                                } else {
                                    preview
                                };
                                user_points.push(line);
                            }
                        }
                    } else if kind == "tool_result" && tool_points.len() < 8 {
                        if let Some(text) = block.get("content").and_then(|v| v.as_str()) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                let (preview, was_truncated) =
                                    truncate_utf8_for_prompt(trimmed, 160);
                                let snippet = if was_truncated {
                                    format!("{}...", preview.trim_end())
                                } else {
                                    preview
                                };
                                tool_points.push(format!("Tool result: {}", snippet));
                            }
                        }
                    }
                }
            }
            "assistant" => {
                for block in blocks {
                    let kind = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if kind == "text" && assistant_points.len() < 6 {
                        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                let (preview, was_truncated) =
                                    truncate_utf8_for_prompt(trimmed, 280);
                                let line = if was_truncated {
                                    format!("{}...", preview.trim_end())
                                } else {
                                    preview
                                };
                                assistant_points.push(line);
                            }
                        }
                    } else if kind == "tool_use" && tool_points.len() < 8 {
                        let name = block
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim();
                        if !name.is_empty() {
                            tool_points.push(format!("Called tool `{}`", name));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    user_points.reverse();
    assistant_points.reverse();
    tool_points.reverse();

    let mut out = String::new();
    out.push_str("Session handoff summary\n");
    out.push_str(
        "- Goal: Continue the active task while preserving recent intent and constraints.\n",
    );
    if !user_points.is_empty() {
        out.push_str("\nRecent user intent:\n");
        for item in &user_points {
            out.push_str("- ");
            out.push_str(item);
            out.push('\n');
        }
    }
    if !assistant_points.is_empty() {
        out.push_str("\nRecent assistant state:\n");
        for item in &assistant_points {
            out.push_str("- ");
            out.push_str(item);
            out.push('\n');
        }
    }
    if !tool_points.is_empty() {
        out.push_str("\nRecent tool activity:\n");
        for item in &tool_points {
            out.push_str("- ");
            out.push_str(item);
            out.push('\n');
        }
    }
    let (trimmed, was_truncated) =
        truncate_utf8_for_prompt(&out, AGENT_HARD_COMPACTION_SUMMARY_MAX_BYTES);
    if was_truncated {
        format!(
            "{}\n\n(Compaction note: summary truncated to fit context budget.)",
            trimmed
        )
    } else {
        trimmed
    }
}

fn soft_compact_openai_messages(messages: &mut [serde_json::Value]) -> (usize, usize) {
    if messages.len() <= 1 {
        return (0, 0);
    }
    let preserve_from = messages.len().saturating_sub(24);
    let mut pruned_tool_results = 0usize;
    let mut pruned_text_messages = 0usize;

    for (idx, message) in messages.iter_mut().enumerate().skip(1) {
        if idx >= preserve_from {
            continue;
        }
        let role = json_role(message).unwrap_or("");
        if role == "tool" {
            if let Some(content) = message.get("content").and_then(|v| v.as_str()) {
                if content.len() > 480 {
                    if let Some(obj) = message.as_object_mut() {
                        obj.insert(
                            "content".to_string(),
                            serde_json::Value::String(
                                "[Old tool result content cleared. See tool_call_finished evidence for full output.]"
                                    .to_string(),
                            ),
                        );
                    }
                    pruned_tool_results += 1;
                }
            }
            continue;
        }
        if role == "assistant" {
            if let Some(content) = message.get("content").and_then(|v| v.as_str()) {
                if content.len() > 1_200 {
                    let (preview, was_truncated) = truncate_utf8_for_prompt(content, 1_200);
                    if was_truncated {
                        if let Some(obj) = message.as_object_mut() {
                            obj.insert(
                                "content".to_string(),
                                serde_json::Value::String(format!(
                                    "{}\n\n(Older assistant content truncated during compaction.)",
                                    preview.trim_end()
                                )),
                            );
                        }
                        pruned_text_messages += 1;
                    }
                }
            }
        }
    }

    (pruned_tool_results, pruned_text_messages)
}

fn soft_compact_anthropic_messages(messages: &mut [serde_json::Value]) -> (usize, usize) {
    if messages.is_empty() {
        return (0, 0);
    }
    let preserve_from = messages.len().saturating_sub(24);
    let mut pruned_tool_results = 0usize;
    let mut pruned_text_messages = 0usize;

    for (idx, message) in messages.iter_mut().enumerate() {
        if idx >= preserve_from {
            continue;
        }
        let Some(content_arr) = message.get_mut("content").and_then(|v| v.as_array_mut()) else {
            continue;
        };
        for block in content_arr.iter_mut() {
            let kind = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if kind == "tool_result" {
                if let Some(content) = block.get("content").and_then(|v| v.as_str()) {
                    if content.len() > 480 {
                        if let Some(obj) = block.as_object_mut() {
                            obj.insert(
                                "content".to_string(),
                                serde_json::Value::String(
                                    "[Old tool result content cleared. See tool_call_finished evidence for full output.]"
                                        .to_string(),
                                ),
                            );
                        }
                        pruned_tool_results += 1;
                    }
                }
            } else if kind == "text" {
                if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                    if text.len() > 1_200 {
                        let (preview, was_truncated) = truncate_utf8_for_prompt(text, 1_200);
                        if was_truncated {
                            if let Some(obj) = block.as_object_mut() {
                                obj.insert(
                                    "text".to_string(),
                                    serde_json::Value::String(format!(
                                        "{}\n\n(Older content truncated during compaction.)",
                                        preview.trim_end()
                                    )),
                                );
                            }
                            pruned_text_messages += 1;
                        }
                    }
                }
            }
        }
    }

    (pruned_tool_results, pruned_text_messages)
}

fn hard_compact_openai_messages(messages: &mut Vec<serde_json::Value>) -> usize {
    if messages.len() <= 2 {
        return 0;
    }
    let Some(system) = messages.first().cloned() else {
        return 0;
    };
    if json_role(&system) != Some("system") {
        return 0;
    }
    let Some(goal_idx) = messages.iter().rposition(|m| json_role(m) == Some("user")) else {
        return 0;
    };

    let mut out: Vec<serde_json::Value> = Vec::new();
    out.push(system);
    if goal_idx > 0 {
        out.push(messages[goal_idx].clone());
    }

    let mut tail_start = messages
        .len()
        .saturating_sub(AGENT_HARD_COMPACT_TAIL_MESSAGES);
    if tail_start < goal_idx.saturating_add(1) {
        tail_start = goal_idx.saturating_add(1);
    }
    while tail_start < messages.len() && json_role(&messages[tail_start]) == Some("tool") {
        tail_start += 1;
    }
    if tail_start < messages.len() {
        out.extend(messages[tail_start..].iter().cloned());
    }

    let removed = messages.len().saturating_sub(out.len());
    *messages = out;
    removed
}

fn hard_compact_anthropic_messages(messages: &mut Vec<serde_json::Value>) -> usize {
    if messages.len() <= 1 {
        return 0;
    }
    let Some(goal_idx) = messages.iter().rposition(|m| {
        json_role(m) == Some("user") && !is_anthropic_tool_result_only_user_message(m)
    }) else {
        return 0;
    };

    let mut out: Vec<serde_json::Value> = Vec::new();
    out.push(messages[goal_idx].clone());

    let mut tail_start = messages
        .len()
        .saturating_sub(AGENT_HARD_COMPACT_TAIL_MESSAGES);
    if tail_start < goal_idx.saturating_add(1) {
        tail_start = goal_idx.saturating_add(1);
    }
    if tail_start < messages.len()
        && is_anthropic_tool_result_only_user_message(&messages[tail_start])
    {
        if tail_start > goal_idx.saturating_add(1) {
            tail_start -= 1;
        } else {
            tail_start += 1;
        }
    }
    if tail_start < messages.len() {
        out.extend(messages[tail_start..].iter().cloned());
    }

    let removed = messages.len().saturating_sub(out.len());
    *messages = out;
    removed
}

#[cfg(test)]
mod compaction_tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn soft_compact_openai_prunes_old_tool_and_long_assistant() {
        let long_tool = "x".repeat(700);
        let long_assistant = "y".repeat(1_800);
        let recent_tool = "z".repeat(700);
        let mut messages: Vec<serde_json::Value> = vec![json!({
            "role": "system",
            "content": "system"
        })];
        messages.push(json!({ "role": "tool", "content": long_tool }));
        messages.push(json!({ "role": "assistant", "content": long_assistant }));

        for i in 0..27 {
            if i == 5 {
                messages.push(json!({ "role": "tool", "content": recent_tool }));
            } else {
                messages.push(json!({ "role": "assistant", "content": format!("recent-{i}") }));
            }
        }

        let (pruned_tool_results, pruned_text_messages) =
            soft_compact_openai_messages(messages.as_mut_slice());

        assert!(pruned_tool_results >= 1);
        assert!(pruned_text_messages >= 1);
        assert_eq!(
            messages[1].get("content").and_then(|v| v.as_str()),
            Some(
                "[Old tool result content cleared. See tool_call_finished evidence for full output.]"
            )
        );
        assert!(messages[2]
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .contains("(Older assistant content truncated during compaction.)"));
        assert_eq!(
            messages[8].get("content").and_then(|v| v.as_str()),
            Some("z".repeat(700).as_str())
        );
    }

    #[test]
    fn hard_compact_openai_preserves_system_goal_and_tail() {
        let mut messages: Vec<serde_json::Value> = vec![json!({
            "role": "system",
            "content": "system"
        })];
        messages.push(json!({ "role": "user", "content": "older goal" }));
        messages.push(json!({ "role": "assistant", "content": "older assistant" }));
        messages.push(json!({ "role": "user", "content": "latest goal" }));
        for i in 0..22 {
            let role = if i % 3 == 0 { "assistant" } else { "tool" };
            messages.push(json!({
                "role": role,
                "content": format!("tail-{i}")
            }));
        }

        let removed = hard_compact_openai_messages(&mut messages);
        assert!(removed > 0);
        assert_eq!(json_role(&messages[0]), Some("system"));
        assert_eq!(json_role(&messages[1]), Some("user"));
        assert_eq!(
            messages[1].get("content").and_then(|v| v.as_str()),
            Some("latest goal")
        );
        assert!(messages.len() <= AGENT_HARD_COMPACT_TAIL_MESSAGES + 2);
    }

    #[test]
    fn handoff_summary_event_roundtrips_latest_summary() {
        let temp_root = std::env::temp_dir().join(format!("arx-handoff-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_root).expect("create temp dir");
        let db_path = temp_root.join("arx.db");
        let state = db::init_db_at(&db_path, "test-key").expect("init db");
        let conn = open_conn(&state.db_path, &state.key).expect("open conn");
        let thread =
            create_thread(&conn, "test", ENGINE_MESSAGES_AGENT, None).expect("create thread");

        let first_id = append_handoff_summary_event(
            &conn,
            &state.db_path,
            &thread.id,
            "run-1",
            "summary one",
            "token_budget",
            100,
            80,
        );
        assert!(first_id.is_some());
        let second_id = append_handoff_summary_event(
            &conn,
            &state.db_path,
            &thread.id,
            "run-2",
            "summary two",
            "token_budget",
            120,
            70,
        );
        assert!(second_id.is_some());

        let loaded = load_latest_handoff_summary(&conn, &thread.id);
        assert_eq!(loaded.as_deref(), Some("summary two"));

        let _ = fs::remove_dir_all(&temp_root);
    }
}

fn trim_openai_tool_loop_messages(messages: &mut Vec<serde_json::Value>) {
    if messages.len() <= 1 {
        return;
    }
    let Some(system) = messages.first().cloned() else {
        return;
    };
    if json_role(&system) != Some("system") {
        return;
    }
    let Some(goal_idx) = messages.iter().rposition(|m| json_role(m) == Some("user")) else {
        return;
    };

    let prefix_start = std::cmp::max(
        1,
        goal_idx.saturating_sub(AGENT_MAX_PREFIX_MESSAGES_BEFORE_GOAL),
    );

    let tail_all_start = goal_idx.saturating_add(1);
    let tail_len = messages.len().saturating_sub(tail_all_start);
    let mut tail_start =
        tail_all_start.saturating_add(tail_len.saturating_sub(AGENT_MAX_TAIL_MESSAGES_AFTER_GOAL));
    if tail_start < tail_all_start {
        tail_start = tail_all_start;
    }

    while tail_start > tail_all_start && json_role(&messages[tail_start]) == Some("tool") {
        tail_start = tail_start.saturating_sub(1);
    }
    while tail_start < messages.len() && json_role(&messages[tail_start]) == Some("tool") {
        tail_start += 1;
    }

    let mut out: Vec<serde_json::Value> = Vec::new();
    out.push(system);
    if prefix_start <= goal_idx {
        out.extend(messages[prefix_start..=goal_idx].iter().cloned());
    }
    if tail_start < messages.len() {
        out.extend(messages[tail_start..].iter().cloned());
    }
    *messages = out;
}

fn is_anthropic_tool_result_only_user_message(message: &serde_json::Value) -> bool {
    if json_role(message) != Some("user") {
        return false;
    }
    let Some(arr) = message.get("content").and_then(|v| v.as_array()) else {
        return false;
    };
    if arr.is_empty() {
        return false;
    }
    arr.iter()
        .all(|block| block.get("type").and_then(|v| v.as_str()) == Some("tool_result"))
}

fn trim_anthropic_tool_loop_messages(messages: &mut Vec<serde_json::Value>) {
    if messages.is_empty() {
        return;
    }
    let Some(goal_idx) = messages.iter().rposition(|m| {
        json_role(m) == Some("user") && !is_anthropic_tool_result_only_user_message(m)
    }) else {
        return;
    };

    let prefix_start = goal_idx.saturating_sub(AGENT_MAX_PREFIX_MESSAGES_BEFORE_GOAL);

    let tail_all_start = goal_idx.saturating_add(1);
    let tail_len = messages.len().saturating_sub(tail_all_start);
    let mut tail_start =
        tail_all_start.saturating_add(tail_len.saturating_sub(AGENT_MAX_TAIL_MESSAGES_AFTER_GOAL));
    if tail_start < tail_all_start {
        tail_start = tail_all_start;
    }

    if tail_start < messages.len()
        && is_anthropic_tool_result_only_user_message(&messages[tail_start])
    {
        if tail_start > tail_all_start {
            tail_start -= 1;
        } else {
            tail_start += 1;
        }
    }

    let mut out: Vec<serde_json::Value> = Vec::new();
    out.extend(messages[prefix_start..=goal_idx].iter().cloned());
    if tail_start < messages.len() {
        out.extend(messages[tail_start..].iter().cloned());
    }
    *messages = out;
}

fn make_agent_tool_schema() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
          "name": "update_plan",
          "description": "Update the UI Plan panel for this session. Use a short plan with 3–6 steps and statuses: pending|in_progress|completed.",
          "input_schema": {
            "type": "object",
            "properties": {
              "explanation": { "type": "string" },
              "plan": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "step": { "type": "string" },
                    "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] }
                  },
                  "required": ["step", "status"]
                }
              }
            },
            "required": ["plan"]
          }
        }),
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

fn make_agent_tool_schema_update_plan_only() -> Vec<serde_json::Value> {
    make_agent_tool_schema()
        .into_iter()
        .filter(|tool| tool.get("name").and_then(|v| v.as_str()) == Some("update_plan"))
        .collect()
}

fn make_agent_tool_schema_openai() -> Vec<serde_json::Value> {
    make_agent_tool_schema()
        .into_iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_string();
            let description = tool
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parameters = tool
                .get("input_schema")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
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

fn make_agent_tool_schema_openai_responses() -> Vec<serde_json::Value> {
    make_agent_tool_schema()
        .into_iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_string();
            let description = tool
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parameters = tool
                .get("input_schema")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            Some(serde_json::json!({
              "type": "function",
              "name": name,
              "description": description,
              "parameters": parameters,
              "strict": false
            }))
        })
        .collect()
}

fn make_agent_tool_schema_openai_update_plan_only() -> Vec<serde_json::Value> {
    make_agent_tool_schema_update_plan_only()
        .into_iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_string();
            let description = tool
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parameters = tool
                .get("input_schema")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
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

fn make_agent_tool_schema_openai_responses_update_plan_only() -> Vec<serde_json::Value> {
    make_agent_tool_schema_update_plan_only()
        .into_iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_string();
            let description = tool
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parameters = tool
                .get("input_schema")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            Some(serde_json::json!({
              "type": "function",
              "name": name,
              "description": description,
              "parameters": parameters,
              "strict": false
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
    let root_canon = root_path
        .canonicalize()
        .unwrap_or_else(|_| root_path.to_path_buf());
    let abs_canon = abs.canonicalize().unwrap_or_else(|_| abs.to_path_buf());
    abs_canon
        .strip_prefix(&root_canon)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| abs.to_string_lossy().to_string())
}

fn write_file_atomic(path: &std::path::Path, bytes: &[u8]) -> anyhow::Result<()> {
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
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
    if cfg!(windows) {
        "rg.exe"
    } else {
        "rg"
    }
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
    Ok(db_path
        .parent()
        .ok_or_else(|| "failed to resolve app data dir".to_string())?
        .join("bin"))
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
    let output = cmd
        .output()
        .map_err(|e| format!("{} failed: {}", label, e))?;
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
        return Err(format!(
            "ripgrep download failed (status {})",
            resp.status()
        ));
    }
    let archive_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("ripgrep download read failed: {}", e))?
        .to_vec();

    let archive_path = bin_dir.join(&filename);
    write_file_atomic(&archive_path, &archive_bytes)
        .map_err(|e| format!("write ripgrep archive failed: {}", e))?;

    let extract_dir = bin_dir.join(format!(
        ".arx.ripgrep.extract.{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("create extract dir failed: {}", e))?;

    let extract_result = match ext {
        "tar.gz" => {
            let mut cmd = std::process::Command::new("tar");
            cmd.arg("-xzf")
                .arg(&archive_path)
                .arg("-C")
                .arg(&extract_dir);
            run_checked_command(&mut cmd, "tar extract")
        }
        "zip" => {
            if cfg!(windows) {
                let archive_str = archive_path.to_string_lossy().replace('\'', "''");
                let dest_str = extract_dir.to_string_lossy().replace('\'', "''");
                let mut cmd = std::process::Command::new("powershell");
                cmd.arg("-NoProfile").arg("-Command").arg(format!(
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
        Err(extract_result
            .err()
            .unwrap_or_else(|| "extract failed".to_string()))
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
        std::fs::set_permissions(&managed, perms)
            .map_err(|e| format!("ripgrep chmod failed: {}", e))?;
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

    for glob in [
        "!.git/**",
        "!node_modules/**",
        "!dist/**",
        "!target/**",
        "!blobs/**",
    ] {
        cmd.arg("--glob").arg(glob);
    }

    if needs_pcre2 {
        cmd.arg("--pcre2");
    }

    cmd.arg("--regexp").arg(pat);

    if let Some(include) = include.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        cmd.arg("--glob").arg(include);
    }

    cmd.arg(base_rel)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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

    let status = child
        .wait()
        .map_err(|e| format!("ripgrep wait failed: {}", e))?;
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
        "updateplan" => "update_plan".to_string(),
        _ => lower,
    }
}

fn is_known_agent_tool_name(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "update_plan"
            | "read"
            | "list_dir"
            | "sha256"
            | "write"
            | "edit"
            | "glob"
            | "grep"
            | "bash"
    )
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

async fn run_agent_tool(
    workspace_root: &str,
    db_path: &Path,
    tool_name: &str,
    args: &serde_json::Value,
) -> ToolExecResult {
    let workspace_root = workspace_root.trim();
    if workspace_root.is_empty() || !std::path::Path::new(workspace_root).is_absolute() {
        return tool_error(
            "workspace not bound; select a workspace before using tools".to_string(),
        );
    }

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
            let offset = obj
                .get("offset")
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
                .max(0) as usize;
            let limit = obj
                .get("limit")
                .and_then(|v| v.as_i64())
                .unwrap_or(200)
                .max(1) as usize;
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
            out_lines.push(format!(
                "dir: {} ({} dirs, {} files)",
                rel,
                dirs.len(),
                files.len()
            ));
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
                match run_ripgrep_grep(
                    &rg_path,
                    workspace_root,
                    &base_rel,
                    pat,
                    include,
                    MAX_HITS,
                    needs_pcre2,
                ) {
                    Ok((hits, truncated, had_errors)) => {
                        let mut out_lines: Vec<String> = Vec::new();
                        out_lines.push(format!(
                            "hits: {}{} (backend: rg{})",
                            hits.len(),
                            if truncated { " (truncated)" } else { "" },
                            if needs_pcre2 { ", pcre2" } else { "" }
                        ));
                        if had_errors {
                            out_lines
                                .push("(some paths were inaccessible and skipped)".to_string());
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
                    Some(err) => {
                        format!("unsupported regex feature (look-around/backrefs); {}", err)
                    }
                    None => "unsupported regex feature (look-around/backrefs); ripgrep unavailable"
                        .to_string(),
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
                    let before_bytes = if exists {
                        std::fs::read(&abs).ok()
                    } else {
                        None
                    };
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
                        before_bytes,
                    });
                }

                let mut artifacts: Vec<serde_json::Value> = Vec::new();
                let mut changed: Vec<String> = Vec::new();
                for item in prepared {
                    if let Err(err) = write_file_atomic(&item.abs, item.content.as_bytes()) {
                        return tool_error(format!("write failed ({}): {}", item.rel, err));
                    }
                    let after_bytes = std::fs::read(&item.abs)
                        .unwrap_or_else(|_| item.content.as_bytes().to_vec());
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
                let summary = format!(
                    "ok\nwrote {} file(s):\n{}",
                    changed.len(),
                    changed.join("\n")
                );
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
            let before_bytes = if exists {
                std::fs::read(&abs).ok()
            } else {
                None
            };
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
                return tool_error(
                    "expected_before_sha256 provided, but file does not exist".to_string(),
                );
            }

            if old.is_empty() {
                if let Err(err) = write_file_atomic(&abs, new.as_bytes()) {
                    return tool_error(format!("write failed: {}", err));
                }
                let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| new.as_bytes().to_vec());
                let after_hash = hex_sha256(&after_bytes);

                let mut result = tool_ok(if exists {
                    "ok".to_string()
                } else {
                    "ok (created)".to_string()
                });
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
            let replaced = if all {
                text.replace(old, new)
            } else {
                text.replacen(old, new, 1)
            };
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
                    return tool_error(format!(
                        "cwd does not exist and could not be created: {}",
                        err
                    ));
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
                if out.trim().is_empty() {
                    "(empty)".to_string()
                } else {
                    out.trim().to_string()
                }
            };

            ToolExecResult {
                status: if timed_out { "error" } else { "ok" },
                tool_result_content,
                stdout,
                stderr,
                exit_code,
                artifacts: Vec::new(),
                reason: if timed_out {
                    Some("timeout".to_string())
                } else {
                    None
                },
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
    inference_source: String,
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

fn emit_tool_calls_updated(window: &tauri::Window, session_id: &str) {
    let _ = window.emit(
        "tool-calls-updated",
        SessionIdPayload {
            session_id: session_id.to_string(),
        },
    );
}

#[derive(Clone, Serialize)]
struct InferenceFallbackPayload {
    session_id: String,
    from: String,
    to: String,
    reason: String,
}

#[derive(Clone, Serialize)]
struct PlatformInferenceActionRequiredPayload {
    session_id: String,
    approval_id: String,
    provider_id: String,
    provider_label: String,
    model_id: String,
    reason: String,
}

#[derive(Clone, Serialize)]
struct AgentStatusPayload {
    session_id: String,
    status: String, // "thinking" | "working" | "idle"
    tool_name: Option<String>,
    tool_args_preview: Option<String>,
}

#[derive(Clone, Serialize)]
struct ToolCallProgressPayload {
    session_id: String,
    tool_call_id: String,
    tool_name: String,
    tool_args_preview: Option<String>,
    status: String,         // "started" | "finished"
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

fn append_messages_agent_assistant_message(
    conn: &rusqlite::Connection,
    db_path: &Path,
    thread_id: &str,
    content_text: &str,
    model_id: &str,
    run_id: &str,
    source_event_ids: &[String],
    provider_id: &str,
    provider_model_ref: Option<&str>,
    inference_source: &str,
    max_tokens: u32,
    memory_used: Option<&[context_builder::UsedPersonalMemoryItem]>,
    context_community_id: Option<&str>,
) {
    let mut payload = serde_json::json!({
      "v": 1,
      "role": "assistant",
      "content": { "text": content_text },
      "meta": {
        "engine_id": ENGINE_MESSAGES_AGENT,
        "model_id": model_id,
        "provider_id": provider_id,
        "provider_model_ref": provider_model_ref,
        "inference_source": inference_source,
        "context_community_id": context_community_id,
        "run_id": run_id,
        "max_tokens": max_tokens
      },
      "source_event_ids": source_event_ids
    });
    if let Some(items) = memory_used {
        if !items.is_empty() {
            if let Some(meta) = payload.get_mut("meta").and_then(|v| v.as_object_mut()) {
                meta.insert(
                    "memory_used".to_string(),
                    serde_json::Value::Array(
                        items
                            .iter()
                            .map(|it| {
                                serde_json::json!({
                                  "id": it.id.as_str(),
                                  "content": it.content.as_str(),
                                  "scope": it.scope.as_str(),
                                  "scope_id": it.scope_id.as_deref(),
                                  "pinned": it.pinned != 0,
                                  "updated_at": it.updated_at
                                })
                            })
                            .collect::<Vec<_>>(),
                    ),
                );
            }
        }
    }
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

async fn await_inference_fallback_approval(
    window: &tauri::Window,
    session_id: &str,
    model_id: &str,
    provider: PlatformProvider,
    reason: &str,
    mut cancel_rx: watch::Receiver<bool>,
) -> bool {
    let approval_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<bool>();
    {
        let mut map = PENDING_INFERENCE_APPROVALS.lock().await;
        map.insert(approval_id.clone(), tx);
    }

    let _ = window.emit(
        "platform-inference-action-required",
        PlatformInferenceActionRequiredPayload {
            session_id: session_id.to_string(),
            approval_id: approval_id.clone(),
            provider_id: platform_provider_id(provider).to_string(),
            provider_label: platform_provider_display_name(provider).to_string(),
            model_id: model_id.to_string(),
            reason: reason.to_string(),
        },
    );

    if *cancel_rx.borrow() {
        let mut map = PENDING_INFERENCE_APPROVALS.lock().await;
        map.remove(&approval_id);
        return false;
    }

    let decision = tokio::select! {
      decision = rx => {
        match decision {
          Ok(approved) => approved,
          Err(_) => false,
        }
      }
      _ = cancel_rx.changed() => false
    };

    let mut map = PENDING_INFERENCE_APPROVALS.lock().await;
    map.remove(&approval_id);
    decision
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

async fn send_turn_messages_agent(
    window: &tauri::Window,
    mut conn: rusqlite::Connection,
    db_path: &Path,
    thread_id: &str,
    workspace: &str,
    mode: &str,
    selected_model_id: &str,
    input: &str,
    atom_system_prompt: &str,
    used_personal_memory: &[context_builder::UsedPersonalMemoryItem],
    history_messages_json: Option<String>,
    platform_proxy: Option<PlatformProxyConfig>,
    mut cancel_rx: watch::Receiver<bool>,
    context_community_id: Option<String>,
) -> Result<SendTurnResult, String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let run_started_at = Instant::now();
    let mut final_inference_source: Option<String> = None;
    let context_community_id = context_community_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());
    let workspace_scope_id = workspace_scope_id_from_path(workspace);

    append_run_started(
        &conn,
        db_path,
        thread_id,
        &run_id,
        &workspace_scope_id,
        mode,
        ENGINE_MESSAGES_AGENT,
        Some(selected_model_id),
    );

    let prefetched_chatgpt_auth: Option<ChatgptAuthV1> =
        if model_alias_looks_openai(selected_model_id) {
            match get_chatgpt_auth_for_inference().await {
                Ok(value) => value,
                Err(_) => None,
            }
        } else {
            None
        };

    let model_ref = match resolve_platform_model_for_alias_with_registry(
        selected_model_id,
        platform_proxy.as_ref(),
        model_alias_looks_openai(selected_model_id),
    )
    .await
    {
        Ok(v) => v,
        Err(err) => {
            append_messages_agent_assistant_message(
                &conn,
                db_path,
                thread_id,
                &format!("Engine error: {}", err),
                selected_model_id,
                &run_id,
                &[],
                "unknown",
                None,
                "system",
                DEFAULT_MAX_TOKENS,
                None,
                context_community_id,
            );
            append_run_finished(
                &conn,
                db_path,
                thread_id,
                &run_id,
                "error",
                Some("missing_model_mapping"),
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                SessionIdPayload {
                    session_id: thread_id.to_string(),
                },
            );
            return Ok(SendTurnResult {
                thread_id: thread_id.to_string(),
                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: None,
                engine_input_seq: None,
                run_id: Some(run_id),
            });
        }
    };
    let provider_id = platform_provider_id(model_ref.provider);
    let provider_model_ref_str = model_ref.ref_str.clone();
    let provider_model_ref = Some(provider_model_ref_str.as_str());
    let provider_model_id = model_ref.model.clone();

    let input_trim = input.trim();
    let (input_redacted, input_report) = context::redact_secrets(input_trim);
    if input_report.blocked {
        append_messages_agent_assistant_message(
            &conn,
            db_path,
            thread_id,
            "Blocked: sensitive content detected in message. Remove secrets before sending.",
            selected_model_id,
            &run_id,
            &[],
            provider_id,
            provider_model_ref,
            "system",
            DEFAULT_MAX_TOKENS,
            None,
            context_community_id,
        );
        append_run_finished(
            &conn,
            db_path,
            thread_id,
            &run_id,
            "error",
            Some("secret_redaction"),
        );
        let _ = window.emit(
            "openrouter-turn-finished",
            SessionIdPayload {
                session_id: thread_id.to_string(),
            },
        );
        return Ok(SendTurnResult {
            thread_id: thread_id.to_string(),
            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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

    let mut platform_available_for_run = platform_proxy.as_ref().is_some();
    let platform_agent_infer_url = platform_proxy.as_ref().map(|cfg| {
        format!(
            "{}/functions/v1/platform_agent_infer",
            cfg.supabase_url.trim_end_matches('/')
        )
    });
    let mut platform_fallback_notified = false;

    let mut byok_provider_key: Option<String> = None;
    let mut get_byok_provider_key = || -> Result<String, String> {
        if !BYOK_ENABLED {
            return Err(
                "BYOK is disabled. Use Arx AI quota, ChatGPT sign-in for OpenAI on desktop, or upgrade."
                    .to_string(),
            );
        }
        if let Some(value) = byok_provider_key.clone() {
            return Ok(value);
        }
        let key_name = platform_provider_key_name(model_ref.provider);
        let entry = Entry::new("com.arx.app", key_name).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(value) => {
                byok_provider_key = Some(value.clone());
                Ok(value)
            }
            Err(_) => Err(format!(
                "Missing {} API key. Add it in Settings → Models.",
                platform_provider_display_name(model_ref.provider)
            )),
        }
    };

    if model_ref.provider != PlatformProvider::Anthropic {
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

        let base_system_prompt = atom_system_prompt.to_string();
        let mut active_handoff_summary = load_latest_handoff_summary(&conn, thread_id);
        let initial_system_prompt = compose_system_prompt_with_handoff(
            &base_system_prompt,
            active_handoff_summary.as_deref(),
        );

        // Base conversation: system in messages, then last ~20 user/assistant text messages.
        let mut messages: Vec<serde_json::Value> = Vec::new();
        messages.push(serde_json::json!({ "role": "system", "content": initial_system_prompt }));
        for (role, value) in
            load_recent_history_messages(&conn, thread_id, history_messages_json.as_deref())
        {
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
            messages.push(serde_json::json!({ "role": role, "content": redacted }));
        }
        if messages
            .last()
            .and_then(|m| m.get("role"))
            .and_then(|v| v.as_str())
            != Some("user")
            || messages
                .last()
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
                != Some(input_to_send.as_str())
        {
            messages.push(serde_json::json!({ "role": "user", "content": input_to_send.clone() }));
        }

        let tools_schema_chat = if workspace.trim().is_empty() {
            make_agent_tool_schema_openai_update_plan_only()
        } else {
            make_agent_tool_schema_openai()
        };
        let tools_schema_responses = if workspace.trim().is_empty() {
            make_agent_tool_schema_openai_responses_update_plan_only()
        } else {
            make_agent_tool_schema_openai_responses()
        };
        let client = reqwest::Client::new();
        let base_url = platform_openai_compatible_base_url(model_ref.provider)
            .unwrap_or("https://api.openai.com/v1")
            .trim_end_matches('/');
        let chat_url = format!("{}/chat/completions", base_url);
        let mut chatgpt_auth: Option<ChatgptAuthV1> =
            if model_ref.provider == PlatformProvider::OpenAi {
                prefetched_chatgpt_auth.clone()
            } else {
                None
            };
        let mut chatgpt_fallback_approved_for_run = false;
        let mut chatgpt_fallback_notified = false;
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
        let mut tool_rounds: u32 = 0;
        let mut last_tool_call_key: Option<String> = None;
        let mut identical_tool_call_streak: u32 = 0;
        let mut recent_tool_call_keys: VecDeque<String> = VecDeque::new();
        let mut compactions_this_run: u32 = 0;

        let content = loop {
            if *cancel_rx.borrow() {
                return Ok(finish_cancelled_messages_agent(
                    window,
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    first_engine_input_event_id.clone(),
                    first_engine_input_seq,
                ));
            }
            if run_started_at.elapsed().as_millis() > AGENT_MAX_RUN_WALL_MS {
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    "Engine paused: run exceeded wall-clock safety budget; review and continue in a new turn.",
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    DEFAULT_MAX_TOKENS,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("loop_guard_run_wall_timeout"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: first_engine_input_event_id.clone(),
                    engine_input_seq: first_engine_input_seq,
                    run_id: Some(run_id),
                });
            }

            let mut system_prompt = compose_system_prompt_with_handoff(
                &base_system_prompt,
                active_handoff_summary.as_deref(),
            );
            if let Some(first) = messages.first_mut() {
                if json_role(first) == Some("system") {
                    if let Some(obj) = first.as_object_mut() {
                        obj.insert(
                            "content".to_string(),
                            serde_json::Value::String(system_prompt.clone()),
                        );
                    }
                }
            }
            let mut estimated_prompt_tokens = estimate_prompt_tokens(&system_prompt, &messages);
            if estimated_prompt_tokens > AGENT_AUTO_COMPACT_TOKEN_LIMIT {
                if compactions_this_run >= AGENT_MAX_COMPACTIONS_PER_RUN {
                    append_messages_agent_assistant_message(
                        &conn,
                        db_path,
                        thread_id,
                        "Engine paused: context compaction reached safety limit; start a new thread or narrow scope.",
                        selected_model_id,
                        &run_id,
                        &evidence_event_ids,
                        provider_id,
                        provider_model_ref,
                        final_inference_source.as_deref().unwrap_or("system"),
                        DEFAULT_MAX_TOKENS,
                        None,
                        context_community_id,
                    );
                    append_run_finished(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        "error",
                        Some("loop_guard_compaction_limit"),
                    );
                    let _ = window.emit(
                        "openrouter-turn-finished",
                        SessionIdPayload {
                            session_id: thread_id.to_string(),
                        },
                    );
                    return Ok(SendTurnResult {
                        thread_id: thread_id.to_string(),
                        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                        engine_input_event_id: first_engine_input_event_id.clone(),
                        engine_input_seq: first_engine_input_seq,
                        run_id: Some(run_id),
                    });
                }

                let before_estimated_tokens = estimated_prompt_tokens;
                let (soft_pruned_tool_results, soft_pruned_text_messages) =
                    soft_compact_openai_messages(messages.as_mut_slice());
                system_prompt = compose_system_prompt_with_handoff(
                    &base_system_prompt,
                    active_handoff_summary.as_deref(),
                );
                if let Some(first) = messages.first_mut() {
                    if json_role(first) == Some("system") {
                        if let Some(obj) = first.as_object_mut() {
                            obj.insert(
                                "content".to_string(),
                                serde_json::Value::String(system_prompt.clone()),
                            );
                        }
                    }
                }
                estimated_prompt_tokens = estimate_prompt_tokens(&system_prompt, &messages);

                let mut mode = "soft";
                let mut removed_messages = 0usize;
                let mut summary_event_id: Option<String> = None;
                let mut generated_summary: Option<String> = None;

                if estimated_prompt_tokens > AGENT_AUTO_COMPACT_TARGET_TOKENS
                    || (soft_pruned_tool_results == 0 && soft_pruned_text_messages == 0)
                {
                    let summary = build_handoff_summary_from_openai_messages(&messages);
                    if !summary.trim().is_empty() {
                        generated_summary = Some(summary.clone());
                        active_handoff_summary = Some(summary.clone());
                    }
                    removed_messages = hard_compact_openai_messages(&mut messages);
                    system_prompt = compose_system_prompt_with_handoff(
                        &base_system_prompt,
                        active_handoff_summary.as_deref(),
                    );
                    if let Some(first) = messages.first_mut() {
                        if json_role(first) == Some("system") {
                            if let Some(obj) = first.as_object_mut() {
                                obj.insert(
                                    "content".to_string(),
                                    serde_json::Value::String(system_prompt.clone()),
                                );
                            }
                        }
                    }
                    estimated_prompt_tokens = estimate_prompt_tokens(&system_prompt, &messages);
                    if let Some(summary) = generated_summary.as_deref() {
                        summary_event_id = append_handoff_summary_event(
                            &conn,
                            db_path,
                            thread_id,
                            &run_id,
                            summary,
                            "token_budget",
                            before_estimated_tokens,
                            estimated_prompt_tokens,
                        );
                    }
                    mode = "hard";
                }

                compactions_this_run = compactions_this_run.saturating_add(1);
                append_compaction_metadata_event(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    mode,
                    "token_budget",
                    before_estimated_tokens,
                    estimated_prompt_tokens,
                    soft_pruned_tool_results,
                    soft_pruned_text_messages,
                    removed_messages,
                    summary_event_id.as_deref(),
                );

                if estimated_prompt_tokens > AGENT_AUTO_COMPACT_TOKEN_LIMIT {
                    continue;
                }
            }

            call_seq += 1;
            let mut request_max_tokens = DEFAULT_MAX_TOKENS;
            let mut request_attempt: u32 = 1;
            let mut use_platform_for_call = platform_available_for_run
                && !(model_ref.provider == PlatformProvider::OpenAi && chatgpt_auth.is_some());

            let (engine_input_event, status, resp_bytes, parsed_response) = loop {
                let using_platform = use_platform_for_call && platform_agent_infer_url.is_some();
                let using_chatgpt = !using_platform
                    && model_ref.provider == PlatformProvider::OpenAi
                    && chatgpt_auth.is_some();
                let request_model_id = if using_chatgpt {
                    selected_model_id
                } else {
                    provider_model_id.as_str()
                };
                let provider_request = if using_chatgpt {
                    let mut input: Vec<serde_json::Value> = Vec::new();
                    for msg in &messages {
                        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
                        match role {
                            "system" => {}
                            "user" => {
                                let text = msg
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !text.trim().is_empty() {
                                    input.push(serde_json::json!({
                                      "role": "user",
                                      "content": [{ "type": "input_text", "text": text }]
                                    }));
                                }
                            }
                            "assistant" => {
                                let text = msg
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !text.trim().is_empty() {
                                    input.push(serde_json::json!({
                                      "role": "assistant",
                                      "content": [{ "type": "output_text", "text": text }]
                                    }));
                                }
                                if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array())
                                {
                                    for tc in tcs {
                                        let call_id = tc
                                            .get("id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let name = tc
                                            .get("function")
                                            .and_then(|f| f.get("name"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let arguments = tc
                                            .get("function")
                                            .and_then(|f| f.get("arguments"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        if !call_id.trim().is_empty() && !name.trim().is_empty() {
                                            input.push(serde_json::json!({
                                              "type": "function_call",
                                              "call_id": call_id,
                                              "name": name,
                                              "arguments": arguments
                                            }));
                                        }
                                    }
                                }
                            }
                            "tool" => {
                                let call_id = msg
                                    .get("tool_call_id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let output = msg
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !call_id.trim().is_empty() {
                                    input.push(serde_json::json!({
                                      "type": "function_call_output",
                                      "call_id": call_id,
                                      "output": output
                                    }));
                                }
                            }
                            _ => {}
                        }
                    }
                    serde_json::json!({
                      "model": request_model_id,
                      "instructions": system_prompt.clone(),
                      "store": false,
                      "stream": true,
                      "input": input,
                      "tools": tools_schema_responses,
                      "tool_choice": "auto",
                      "parallel_tool_calls": false,
                      "include": []
                    })
                } else if model_ref.provider == PlatformProvider::OpenAi {
                    serde_json::json!({
                      "model": request_model_id,
                      "max_completion_tokens": request_max_tokens,
                      "stream": true,
                      "messages": messages,
                      "tools": tools_schema_chat
                    })
                } else {
                    serde_json::json!({
                      "model": request_model_id,
                      "max_tokens": request_max_tokens,
                      "stream": true,
                      "messages": messages,
                      "tools": tools_schema_chat
                    })
                };
                let (request_bytes, request_format, inference_source) = if using_platform {
                    let wrapped = serde_json::json!({
                      "model_id": selected_model_id,
                      "request": provider_request
                    });
                    (
                        serde_json::to_vec(&wrapped)
                            .map_err(|e| format!("Request serialization failed: {}", e))?,
                        "arx.platform_agent_infer.json",
                        "platform",
                    )
                } else {
                    (
                        serde_json::to_vec(&provider_request)
                            .map_err(|e| format!("Request serialization failed: {}", e))?,
                        if using_chatgpt {
                            "openai.responses.json"
                        } else {
                            "openai_compatible.chat_completions.json"
                        },
                        if using_chatgpt { "chatgpt" } else { "user" },
                    )
                };
                final_inference_source = Some(inference_source.to_string());
                let request_blob = blob_store::write_blob(db_path, &request_bytes)
                    .map_err(|e| format!("Request blob write failed: {}", e))?;
                let _ = db::record_blob(
                    &conn,
                    &request_blob.id,
                    &request_blob.rel_path,
                    request_blob.byte_len,
                );

                let engine_input_max_tokens = if using_chatgpt {
                    // ChatGPT/Codex subscription endpoint rejects max token params; keep evidence truthful.
                    serde_json::Value::Null
                } else {
                    serde_json::json!(request_max_tokens)
                };

                let engine_input_payload = serde_json::json!({
                  "v": 1,
                  "engine_id": ENGINE_MESSAGES_AGENT,
                  "provider_id": provider_id,
                  "model_id": selected_model_id,
                  "provider_model_ref": provider_model_ref_str.as_str(),
                  "provider_model_id": provider_model_id.as_str(),
                  "inference_source": inference_source,
                  "run_id": run_id,
                  "seq": call_seq,
                  "attempt": request_attempt,
                  "request_format": request_format,
                  "sent_blob_id": request_blob.id,
                  "sent_blob_ref": request_blob.rel_path,
                  "sent_byte_len": request_blob.byte_len,
                  "max_tokens": engine_input_max_tokens,
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
                        append_messages_agent_assistant_message(
                            &conn,
                            db_path,
                            thread_id,
                            &format!("Storage error: failed to record engine_input: {}", err),
                            selected_model_id,
                            &run_id,
                            &[],
                            provider_id,
                            provider_model_ref,
                            inference_source,
                            request_max_tokens,
                            None,
                            context_community_id,
                        );
                        append_run_finished(
                            &conn,
                            db_path,
                            thread_id,
                            &run_id,
                            "error",
                            Some("engine_input_record_failed"),
                        );
                        let _ = window.emit(
                            "openrouter-turn-finished",
                            SessionIdPayload {
                                session_id: thread_id.to_string(),
                            },
                        );
                        return Ok(SendTurnResult {
                            thread_id: thread_id.to_string(),
                            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
                    return Ok(finish_cancelled_messages_agent(
                        window,
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        first_engine_input_event_id.clone(),
                        first_engine_input_seq,
                    ));
                }

                let send_fut = if using_platform {
                    let url = platform_agent_infer_url.clone().unwrap_or_default();
                    let cfg = platform_proxy
                        .as_ref()
                        .ok_or_else(|| "platform proxy is not configured".to_string())?;
                    client
                        .post(url)
                        .header("apikey", cfg.supabase_anon_key.clone())
                        .header("Authorization", format!("Bearer {}", cfg.access_token))
                        .header("Content-Type", "application/json")
                        .header("Accept", "text/event-stream")
                        .body(request_bytes)
                        .send()
                } else {
                    if using_chatgpt {
                        let auth = chatgpt_auth.as_ref().ok_or_else(|| {
                            "ChatGPT session not available. Sign in again.".to_string()
                        })?;
                        let mut req = client
                            .post(CHATGPT_CODEX_RESPONSES_URL)
                            .header("Authorization", format!("Bearer {}", auth.access_token))
                            .header("User-Agent", "codex-cli")
                            .header("Content-Type", "application/json")
                            .header("Accept", "text/event-stream");
                        if let Some(account_id) =
                            auth.account_id.as_deref().filter(|v| !v.trim().is_empty())
                        {
                            req = req.header("ChatGPT-Account-Id", account_id.trim());
                        }
                        req.body(request_bytes).send()
                    } else {
                        let provider_key = match get_byok_provider_key() {
                            Ok(value) => value,
                            Err(message) => {
                                append_messages_agent_assistant_message(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &message,
                                    selected_model_id,
                                    &run_id,
                                    &[],
                                    provider_id,
                                    provider_model_ref,
                                    inference_source,
                                    request_max_tokens,
                                    None,
                                    context_community_id,
                                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("missing_api_key"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }
                        };
                        client
                            .post(chat_url.clone())
                            .header("Authorization", format!("Bearer {}", provider_key))
                            .header("Content-Type", "application/json")
                            .header("Accept", "text/event-stream")
                            .body(request_bytes)
                            .send()
                    }
                };

                let res = tokio::select! {
                  _ = cancel_rx.changed() => {
                    return Ok(finish_cancelled_messages_agent(
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
                        append_messages_agent_assistant_message(
                            &conn,
                            db_path,
                            thread_id,
                            &format!("Engine error: request failed: {}", err),
                            selected_model_id,
                            &run_id,
                            &[],
                            provider_id,
                            provider_model_ref,
                            inference_source,
                            request_max_tokens,
                            None,
                            context_community_id,
                        );
                        append_run_finished(
                            &conn,
                            db_path,
                            thread_id,
                            &run_id,
                            "error",
                            Some("provider_request_failed"),
                        );
                        let _ = window.emit(
                            "openrouter-turn-finished",
                            SessionIdPayload {
                                session_id: thread_id.to_string(),
                            },
                        );
                        return Ok(SendTurnResult {
                            thread_id: thread_id.to_string(),
                            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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

                if !status.is_success()
                    || (!content_type.contains("text/event-stream") && !using_chatgpt)
                {
                    resp_bytes = tokio::select! {
                      _ = cancel_rx.changed() => {
                        return Ok(finish_cancelled_messages_agent(
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
                        .map_err(|e| format!("Response blob write failed: {}", e))?;
                    let _ = db::record_blob(
                        &conn,
                        &resp_blob.id,
                        &resp_blob.rel_path,
                        resp_blob.byte_len,
                    );

                    let engine_io_payload = serde_json::json!({
                      "v": 1,
                      "engine_id": ENGINE_MESSAGES_AGENT,
                      "provider_id": provider_id,
                      "model_id": selected_model_id,
                      "provider_model_ref": provider_model_ref_str.as_str(),
                      "provider_model_id": provider_model_id.as_str(),
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

                    if using_platform && !status.is_success() {
                        platform_available_for_run = false;

                        if is_platform_inference_quota_exceeded(&resp_bytes) {
                            let provider_key_ok = get_byok_provider_key().is_ok();
                            if !provider_key_ok {
                                append_messages_agent_assistant_message(
	                  &conn,
	                  db_path,
	                  thread_id,
	                  &format!(
		                    "You've used your Arx AI quota for this month. Upgrade to continue with Arx AI.",
		                  ),
	                  selected_model_id,
	                  &run_id,
	                  &evidence_event_ids,
	                  provider_id,
	                  provider_model_ref,
                    inference_source,
	                  request_max_tokens,
	                  None,
	                  context_community_id,
	                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("platform_quota_exceeded"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }

                            let approved = await_inference_fallback_approval(
                                window,
                                thread_id,
                                selected_model_id,
                                model_ref.provider,
                                "platform_quota_exceeded",
                                cancel_rx.clone(),
                            )
                            .await;
                            if !approved {
                                append_messages_agent_assistant_message(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &format!(
	                  "Arx AI quota reached. Cancelled — upgrade to continue.",
	                ),
                                    selected_model_id,
                                    &run_id,
                                    &evidence_event_ids,
                                    provider_id,
                                    provider_model_ref,
                                    inference_source,
                                    request_max_tokens,
                                    None,
                                    context_community_id,
                                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("platform_fallback_denied"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }

                            let approved = await_inference_fallback_approval(
                                window,
                                thread_id,
                                selected_model_id,
                                model_ref.provider,
                                "platform_quota_exceeded",
                                cancel_rx.clone(),
                            )
                            .await;
                            if !approved {
                                append_messages_agent_assistant_message(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &format!(
		                  "Arx AI quota reached. Cancelled — upgrade to continue.",
		                ),
                                    selected_model_id,
                                    &run_id,
                                    &evidence_event_ids,
                                    provider_id,
                                    provider_model_ref,
                                    inference_source,
                                    request_max_tokens,
                                    None,
                                    context_community_id,
                                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("platform_fallback_denied"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }

                            if !platform_fallback_notified {
                                let _ = window.emit(
                                    "inference-fallback",
                                    InferenceFallbackPayload {
                                        session_id: thread_id.to_string(),
                                        from: "platform".to_string(),
                                        to: "user".to_string(),
                                        reason: "platform_quota_exceeded".to_string(),
                                    },
                                );
                                platform_fallback_notified = true;
                            }
                            use_platform_for_call = false;
                            continue;
                        }

                        if is_platform_inference_not_allowed(&resp_bytes) {
                            use_platform_for_call = false;
                            continue;
                        }

                        // Best-effort: if platform is misconfigured/unavailable and BYOK is enabled, fall back.
                        if get_byok_provider_key().is_ok() {
                            let approved = await_inference_fallback_approval(
                                window,
                                thread_id,
                                selected_model_id,
                                model_ref.provider,
                                "platform_error",
                                cancel_rx.clone(),
                            )
                            .await;
                            if !approved {
                                append_messages_agent_assistant_message(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &format!(
		                    "Arx AI is temporarily unavailable. Please try again.",
		                  ),
                                    selected_model_id,
                                    &run_id,
                                    &evidence_event_ids,
                                    provider_id,
                                    provider_model_ref,
                                    inference_source,
                                    request_max_tokens,
                                    None,
                                    context_community_id,
                                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("platform_fallback_denied"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }

                            if !platform_fallback_notified {
                                let _ = window.emit(
                                    "inference-fallback",
                                    InferenceFallbackPayload {
                                        session_id: thread_id.to_string(),
                                        from: "platform".to_string(),
                                        to: "user".to_string(),
                                        reason: "platform_error".to_string(),
                                    },
                                );
                                platform_fallback_notified = true;
                            }
                            use_platform_for_call = false;
                            continue;
                        }
                    }

                    if using_chatgpt && !status.is_success() {
                        // First try: refresh ChatGPT token and retry once.
                        if request_attempt == 1 {
                            if let Ok(value) = get_chatgpt_auth_for_inference().await {
                                if value.is_some() {
                                    chatgpt_auth = value;
                                    request_attempt = 2;
                                    continue;
                                }
                            }
                        }

                        // ChatGPT auth isn't usable for this run; fall back to Arx platform if available.
                        chatgpt_auth = None;
                        if platform_available_for_run && platform_agent_infer_url.is_some() {
                            if !chatgpt_fallback_notified {
                                let friendly = format_provider_error(&resp_bytes);
                                let reason = if friendly.trim().is_empty() {
                                    format!("chatgpt_http_{}", status.as_u16())
                                } else {
                                    format!("chatgpt_http_{}: {}", status.as_u16(), friendly)
                                };
                                let _ = window.emit(
                                    "inference-fallback",
                                    InferenceFallbackPayload {
                                        session_id: thread_id.to_string(),
                                        from: "chatgpt".to_string(),
                                        to: "platform".to_string(),
                                        reason,
                                    },
                                );
                                chatgpt_fallback_notified = true;
                            }
                            use_platform_for_call = true;
                            continue;
                        }

                        // Otherwise, require explicit approval before switching to BYOK (when enabled).
                        if !chatgpt_fallback_approved_for_run {
                            let provider_key_ok = get_byok_provider_key().is_ok();
                            if !provider_key_ok {
                                append_messages_agent_assistant_message(
	                  &conn,
	                  db_path,
	                  thread_id,
	                  "ChatGPT sign-in failed. Reconnect ChatGPT or upgrade to continue.",
	                  selected_model_id,
	                  &run_id,
	                  &evidence_event_ids,
	                  provider_id,
	                  provider_model_ref,
                    inference_source,
	                  request_max_tokens,
	                  None,
	                  context_community_id,
	                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("chatgpt_auth_failed"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }

                            let approved = await_inference_fallback_approval(
                                window,
                                thread_id,
                                selected_model_id,
                                model_ref.provider,
                                "chatgpt_error",
                                cancel_rx.clone(),
                            )
                            .await;
                            if !approved {
                                append_messages_agent_assistant_message(
	                  &conn,
	                  db_path,
	                  thread_id,
	                  "ChatGPT sign-in failed. Cancelled — reconnect ChatGPT or upgrade.",
	                  selected_model_id,
	                  &run_id,
	                  &evidence_event_ids,
	                  provider_id,
	                  provider_model_ref,
                    inference_source,
	                  request_max_tokens,
	                  None,
	                  context_community_id,
	                );
                                append_run_finished(
                                    &conn,
                                    db_path,
                                    thread_id,
                                    &run_id,
                                    "error",
                                    Some("chatgpt_fallback_denied"),
                                );
                                let _ = window.emit(
                                    "openrouter-turn-finished",
                                    SessionIdPayload {
                                        session_id: thread_id.to_string(),
                                    },
                                );
                                return Ok(SendTurnResult {
                                    thread_id: thread_id.to_string(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    engine_input_event_id: Some(engine_input_event.id),
                                    engine_input_seq: Some(engine_input_event.seq),
                                    run_id: Some(run_id),
                                });
                            }

                            chatgpt_fallback_approved_for_run = true;
                        }

                        use_platform_for_call = false;
                        continue;
                    }

                    let friendly = format_provider_error(&resp_bytes);
                    if status.as_u16() == 402 && request_attempt == 1 {
                        if let Some(afford) = parse_affordable_max_tokens(&friendly) {
                            if afford < request_max_tokens {
                                request_max_tokens = afford;
                                request_attempt = 2;
                                continue;
                            }
                        }
                    }

                    if status.is_success() {
                        let parsed: serde_json::Value =
                            serde_json::from_slice(&resp_bytes).unwrap_or(serde_json::Value::Null);
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
                                let id = tc
                                    .get("id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
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
                                    parsed_response.tool_calls.push(PartialToolCall {
                                        id,
                                        name,
                                        arguments,
                                    });
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
                let mut saw_chatgpt_output_text_delta = false;
                let mut saw_chatgpt_output_text_done = false;
                let mut prompt_tokens: Option<u64> = None;
                let mut completion_tokens: Option<u64> = None;

                loop {
                    if *cancel_rx.borrow() {
                        return Ok(finish_cancelled_messages_agent(
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
                        return Ok(finish_cancelled_messages_agent(
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
                            append_messages_agent_assistant_message(
                                &conn,
                                db_path,
                                thread_id,
                                &format!("Engine error: stream error: {}", err),
                                selected_model_id,
                                &run_id,
                                &evidence_event_ids,
                                provider_id,
                                provider_model_ref,
                                inference_source,
                                request_max_tokens,
                                None,
                                context_community_id,
                            );
                            append_run_finished(
                                &conn,
                                db_path,
                                thread_id,
                                &run_id,
                                "error",
                                Some("provider_stream_error"),
                            );
                            let _ = window.emit(
                                "openrouter-turn-finished",
                                SessionIdPayload {
                                    session_id: thread_id.to_string(),
                                },
                            );
                            return Ok(SendTurnResult {
                                thread_id: thread_id.to_string(),
                                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
                              "engine_id": ENGINE_MESSAGES_AGENT,
                              "provider_id": provider_id,
                              "model_id": selected_model_id,
                              "provider_model_ref": provider_model_ref_str.as_str(),
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
                              "engine_id": ENGINE_MESSAGES_AGENT,
                              "provider_id": provider_id,
                              "model_id": selected_model_id,
                              "provider_model_ref": provider_model_ref_str.as_str(),
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
                          "engine_id": ENGINE_MESSAGES_AGENT,
                          "provider_id": provider_id,
                          "model_id": selected_model_id,
                          "provider_model_ref": provider_model_ref_str.as_str(),
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

                        if using_chatgpt {
                            let kind = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");

                            if matches!(kind, "response.completed" | "response.done") {
                                if let Some(usage) =
                                    parsed.get("response").and_then(|r| r.get("usage"))
                                {
                                    prompt_tokens = usage
                                        .get("input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .or(prompt_tokens);
                                    completion_tokens = usage
                                        .get("output_tokens")
                                        .and_then(|v| v.as_u64())
                                        .or(completion_tokens);
                                }
                            }

                            if kind == "response.output_text.delta" {
                                if let Some(delta) = parsed.get("delta").and_then(|v| v.as_str()) {
                                    if !delta.is_empty() {
                                        saw_chatgpt_output_text_delta = true;
                                        assistant.push_str(delta);
                                        stream_seq += 1;
                                        let _ = window.emit(
                                            "openrouter-stream",
                                            OpenRouterStreamPayload {
                                                session_id: thread_id.to_string(),
                                                run_id: run_id.clone(),
                                                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                                model_id: selected_model_id.to_string(),
                                                inference_source: inference_source.to_string(),
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
                            }

                            if kind == "response.output_text.done"
                                && !saw_chatgpt_output_text_delta
                                && !saw_chatgpt_output_text_done
                            {
                                if let Some(text) = parsed.get("text").and_then(|v| v.as_str()) {
                                    if !text.trim().is_empty() {
                                        saw_chatgpt_output_text_done = true;
                                        assistant.push_str(text);
                                        stream_seq += 1;
                                        let _ = window.emit(
                                            "openrouter-stream",
                                            OpenRouterStreamPayload {
                                                session_id: thread_id.to_string(),
                                                run_id: run_id.clone(),
                                                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                                model_id: selected_model_id.to_string(),
                                                inference_source: inference_source.to_string(),
                                                chunk: text.to_string(),
                                                full_content: assistant.clone(),
                                                seq: stream_seq,
                                                prompt_tokens,
                                                completion_tokens,
                                                max_tokens: request_max_tokens,
                                            },
                                        );
                                    }
                                }
                            }

                            if kind == "response.output_item.done" {
                                if let Some(item) = parsed.get("item") {
                                    let item_type =
                                        item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                    if item_type == "message"
                                        && !saw_chatgpt_output_text_delta
                                        && !saw_chatgpt_output_text_done
                                    {
                                        if let Some(content) =
                                            item.get("content").and_then(|v| v.as_array())
                                        {
                                            let mut text = String::new();
                                            for part in content {
                                                let part_type = part
                                                    .get("type")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("");
                                                if part_type == "output_text" {
                                                    if let Some(t) =
                                                        part.get("text").and_then(|v| v.as_str())
                                                    {
                                                        if !t.is_empty() {
                                                            text.push_str(t);
                                                        }
                                                    }
                                                }
                                            }
                                            if !text.trim().is_empty() {
                                                saw_chatgpt_output_text_done = true;
                                                assistant.push_str(&text);
                                                stream_seq += 1;
                                                let _ = window.emit(
                                                    "openrouter-stream",
                                                    OpenRouterStreamPayload {
                                                        session_id: thread_id.to_string(),
                                                        run_id: run_id.clone(),
                                                        engine_id: ENGINE_MESSAGES_AGENT
                                                            .to_string(),
                                                        model_id: selected_model_id.to_string(),
                                                        inference_source: inference_source
                                                            .to_string(),
                                                        chunk: text,
                                                        full_content: assistant.clone(),
                                                        seq: stream_seq,
                                                        prompt_tokens,
                                                        completion_tokens,
                                                        max_tokens: request_max_tokens,
                                                    },
                                                );
                                            }
                                        }
                                    }
                                    if item_type == "function_call" {
                                        let call_id = item
                                            .get("call_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let name = item
                                            .get("name")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let arguments = item
                                            .get("arguments")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        if !call_id.trim().is_empty() && !name.trim().is_empty() {
                                            tool_calls.push(PartialToolCall {
                                                id: call_id,
                                                name,
                                                arguments,
                                            });
                                        }
                                    }
                                }
                            }
                        } else {
                            if let Some(usage) = parsed.get("usage") {
                                prompt_tokens = usage
                                    .get("prompt_tokens")
                                    .and_then(|v| v.as_u64())
                                    .or(prompt_tokens);
                                completion_tokens = usage
                                    .get("completion_tokens")
                                    .and_then(|v| v.as_u64())
                                    .or(completion_tokens);
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
                                            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                            model_id: selected_model_id.to_string(),
                                            inference_source: inference_source.to_string(),
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
                                    let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0)
                                        as usize;
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
                let friendly = format_provider_error(&resp_bytes);
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    &format!("Engine error: error {}: {}", status.as_u16(), friendly),
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    request_max_tokens,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("provider_http_error"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: Some(engine_input_event.id),
                    engine_input_seq: Some(engine_input_event.seq),
                    run_id: Some(run_id),
                });
            }

            let mut tool_calls = parsed_response.tool_calls;
            if tool_calls.is_empty() {
                break parsed_response.text.trim().to_string();
            }
            tool_rounds = tool_rounds.saturating_add(1);
            if tool_rounds > AGENT_MAX_TOOL_ROUNDS_PER_RUN {
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    "Engine paused: tool loop exceeded safety round limit; review the plan before continuing.",
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    request_max_tokens,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("loop_guard_tool_round_limit"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: Some(engine_input_event.id),
                    engine_input_seq: Some(engine_input_event.seq),
                    run_id: Some(run_id),
                });
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
                let raw_tool_name = tc.name;
                let mut parsed_args = serde_json::from_str::<serde_json::Value>(&tc.arguments)
                    .unwrap_or(serde_json::Value::Null);
                if !parsed_args.is_object() {
                    parsed_args = serde_json::json!({
                      "__arx_tool_args_error": "invalid tool arguments (expected JSON object)",
                      "__arx_tool_args_input": tc.arguments
                    });
                }
                if tool_use_id.trim().is_empty() {
                    tool_use_id = uuid::Uuid::new_v4().to_string();
                }
                let loop_tool_key = compute_tool_call_key(
                    normalize_agent_tool_name(&raw_tool_name).as_str(),
                    &parsed_args,
                    &workspace_scope_id,
                );
                if last_tool_call_key
                    .as_deref()
                    .map(|prev| prev == loop_tool_key.as_str())
                    .unwrap_or(false)
                {
                    identical_tool_call_streak = identical_tool_call_streak.saturating_add(1);
                } else {
                    identical_tool_call_streak = 1;
                    last_tool_call_key = Some(loop_tool_key.clone());
                }
                if push_tool_key_and_detect_cycle(&mut recent_tool_call_keys, &loop_tool_key) {
                    append_messages_agent_assistant_message(
                        &conn,
                        db_path,
                        thread_id,
                        "Engine paused: detected a repeating multi-step tool cycle with no progress. Review the plan and add a new constraint before retrying.",
                        selected_model_id,
                        &run_id,
                        &evidence_event_ids,
                        provider_id,
                        provider_model_ref,
                        final_inference_source.as_deref().unwrap_or("system"),
                        request_max_tokens,
                        None,
                        context_community_id,
                    );
                    append_run_finished(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        "error",
                        Some("loop_guard_no_progress_tool_cycle"),
                    );
                    let _ = window.emit(
                        "openrouter-turn-finished",
                        SessionIdPayload {
                            session_id: thread_id.to_string(),
                        },
                    );
                    return Ok(SendTurnResult {
                        thread_id: thread_id.to_string(),
                        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                        engine_input_event_id: Some(engine_input_event.id),
                        engine_input_seq: Some(engine_input_event.seq),
                        run_id: Some(run_id),
                    });
                }
                if identical_tool_call_streak > AGENT_MAX_IDENTICAL_TOOL_CALL_STREAK {
                    append_messages_agent_assistant_message(
                        &conn,
                        db_path,
                        thread_id,
                        "Engine paused: detected repeated identical tool calls; this may be a loop. Review and retry with clarified instructions.",
                        selected_model_id,
                        &run_id,
                        &evidence_event_ids,
                        provider_id,
                        provider_model_ref,
                        final_inference_source.as_deref().unwrap_or("system"),
                        request_max_tokens,
                        None,
                        context_community_id,
                    );
                    append_run_finished(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        "error",
                        Some("loop_guard_identical_tool_call_streak"),
                    );
                    let _ = window.emit(
                        "openrouter-turn-finished",
                        SessionIdPayload {
                            session_id: thread_id.to_string(),
                        },
                    );
                    return Ok(SendTurnResult {
                        thread_id: thread_id.to_string(),
                        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                        engine_input_event_id: Some(engine_input_event.id),
                        engine_input_seq: Some(engine_input_event.seq),
                        run_id: Some(run_id),
                    });
                }
                if run_started_at.elapsed().as_millis() > AGENT_MAX_RUN_WALL_MS {
                    append_messages_agent_assistant_message(
                        &conn,
                        db_path,
                        thread_id,
                        "Engine paused: run exceeded wall-clock safety budget; review and continue in a new turn.",
                        selected_model_id,
                        &run_id,
                        &evidence_event_ids,
                        provider_id,
                        provider_model_ref,
                        final_inference_source.as_deref().unwrap_or("system"),
                        request_max_tokens,
                        None,
                        context_community_id,
                    );
                    append_run_finished(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        "error",
                        Some("loop_guard_run_wall_timeout"),
                    );
                    let _ = window.emit(
                        "openrouter-turn-finished",
                        SessionIdPayload {
                            session_id: thread_id.to_string(),
                        },
                    );
                    return Ok(SendTurnResult {
                        thread_id: thread_id.to_string(),
                        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                        engine_input_event_id: Some(engine_input_event.id),
                        engine_input_seq: Some(engine_input_event.seq),
                        run_id: Some(run_id),
                    });
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
                    return Ok(finish_cancelled_messages_agent(
                        window,
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        first_engine_input_event_id.clone(),
                        first_engine_input_seq,
                    ));
                }

                let tool_result_content =
                    truncate_tool_result_for_prompt(&outcome.tool_result_content);
                messages.push(serde_json::json!({
                  "role": "tool",
                  "tool_call_id": tool_use_id,
                  "content": tool_result_content
                }));

                if *cancel_rx.borrow() {
                    return Ok(finish_cancelled_messages_agent(
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

            trim_openai_tool_loop_messages(&mut messages);
        };

        if content.trim().is_empty() {
            append_messages_agent_assistant_message(
                &conn,
                db_path,
                thread_id,
                "Engine error: empty response.",
                selected_model_id,
                &run_id,
                &evidence_event_ids,
                provider_id,
                provider_model_ref,
                final_inference_source.as_deref().unwrap_or("system"),
                DEFAULT_MAX_TOKENS,
                None,
                context_community_id,
            );
            append_run_finished(
                &conn,
                db_path,
                thread_id,
                &run_id,
                "error",
                Some("empty_response"),
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                SessionIdPayload {
                    session_id: thread_id.to_string(),
                },
            );
            return Ok(SendTurnResult {
                thread_id: thread_id.to_string(),
                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: first_engine_input_event_id.clone(),
                engine_input_seq: first_engine_input_seq,
                run_id: Some(run_id),
            });
        }

        append_messages_agent_assistant_message(
            &conn,
            db_path,
            thread_id,
            &content,
            selected_model_id,
            &run_id,
            &evidence_event_ids,
            provider_id,
            provider_model_ref,
            final_inference_source.as_deref().unwrap_or("system"),
            DEFAULT_MAX_TOKENS,
            Some(used_personal_memory),
            context_community_id,
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
            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
            engine_input_event_id: first_engine_input_event_id,
            engine_input_seq: first_engine_input_seq,
            run_id: Some(run_id),
        });
    }

    let base_system_prompt = atom_system_prompt.to_string();
    let mut active_handoff_summary = load_latest_handoff_summary(&conn, thread_id);

    // Base conversation: system in request, then last ~20 user/assistant text messages.
    let mut messages: Vec<serde_json::Value> = Vec::new();
    for (role, value) in
        load_recent_history_messages(&conn, thread_id, history_messages_json.as_deref())
    {
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
        messages.push(serde_json::json!({
          "role": role,
          "content": [{ "type": "text", "text": redacted }]
        }));
    }
    messages.push(serde_json::json!({
      "role": "user",
      "content": [{ "type": "text", "text": input_to_send.clone() }]
    }));

    let tools_schema = if workspace.trim().is_empty() {
        make_agent_tool_schema_update_plan_only()
    } else {
        make_agent_tool_schema()
    };
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
    let mut tool_rounds: u32 = 0;
    let mut last_tool_call_key: Option<String> = None;
    let mut identical_tool_call_streak: u32 = 0;
    let mut recent_tool_call_keys: VecDeque<String> = VecDeque::new();
    let mut compactions_this_run: u32 = 0;

    let content = loop {
        if *cancel_rx.borrow() {
            return Ok(finish_cancelled_messages_agent(
                window,
                &conn,
                db_path,
                thread_id,
                &run_id,
                first_engine_input_event_id.clone(),
                first_engine_input_seq,
            ));
        }
        if run_started_at.elapsed().as_millis() > AGENT_MAX_RUN_WALL_MS {
            append_messages_agent_assistant_message(
                &conn,
                db_path,
                thread_id,
                "Engine paused: run exceeded wall-clock safety budget; review and continue in a new turn.",
                selected_model_id,
                &run_id,
                &evidence_event_ids,
                provider_id,
                provider_model_ref,
                final_inference_source.as_deref().unwrap_or("system"),
                DEFAULT_MAX_TOKENS,
                None,
                context_community_id,
            );
            append_run_finished(
                &conn,
                db_path,
                thread_id,
                &run_id,
                "error",
                Some("loop_guard_run_wall_timeout"),
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                SessionIdPayload {
                    session_id: thread_id.to_string(),
                },
            );
            return Ok(SendTurnResult {
                thread_id: thread_id.to_string(),
                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: first_engine_input_event_id.clone(),
                engine_input_seq: first_engine_input_seq,
                run_id: Some(run_id),
            });
        }

        let mut system_prompt = compose_system_prompt_with_handoff(
            &base_system_prompt,
            active_handoff_summary.as_deref(),
        );
        let mut estimated_prompt_tokens = estimate_prompt_tokens(&system_prompt, &messages);
        if estimated_prompt_tokens > AGENT_AUTO_COMPACT_TOKEN_LIMIT {
            if compactions_this_run >= AGENT_MAX_COMPACTIONS_PER_RUN {
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    "Engine paused: context compaction reached safety limit; start a new thread or narrow scope.",
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    DEFAULT_MAX_TOKENS,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("loop_guard_compaction_limit"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: first_engine_input_event_id.clone(),
                    engine_input_seq: first_engine_input_seq,
                    run_id: Some(run_id),
                });
            }

            let before_estimated_tokens = estimated_prompt_tokens;
            let (soft_pruned_tool_results, soft_pruned_text_messages) =
                soft_compact_anthropic_messages(messages.as_mut_slice());
            system_prompt = compose_system_prompt_with_handoff(
                &base_system_prompt,
                active_handoff_summary.as_deref(),
            );
            estimated_prompt_tokens = estimate_prompt_tokens(&system_prompt, &messages);

            let mut mode = "soft";
            let mut removed_messages = 0usize;
            let mut summary_event_id: Option<String> = None;
            let mut generated_summary: Option<String> = None;

            if estimated_prompt_tokens > AGENT_AUTO_COMPACT_TARGET_TOKENS
                || (soft_pruned_tool_results == 0 && soft_pruned_text_messages == 0)
            {
                let summary = build_handoff_summary_from_anthropic_messages(&messages);
                if !summary.trim().is_empty() {
                    generated_summary = Some(summary.clone());
                    active_handoff_summary = Some(summary);
                }
                removed_messages = hard_compact_anthropic_messages(&mut messages);
                system_prompt = compose_system_prompt_with_handoff(
                    &base_system_prompt,
                    active_handoff_summary.as_deref(),
                );
                estimated_prompt_tokens = estimate_prompt_tokens(&system_prompt, &messages);
                if let Some(summary) = generated_summary.as_deref() {
                    summary_event_id = append_handoff_summary_event(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        summary,
                        "token_budget",
                        before_estimated_tokens,
                        estimated_prompt_tokens,
                    );
                }
                mode = "hard";
            }

            compactions_this_run = compactions_this_run.saturating_add(1);
            append_compaction_metadata_event(
                &conn,
                db_path,
                thread_id,
                &run_id,
                mode,
                "token_budget",
                before_estimated_tokens,
                estimated_prompt_tokens,
                soft_pruned_tool_results,
                soft_pruned_text_messages,
                removed_messages,
                summary_event_id.as_deref(),
            );

            if estimated_prompt_tokens > AGENT_AUTO_COMPACT_TOKEN_LIMIT {
                continue;
            }
        }

        call_seq += 1;
        let mut request_max_tokens = DEFAULT_MAX_TOKENS;
        let mut request_attempt: u32 = 1;
        let mut use_platform_for_call = platform_available_for_run;

        let (engine_input_event, status, resp_bytes) = loop {
            let provider_request = serde_json::json!({
              "model": provider_model_id.as_str(),
              "max_tokens": request_max_tokens,
              "stream": true,
              "system": system_prompt.clone(),
              "messages": messages,
              "tools": tools_schema
            });
            let using_platform = use_platform_for_call && platform_agent_infer_url.is_some();
            let (request_bytes, request_format, inference_source) = if using_platform {
                let wrapped = serde_json::json!({
                  "model_id": selected_model_id,
                  "request": provider_request
                });
                (
                    serde_json::to_vec(&wrapped)
                        .map_err(|e| format!("Request serialization failed: {}", e))?,
                    "arx.platform_agent_infer.json",
                    "platform",
                )
            } else {
                (
                    serde_json::to_vec(&provider_request)
                        .map_err(|e| format!("Request serialization failed: {}", e))?,
                    "anthropic.messages.json",
                    "user",
                )
            };
            final_inference_source = Some(inference_source.to_string());
            let request_blob = blob_store::write_blob(db_path, &request_bytes)
                .map_err(|e| format!("Request blob write failed: {}", e))?;
            let _ = db::record_blob(
                &conn,
                &request_blob.id,
                &request_blob.rel_path,
                request_blob.byte_len,
            );

            let engine_input_payload = serde_json::json!({
              "v": 1,
              "engine_id": ENGINE_MESSAGES_AGENT,
              "provider_id": provider_id,
              "model_id": selected_model_id,
              "provider_model_ref": provider_model_ref_str.as_str(),
              "provider_model_id": provider_model_id.as_str(),
              "inference_source": inference_source,
              "run_id": run_id,
              "seq": call_seq,
              "attempt": request_attempt,
              "request_format": request_format,
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
                    append_messages_agent_assistant_message(
                        &conn,
                        db_path,
                        thread_id,
                        &format!("Storage error: failed to record engine_input: {}", err),
                        selected_model_id,
                        &run_id,
                        &[],
                        provider_id,
                        provider_model_ref,
                        inference_source,
                        request_max_tokens,
                        None,
                        context_community_id,
                    );
                    append_run_finished(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        "error",
                        Some("engine_input_record_failed"),
                    );
                    let _ = window.emit(
                        "openrouter-turn-finished",
                        SessionIdPayload {
                            session_id: thread_id.to_string(),
                        },
                    );
                    return Ok(SendTurnResult {
                        thread_id: thread_id.to_string(),
                        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
                return Ok(finish_cancelled_messages_agent(
                    window,
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    first_engine_input_event_id.clone(),
                    first_engine_input_seq,
                ));
            }

            let send_fut = if using_platform {
                let url = platform_agent_infer_url.clone().unwrap_or_default();
                let cfg = platform_proxy
                    .as_ref()
                    .ok_or_else(|| "platform proxy is not configured".to_string())?;
                client
                    .post(url)
                    .header("apikey", cfg.supabase_anon_key.clone())
                    .header("Authorization", format!("Bearer {}", cfg.access_token))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .body(request_bytes)
                    .send()
            } else {
                let provider_key = match get_byok_provider_key() {
                    Ok(value) => value,
                    Err(message) => {
                        append_messages_agent_assistant_message(
                            &conn,
                            db_path,
                            thread_id,
                            &message,
                            selected_model_id,
                            &run_id,
                            &[],
                            provider_id,
                            provider_model_ref,
                            inference_source,
                            request_max_tokens,
                            None,
                            context_community_id,
                        );
                        append_run_finished(
                            &conn,
                            db_path,
                            thread_id,
                            &run_id,
                            "error",
                            Some("missing_api_key"),
                        );
                        let _ = window.emit(
                            "openrouter-turn-finished",
                            SessionIdPayload {
                                session_id: thread_id.to_string(),
                            },
                        );
                        return Ok(SendTurnResult {
                            thread_id: thread_id.to_string(),
                            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                            engine_input_event_id: Some(engine_input_event.id),
                            engine_input_seq: Some(engine_input_event.seq),
                            run_id: Some(run_id),
                        });
                    }
                };
                client
                    .post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", provider_key)
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .header("anthropic-version", "2023-06-01")
                    .body(request_bytes)
                    .send()
            };

            let res = tokio::select! {
              _ = cancel_rx.changed() => {
                return Ok(finish_cancelled_messages_agent(
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
                    append_messages_agent_assistant_message(
                        &conn,
                        db_path,
                        thread_id,
                        &format!("Engine error: request failed: {}", err),
                        selected_model_id,
                        &run_id,
                        &[],
                        provider_id,
                        provider_model_ref,
                        inference_source,
                        request_max_tokens,
                        None,
                        context_community_id,
                    );
                    append_run_finished(
                        &conn,
                        db_path,
                        thread_id,
                        &run_id,
                        "error",
                        Some("provider_request_failed"),
                    );
                    let _ = window.emit(
                        "openrouter-turn-finished",
                        SessionIdPayload {
                            session_id: thread_id.to_string(),
                        },
                    );
                    return Ok(SendTurnResult {
                        thread_id: thread_id.to_string(),
                        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
                    return Ok(finish_cancelled_messages_agent(
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
                    .map_err(|e| format!("Response blob write failed: {}", e))?;
                let _ = db::record_blob(
                    &conn,
                    &resp_blob.id,
                    &resp_blob.rel_path,
                    resp_blob.byte_len,
                );

                let engine_io_payload = serde_json::json!({
                  "v": 1,
                  "engine_id": ENGINE_MESSAGES_AGENT,
                  "provider_id": provider_id,
                  "model_id": selected_model_id,
                  "provider_model_ref": provider_model_ref_str.as_str(),
                  "provider_model_id": provider_model_id.as_str(),
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

                if using_platform && !status.is_success() {
                    platform_available_for_run = false;

                    if is_platform_inference_quota_exceeded(&resp_bytes) {
                        let provider_key_ok = get_byok_provider_key().is_ok();
                        if !provider_key_ok {
                            append_messages_agent_assistant_message(
	                &conn,
	                db_path,
	                thread_id,
	                &format!(
	                  "You've used your Arx AI quota for this month. Upgrade to continue with Arx AI.",
	                ),
	                selected_model_id,
	                &run_id,
	                &evidence_event_ids,
	                provider_id,
	                provider_model_ref,
                  inference_source,
	                request_max_tokens,
	                None,
	                context_community_id,
	              );
                            append_run_finished(
                                &conn,
                                db_path,
                                thread_id,
                                &run_id,
                                "error",
                                Some("platform_quota_exceeded"),
                            );
                            let _ = window.emit(
                                "openrouter-turn-finished",
                                SessionIdPayload {
                                    session_id: thread_id.to_string(),
                                },
                            );
                            return Ok(SendTurnResult {
                                thread_id: thread_id.to_string(),
                                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                engine_input_event_id: Some(engine_input_event.id),
                                engine_input_seq: Some(engine_input_event.seq),
                                run_id: Some(run_id),
                            });
                        }

                        if !platform_fallback_notified {
                            let _ = window.emit(
                                "inference-fallback",
                                InferenceFallbackPayload {
                                    session_id: thread_id.to_string(),
                                    from: "platform".to_string(),
                                    to: "user".to_string(),
                                    reason: "platform_quota_exceeded".to_string(),
                                },
                            );
                            platform_fallback_notified = true;
                        }
                        use_platform_for_call = false;
                        continue;
                    }

                    if is_platform_inference_not_allowed(&resp_bytes) {
                        use_platform_for_call = false;
                        continue;
                    }

                    if get_byok_provider_key().is_ok() {
                        let approved = await_inference_fallback_approval(
                            window,
                            thread_id,
                            selected_model_id,
                            model_ref.provider,
                            "platform_error",
                            cancel_rx.clone(),
                        )
                        .await;
                        if !approved {
                            append_messages_agent_assistant_message(
                                &conn,
                                db_path,
                                thread_id,
                                &format!(
		                  "Arx AI is temporarily unavailable. Please try again.",
		                ),
                                selected_model_id,
                                &run_id,
                                &evidence_event_ids,
                                provider_id,
                                provider_model_ref,
                                inference_source,
                                request_max_tokens,
                                None,
                                context_community_id,
                            );
                            append_run_finished(
                                &conn,
                                db_path,
                                thread_id,
                                &run_id,
                                "error",
                                Some("platform_fallback_denied"),
                            );
                            let _ = window.emit(
                                "openrouter-turn-finished",
                                SessionIdPayload {
                                    session_id: thread_id.to_string(),
                                },
                            );
                            return Ok(SendTurnResult {
                                thread_id: thread_id.to_string(),
                                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                engine_input_event_id: Some(engine_input_event.id),
                                engine_input_seq: Some(engine_input_event.seq),
                                run_id: Some(run_id),
                            });
                        }

                        if !platform_fallback_notified {
                            let _ = window.emit(
                                "inference-fallback",
                                InferenceFallbackPayload {
                                    session_id: thread_id.to_string(),
                                    from: "platform".to_string(),
                                    to: "user".to_string(),
                                    reason: "platform_error".to_string(),
                                },
                            );
                            platform_fallback_notified = true;
                        }
                        use_platform_for_call = false;
                        continue;
                    }
                }

                if status.as_u16() == 402 && request_attempt == 1 {
                    let friendly = serde_json::from_slice::<serde_json::Value>(&resp_bytes)
                        .ok()
                        .and_then(|v| v.get("error").cloned())
                        .and_then(|e| {
                            e.get("message")
                                .and_then(|m| m.as_str())
                                .map(|s| s.to_string())
                        })
                        .unwrap_or_else(|| String::from_utf8_lossy(&resp_bytes).to_string());
                    if let Some(afford) = parse_affordable_max_tokens(&friendly) {
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
                Text {
                    text: String,
                },
                ToolUse {
                    id: String,
                    name: String,
                    input: serde_json::Value,
                    input_json: String,
                },
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
                    return Ok(finish_cancelled_messages_agent(
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
                    return Ok(finish_cancelled_messages_agent(
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
                        append_messages_agent_assistant_message(
                            &conn,
                            db_path,
                            thread_id,
                            &format!("Engine error: stream error: {}", err),
                            selected_model_id,
                            &run_id,
                            &evidence_event_ids,
                            provider_id,
                            provider_model_ref,
                            inference_source,
                            request_max_tokens,
                            None,
                            context_community_id,
                        );
                        append_run_finished(
                            &conn,
                            db_path,
                            thread_id,
                            &run_id,
                            "error",
                            Some("provider_stream_error"),
                        );
                        let _ = window.emit(
                            "openrouter-turn-finished",
                            SessionIdPayload {
                                session_id: thread_id.to_string(),
                            },
                        );
                        return Ok(SendTurnResult {
                            thread_id: thread_id.to_string(),
                            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
                          "engine_id": ENGINE_MESSAGES_AGENT,
                          "provider_id": provider_id,
                          "model_id": selected_model_id,
                          "provider_model_ref": provider_model_ref_str.as_str(),
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
                          "engine_id": ENGINE_MESSAGES_AGENT,
                          "provider_id": provider_id,
                          "model_id": selected_model_id,
                          "provider_model_ref": provider_model_ref_str.as_str(),
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
                      "engine_id": ENGINE_MESSAGES_AGENT,
                      "provider_id": provider_id,
                      "model_id": selected_model_id,
                      "provider_model_ref": provider_model_ref_str.as_str(),
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
                        let idx =
                            parsed.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                        if blocks.len() <= idx {
                            blocks.resize_with(idx + 1, || None);
                        }
                        let block = parsed
                            .get("content_block")
                            .cloned()
                            .unwrap_or(serde_json::Value::Null);
                        let kind = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if kind == "text" {
                            let text = block
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            blocks[idx] = Some(StreamedBlock::Text { text });
                        } else if kind == "tool_use" {
                            let id = block
                                .get("id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let name = block
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let input = block
                                .get("input")
                                .cloned()
                                .unwrap_or(serde_json::Value::Null);
                            blocks[idx] = Some(StreamedBlock::ToolUse {
                                id,
                                name,
                                input,
                                input_json: String::new(),
                            });
                        }
                        continue;
                    }

                    if event_type == "content_block_delta" {
                        let idx =
                            parsed.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                        let delta = parsed
                            .get("delta")
                            .cloned()
                            .unwrap_or(serde_json::Value::Null);
                        let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if delta_type == "text_delta" {
                            let delta_text =
                                delta.get("text").and_then(|v| v.as_str()).unwrap_or("");
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
                                    blocks[idx] = Some(StreamedBlock::Text {
                                        text: delta_text.to_string(),
                                    });
                                }
                            }
                            assistant.push_str(delta_text);
                            stream_seq += 1;
                            let _ = window.emit(
                                "openrouter-stream",
                                OpenRouterStreamPayload {
                                    session_id: thread_id.to_string(),
                                    run_id: run_id.clone(),
                                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                                    model_id: selected_model_id.to_string(),
                                    inference_source: inference_source.to_string(),
                                    chunk: delta_text.to_string(),
                                    full_content: assistant.clone(),
                                    seq: stream_seq,
                                    prompt_tokens,
                                    completion_tokens,
                                    max_tokens: request_max_tokens,
                                },
                            );
                        } else if delta_type == "input_json_delta" {
                            let partial_json = delta
                                .get("partial_json")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            if partial_json.is_empty() {
                                continue;
                            }
                            if blocks.len() <= idx {
                                blocks.resize_with(idx + 1, || None);
                            }
                            if let Some(StreamedBlock::ToolUse { input_json, .. }) =
                                blocks.get_mut(idx).and_then(|v| v.as_mut())
                            {
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
                    Some(StreamedBlock::Text { text }) => {
                        Some(serde_json::json!({ "type": "text", "text": text }))
                    }
                    Some(StreamedBlock::ToolUse {
                        id,
                        name,
                        input,
                        input_json,
                    }) => {
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
            let friendly = format_provider_error(&resp_bytes);
            append_messages_agent_assistant_message(
                &conn,
                db_path,
                thread_id,
                &format!("Engine error: error {}: {}", status.as_u16(), friendly),
                selected_model_id,
                &run_id,
                &evidence_event_ids,
                provider_id,
                provider_model_ref,
                final_inference_source.as_deref().unwrap_or("system"),
                request_max_tokens,
                None,
                context_community_id,
            );
            append_run_finished(
                &conn,
                db_path,
                thread_id,
                &run_id,
                "error",
                Some("provider_http_error"),
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                SessionIdPayload {
                    session_id: thread_id.to_string(),
                },
            );
            return Ok(SendTurnResult {
                thread_id: thread_id.to_string(),
                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: Some(engine_input_event.id),
                engine_input_seq: Some(engine_input_event.seq),
                run_id: Some(run_id),
            });
        };

        if *cancel_rx.borrow() {
            return Ok(finish_cancelled_messages_agent(
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
            .map_err(|e| format!("Response parse failed: {}", e))?;
        let content_blocks = parsed
            .get("content")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

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
            let tool_use_id = block
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let raw_tool_name = block
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_args = block
                .get("input")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            let loop_tool_key = compute_tool_call_key(
                normalize_agent_tool_name(&raw_tool_name).as_str(),
                &tool_args,
                &workspace_scope_id,
            );
            if last_tool_call_key
                .as_deref()
                .map(|prev| prev == loop_tool_key.as_str())
                .unwrap_or(false)
            {
                identical_tool_call_streak = identical_tool_call_streak.saturating_add(1);
            } else {
                identical_tool_call_streak = 1;
                last_tool_call_key = Some(loop_tool_key.clone());
            }
            if push_tool_key_and_detect_cycle(&mut recent_tool_call_keys, &loop_tool_key) {
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    "Engine paused: detected a repeating multi-step tool cycle with no progress. Review the plan and add a new constraint before retrying.",
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    request_max_tokens,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("loop_guard_no_progress_tool_cycle"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: first_engine_input_event_id.clone(),
                    engine_input_seq: first_engine_input_seq,
                    run_id: Some(run_id),
                });
            }
            if identical_tool_call_streak > AGENT_MAX_IDENTICAL_TOOL_CALL_STREAK {
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    "Engine paused: detected repeated identical tool calls; this may be a loop. Review and retry with clarified instructions.",
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    request_max_tokens,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("loop_guard_identical_tool_call_streak"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: first_engine_input_event_id.clone(),
                    engine_input_seq: first_engine_input_seq,
                    run_id: Some(run_id),
                });
            }
            if run_started_at.elapsed().as_millis() > AGENT_MAX_RUN_WALL_MS {
                append_messages_agent_assistant_message(
                    &conn,
                    db_path,
                    thread_id,
                    "Engine paused: run exceeded wall-clock safety budget; review and continue in a new turn.",
                    selected_model_id,
                    &run_id,
                    &evidence_event_ids,
                    provider_id,
                    provider_model_ref,
                    final_inference_source.as_deref().unwrap_or("system"),
                    request_max_tokens,
                    None,
                    context_community_id,
                );
                append_run_finished(
                    &conn,
                    db_path,
                    thread_id,
                    &run_id,
                    "error",
                    Some("loop_guard_run_wall_timeout"),
                );
                let _ = window.emit(
                    "openrouter-turn-finished",
                    SessionIdPayload {
                        session_id: thread_id.to_string(),
                    },
                );
                return Ok(SendTurnResult {
                    thread_id: thread_id.to_string(),
                    engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                    engine_input_event_id: first_engine_input_event_id.clone(),
                    engine_input_seq: first_engine_input_seq,
                    run_id: Some(run_id),
                });
            }
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
                return Ok(finish_cancelled_messages_agent(
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
              "content": truncate_tool_result_for_prompt(&outcome.tool_result_content)
            }));

            if *cancel_rx.borrow() {
                return Ok(finish_cancelled_messages_agent(
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
            break text_out.trim().to_string();
        }
        tool_rounds = tool_rounds.saturating_add(1);
        if tool_rounds > AGENT_MAX_TOOL_ROUNDS_PER_RUN {
            append_messages_agent_assistant_message(
                &conn,
                db_path,
                thread_id,
                "Engine paused: tool loop exceeded safety round limit; review the plan before continuing.",
                selected_model_id,
                &run_id,
                &evidence_event_ids,
                provider_id,
                provider_model_ref,
                final_inference_source.as_deref().unwrap_or("system"),
                request_max_tokens,
                None,
                context_community_id,
            );
            append_run_finished(
                &conn,
                db_path,
                thread_id,
                &run_id,
                "error",
                Some("loop_guard_tool_round_limit"),
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                SessionIdPayload {
                    session_id: thread_id.to_string(),
                },
            );
            return Ok(SendTurnResult {
                thread_id: thread_id.to_string(),
                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: first_engine_input_event_id.clone(),
                engine_input_seq: first_engine_input_seq,
                run_id: Some(run_id),
            });
        }

        messages.push(serde_json::json!({ "role": "assistant", "content": content_blocks }));
        messages.push(serde_json::json!({ "role": "user", "content": tool_results }));

        trim_anthropic_tool_loop_messages(&mut messages);
    };

    if *cancel_rx.borrow() {
        return Ok(finish_cancelled_messages_agent(
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
        append_messages_agent_assistant_message(
            &conn,
            db_path,
            thread_id,
            "Engine error: empty response.",
            selected_model_id,
            &run_id,
            &evidence_event_ids,
            provider_id,
            provider_model_ref,
            final_inference_source.as_deref().unwrap_or("system"),
            DEFAULT_MAX_TOKENS,
            None,
            context_community_id,
        );
        append_run_finished(
            &conn,
            db_path,
            thread_id,
            &run_id,
            "error",
            Some("empty_response"),
        );
        let _ = window.emit(
            "openrouter-turn-finished",
            SessionIdPayload {
                session_id: thread_id.to_string(),
            },
        );
        return Ok(SendTurnResult {
            thread_id: thread_id.to_string(),
            engine_id: ENGINE_MESSAGES_AGENT.to_string(),
            engine_input_event_id: first_engine_input_event_id.clone(),
            engine_input_seq: first_engine_input_seq,
            run_id: Some(run_id),
        });
    }

    append_messages_agent_assistant_message(
        &conn,
        db_path,
        thread_id,
        &content,
        selected_model_id,
        &run_id,
        &evidence_event_ids,
        provider_id,
        provider_model_ref,
        final_inference_source.as_deref().unwrap_or("system"),
        DEFAULT_MAX_TOKENS,
        Some(used_personal_memory),
        context_community_id,
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
        engine_id: ENGINE_MESSAGES_AGENT.to_string(),
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
    _cwd: String,
    input: String,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    supabase_access_token: Option<String>,
) -> Result<SendTurnResult, String> {
    let _thread_lock = lock_thread_run(&thread_id).await;
    let (_cancel_reg, cancel_rx) = CancelRegistration::register(thread_id.trim()).await;
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let mut thread = get_thread_by_id(&conn, &thread_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "thread not found".to_string())?;

    // Legacy compatibility: migrate old threads to the current engine on first use.
    if thread.engine_id == ENGINE_LEGACY_OPENROUTER_CHAT
        || thread.engine_id == ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        let model_id = thread.model_id.clone();
        set_thread_engine_model(
            &conn,
            &thread_id,
            ENGINE_MESSAGES_AGENT,
            model_id.as_deref(),
        )
        .map_err(|e| e.to_string())?;
        thread.engine_id = ENGINE_MESSAGES_AGENT.to_string();
    }

    let platform_proxy = match (
        supabase_url.as_deref(),
        supabase_anon_key.as_deref(),
        supabase_access_token.as_deref(),
    ) {
        (Some(url), Some(anon), Some(token)) => {
            let url = url.trim();
            let anon = anon.trim();
            let token = token.trim();
            if url.is_empty() || anon.is_empty() || token.is_empty() {
                None
            } else if !(url.starts_with("https://") || url.starts_with("http://")) {
                None
            } else {
                Some(PlatformProxyConfig {
                    supabase_url: url.trim_end_matches('/').to_string(),
                    supabase_anon_key: anon.to_string(),
                    access_token: token.to_string(),
                })
            }
        }
        _ => None,
    };

    // Workspace bindings are explicit (device-local). Do not fall back to "." when unbound.
    let workspace = thread
        .workspace_path
        .as_deref()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .filter(|p| std::path::Path::new(p).is_absolute())
        .unwrap_or("");

    let run_mode = get_ui_state(&conn, &format!("agent_mode::{}", thread_id))
        .ok()
        .flatten()
        .and_then(|v| normalize_agent_mode(&v))
        .map(|mode| {
            if mode == "explore" {
                "explore"
            } else {
                "build"
            }
        })
        .unwrap_or("build");

    let cloud_user_id = platform_proxy
        .as_ref()
        .and_then(|cfg| jwt_string_claim(&cfg.access_token, "sub"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let cloud_personal_memory_items_json =
        if let (Some(proxy), Some(user_id)) = (platform_proxy.as_ref(), cloud_user_id.as_deref())
        {
            fetch_cloud_personal_memory_items_json(proxy, user_id).await
        } else {
            None
        };

    // Shared memory injection. Prefer cloud-canonical items if provided.
    let used_personal_memory = if let Some(json) = cloud_personal_memory_items_json.as_deref() {
        context_builder::build_used_personal_memory_from_cloud_json(workspace, json)
            .or_else(|_| context_builder::build_turn_handoff_prefix(&conn, workspace))
            .map_err(|e| e.to_string())?
    } else {
        context_builder::build_turn_handoff_prefix(&conn, workspace).map_err(|e| e.to_string())?
    };

    let cloud_community_system_prompt = if let (Some(proxy), Some(user_id), Some(community_id)) = (
        platform_proxy.as_ref(),
        cloud_user_id.as_deref(),
        thread.community_id.as_deref(),
    ) {
        fetch_active_community_system_prompt(proxy, user_id, community_id).await
    } else {
        None
    };

    let user_system_prompt = get_ui_state(&conn, "system_prompt").ok().flatten();
    let atom_system_prompt = build_atom_system_prompt(
        workspace,
        &used_personal_memory,
        thread.community_id.as_deref(),
        user_system_prompt.as_deref(),
        cloud_community_system_prompt.as_deref(),
    );
    let retrieval_payload = serde_json::json!({
          "v": 1,
          "workspace_path": workspace,
          "personal_memory": {
        "budget_chars": 2000,
        "items": used_personal_memory.iter().map(|it| serde_json::json!({
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
        .ok_or_else(|| "model_id is required".to_string())?;

    if thread.engine_id == ENGINE_MESSAGES_AGENT {
        return send_turn_messages_agent(
            &window,
            conn,
            &state.db_path,
            &thread_id,
            workspace,
            run_mode,
            selected_model_id,
            &input,
            &atom_system_prompt,
            &used_personal_memory,
            None,
            platform_proxy,
            cancel_rx.clone(),
            thread.community_id.clone(),
        )
        .await;
    }

    return Err(format!("Unsupported engine_id: {}", thread.engine_id));
}

#[tauri::command]
async fn submit_turn_cmd(
    window: tauri::Window,
    state: tauri::State<'_, DbState>,
    thread_id: String,
    cwd: String,
    input: String,
    user_content_json: String,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    supabase_access_token: Option<String>,
) -> Result<SendTurnResult, String> {
    let db_path = state.db_path.clone();
    let db_key = state.key.clone();

    {
        let conn = open_conn(&db_path, &db_key).map_err(|e| e.to_string())?;
        add_message(&conn, &thread_id, "user", &user_content_json).map_err(|e| e.to_string())?;
    }

    match send_turn_cmd(
        window.clone(),
        state,
        thread_id.clone(),
        cwd,
        input,
        supabase_url,
        supabase_anon_key,
        supabase_access_token,
    )
    .await
    {
        Ok(result) => Ok(result),
        Err(err) => {
            let fallback_content = serde_json::json!({
                "text": format!("Engine error: {}", err),
            })
            .to_string();
            if let Ok(conn) = open_conn(&db_path, &db_key) {
                let _ = add_message(&conn, &thread_id, "assistant", &fallback_content);
            }

            let _ = window.emit(
                "agent-status",
                AgentStatusPayload {
                    session_id: thread_id.clone(),
                    status: "idle".to_string(),
                    tool_name: None,
                    tool_args_preview: None,
                },
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                SessionIdPayload {
                    session_id: thread_id.clone(),
                },
            );

            Ok(SendTurnResult {
                thread_id,
                engine_id: ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: None,
                engine_input_seq: None,
                run_id: None,
            })
        }
    }
}

/// Legacy alias for backward compatibility
#[tauri::command]
async fn engine_send_turn_cmd(
    window: tauri::Window,
    state: tauri::State<'_, DbState>,
    thread_id: String,
    cwd: String,
    input: String,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    supabase_access_token: Option<String>,
) -> Result<SendTurnResult, String> {
    send_turn_cmd(
        window,
        state,
        thread_id,
        cwd,
        input,
        supabase_url,
        supabase_anon_key,
        supabase_access_token,
    )
    .await
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
        .unwrap_or(ENGINE_MESSAGES_AGENT);
    let engine_id = if engine_id == ENGINE_LEGACY_OPENROUTER_CHAT
        || engine_id == ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        ENGINE_MESSAGES_AGENT
    } else {
        engine_id
    };

    let model_id = model_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());

    if engine_id == ENGINE_MESSAGES_AGENT && model_id.is_none() {
        return Err("Model is required".to_string());
    }

    let thread = create_thread(&conn, &title, engine_id, model_id).map_err(|e| e.to_string())?;
    Ok(thread)
}

#[tauri::command]
fn upsert_thread_cmd(
    state: tauri::State<DbState>,
    thread_id: String,
    title: Option<String>,
    engine_id: Option<String>,
    model_id: Option<String>,
    community_id: Option<String>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
) -> Result<db::ThreadRecord, String> {
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let cleaned_engine_id = engine_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or(ENGINE_MESSAGES_AGENT);
    let cleaned_engine_id = if cleaned_engine_id == ENGINE_LEGACY_OPENROUTER_CHAT
        || cleaned_engine_id == ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        ENGINE_MESSAGES_AGENT
    } else {
        cleaned_engine_id
    };

    let cleaned_model_id = model_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());

    let cleaned_community_id = community_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());

    let cleaned_title = title.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty());

    db::upsert_thread_from_cloud(
        &conn,
        &thread_id,
        cleaned_title,
        cleaned_engine_id,
        cleaned_model_id,
        cleaned_community_id,
        created_at,
        updated_at,
    )
    .map_err(|e| e.to_string())
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
fn list_events_since_cmd(
    state: tauri::State<DbState>,
    thread_id: String,
    after_seq: i64,
    limit: usize,
    include_engine_io_chunk: Option<bool>,
) -> Result<Vec<db::EventRecord>, String> {
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    list_events_since(
        &conn,
        &thread_id,
        after_seq,
        limit,
        include_engine_io_chunk.unwrap_or(false),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_tool_calls_cmd(
    state: tauri::State<DbState>,
    thread_id: String,
    limit: usize,
) -> Result<Vec<db::ToolCallRecord>, String> {
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    list_tool_calls(&conn, &thread_id, limit).map_err(|e| e.to_string())
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
fn reset_local_db_cmd(state: tauri::State<DbState>) -> Result<(), String> {
    // Best-effort local reset: delete the SQLite file and blobs, then recreate schema.
    // Cloud is canonical for cognition; this is a cache/evidence store for the desktop operator.
    let _ = std::fs::remove_dir_all(blob_store::blob_root(&state.db_path));
    let _ = std::fs::remove_file(&state.db_path);
    db::init_db_at(&state.db_path, &state.key)
        .map(|_| ())
        .map_err(|e| e.to_string())
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
    let cleaned = workspace_path
        .as_deref()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty());
    if let Some(path) = cleaned {
        if !std::path::Path::new(path).is_absolute() {
            return Err("workspace_path must be an absolute path".to_string());
        }
    }
    let scope_id = cleaned.map(|p| {
        std::path::Path::new(p)
            .canonicalize()
            .ok()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or_else(|| p.to_string())
    });

    // Contract primitive: device-local binding for workspace scope enforcement.
    let _ = upsert_workspace_binding(&conn, &thread_id, cleaned, scope_id.as_deref());

    // Legacy metadata (kept for backwards compatibility with the current UI).
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
    let cleaned = community_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());
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
    let cleaned_engine = if cleaned_engine == ENGINE_LEGACY_OPENROUTER_CHAT
        || cleaned_engine == ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        ENGINE_MESSAGES_AGENT
    } else {
        cleaned_engine
    };
    let cleaned_model = model_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());
    let requires_model = cleaned_engine == ENGINE_MESSAGES_AGENT;
    let final_model = if requires_model {
        cleaned_model.ok_or_else(|| "model_id is required".to_string())?
    } else {
        ""
    };

    set_thread_engine_model(
        &conn,
        &thread_id,
        cleaned_engine,
        if requires_model {
            Some(final_model)
        } else {
            None
        },
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
    let cleaned = path.trim();
    if cleaned.is_empty() {
        return Err("workspace root is required".to_string());
    }
    if !std::path::Path::new(cleaned).is_absolute() {
        return Err("workspace root must be an absolute path".to_string());
    }
    std::fs::create_dir_all(cleaned).map_err(|e| e.to_string())?;
    set_ui_state(&conn, "workspace_root", cleaned).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_path_within_workspace_cmd(
    state: tauri::State<DbState>,
    path: String,
) -> Result<bool, String> {
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
    let before = db::get_personal_memory_item_by_id(&conn, &id).map_err(|e| e.to_string())?;
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

#[tauri::command]
fn get_provider_key_cmd(provider: String) -> Result<Option<String>, String> {
    let entry = Entry::new("com.arx.app", &provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
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
const KEYCHAIN_CHATGPT_AUTH_V1: &str = "chatgpt_auth_v1";
const CHATGPT_OAUTH_ISSUER: &str = "https://auth.openai.com";
const CHATGPT_OAUTH_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_OAUTH_SCOPE: &str = "openid profile email offline_access";
const CHATGPT_OAUTH_ORIGINATOR: &str = "codex_cli_rs";
const CHATGPT_CODEX_RESPONSES_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const CHATGPT_OAUTH_CALLBACK_PORT: u16 = 1455;

#[derive(Clone, Serialize, Deserialize)]
struct ChatgptAuthV1 {
    id_token: String,
    access_token: String,
    refresh_token: String,
    account_id: Option<String>,
    email: Option<String>,
    access_token_expires_at: Option<i64>,
}

#[derive(Clone, Serialize)]
struct ChatgptAuthSummary {
    email: Option<String>,
    account_id: Option<String>,
    access_token_expires_at: Option<i64>,
}

fn decode_jwt_claims(token: &str) -> Option<serde_json::Value> {
    let mut parts = token.split('.');
    let _ = parts.next()?;
    let payload_b64 = parts.next()?;
    if payload_b64.trim().is_empty() {
        return None;
    }
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let bytes = URL_SAFE_NO_PAD.decode(payload_b64.as_bytes()).ok()?;
    serde_json::from_slice::<serde_json::Value>(&bytes).ok()
}

fn jwt_string_claim(token: &str, key: &str) -> Option<String> {
    decode_jwt_claims(token)?
        .get(key)
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
}

fn jwt_i64_claim(token: &str, key: &str) -> Option<i64> {
    decode_jwt_claims(token)?.get(key).and_then(|v| v.as_i64())
}

fn extract_chatgpt_account_id_from_claims(claims: &serde_json::Value) -> Option<String> {
    if let Some(v) = claims.get("chatgpt_account_id").and_then(|v| v.as_str()) {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(v) = claims
        .get("https://api.openai.com/auth")
        .and_then(|v| v.get("chatgpt_account_id"))
        .and_then(|v| v.as_str())
    {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(v) = claims
        .get("organizations")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
    {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    None
}

fn extract_chatgpt_account_id_from_token(token: &str) -> Option<String> {
    let claims = decode_jwt_claims(token)?;
    extract_chatgpt_account_id_from_claims(&claims)
}

fn load_chatgpt_auth_v1() -> Result<Option<ChatgptAuthV1>, String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_CHATGPT_AUTH_V1).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(raw) => {
            let parsed: ChatgptAuthV1 =
                serde_json::from_str(raw.trim()).map_err(|e| e.to_string())?;
            Ok(Some(parsed))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn save_chatgpt_auth_v1(value: &ChatgptAuthV1) -> Result<(), String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_CHATGPT_AUTH_V1).map_err(|e| e.to_string())?;
    let serialized = serde_json::to_string(value).map_err(|e| e.to_string())?;
    entry.set_password(&serialized).map_err(|e| e.to_string())
}

fn clear_chatgpt_auth_v1() -> Result<(), String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_CHATGPT_AUTH_V1).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

fn summarize_chatgpt_auth(value: &ChatgptAuthV1) -> ChatgptAuthSummary {
    ChatgptAuthSummary {
        email: value.email.clone(),
        account_id: value.account_id.clone(),
        access_token_expires_at: value.access_token_expires_at,
    }
}

fn generate_chatgpt_pkce() -> (String, String) {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let mut raw = [0u8; 32];
    raw[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    raw[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    let code_verifier = URL_SAFE_NO_PAD.encode(raw);
    let digest = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = URL_SAFE_NO_PAD.encode(digest);
    (code_verifier, code_challenge)
}

fn generate_chatgpt_state() -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let mut raw = [0u8; 32];
    raw[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    raw[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(raw)
}

fn build_chatgpt_authorize_url(
    redirect_uri: &str,
    code_challenge: &str,
    state: &str,
) -> Result<String, String> {
    let base = format!("{}/oauth/authorize", CHATGPT_OAUTH_ISSUER);
    let url = reqwest::Url::parse_with_params(
        &base,
        [
            ("response_type", "code"),
            ("client_id", CHATGPT_OAUTH_CLIENT_ID),
            ("redirect_uri", redirect_uri),
            ("scope", CHATGPT_OAUTH_SCOPE),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
            ("id_token_add_organizations", "true"),
            ("codex_cli_simplified_flow", "true"),
            ("state", state),
            ("originator", CHATGPT_OAUTH_ORIGINATOR),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(url.to_string())
}

async fn exchange_chatgpt_code_for_tokens(
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<(String, String, String), String> {
    #[derive(Deserialize)]
    struct TokenResponse {
        id_token: String,
        access_token: String,
        refresh_token: String,
    }

    let url = format!("{}/oauth/token", CHATGPT_OAUTH_ISSUER);
    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("client_id", CHATGPT_OAUTH_CLIENT_ID),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("ChatGPT login failed: {}", body.trim()));
    }
    let parsed: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok((parsed.id_token, parsed.access_token, parsed.refresh_token))
}

async fn refresh_chatgpt_tokens(
    refresh_token: &str,
) -> Result<(Option<String>, Option<String>, Option<String>), String> {
    #[derive(Serialize)]
    struct RefreshRequest<'a> {
        client_id: &'a str,
        grant_type: &'a str,
        refresh_token: &'a str,
        scope: &'a str,
    }

    #[derive(Deserialize)]
    struct RefreshResponse {
        id_token: Option<String>,
        access_token: Option<String>,
        refresh_token: Option<String>,
    }

    let url = format!("{}/oauth/token", CHATGPT_OAUTH_ISSUER);
    let client = reqwest::Client::new();
    let req = RefreshRequest {
        client_id: CHATGPT_OAUTH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token,
        scope: "openid profile email",
    };

    let res = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("ChatGPT refresh failed: {}", body.trim()));
    }

    let parsed: RefreshResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok((parsed.id_token, parsed.access_token, parsed.refresh_token))
}

async fn get_chatgpt_auth_for_inference() -> Result<Option<ChatgptAuthV1>, String> {
    let Some(mut current) = load_chatgpt_auth_v1()? else {
        return Ok(None);
    };
    if current.account_id.is_none() {
        current.account_id = extract_chatgpt_account_id_from_token(&current.id_token)
            .or_else(|| extract_chatgpt_account_id_from_token(&current.access_token));
        let _ = save_chatgpt_auth_v1(&current);
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    if let Some(exp) = current.access_token_expires_at {
        if exp > 0 && now + 60 < exp {
            return Ok(Some(current));
        }
    }

    let refresh = current.refresh_token.trim();
    if refresh.is_empty() {
        return Ok(Some(current));
    }

    match refresh_chatgpt_tokens(refresh).await {
        Ok((maybe_id, maybe_access, maybe_refresh)) => {
            let id_token = maybe_id.unwrap_or_else(|| current.id_token.clone());
            let access_token = maybe_access.unwrap_or_else(|| current.access_token.clone());
            let refresh_token = maybe_refresh.unwrap_or_else(|| current.refresh_token.clone());
            let updated = ChatgptAuthV1 {
                account_id: extract_chatgpt_account_id_from_token(&id_token)
                    .or_else(|| extract_chatgpt_account_id_from_token(&access_token))
                    .or_else(|| current.account_id.clone()),
                email: jwt_string_claim(&id_token, "email"),
                access_token_expires_at: jwt_i64_claim(&access_token, "exp"),
                id_token,
                access_token,
                refresh_token,
            };
            save_chatgpt_auth_v1(&updated)?;
            Ok(Some(updated))
        }
        Err(_) => {
            let _ = clear_chatgpt_auth_v1();
            Ok(None)
        }
    }
}

async fn wait_for_chatgpt_oauth_callback(
    listener: TcpListener,
    expected_state: &str,
) -> Result<String, String> {
    let deadline = tokio::time::sleep(std::time::Duration::from_secs(300));
    tokio::pin!(deadline);

    loop {
        tokio::select! {
          _ = &mut deadline => {
            return Err("ChatGPT login timed out.".to_string());
          }
          accepted = listener.accept() => {
            let (mut stream, _) = accepted.map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            let mut tmp = [0u8; 1024];
            loop {
              let n = stream.read(&mut tmp).await.map_err(|e| e.to_string())?;
              if n == 0 {
                break;
              }
              buf.extend_from_slice(&tmp[..n]);
              if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                break;
              }
              if buf.len() > 16 * 1024 {
                break;
              }
            }
            let req = String::from_utf8_lossy(&buf).to_string();
            let first_line = req.lines().next().unwrap_or("");
            let path = first_line
              .strip_prefix("GET ")
              .and_then(|rest| rest.split_whitespace().next())
              .unwrap_or("/");

            let parsed = reqwest::Url::parse(&format!("http://localhost{}", path)).ok();
            let params: std::collections::HashMap<String, String> = parsed
              .as_ref()
              .map(|u| u.query_pairs().into_owned().collect())
              .unwrap_or_default();

            let ok = parsed
              .as_ref()
              .map(|u| u.path() == "/auth/callback")
              .unwrap_or(false)
              && params.get("state").map(|v| v.as_str()) == Some(expected_state)
              && params.get("code").map(|v| !v.trim().is_empty()).unwrap_or(false);

            if ok {
              let body = "<!doctype html><html><body style=\"font-family: system-ui; padding: 24px;\"><h2>Signed in</h2><p>You can close this window and return to Arx.</p></body></html>";
              let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
                body.as_bytes().len(),
                body
              );
              let _ = stream.write_all(resp.as_bytes()).await;
              let _ = stream.flush().await;
              let code = params.get("code").cloned().unwrap_or_default();
              return Ok(code);
            }

            if parsed.as_ref().map(|u| u.path() == "/cancel").unwrap_or(false) {
              let body = "ok";
              let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
                body.as_bytes().len(),
                body
              );
              let _ = stream.write_all(resp.as_bytes()).await;
              let _ = stream.flush().await;
              return Err("ChatGPT login was cancelled.".to_string());
            }

            let body = "Not found";
            let resp = format!(
              "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
              body.as_bytes().len(),
              body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
            let _ = stream.flush().await;
          }
        }
    }
}

async fn send_chatgpt_cancel_request() -> Result<(), String> {
    let addr = format!("127.0.0.1:{}", CHATGPT_OAUTH_CALLBACK_PORT);
    let mut stream = TcpStream::connect(addr).await.map_err(|e| e.to_string())?;
    let req = format!(
        "GET /cancel HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        CHATGPT_OAUTH_CALLBACK_PORT
    );
    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64];
    let _ = stream.read(&mut buf).await;
    Ok(())
}

async fn bind_chatgpt_callback_listener() -> Result<TcpListener, String> {
    let bind_addr = format!("127.0.0.1:{}", CHATGPT_OAUTH_CALLBACK_PORT);
    let mut cancel_attempted = false;
    let mut attempts: u32 = 0;
    const MAX_ATTEMPTS: u32 = 10;

    loop {
        match TcpListener::bind(&bind_addr).await {
            Ok(listener) => return Ok(listener),
            Err(err) if err.kind() == std::io::ErrorKind::AddrInUse => {
                attempts += 1;
                if !cancel_attempted {
                    cancel_attempted = true;
                    let _ = send_chatgpt_cancel_request().await;
                }
                if attempts >= MAX_ATTEMPTS {
                    return Err(format!(
                        "ChatGPT login port {} is already in use.",
                        CHATGPT_OAUTH_CALLBACK_PORT
                    ));
                }
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                continue;
            }
            Err(err) => return Err(err.to_string()),
        }
    }
}

#[tauri::command]
fn get_chatgpt_auth_summary_cmd() -> Result<Option<ChatgptAuthSummary>, String> {
    Ok(load_chatgpt_auth_v1()?.map(|value| summarize_chatgpt_auth(&value)))
}

#[tauri::command]
fn clear_chatgpt_auth_cmd() -> Result<(), String> {
    clear_chatgpt_auth_v1()
}

#[tauri::command]
async fn chatgpt_login_cmd() -> Result<ChatgptAuthSummary, String> {
    // Use Codex's fixed localhost callback port. The OAuth client is typically
    // registered with a single redirect URI, so random ports can fail.
    let listener = bind_chatgpt_callback_listener().await?;
    let redirect_uri = format!(
        "http://localhost:{}/auth/callback",
        CHATGPT_OAUTH_CALLBACK_PORT
    );

    let (code_verifier, code_challenge) = generate_chatgpt_pkce();
    let state = generate_chatgpt_state();
    let auth_url = build_chatgpt_authorize_url(&redirect_uri, &code_challenge, &state)?;

    // Launch browser for the OAuth consent/login flow.
    open::that(&auth_url).map_err(|e| e.to_string())?;

    let code = wait_for_chatgpt_oauth_callback(listener, &state).await?;
    let (id_token, access_token, refresh_token) =
        exchange_chatgpt_code_for_tokens(&code, &redirect_uri, &code_verifier).await?;

    let account_id = extract_chatgpt_account_id_from_token(&id_token)
        .or_else(|| extract_chatgpt_account_id_from_token(&access_token));
    let email = jwt_string_claim(&id_token, "email");
    let access_token_expires_at = jwt_i64_claim(&access_token, "exp");

    let stored = ChatgptAuthV1 {
        id_token,
        access_token,
        refresh_token,
        account_id,
        email,
        access_token_expires_at,
    };
    save_chatgpt_auth_v1(&stored)?;
    Ok(summarize_chatgpt_auth(&stored))
}

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
    entry.set_password(cleaned).map_err(|e| e.to_string())
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
fn open_external_url_cmd(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is empty".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("url must start with http:// or https://".to_string());
    }
    open::that(trimmed).map_err(|e| e.to_string())
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
    let Some(raw) = get_ui_state(conn, UI_STATE_PENDING_INVITES_V1)
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
fn list_pending_invites_cmd(
    state: tauri::State<DbState>,
) -> Result<Vec<PendingInviteRecord>, String> {
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
fn dismiss_pending_invite_cmd(
    state: tauri::State<DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = db::now_ts();

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
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
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
fn get_system_prompt_cmd(state: tauri::State<DbState>) -> Result<Option<String>, String> {
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    get_ui_state(&conn, "system_prompt").map_err(|e| e.to_string())
}

#[tauri::command]
fn set_system_prompt_cmd(state: tauri::State<DbState>, prompt: String) -> Result<(), String> {
    let conn = open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    if prompt.len() > 20000 {
        return Err("prompt too large".to_string());
    }
    set_ui_state(&conn, "system_prompt", &prompt).map_err(|e| e.to_string())
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
        reason: "Internal command classification is disabled in MVP; use the engine terminal."
            .to_string(),
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
                Some(format!(
                    "data:{};base64,{}",
                    mime,
                    STANDARD.encode(preview_bytes)
                ))
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

const NATIVE_VOICE_TARGET_SAMPLE_RATE_HZ: u32 = 16_000;

struct NativeVoiceCaptureSession {
    stream: cpal::Stream,
    samples_mono_i16: Arc<StdMutex<Vec<i16>>>,
    input_sample_rate_hz: u32,
    started_at: Instant,
}

#[derive(Clone, Copy, Debug)]
struct NativeVoiceSignalMetrics {
    rms: f32,
    peak: i16,
    speech_ratio: f32,
}

#[derive(Serialize)]
struct NativeVoiceCaptureStarted {
    input_sample_rate_hz: u32,
}

#[derive(Serialize)]
struct NativeVoiceCaptureStopped {
    audio_base64: String,
    mime_type: String,
    sample_rate_hz: u32,
    duration_ms: u64,
    rms: f32,
    peak: i16,
    speech_ratio: f32,
    speech_detected: bool,
}

enum NativeVoiceWorkerCommand {
    Start {
        reply: std::sync::mpsc::Sender<Result<NativeVoiceCaptureStarted, String>>,
    },
    Stop {
        reply: std::sync::mpsc::Sender<Result<NativeVoiceCaptureStopped, String>>,
    },
    Cancel {
        reply: std::sync::mpsc::Sender<Result<bool, String>>,
    },
}

#[derive(Clone)]
struct NativeVoiceCaptureManager {
    sender: std::sync::mpsc::Sender<NativeVoiceWorkerCommand>,
}

impl Default for NativeVoiceCaptureManager {
    fn default() -> Self {
        let (sender, receiver) = std::sync::mpsc::channel::<NativeVoiceWorkerCommand>();
        let _ = std::thread::Builder::new()
            .name("native-voice-capture".to_string())
            .spawn(move || native_voice_worker_loop(receiver));
        Self { sender }
    }
}

fn f32_sample_to_i16(sample: f32) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    let scaled = if clamped < 0.0 {
        (clamped * 32768.0).round()
    } else {
        (clamped * 32767.0).round()
    };
    scaled.clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

fn mix_frame_f32_to_i16(frame: &[f32]) -> i16 {
    if frame.is_empty() {
        return 0;
    }
    let mut sum = 0.0f32;
    for sample in frame {
        sum += sample.clamp(-1.0, 1.0);
    }
    f32_sample_to_i16(sum / frame.len() as f32)
}

fn mix_frame_i16_to_i16(frame: &[i16]) -> i16 {
    if frame.is_empty() {
        return 0;
    }
    let sum: i64 = frame.iter().map(|sample| *sample as i64).sum();
    let avg = (sum as f64 / frame.len() as f64)
        .round()
        .clamp(i16::MIN as f64, i16::MAX as f64);
    avg as i16
}

fn mix_frame_u16_to_i16(frame: &[u16]) -> i16 {
    if frame.is_empty() {
        return 0;
    }
    let mut sum = 0i64;
    for sample in frame {
        sum += *sample as i64 - 32768;
    }
    let avg = (sum as f64 / frame.len() as f64)
        .round()
        .clamp(i16::MIN as f64, i16::MAX as f64);
    avg as i16
}

#[cfg(test)]
mod native_voice_capture_tests {
    use super::{
        f32_sample_to_i16, mix_frame_f32_to_i16, mix_frame_i16_to_i16, mix_frame_u16_to_i16,
    };

    #[test]
    fn f32_conversion_preserves_negative_polarity() {
        assert!(f32_sample_to_i16(-0.5) < 0);
        assert!(f32_sample_to_i16(0.5) > 0);
    }

    #[test]
    fn f32_mix_down_averages_channels() {
        // Equal-opposite stereo sample should average to (near) silence.
        let mixed = mix_frame_f32_to_i16(&[1.0, -1.0]);
        assert!(mixed.abs() <= 1);
    }

    #[test]
    fn i16_mix_down_averages_channels() {
        let mixed = mix_frame_i16_to_i16(&[2000, -1000, 1000]);
        assert_eq!(mixed, 667);
    }

    #[test]
    fn u16_mix_down_centers_at_32768() {
        assert_eq!(mix_frame_u16_to_i16(&[32768]), 0);
        let mixed = mix_frame_u16_to_i16(&[65535, 0]);
        assert!(mixed.abs() <= 1);
    }
}

fn push_mono_i16_from_f32(data: &[f32], channels: usize, sink: &Arc<StdMutex<Vec<i16>>>) {
    if channels == 0 {
        return;
    }
    if let Ok(mut guard) = sink.lock() {
        for frame in data.chunks(channels) {
            guard.push(mix_frame_f32_to_i16(frame));
        }
    }
}

fn push_mono_i16_from_i16(data: &[i16], channels: usize, sink: &Arc<StdMutex<Vec<i16>>>) {
    if channels == 0 {
        return;
    }
    if let Ok(mut guard) = sink.lock() {
        for frame in data.chunks(channels) {
            guard.push(mix_frame_i16_to_i16(frame));
        }
    }
}

fn push_mono_i16_from_u16(data: &[u16], channels: usize, sink: &Arc<StdMutex<Vec<i16>>>) {
    if channels == 0 {
        return;
    }
    if let Ok(mut guard) = sink.lock() {
        for frame in data.chunks(channels) {
            guard.push(mix_frame_u16_to_i16(frame));
        }
    }
}

fn encode_wav_pcm16_mono(samples: &[i16], sample_rate_hz: u32) -> Vec<u8> {
    let data_size = (samples.len() * std::mem::size_of::<i16>()) as u32;
    let mut out = Vec::with_capacity(44 + data_size as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36u32 + data_size).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&sample_rate_hz.to_le_bytes());
    let byte_rate = sample_rate_hz * 2;
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for sample in samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

fn resample_linear_mono_i16(input: &[i16], from_rate_hz: u32, to_rate_hz: u32) -> Vec<i16> {
    if input.is_empty() || from_rate_hz == 0 || to_rate_hz == 0 {
        return Vec::new();
    }
    if from_rate_hz == to_rate_hz {
        return input.to_vec();
    }
    let ratio = from_rate_hz as f64 / to_rate_hz as f64;
    let out_len = ((input.len() as f64) * (to_rate_hz as f64) / (from_rate_hz as f64))
        .round()
        .max(1.0) as usize;
    let mut out = Vec::with_capacity(out_len);
    for idx in 0..out_len {
        let src_pos = idx as f64 * ratio;
        let left = src_pos.floor() as usize;
        let right = (left + 1).min(input.len().saturating_sub(1));
        let frac = (src_pos - left as f64) as f32;
        let a = input[left] as f32;
        let b = input[right] as f32;
        out.push(
            (a + (b - a) * frac)
                .round()
                .clamp(i16::MIN as f32, i16::MAX as f32) as i16,
        );
    }
    out
}

fn analyze_voice_signal(samples: &[i16]) -> NativeVoiceSignalMetrics {
    if samples.is_empty() {
        return NativeVoiceSignalMetrics {
            rms: 0.0,
            peak: 0,
            speech_ratio: 0.0,
        };
    }
    let mut sum_sq = 0.0f64;
    let mut peak = 0i16;
    let mut voiced_samples = 0usize;
    for sample in samples {
        let normalized = (*sample as f32 / 32768.0).abs();
        sum_sq += f64::from(normalized * normalized);
        if normalized > 0.015 {
            voiced_samples += 1;
        }
        let abs_i32 = (*sample as i32).abs();
        if abs_i32 > peak as i32 {
            peak = abs_i32.min(i16::MAX as i32) as i16;
        }
    }
    NativeVoiceSignalMetrics {
        rms: (sum_sq / samples.len() as f64).sqrt() as f32,
        peak,
        speech_ratio: voiced_samples as f32 / samples.len() as f32,
    }
}

fn detect_speech(samples: &[i16], sample_rate_hz: u32, metrics: NativeVoiceSignalMetrics) -> bool {
    let min_samples = (sample_rate_hz as usize / 5).max(800);
    if samples.len() < min_samples {
        return false;
    }
    metrics.rms >= 0.007 || metrics.speech_ratio >= 0.012 || metrics.peak >= 900
}

fn start_native_capture_session(
    session: &mut Option<NativeVoiceCaptureSession>,
) -> Result<NativeVoiceCaptureStarted, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{SampleFormat, StreamConfig};

    if session.is_some() {
        return Err("Voice capture is already active.".to_string());
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device available.".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("Could not read microphone config: {e}"))?;

    let stream_config: StreamConfig = supported.clone().into();
    let input_channels = stream_config.channels.max(1) as usize;
    let input_sample_rate_hz = stream_config.sample_rate.0;
    let samples_mono_i16 = Arc::new(StdMutex::new(Vec::with_capacity(
        input_sample_rate_hz as usize * 30,
    )));

    let stream = match supported.sample_format() {
        SampleFormat::F32 => {
            let sink = Arc::clone(&samples_mono_i16);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| push_mono_i16_from_f32(data, input_channels, &sink),
                    |error| eprintln!("[voice-native] stream error: {error}"),
                    None,
                )
                .map_err(|e| format!("Could not start microphone stream (f32): {e}"))?
        }
        SampleFormat::I16 => {
            let sink = Arc::clone(&samples_mono_i16);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| push_mono_i16_from_i16(data, input_channels, &sink),
                    |error| eprintln!("[voice-native] stream error: {error}"),
                    None,
                )
                .map_err(|e| format!("Could not start microphone stream (i16): {e}"))?
        }
        SampleFormat::U16 => {
            let sink = Arc::clone(&samples_mono_i16);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| push_mono_i16_from_u16(data, input_channels, &sink),
                    |error| eprintln!("[voice-native] stream error: {error}"),
                    None,
                )
                .map_err(|e| format!("Could not start microphone stream (u16): {e}"))?
        }
        _ => return Err("Unsupported microphone sample format.".to_string()),
    };

    stream
        .play()
        .map_err(|e| format!("Could not activate microphone stream: {e}"))?;

    *session = Some(NativeVoiceCaptureSession {
        stream,
        samples_mono_i16,
        input_sample_rate_hz,
        started_at: Instant::now(),
    });

    Ok(NativeVoiceCaptureStarted {
        input_sample_rate_hz,
    })
}

fn stop_native_capture_session(
    session: &mut Option<NativeVoiceCaptureSession>,
) -> Result<NativeVoiceCaptureStopped, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let active = session
        .take()
        .ok_or_else(|| "Voice capture is not active.".to_string())?;
    drop(active.stream);

    let raw_samples = {
        let mut guard = active
            .samples_mono_i16
            .lock()
            .map_err(|_| "Voice capture sample lock error.".to_string())?;
        std::mem::take(&mut *guard)
    };
    if raw_samples.is_empty() {
        return Err("No audio captured.".to_string());
    }

    let sample_rate_hz = NATIVE_VOICE_TARGET_SAMPLE_RATE_HZ;
    let samples =
        resample_linear_mono_i16(&raw_samples, active.input_sample_rate_hz, sample_rate_hz);
    if samples.is_empty() {
        return Err("No audio captured after resampling.".to_string());
    }

    let metrics = analyze_voice_signal(&samples);
    let speech_detected = detect_speech(&samples, sample_rate_hz, metrics);
    if !speech_detected {
        return Err(format!(
            "No speech detected. (rms={:.4}, peak={}, speech_ratio={:.3})",
            metrics.rms, metrics.peak, metrics.speech_ratio
        ));
    }

    let duration_ms = ((samples.len() as f64 / sample_rate_hz as f64) * 1000.0).round() as u64;
    let elapsed_ms = active.started_at.elapsed().as_millis() as u64;
    let audio_base64 = STANDARD.encode(encode_wav_pcm16_mono(&samples, sample_rate_hz));

    Ok(NativeVoiceCaptureStopped {
        audio_base64,
        mime_type: "audio/wav".to_string(),
        sample_rate_hz,
        duration_ms: duration_ms.max(elapsed_ms),
        rms: metrics.rms,
        peak: metrics.peak,
        speech_ratio: metrics.speech_ratio,
        speech_detected,
    })
}

fn native_voice_worker_loop(receiver: std::sync::mpsc::Receiver<NativeVoiceWorkerCommand>) {
    let mut session: Option<NativeVoiceCaptureSession> = None;
    while let Ok(command) = receiver.recv() {
        match command {
            NativeVoiceWorkerCommand::Start { reply } => {
                let _ = reply.send(start_native_capture_session(&mut session));
            }
            NativeVoiceWorkerCommand::Stop { reply } => {
                let _ = reply.send(stop_native_capture_session(&mut session));
            }
            NativeVoiceWorkerCommand::Cancel { reply } => {
                if let Some(active) = session.take() {
                    drop(active.stream);
                }
                let _ = reply.send(Ok(true));
            }
        }
    }
}

#[tauri::command]
fn start_native_voice_capture_cmd(
    native_voice: tauri::State<NativeVoiceCaptureManager>,
) -> Result<NativeVoiceCaptureStarted, String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    native_voice
        .sender
        .send(NativeVoiceWorkerCommand::Start { reply: reply_tx })
        .map_err(|_| "Native voice worker is unavailable.".to_string())?;
    reply_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Native voice worker timed out while starting capture.".to_string())?
}

#[tauri::command]
fn stop_native_voice_capture_cmd(
    native_voice: tauri::State<NativeVoiceCaptureManager>,
) -> Result<NativeVoiceCaptureStopped, String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    native_voice
        .sender
        .send(NativeVoiceWorkerCommand::Stop { reply: reply_tx })
        .map_err(|_| "Native voice worker is unavailable.".to_string())?;
    reply_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "Native voice worker timed out while stopping capture.".to_string())?
}

#[tauri::command]
fn cancel_native_voice_capture_cmd(
    native_voice: tauri::State<NativeVoiceCaptureManager>,
) -> Result<bool, String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    native_voice
        .sender
        .send(NativeVoiceWorkerCommand::Cancel { reply: reply_tx })
        .map_err(|_| "Native voice worker is unavailable.".to_string())?;
    reply_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Native voice worker timed out while cancelling capture.".to_string())?
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let base_dir = app.path().app_data_dir().map_err(|e| anyhow::anyhow!(e))?;
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
                            std::env::current_dir().ok().unwrap_or_else(|| {
                                app.path()
                                    .home_dir()
                                    .expect("home dir must exist")
                                    .join("Arx Workspace")
                            })
                        } else {
                            app.path()
                                .home_dir()
                                .map_err(|e| anyhow::anyhow!(e))?
                                .join("Arx Workspace")
                        };
                        std::fs::create_dir_all(&default_root)?;
                        set_ui_state(
                            &conn,
                            "workspace_root",
                            default_root.to_string_lossy().as_ref(),
                        )?;
                    }
                    Ok(state)
                })() {
                    Ok(state) => {
                        app.manage(state);
                        app.manage(NativeVoiceCaptureManager::default());
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

            Ok(())
        })
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            initialize_cmd,
            create_thread_cmd,
            upsert_thread_cmd,
            delete_thread_cmd,
            list_threads_cmd,
            get_thread_cmd,
            list_events_cmd,
            list_events_since_cmd,
            list_tool_calls_cmd,
            get_event_cmd,
            list_turns_cmd,
            gc_blobs_cmd,
            rebuild_projections_cmd,
            reset_local_db_cmd,
            list_tools_cmd,
            get_agent_mode_cmd,
            set_agent_mode_cmd,
            respond_permission_cmd,
            decide_tool_call_cmd,
            decide_inference_fallback_cmd,
            get_auto_approve_write_edit_cmd,
            set_auto_approve_write_edit_cmd,
            cancel_run_cmd,
            send_turn_cmd,
            submit_turn_cmd,
            engine_send_turn_cmd,
            get_supabase_session_cmd,
            set_supabase_session_cmd,
            clear_supabase_session_cmd,
            get_chatgpt_auth_summary_cmd,
            clear_chatgpt_auth_cmd,
            chatgpt_login_cmd,
            open_external_url_cmd,
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
            get_active_model_cmd,
            set_active_model_cmd,
            set_provider_key_cmd,
            clear_provider_key_cmd,
            has_provider_key_cmd,
            get_provider_key_cmd,
            scan_publish_content_cmd,
            get_exec_policy_rules_cmd,
            get_system_prompt_cmd,
            get_approval_mode_cmd,
            detect_test_commands_cmd,
            set_exec_policy_rules_cmd,
            set_system_prompt_cmd,
            set_approval_mode_cmd,
            get_session_exec_policy_rules_cmd,
            set_session_exec_policy_rules_cmd,
            classify_command_cmd,
            get_session_resume_cmd,
            ingest_attachment_cmd,
            start_native_voice_capture_cmd,
            stop_native_voice_capture_cmd,
            cancel_native_voice_capture_cmd,
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

    app.run(|app_handle, event| match event {
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
    });
}
