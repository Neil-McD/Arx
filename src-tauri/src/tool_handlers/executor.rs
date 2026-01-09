use std::path::Path;
use std::time::Instant;

use rusqlite::Connection;
use serde_json::Value;

use crate::context;
use crate::db::{append_audit_log, open_conn, update_tool_call_output, update_tool_call_status};
use crate::logging;
use crate::tool_handlers::parallel::parallel_runtime;
use crate::tool_handlers::{telemetry_preview, ToolContext, ToolOutput};

#[derive(Debug, Clone)]
pub struct RecordedToolOutput {
    pub tool_call_id: String,
    pub tool_name: String,
    pub args_json: String,
    /// Redacted content intended to be safe to send to the model.
    pub content: String,
}

fn truncate_chars_for_excerpt(content: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for ch in content.chars().take(max_chars) {
        out.push(ch);
    }
    if content.chars().count() > max_chars {
        out.push_str("...");
    }
    out
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
) -> Value {
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
    db_path: &Path,
    session_id: &str,
    tool_call_id: &str,
    tool_name: &str,
    risk_level: &str,
    message: &str,
    duration_ms: u64,
    user_approved: bool,
) {
    let (redacted, report) = context::redact_secrets(message);
    let egress_policy = if report.blocked {
        "never_send"
    } else {
        "redact_then_send"
    };
    let summary = build_output_summary(1, duration_ms, &redacted, &report);
    let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());
    let stderr_excerpt = if redacted.is_empty() {
        None
    } else {
        Some(redacted.as_str())
    };
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
    let _ = append_audit_log(
        conn,
        session_id,
        "error",
        Some(tool_name),
        risk_level,
        if user_approved { 1 } else { 0 },
        None,
        Some(if report.blocked {
            "blocked: sensitive content"
        } else {
            redacted.as_str()
        }),
        None,
    );
    let _ = logging::append_event(
        db_path,
        logging::LogEvent::ToolFailed {
            session_id: session_id.to_string(),
            tool_call_id: tool_call_id.to_string(),
            tool_name: tool_name.to_string(),
            error: telemetry_preview(&redacted),
        },
    );
}

pub async fn execute_and_record_tool_call(
    db_path: &Path,
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
) -> Result<RecordedToolOutput, String> {
    let start = Instant::now();

    let ctx = ToolContext {
        session_id: session_id.to_string(),
        cwd: cwd.to_string(),
        workspace_root,
        project_id,
        db_path: db_path.to_path_buf(),
        db_key: db_key.to_string(),
    };

    let result = parallel_runtime()
        .execute_tool(tool_name, args_json, &ctx)
        .await
        .map_err(|e| e.to_string())?;

    let conn = open_conn(db_path, db_key).map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        ToolOutput::Success { content } | ToolOutput::AutoApplied { content } => {
            let (redacted, report) = context::redact_secrets(&content);
            if report.blocked {
                record_tool_failure(
                    &conn,
                    db_path,
                    session_id,
                    tool_call_id,
                    tool_name,
                    risk_level,
                    "blocked: sensitive content detected",
                    duration_ms,
                    user_approved,
                );
                return Err("blocked: sensitive content detected".to_string());
            }

            let excerpt = truncate_chars_for_excerpt(&redacted, 8000);
            let summary = build_output_summary(0, duration_ms, excerpt.as_str(), &report);
            let summary_json = serde_json::to_string(&summary).unwrap_or_else(|_| "{}".to_string());

            update_tool_call_status(&conn, tool_call_id, "executed").map_err(|e| e.to_string())?;
            update_tool_call_output(
                &conn,
                tool_call_id,
                Some(&summary_json),
                if excerpt.is_empty() { None } else { Some(excerpt.as_str()) },
                None,
                Some(0),
                Some(duration_ms as i64),
                None,
                Some("redact_then_send"),
            )
            .map_err(|e| e.to_string())?;

            append_audit_log(
                &conn,
                session_id,
                "execute",
                Some(tool_name),
                risk_level,
                if user_approved { 1 } else { 0 },
                None,
                None,
                None,
            )
            .map_err(|e| e.to_string())?;

            let _ = logging::append_event(
                db_path,
                logging::LogEvent::ToolExecuted {
                    session_id: session_id.to_string(),
                    tool_call_id: tool_call_id.to_string(),
                    tool_name: tool_name.to_string(),
                },
            );

            Ok(RecordedToolOutput {
                tool_call_id: tool_call_id.to_string(),
                tool_name: tool_name.to_string(),
                args_json: args_json.to_string(),
                content: redacted,
            })
        }
        ToolOutput::Error { message } => {
            record_tool_failure(
                &conn,
                db_path,
                session_id,
                tool_call_id,
                tool_name,
                risk_level,
                &message,
                duration_ms,
                user_approved,
            );
            Err(message)
        }
        ToolOutput::NeedsApproval { .. } => Err("tool requires approval".to_string()),
    }
}

