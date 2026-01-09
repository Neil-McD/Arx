use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LogEvent {
    TurnStarted { session_id: String },
    TurnCompleted { session_id: String },
    ToolProposed { session_id: String, tool_call_id: String, tool_name: String },
    ToolApproved { session_id: String, tool_call_id: String, tool_name: String },
    ToolExecuted { session_id: String, tool_call_id: String, tool_name: String },
    ToolFailed { session_id: String, tool_call_id: String, tool_name: String, error: String },
    ToolCanceled { session_id: String, tool_call_id: String, tool_name: String },
    ToolDenied { session_id: String, tool_call_id: String, tool_name: String, reason: String },
    ToolRejected { session_id: String, reason: String, raw_json: String },
    DoomLoopDetected { session_id: String, tool_name: String, repeats: u32 },
    ToolRetry { session_id: String, provider: String, trigger: String },
}

#[derive(Debug, serde::Serialize)]
struct LogLine {
    ts: i64,
    #[serde(flatten)]
    event: LogEvent,
}

pub fn append_event(db_path: &Path, event: LogEvent) -> Result<(), String> {
    let log_path = db_path
        .parent()
        .ok_or_else(|| "missing db parent".to_string())?
        .join("events.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    let line = LogLine {
        ts: crate::db::now_ts(),
        event,
    };
    let json = serde_json::to_string(&line).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"\n").map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_events_for_session(
    db_path: &Path,
    session_id: &str,
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let log_path = db_path
        .parent()
        .ok_or_else(|| "missing db parent".to_string())?
        .join("events.jsonl");
    let content = match fs::read_to_string(&log_path) {
        Ok(text) => text,
        Err(_) => return Ok(Vec::new()),
    };
    let mut out = Vec::new();
    for line in content.lines().rev() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if value
                .get("session_id")
                .and_then(|v| v.as_str())
                .map(|v| v == session_id)
                .unwrap_or(false)
            {
                out.push(value);
                if out.len() >= limit {
                    break;
                }
            }
        }
    }
    out.reverse();
    Ok(out)
}

pub fn export_events_for_session(
    db_path: &Path,
    session_id: &str,
) -> Result<String, String> {
    let log_path = db_path
        .parent()
        .ok_or_else(|| "missing db parent".to_string())?
        .join("events.jsonl");
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let mut out = String::new();
    for line in content.lines() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if value
                .get("session_id")
                .and_then(|v| v.as_str())
                .map(|v| v == session_id)
                .unwrap_or(false)
            {
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    Ok(out)
}
