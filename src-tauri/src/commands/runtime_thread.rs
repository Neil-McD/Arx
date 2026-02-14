use once_cell::sync::Lazy;
use serde::Serialize;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};
use tauri::Emitter;
use uuid::Uuid;

#[derive(Default)]
struct InvokeWindowEntry {
    calls: u64,
    errors: u64,
    total_latency_ms: u128,
}

#[derive(Default)]
struct RuntimeInvokeWindow {
    started_at: Option<Instant>,
    by_command: std::collections::HashMap<&'static str, InvokeWindowEntry>,
    cache_hits: u64,
    cache_misses: u64,
}

struct RuntimeReadConnCache {
    db_path: PathBuf,
    key: String,
    conn: rusqlite::Connection,
}

static RUNTIME_READ_CONN_CACHE: Lazy<StdMutex<Option<RuntimeReadConnCache>>> =
    Lazy::new(|| StdMutex::new(None));
static RUNTIME_INVOKE_WINDOW: Lazy<StdMutex<RuntimeInvokeWindow>> =
    Lazy::new(|| StdMutex::new(RuntimeInvokeWindow::default()));
const RUNTIME_INVOKE_WINDOW_FLUSH_SECS: u64 = 5;

fn record_runtime_invoke(
    command: &'static str,
    started_at: Instant,
    ok: bool,
    cache_hit: Option<bool>,
) {
    let elapsed_ms = started_at.elapsed().as_millis();
    let mut window = match RUNTIME_INVOKE_WINDOW.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let now = Instant::now();
    if window.started_at.is_none() {
        window.started_at = Some(now);
    }

    let entry = window.by_command.entry(command).or_default();
    entry.calls = entry.calls.saturating_add(1);
    if !ok {
        entry.errors = entry.errors.saturating_add(1);
    }
    entry.total_latency_ms = entry.total_latency_ms.saturating_add(elapsed_ms);

    if let Some(hit) = cache_hit {
        if hit {
            window.cache_hits = window.cache_hits.saturating_add(1);
        } else {
            window.cache_misses = window.cache_misses.saturating_add(1);
        }
    }

    let Some(window_start) = window.started_at else {
        return;
    };
    if now.duration_since(window_start) < Duration::from_secs(RUNTIME_INVOKE_WINDOW_FLUSH_SECS) {
        return;
    }

    let mut parts = Vec::new();
    for (name, stats) in window.by_command.iter() {
        let avg_ms = if stats.calls == 0 {
            0.0
        } else {
            stats.total_latency_ms as f64 / stats.calls as f64
        };
        parts.push(format!(
            "{}:calls={},errors={},avg_ms={avg_ms:.1}",
            name, stats.calls, stats.errors
        ));
    }
    parts.sort();

    eprintln!(
        "[runtime-thread-invokes] window_s={} cache_hits={} cache_misses={} {}",
        RUNTIME_INVOKE_WINDOW_FLUSH_SECS,
        window.cache_hits,
        window.cache_misses,
        parts.join(" | ")
    );
    *window = RuntimeInvokeWindow {
        started_at: Some(now),
        by_command: std::collections::HashMap::new(),
        cache_hits: 0,
        cache_misses: 0,
    };
}

fn invalidate_runtime_read_conn_cache() {
    let mut guard = match RUNTIME_READ_CONN_CACHE.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    *guard = None;
}

fn with_runtime_read_conn<T, F>(state: &crate::db::DbState, f: F) -> Result<(T, bool), String>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
{
    let mut guard = match RUNTIME_READ_CONN_CACHE.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    let mut cache_hit = true;
    let should_open = match guard.as_ref() {
        Some(cached) => cached.db_path != state.db_path || cached.key != state.key,
        None => true,
    };
    if should_open {
        cache_hit = false;
        let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
        *guard = Some(RuntimeReadConnCache {
            db_path: state.db_path.clone(),
            key: state.key.clone(),
            conn,
        });
    }

    let Some(cached) = guard.as_ref() else {
        return Err("read cache unavailable".to_string());
    };
    let value = f(&cached.conn)?;
    Ok((value, cache_hit))
}

fn run_cached_read_command<T, F>(
    state: &crate::db::DbState,
    command: &'static str,
    f: F,
) -> Result<T, String>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
{
    let started_at = Instant::now();
    let result = with_runtime_read_conn(state, f);
    match result {
        Ok((value, cache_hit)) => {
            record_runtime_invoke(command, started_at, true, Some(cache_hit));
            Ok(value)
        }
        Err(err) => {
            record_runtime_invoke(command, started_at, false, None);
            Err(err)
        }
    }
}

#[derive(Serialize)]
pub(crate) struct RuntimeCapabilities {
    transport: String,
    cursor_resume: bool,
    tool_approvals: bool,
    local_db_events: bool,
    streaming_tokens: bool,
}

#[derive(Serialize)]
pub(crate) struct InitializeResponse {
    protocol_version: i64,
    runtime_id: String,
    capabilities: RuntimeCapabilities,
}

#[tauri::command]
pub(crate) fn initialize_cmd() -> Result<InitializeResponse, String> {
    Ok(InitializeResponse {
        protocol_version: crate::ARP_PROTOCOL_VERSION,
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

#[tauri::command]
pub(crate) fn get_agent_mode_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
) -> Result<String, String> {
    let key = format!("agent_mode::{}", session_id);
    run_cached_read_command(&state, "get_agent_mode_cmd", |conn| {
        Ok(crate::db::get_ui_state(conn, &key)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "build".to_string()))
    })
}

#[tauri::command]
pub(crate) fn set_agent_mode_cmd(
    state: tauri::State<crate::db::DbState>,
    session_id: String,
    mode: String,
) -> Result<(), String> {
    let Some(mode) = crate::normalize_agent_mode(&mode) else {
        return Err("invalid mode (expected build|plan|explore)".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let key = format!("agent_mode::{}", session_id);
    crate::db::set_ui_state(&conn, &key, mode).map_err(|e| e.to_string())
}

fn append_local_message_event(
    conn: &rusqlite::Connection,
    db_path: &Path,
    thread_id: &str,
    role: &str,
    content_json: &str,
) -> Result<(), String> {
    let role_normalized = role.trim().to_ascii_lowercase();
    let content_value =
        serde_json::from_str::<serde_json::Value>(content_json).unwrap_or(serde_json::Value::Null);

    let (event_type, payload_json) = match role_normalized.as_str() {
        "user" => (
            "user_message",
            serde_json::json!({
              "v": 1,
              "role": "user",
              "content": content_value,
            }),
        ),
        "assistant" => {
            let run_id = format!("local_fallback_{}", Uuid::new_v4().simple());
            (
                "assistant_message",
                serde_json::json!({
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
                serde_json::json!({
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
        conn,
        db_path,
        thread_id,
        event_type,
        None,
        Some(&payload_text),
        None,
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn decide_tool_call_cmd(
    tool_call_id: String,
    approved: bool,
    allow_write_edit_for_session: Option<bool>,
) -> Result<(), String> {
    let sender = {
        let mut map = crate::PENDING_TOOL_APPROVALS.lock().await;
        map.remove(tool_call_id.trim())
    };
    let Some(sender) = sender else {
        return Err("tool call not awaiting approval".to_string());
    };
    sender
        .send(crate::ToolApprovalDecision {
            approved,
            allow_write_edit_for_session: allow_write_edit_for_session.unwrap_or(false),
        })
        .map_err(|_| "tool call approval receiver dropped".to_string())
}

#[tauri::command]
pub(crate) async fn cancel_run_cmd(thread_id: String) -> Result<bool, String> {
    let thread_id = thread_id.trim().to_string();
    if thread_id.is_empty() {
        return Err("thread_id is required".to_string());
    }
    let sender = {
        let map = crate::CANCEL_RUN_SIGNALS.lock().await;
        map.get(&thread_id).cloned()
    };
    if let Some(sender) = sender {
        let _ = sender.send(true);
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub(crate) async fn submit_turn_cmd(
    window: tauri::Window,
    state: tauri::State<'_, crate::db::DbState>,
    thread_id: String,
    _cwd: String,
    input: String,
    user_content_json: String,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    supabase_access_token: Option<String>,
) -> Result<crate::SendTurnResult, String> {
    let db_path = state.db_path.clone();
    let db_key = state.key.clone();
    let _thread_lock = crate::lock_thread_run(&thread_id).await;
    let (_cancel_reg, cancel_rx) = crate::CancelRegistration::register(thread_id.trim()).await;

    {
        let conn = crate::db::open_conn(&db_path, &db_key).map_err(|e| e.to_string())?;
        append_local_message_event(&conn, &db_path, &thread_id, "user", &user_content_json)?;
    }

    match crate::send_turn_cmd_core(
        &window,
        &db_path,
        &db_key,
        &thread_id,
        &input,
        supabase_url,
        supabase_anon_key,
        supabase_access_token,
        cancel_rx,
    )
    .await
    {
        Ok(result) => Ok(result),
        Err(err) => {
            let fallback_content = serde_json::json!({
                "text": format!("Engine error: {}", err),
            })
            .to_string();
            if let Ok(conn) = crate::db::open_conn(&db_path, &db_key) {
                let _ =
                    append_local_message_event(&conn, &db_path, &thread_id, "assistant", &fallback_content);
            }

            let _ = window.emit(
                "agent-status",
                crate::AgentStatusPayload {
                    session_id: thread_id.clone(),
                    status: "idle".to_string(),
                    tool_name: None,
                    tool_args_preview: None,
                },
            );
            let _ = window.emit(
                "openrouter-turn-finished",
                crate::SessionIdPayload {
                    session_id: thread_id.clone(),
                },
            );

            Ok(crate::SendTurnResult {
                thread_id,
                engine_id: crate::ENGINE_MESSAGES_AGENT.to_string(),
                engine_input_event_id: None,
                engine_input_seq: None,
                run_id: None,
            })
        }
    }
}

#[tauri::command]
pub(crate) fn create_thread_cmd(
    state: tauri::State<crate::db::DbState>,
    title: String,
    engine_id: Option<String>,
    model_id: Option<String>,
    thread_lane: Option<String>,
    project_id: Option<String>,
) -> Result<crate::db::ThreadRecord, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let engine_id = engine_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or(crate::ENGINE_MESSAGES_AGENT);
    let engine_id = if engine_id == crate::ENGINE_LEGACY_OPENROUTER_CHAT
        || engine_id == crate::ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        crate::ENGINE_MESSAGES_AGENT
    } else {
        engine_id
    };

    let model_id = model_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());

    if engine_id == crate::ENGINE_MESSAGES_AGENT && model_id.is_none() {
        return Err("Model is required".to_string());
    }

    let cleaned_lane = crate::normalize_thread_lane_input(thread_lane.as_deref())?;
    let cleaned_project_id = project_id
        .as_deref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    if let Some(project_id) = cleaned_project_id {
        let project = crate::db::get_project_by_id(&conn, project_id).map_err(|e| e.to_string())?;
        if project.is_none() {
            return Err("project not found".to_string());
        }
    }

    let thread = crate::db::create_thread(
        &conn,
        &title,
        engine_id,
        model_id,
        Some(cleaned_lane),
        cleaned_project_id,
    )
    .map_err(|e| e.to_string())?;
    Ok(thread)
}

#[tauri::command]
pub(crate) fn upsert_thread_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    title: Option<String>,
    engine_id: Option<String>,
    model_id: Option<String>,
    thread_lane: Option<String>,
    project_id: Option<String>,
    community_id: Option<String>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
) -> Result<crate::db::ThreadRecord, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let cleaned_engine_id = engine_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or(crate::ENGINE_MESSAGES_AGENT);
    let cleaned_engine_id = if cleaned_engine_id == crate::ENGINE_LEGACY_OPENROUTER_CHAT
        || cleaned_engine_id == crate::ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        crate::ENGINE_MESSAGES_AGENT
    } else {
        cleaned_engine_id
    };

    let cleaned_model_id = model_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());

    let cleaned_thread_lane = crate::normalize_thread_lane_input(thread_lane.as_deref())?;
    let cleaned_project_id = project_id
        .as_deref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    if let Some(project_id) = cleaned_project_id {
        let project = crate::db::get_project_by_id(&conn, project_id).map_err(|e| e.to_string())?;
        if project.is_none() {
            return Err("project not found".to_string());
        }
    }

    let cleaned_community_id = community_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());

    let cleaned_title = title.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty());

    crate::db::upsert_thread_from_cloud(
        &conn,
        &thread_id,
        cleaned_title,
        cleaned_engine_id,
        cleaned_model_id,
        Some(cleaned_thread_lane),
        cleaned_project_id,
        cleaned_community_id,
        created_at,
        updated_at,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_threads_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Vec<crate::db::ThreadRecord>, String> {
    run_cached_read_command(&state, "list_threads_cmd", |conn| {
        crate::db::list_threads(conn).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn get_thread_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
) -> Result<Option<crate::db::ThreadRecord>, String> {
    run_cached_read_command(&state, "get_thread_cmd", |conn| {
        crate::db::get_thread_by_id(conn, &thread_id).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn list_events_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    limit: usize,
) -> Result<Vec<crate::db::EventRecord>, String> {
    run_cached_read_command(&state, "list_events_cmd", |conn| {
        crate::db::list_events(conn, &thread_id, limit).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn list_events_since_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    after_seq: i64,
    limit: usize,
    include_engine_io_chunk: Option<bool>,
) -> Result<Vec<crate::db::EventRecord>, String> {
    run_cached_read_command(&state, "list_events_since_cmd", |conn| {
        crate::db::list_events_since(
            conn,
            &thread_id,
            after_seq,
            limit,
            include_engine_io_chunk.unwrap_or(false),
        )
        .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn list_tool_calls_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    limit: usize,
) -> Result<Vec<crate::db::ToolCallRecord>, String> {
    run_cached_read_command(&state, "list_tool_calls_cmd", |conn| {
        crate::db::list_tool_calls(conn, &thread_id, limit).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn get_event_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    event_id: String,
) -> Result<Option<crate::db::EventRecord>, String> {
    run_cached_read_command(&state, "get_event_cmd", |conn| {
        crate::db::get_event_by_id(conn, &thread_id, &event_id).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn list_turns_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    limit: usize,
) -> Result<Vec<crate::db::TurnRecord>, String> {
    run_cached_read_command(&state, "list_turns_cmd", |conn| {
        crate::db::list_turns(conn, &thread_id, limit).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn reset_local_db_cmd(state: tauri::State<crate::db::DbState>) -> Result<(), String> {
    invalidate_runtime_read_conn_cache();
    // Best-effort local reset: delete the SQLite file and blobs, then recreate schema.
    // Cloud is canonical for cognition; this is a cache/evidence store for the desktop operator.
    let _ = std::fs::remove_dir_all(crate::blob_store::blob_root(&state.db_path));
    let _ = std::fs::remove_file(&state.db_path);
    let result = crate::db::init_db_at(&state.db_path, &state.key)
        .map(|_| ())
        .map_err(|e| e.to_string());
    invalidate_runtime_read_conn_cache();
    result
}

#[tauri::command]
pub(crate) fn delete_thread_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::delete_thread(&conn, &thread_id).map_err(|e| e.to_string())
}
