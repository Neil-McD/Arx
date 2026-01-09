use crate::agent::context as prompt;
use crate::agent::providers;
use crate::agent::tool_calls as text_tool_calls;
use crate::agent::types::{
    OpenAiMessage, OpenAiMessageContent, OpenAiToolCall, OpenAiToolCallFunction,
};
use crate::agent::providers::ToolMode;
use crate::context;
use crate::db::{
    ensure_session_resume_block, get_tool_call, get_ui_state, list_messages, open_conn,
    propose_tool_call, update_memory_block_value, update_tool_call_output, update_tool_call_status,
    MessageRecord,
};
use crate::exec_policy::policy_manager;
use crate::logging;
use crate::tool_handlers::telemetry_preview;
use crate::{attachments, logging::LogEvent};

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::params;

pub enum StepInput {
    UserTurn,
    ToolOutputs { outputs: Vec<OwnedToolOutput> },
}

pub enum StopReason {
    EndTurn,
    ToolCallsProposed,
    ApprovalPending,
    AutoExecuted { outputs: Vec<OwnedToolOutput> },
    MaxSteps,
}

pub struct StepOutcome {
    pub assistant_text: String,
    pub stop_reason: StopReason,
}

#[derive(Debug, Clone)]
pub struct OwnedToolOutput {
    pub tool_call_id: String,
    pub tool_name: String,
    pub args_json: String,
    pub content: String,
}

const MAX_AGENT_ITERATIONS: u32 = 10;
const DOOM_LOOP_THRESHOLD: u32 = 3;
const DOOM_LOOP_WINDOW: Duration = Duration::from_secs(5 * 60);
const COMPACTION_MIN_INTERVAL: Duration = Duration::from_secs(2 * 60);
const COMPACT_AFTER_MESSAGES: usize = 80;
const COMPACTION_INPUT_MAX_CHARS: usize = 20_000;
const SESSION_RESUME_CHAR_LIMIT: usize = 2000;
const TOOL_RETRY_TEXT_MAX_CHARS: usize = 1500;

fn provider_requires_native_tool_calls(provider: &str) -> bool {
    matches!(provider, "openai" | "xai")
}

fn looks_like_missing_native_tool_call(text: &str) -> bool {
    // Normalize common unicode punctuation so simple string checks work.
    let lower = text
        .to_lowercase()
        .replace('’', "'")
        .replace('‘', "'");
    if lower.contains("i have a command ready for your approval")
        || lower.contains("i have a patch ready")
        || lower.contains("i have a command ready")
    {
        return true;
    }

    // Common "I'll do X" patterns that should be tool calls in an agent loop.
    let prefixes = [
        "i will ",
        "i'll ",
        "let me ",
        "i’m going to ",
        "i'm going to ",
        "going to ",
        "next i will ",
        "first i'll ",
        "first i will ",
    ];
    let verbs = [
        "run",
        "execute",
        "check",
        "inspect",
        "create",
        "scaffold",
        "generate",
        "apply",
        "edit",
        "search",
        "find",
        "list",
        "read",
        "open",
        "write",
        "update",
        "delete",
        "move",
        "copy",
    ];

    for prefix in prefixes {
        if lower.contains(prefix) {
            for verb in verbs {
                if lower.contains(&format!("{}{}", prefix, verb)) {
                    return true;
                }
            }
        }
    }

    false
}

fn build_missing_tool_call_retry_messages(
    prior: &[OpenAiMessage],
    assistant_text: &str,
) -> Vec<OpenAiMessage> {
    let mut out = prior.to_vec();

    out.push(OpenAiMessage {
        role: "system".to_string(),
        content: OpenAiMessageContent::Text(
            [
                "You must use the native tool-calling interface for any action.",
                "Do NOT output `TOOL_CALL:` blocks or raw JSON in text.",
                "If you intended to act, emit one or more tool calls now.",
                "If no tool is needed, reply with a brief plain-text answer and no tool calls.",
            ]
            .join("\n"),
        ),
        tool_call_id: None,
        tool_calls: None,
    });

    let snippet = assistant_text.chars().take(TOOL_RETRY_TEXT_MAX_CHARS).collect::<String>();
    let (redacted, _) = context::redact_secrets(&snippet);
    out.push(OpenAiMessage {
        role: "user".to_string(),
        content: OpenAiMessageContent::Text(format!(
            "Your previous response (truncated) was:\n\n{}\n\nIf that response implies actions, emit the tool call(s) now.",
            redacted.trim()
        )),
        tool_call_id: None,
        tool_calls: None,
    });

    out
}

fn build_compaction_messages(
    session_resume_yaml: &str,
    history: &[MessageRecord],
    tool_summary_section: &str,
) -> Vec<OpenAiMessage> {
    let mut history_buf = String::new();
    for msg in history.iter().rev().take(80).rev() {
        if msg.role != "user" && msg.role != "assistant" {
            continue;
        }
        let text = extract_text(&msg.content_json).unwrap_or_default();
        if text.trim().is_empty() {
            continue;
        }
        history_buf.push_str(&format!("[{}] {}\n\n", msg.role, text.trim()));
        if history_buf.len() >= COMPACTION_INPUT_MAX_CHARS {
            break;
        }
    }

    let system = [
        "You are Atom, generating a session checkpoint summary for Arx.",
        "Return ONLY YAML (no code fences).",
        "Keep it under 1800 characters.",
        "Keys required: objective, status, last_tool_results, next_steps, blockers.",
        "Prefer short bullet-like YAML lists for last_tool_results/next_steps/blockers.",
    ]
    .join("\n");

    let user = format!(
        "<current_session_resume>\n{}\n</current_session_resume>\n\n<recent_tool_results>\n{}\n</recent_tool_results>\n\n<history_tail>\n{}\n</history_tail>",
        session_resume_yaml.trim(),
        tool_summary_section.trim(),
        history_buf.trim(),
    );

    vec![
        OpenAiMessage {
            role: "system".to_string(),
            content: OpenAiMessageContent::Text(system),
            tool_call_id: None,
            tool_calls: None,
        },
        OpenAiMessage {
            role: "user".to_string(),
            content: OpenAiMessageContent::Text(user),
            tool_call_id: None,
            tool_calls: None,
        },
    ]
}

fn max_steps_notice(
    db_path: &std::path::Path,
    db_key: &str,
    session_id: &str,
) -> String {
    let conn = match open_conn(db_path, db_key) {
        Ok(conn) => conn,
        Err(_) => return "Maximum steps reached; pausing until your next input.".to_string(),
    };

    let tool_summary = prompt::build_tool_summary_section(&conn, session_id).unwrap_or_default();
    let tail = tool_summary.trim();

    if tail.is_empty() {
        "Maximum steps reached; pausing until your next input.\n\nReply with “continue” to keep going, or narrow the request."
            .to_string()
    } else {
        format!(
            "Maximum steps reached; pausing until your next input.\n\nRecent tool results:\n{}\n\nReply with “continue” to keep going, or narrow the request.",
            tail
        )
    }
}

fn is_doom_loop(
    conn: &rusqlite::Connection,
    session_id: &str,
    tool_name: &str,
    args_json: &str,
) -> Result<bool, String> {
    // User overrides: allow repeating this tool call pattern.
    if crate::permissions::is_tool_call_allowed(conn, session_id, tool_name, args_json) {
        return Ok(false);
    }

    // Detect 3 identical tool calls (tool_name + args_json) within a short window.
    // This mirrors OpenCode’s “same tool called repeatedly with identical arguments” guard.
    let since = crate::db::now_ts() - DOOM_LOOP_WINDOW.as_secs() as i64;

    let mut stmt = conn
        .prepare(
            "SELECT tool_name, args_json
             FROM tool_calls
             WHERE session_id = ?1
               AND status != 'proposed'
               AND created_at >= ?2
             ORDER BY created_at DESC
             LIMIT 2",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(params![session_id, since])
        .map_err(|e| e.to_string())?;

    let mut matches = 0u32;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let prev_tool: String = row.get(0).map_err(|e| e.to_string())?;
        let prev_args: String = row.get(1).map_err(|e| e.to_string())?;
        if prev_tool == tool_name && prev_args == args_json {
            matches += 1;
        }
    }

    Ok(matches >= DOOM_LOOP_THRESHOLD.saturating_sub(1))
}

fn extract_text(content_json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(content_json).ok()?;
    value
        .get("text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| value.as_str().map(|s| s.to_string()))
}

fn build_history_messages(history: &[MessageRecord], max_messages: usize) -> Vec<OpenAiMessage> {
    let mut out = Vec::new();
    let start = history.len().saturating_sub(max_messages);
    for msg in &history[start..] {
        let content = extract_text(&msg.content_json).unwrap_or_default();
        out.push(OpenAiMessage {
            role: msg.role.clone(),
            content: OpenAiMessageContent::Text(content),
            tool_call_id: None,
            tool_calls: None,
        });
    }
    out
}

fn command_preview_for_tool(tool_name: &str, args: &serde_json::Value) -> String {
    match tool_name {
        "run_shell_command" => args
            .get("command")
            .and_then(|v| v.as_str())
            .map(|s| format!("$ {}", s))
            .unwrap_or_else(|| "$ …".to_string()),
        "exec_command" => args
            .get("cmd")
            .or_else(|| args.get("command"))
            .and_then(|v| v.as_str())
            .map(|s| format!("$ {}", s))
            .unwrap_or_else(|| "$ …".to_string()),
        "read_file" => args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| format!("read_file {}", s))
            .unwrap_or_else(|| "read_file …".to_string()),
        "list_dir" => args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| format!("list_dir {}", s))
            .unwrap_or_else(|| "list_dir …".to_string()),
        other => other.to_string(),
    }
}

fn tool_requires_approval(tool_name: &str) -> bool {
    let registry = crate::tool_handlers::build_default_registry();
    registry.requires_approval(tool_name)
}

async fn execute_tool_auto(
    db_path: &std::path::Path,
    db_key: &str,
    session_id: &str,
    tool_call_id: &str,
    tool_name: &str,
    args_json: &str,
    cwd: &str,
    workspace_root: Option<String>,
    project_id: Option<String>,
    risk_level: &str,
    user_approved: bool,
) -> Result<OwnedToolOutput, String> {
    let result = crate::tool_handlers::execute_and_record_tool_call(
        db_path,
        db_key,
        session_id,
        tool_call_id,
        tool_name,
        args_json,
        cwd,
        workspace_root,
        project_id,
        risk_level,
        user_approved,
    )
    .await?;

    Ok(OwnedToolOutput {
        tool_call_id: result.tool_call_id,
        tool_name: result.tool_name,
        args_json: result.args_json,
        content: result.content,
    })
}

fn tool_calls_to_openai_tool_calls(outputs: &[OwnedToolOutput]) -> Vec<OpenAiToolCall> {
    outputs
        .iter()
        .map(|o| OpenAiToolCall {
            id: o.tool_call_id.clone(),
            kind: "function".to_string(),
            function: OpenAiToolCallFunction {
                name: o.tool_name.clone(),
                arguments: o.args_json.clone(),
            },
        })
        .collect()
}

fn inject_tool_outputs(messages: &mut Vec<OpenAiMessage>, outputs: &[OwnedToolOutput]) {
    if outputs.is_empty() {
        return;
    }

    // Synthetic assistant tool-call message so OpenAI/xAI can correctly associate tool outputs.
    let tool_calls = tool_calls_to_openai_tool_calls(outputs);
    messages.push(OpenAiMessage {
        role: "assistant".to_string(),
        content: OpenAiMessageContent::Text(String::new()),
        tool_call_id: None,
        tool_calls: Some(tool_calls),
    });

    // Tool result messages.
    for out in outputs {
        messages.push(OpenAiMessage {
            role: "tool".to_string(),
            content: OpenAiMessageContent::Text(out.content.clone()),
            tool_call_id: Some(out.tool_call_id.clone()),
            tool_calls: None,
        });
    }
}

async fn run_step(
    app: &tauri::AppHandle,
    db_path: &std::path::Path,
    db_key: &str,
    session_id: &str,
    model_id: &str,
    cwd: &str,
    input: StepInput,
    iteration_counts: Option<&Arc<Mutex<HashMap<String, u32>>>>,
) -> Result<StepOutcome, String> {
    if let Some(counts) = iteration_counts {
        let mut value = 0u32;
        if let Ok(mut map) = counts.lock() {
            value = map.get(session_id).copied().unwrap_or(0);
            value += 1;
            map.insert(session_id.to_string(), value);
        }
        if value >= MAX_AGENT_ITERATIONS {
            return Ok(StepOutcome {
                assistant_text: max_steps_notice(db_path, db_key, session_id),
                stop_reason: StopReason::MaxSteps,
            });
        }
    }

    let (
        workspace_root,
        project_id,
        history,
        mut memory_section,
        tool_summary_section,
        notes_section,
        agents_md,
        agent_mode,
        session_resume_block_id,
        session_resume_updated_at,
        session_resume_yaml,
    ) = {
        let conn = open_conn(db_path, db_key).map_err(|e| e.to_string())?;
        let session_resume =
            ensure_session_resume_block(&conn, session_id).map_err(|e| e.to_string())?;

        let workspace_root = get_ui_state(&conn, "workspace_root")
            .map_err(|e| e.to_string())?
            .map(|s| s.to_string());
        let project_id = get_ui_state(&conn, "active_project_id")
            .map_err(|e| e.to_string())?
            .map(|s| s.to_string());
        let agent_mode = get_ui_state(&conn, &format!("agent_mode::{}", session_id))
            .ok()
            .flatten()
            .unwrap_or_else(|| "build".to_string());

        let history = list_messages(&conn, session_id).map_err(|e| e.to_string())?;

        let memory_section =
            prompt::build_memory_section(&conn, session_id, project_id.as_deref()).unwrap_or_default();
        let tool_summary_section =
            prompt::build_tool_summary_section(&conn, session_id).unwrap_or_default();

        let notes_query = prompt::extract_memory_query(&history);
        let notes_section =
            prompt::build_retrieved_notes_section(&conn, notes_query.as_deref()).unwrap_or_default();

        let agents_md = {
            let start = Path::new(cwd);
            let boundary = workspace_root.as_deref().map(Path::new);
            crate::context::load_agents_md(start, boundary, 32 * 1024).unwrap_or_default()
        };

        (
            workspace_root,
            project_id,
            history,
            memory_section,
            tool_summary_section,
            notes_section,
            agents_md,
            agent_mode,
            session_resume.id,
            session_resume.updated_at,
            session_resume.value,
        )
    };

    // OpenCode-style compaction: keep the session_resume block fresh for long sessions.
    let mut did_compact = false;
    if matches!(input, StepInput::UserTurn)
        && history.len() >= COMPACT_AFTER_MESSAGES
        && crate::db::now_ts().saturating_sub(session_resume_updated_at) as u64
            >= COMPACTION_MIN_INTERVAL.as_secs()
    {
        let cancel_token = crate::cancellation::cancellation_manager()
            .get_token(session_id)
            .await;

        let compaction_messages =
            build_compaction_messages(&session_resume_yaml, &history, &tool_summary_section);
        let (_provider, compacted) = providers::call_model_once(
            app,
            session_id,
            model_id,
            &compaction_messages,
            cancel_token,
            ToolMode::ReadOnly,
        )
        .await?;

        if !compacted.tool_calls.is_empty() {
            let _ = logging::append_event(
                db_path,
                logging::LogEvent::ToolRejected {
                    session_id: session_id.to_string(),
                    reason: "compaction_returned_tool_calls".to_string(),
                    raw_json: telemetry_preview(&compacted.assistant_text),
                },
            );
        } else if !compacted.assistant_text.trim().is_empty() {
            let mut yaml = compacted.assistant_text.trim().to_string();
            if yaml.chars().count() > SESSION_RESUME_CHAR_LIMIT {
                yaml = yaml.chars().take(SESSION_RESUME_CHAR_LIMIT).collect();
            }
            let (redacted, report) = context::redact_secrets(&yaml);
            if !report.blocked {
                let conn = open_conn(db_path, db_key).map_err(|e| e.to_string())?;
                update_memory_block_value(&conn, &session_resume_block_id, &redacted)
                    .map_err(|e| e.to_string())?;
                did_compact = true;
            }
        }
    }

    if did_compact {
        let conn = open_conn(db_path, db_key).map_err(|e| e.to_string())?;
        memory_section =
            prompt::build_memory_section(&conn, session_id, project_id.as_deref()).unwrap_or_default();
    }

    let system_prompt = prompt::build_system_prompt(
        &agent_mode,
        cwd,
        &agents_md,
        &memory_section,
        &tool_summary_section,
        &notes_section,
    );

    let mut messages = Vec::new();
    messages.push(OpenAiMessage {
        role: "system".to_string(),
        content: OpenAiMessageContent::Text(system_prompt),
        tool_call_id: None,
        tool_calls: None,
    });
    messages.extend(build_history_messages(&history, 40));

    if let StepInput::ToolOutputs { outputs } = &input {
        inject_tool_outputs(&mut messages, outputs);
    }

    let cancel_token = crate::cancellation::cancellation_manager()
        .get_token(session_id)
        .await;

    let tool_mode = if agent_mode.trim().eq_ignore_ascii_case("plan") {
        ToolMode::ReadOnly
    } else {
        ToolMode::All
    };

    let (provider, model_response) = providers::call_model_once(
        app,
        session_id,
        model_id,
        &messages,
        cancel_token.clone(),
        tool_mode,
    )
    .await?;

    let log_rejections = |rejections: &[crate::agent::ToolRejection]| {
        for rej in rejections {
            let truncated: String = rej.raw_json.chars().take(500).collect();
            let (redacted, _) = context::redact_secrets(&truncated);
            let _ = logging::append_event(
                db_path,
                logging::LogEvent::ToolRejected {
                    session_id: session_id.to_string(),
                    reason: rej.reason.clone(),
                    raw_json: redacted,
                },
            );
        }
    };

    log_rejections(&model_response.tool_rejections);

    let mut assistant_text = model_response.assistant_text.trim().to_string();
    let mut tool_calls = model_response.tool_calls;

    // OpenAI/xAI: require native tool calls. If the model "plans" actions in text or emits
    // plaintext TOOL_CALL blocks, re-prompt once to produce a structured tool call.
    if provider_requires_native_tool_calls(&provider) && tool_calls.is_empty() {
        let trigger = if assistant_text.contains("TOOL_CALL:") {
            Some("plaintext_tool_call")
        } else if looks_like_missing_native_tool_call(&assistant_text) {
            Some("missing_native_tool_call")
        } else {
            None
        };

        if let Some(trigger) = trigger {
            let _ = logging::append_event(
                db_path,
                LogEvent::ToolRetry {
                    session_id: session_id.to_string(),
                    provider: provider.clone(),
                    trigger: trigger.to_string(),
                },
            );

            let retry_messages = build_missing_tool_call_retry_messages(&messages, &assistant_text);
            let (_provider2, retry) = providers::call_model_once(
                app,
                session_id,
                model_id,
                &retry_messages,
                cancel_token,
                tool_mode,
            )
            .await?;
            log_rejections(&retry.tool_rejections);
            assistant_text = retry.assistant_text.trim().to_string();
            tool_calls = retry.tool_calls;
        }
    }

    // Fallback: parse TOOL_CALL from assistant text only for non-OpenAI providers.
    if !provider_requires_native_tool_calls(&provider)
        && tool_calls.is_empty()
        && assistant_text.contains("TOOL_CALL:")
    {
        let (text, parsed, rejections) = text_tool_calls::extract_tool_calls(&assistant_text);
        assistant_text = text;
        tool_calls = parsed;
        for rej in rejections {
            let truncated: String = rej.raw_json.chars().take(500).collect();
            let (redacted, _) = context::redact_secrets(&truncated);
            let _ = logging::append_event(
                db_path,
                logging::LogEvent::ToolRejected {
                    session_id: session_id.to_string(),
                    reason: rej.reason,
                    raw_json: redacted,
                },
            );
        }
    }

    // Clear any queued images after we accept a model response (even if no tool calls were returned).
    // This keeps view_image as a one-step affordance and prevents unbounded in-memory growth.
    attachments::clear_images(session_id);

    if tool_calls.is_empty() {
        if provider_requires_native_tool_calls(&provider) && assistant_text.contains("TOOL_CALL:") {
            let mut msg = assistant_text.clone();
            if !msg.is_empty() {
                msg.push_str("\n\n");
            }
            msg.push_str("I didn’t receive a native tool call from the model (it wrote a plaintext TOOL_CALL block instead). Please try again or restate the request.");
            assistant_text = msg;
        }
        return Ok(StepOutcome {
            assistant_text,
            stop_reason: StopReason::EndTurn,
        });
    }

    let registry = crate::tool_handlers::build_default_registry();

    let mut executed = Vec::new();
    let mut proposed_requires_approval = false;
    let mut doom_loop_blocked = false;

    let mut to_execute: Vec<(String, String, String, String, bool)> = Vec::new(); // (tool_call_id, tool_name, args_json, risk_level, user_approved)

    {
        let conn = open_conn(db_path, db_key).map_err(|e| e.to_string())?;

        for call in tool_calls {
            let tool_name = text_tool_calls::normalize_tool_name(&call.tool_name);
            if tool_name.is_empty() || !registry.contains(&tool_name) {
                let _ = logging::append_event(
                    db_path,
                    logging::LogEvent::ToolRejected {
                        session_id: session_id.to_string(),
                        reason: format!("unknown_tool: {}", call.tool_name),
                        raw_json: serde_json::to_string(&call.args).unwrap_or_default(),
                    },
                );
                continue;
            }

            let args_json = serde_json::to_string(&call.args).map_err(|e| e.to_string())?;

            let plan_mode = agent_mode.trim().eq_ignore_ascii_case("plan");
            if plan_mode && (registry.requires_approval(&tool_name) || registry.auto_apply(&tool_name)) {
                let _ = logging::append_event(
                    db_path,
                    logging::LogEvent::ToolRejected {
                        session_id: session_id.to_string(),
                        reason: format!("plan_mode_forbids_tool: {}", tool_name),
                        raw_json: args_json.clone(),
                    },
                );
                continue;
            }

            if is_doom_loop(&conn, session_id, &tool_name, &args_json)? {
                doom_loop_blocked = true;
                let _ = logging::append_event(
                    db_path,
                    logging::LogEvent::DoomLoopDetected {
                        session_id: session_id.to_string(),
                        tool_name: tool_name.clone(),
                        repeats: DOOM_LOOP_THRESHOLD,
                    },
                );

                // Surface as a proposed tool call requiring explicit user confirmation.
                let preview = command_preview_for_tool(&tool_name, &call.args);
                let preview = format!("(doom loop guard) {}", preview);
                let (redacted_preview, _) = context::redact_secrets(&preview);

                let tool_call_id_override = call.call_id.as_deref();
                let record = propose_tool_call(
                    &conn,
                    session_id,
                    &tool_name,
                    &args_json,
                    "medium",
                    &redacted_preview,
                    tool_call_id_override,
                )
                .map_err(|e| e.to_string())?;

                // Mark as guarded so the orchestrator won't auto-execute it.
                let guard = serde_json::json!({ "guard": "doom_loop" }).to_string();
                let _ = update_tool_call_output(
                    &conn,
                    &record.id,
                    Some(&guard),
                    None,
                    None,
                    None,
                    None,
                    None,
                    Some("redact_then_send"),
                );

                let _ = logging::append_event(
                    db_path,
                    logging::LogEvent::ToolProposed {
                        session_id: session_id.to_string(),
                        tool_call_id: record.id.clone(),
                        tool_name: record.tool_name.clone(),
                    },
                );

                proposed_requires_approval = true;
                continue;
            }

            let preview = command_preview_for_tool(&tool_name, &call.args);
            let (redacted_preview, _) = context::redact_secrets(&preview);

            let tool_call_id_override = call.call_id.as_deref();
            let record = propose_tool_call(
                &conn,
                session_id,
                &tool_name,
                &args_json,
                if tool_requires_approval(&tool_name) { "high" } else { "low" },
                &redacted_preview,
                tool_call_id_override,
            )
            .map_err(|e| e.to_string())?;

            let _ = logging::append_event(
                db_path,
                logging::LogEvent::ToolProposed {
                    session_id: session_id.to_string(),
                    tool_call_id: record.id.clone(),
                    tool_name: record.tool_name.clone(),
                },
            );

            let allowed =
                crate::permissions::is_tool_call_allowed(&conn, session_id, &tool_name, &args_json);
            let requires_approval = tool_requires_approval(&tool_name);
            let can_auto_execute = policy_manager().can_auto_execute(&tool_name) || allowed;
            let auto_apply = registry.auto_apply(&tool_name);
            if can_auto_execute || auto_apply {
                let _ = update_tool_call_status(&conn, &record.id, "approved");
                let risk_level = if requires_approval { "high" } else { "low" }.to_string();
                // If this execution is happening due to a stored allow (session/always),
                // treat it as user-approved for audit purposes.
                let user_approved = allowed && requires_approval;
                to_execute.push((record.id.clone(), tool_name, args_json, risk_level, user_approved));
            } else {
                proposed_requires_approval = true;
            }
        }
    }

    if doom_loop_blocked && executed.is_empty() && !proposed_requires_approval {
        let mut msg = assistant_text.clone();
        if !msg.is_empty() {
            msg.push_str("\n\n");
        }
        msg.push_str("I’m pausing because it looks like I’m stuck repeating the same tool call with identical arguments (possible doom loop). If you want me to continue, reply with a different instruction or adjust the request so the next step changes.");
        return Ok(StepOutcome {
            assistant_text: msg,
            stop_reason: StopReason::EndTurn,
        });
    }

    for (tool_call_id, tool_name, args_json, risk_level, user_approved) in to_execute {
        let out = execute_tool_auto(
            db_path,
            db_key,
            session_id,
            &tool_call_id,
            &tool_name,
            &args_json,
            cwd,
            workspace_root.clone(),
            project_id.clone(),
            &risk_level,
            user_approved,
        )
        .await?;
        executed.push(out);
    }

    if !executed.is_empty() {
        return Ok(StepOutcome {
            assistant_text,
            stop_reason: StopReason::AutoExecuted { outputs: executed },
        });
    }

    Ok(StepOutcome {
        assistant_text,
        stop_reason: if proposed_requires_approval {
            StopReason::ApprovalPending
        } else {
            StopReason::ToolCallsProposed
        },
    })
}

pub async fn run_turn(
    app: &tauri::AppHandle,
    db_path: &std::path::Path,
    db_key: &str,
    session_id: &str,
    model_id: &str,
    cwd: &str,
    iteration_counts: &Arc<Mutex<HashMap<String, u32>>>,
) -> Result<String, String> {
    let _ = logging::append_event(
        db_path,
        logging::LogEvent::TurnStarted {
            session_id: session_id.to_string(),
        },
    );

    let mut input = StepInput::UserTurn;
    let mut accumulated = String::new();

    for _ in 0..MAX_AGENT_ITERATIONS {
        let outcome =
            run_step(app, db_path, db_key, session_id, model_id, cwd, input, Some(iteration_counts))
                .await?;

        if !outcome.assistant_text.trim().is_empty() {
            if !accumulated.is_empty() {
                accumulated.push_str("\n\n");
            }
            accumulated.push_str(outcome.assistant_text.trim());
        }

        match outcome.stop_reason {
            StopReason::AutoExecuted { outputs } => {
                input = StepInput::ToolOutputs { outputs };
                continue;
            }
            StopReason::EndTurn
            | StopReason::ToolCallsProposed
            | StopReason::ApprovalPending
            | StopReason::MaxSteps => break,
        }
    }

    let _ = logging::append_event(
        db_path,
        logging::LogEvent::TurnCompleted {
            session_id: session_id.to_string(),
        },
    );

    Ok(accumulated)
}

pub async fn run_turn_with_tool_output(
    app: &tauri::AppHandle,
    db_path: &std::path::Path,
    db_key: &str,
    session_id: &str,
    model_id: &str,
    command: &str,
    output: &str,
    tool_call_id: &str,
    cwd: &str,
    iteration_counts: &Arc<Mutex<HashMap<String, u32>>>,
) -> Result<String, String> {
    let conn = open_conn(db_path, db_key).map_err(|e| e.to_string())?;
    let record = get_tool_call(&conn, tool_call_id).map_err(|e| e.to_string())?;
    drop(conn);

    let (redacted, _report) = context::redact_secrets(output);

    let initial = OwnedToolOutput {
        tool_call_id: tool_call_id.to_string(),
        tool_name: record.tool_name,
        args_json: record.args_json,
        content: format!("Command: {}\n\n{}", command, redacted),
    };

    let mut input = StepInput::ToolOutputs {
        outputs: vec![initial],
    };
    let mut accumulated = String::new();

    for _ in 0..MAX_AGENT_ITERATIONS {
        let outcome = run_step(
            app,
            db_path,
            db_key,
            session_id,
            model_id,
            cwd,
            input,
            Some(iteration_counts),
        )
        .await?;

        if !outcome.assistant_text.trim().is_empty() {
            if !accumulated.is_empty() {
                accumulated.push_str("\n\n");
            }
            accumulated.push_str(outcome.assistant_text.trim());
        }

        match outcome.stop_reason {
            StopReason::AutoExecuted { outputs } => {
                input = StepInput::ToolOutputs { outputs };
                continue;
            }
            StopReason::EndTurn
            | StopReason::ToolCallsProposed
            | StopReason::ApprovalPending
            | StopReason::MaxSteps => break,
        }
    }

    Ok(accumulated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_missing_native_tool_call_intent() {
        assert!(looks_like_missing_native_tool_call(
            "I’ll check the current directory contents."
        ));
        assert!(looks_like_missing_native_tool_call(
            "Let me create backend/ and frontend/ next."
        ));
        assert!(looks_like_missing_native_tool_call(
            "I have a command ready for your approval."
        ));
        assert!(!looks_like_missing_native_tool_call(
            "Here’s an explanation of how the system works."
        ));
    }

    #[test]
    fn retry_messages_include_system_and_user() {
        let prior = vec![OpenAiMessage {
            role: "system".to_string(),
            content: OpenAiMessageContent::Text("base".to_string()),
            tool_call_id: None,
            tool_calls: None,
        }];
        let out = build_missing_tool_call_retry_messages(&prior, "I'll run ls -la");
        assert!(out.len() >= 3);
        assert_eq!(out[0].role, "system");
        assert_eq!(out[1].role, "system");
        assert_eq!(out[2].role, "user");
    }
}
