use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;

use crate::db::{get_tool_call, get_ui_state, set_ui_state};
use crate::exec_policy;

/// OpenCode-style permission responses.
///
/// - `once`: approve only this tool call (no persistence).
/// - `session`: persist for this session only.
/// - `always`: persist globally.
/// - `reject`: cancel the tool call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionResponse {
    Once,
    Session,
    Always,
    Reject,
}

pub enum PermissionScope {
    Session,
    Always,
}

const GLOBAL_KEY: &str = "permission_approved_global";
fn session_key(session_id: &str) -> String {
    format!("permission_approved_session::{}", session_id)
}

fn parse_response(raw: &str) -> Option<PermissionResponse> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "once" => Some(PermissionResponse::Once),
        "session" => Some(PermissionResponse::Session),
        "always" => Some(PermissionResponse::Always),
        "reject" => Some(PermissionResponse::Reject),
        _ => None,
    }
}

pub fn parse_response_or_err(raw: &str) -> Result<PermissionResponse, String> {
    parse_response(raw).ok_or_else(|| "invalid permission response".to_string())
}

fn canonicalize_json_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys = map.keys().cloned().collect::<Vec<_>>();
            keys.sort();
            let mut out = serde_json::Map::new();
            for key in keys {
                if let Some(v) = map.get(&key) {
                    out.insert(key, canonicalize_json_value(v));
                }
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_json_value).collect()),
        other => other.clone(),
    }
}

fn canonicalize_args_json(args_json: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(args_json).ok()?;
    let canon = canonicalize_json_value(&parsed);
    serde_json::to_string(&canon).ok()
}

fn wildcard_match(input: &str, pattern: &str) -> bool {
    // Mirrors references/opencode/.../wildcard.ts (escape regex meta, then apply * and ?).
    let mut regex = String::new();
    regex.push('^');
    for ch in pattern.chars() {
        match ch {
            '*' => regex.push_str(".*"),
            '?' => regex.push('.'),
            '.' | '+' | '^' | '$' | '(' | ')' | '|' | '[' | ']' | '{' | '}' | '\\' => {
                regex.push('\\');
                regex.push(ch);
            }
            other => regex.push(other),
        }
    }
    regex.push('$');

    regex::Regex::new(&regex)
        .ok()
        .map(|re| re.is_match(input))
        .unwrap_or(false)
}

fn parse_pattern_map(raw: Option<String>) -> HashMap<String, bool> {
    // Back-compat: previously stored as Vec<String>; accept and convert.
    let Some(raw) = raw else {
        return HashMap::new();
    };
    let trimmed = raw.trim();
    if trimmed.starts_with('[') {
        let list = serde_json::from_str::<Vec<String>>(trimmed).unwrap_or_default();
        return list.into_iter().map(|k| (k, true)).collect();
    }
    serde_json::from_str::<HashMap<String, bool>>(trimmed).unwrap_or_default()
}

fn write_pattern_map(conn: &Connection, key: &str, map: &HashMap<String, bool>) -> Result<(), String> {
    let raw = serde_json::to_string(map).map_err(|e| e.to_string())?;
    set_ui_state(conn, key, &raw).map_err(|e| e.to_string())
}

fn load_patterns(conn: &Connection, session_id: &str) -> (HashMap<String, bool>, HashMap<String, bool>) {
    let global = parse_pattern_map(get_ui_state(conn, GLOBAL_KEY).ok().flatten());
    let session = parse_pattern_map(get_ui_state(conn, &session_key(session_id)).ok().flatten());
    (global, session)
}

fn tool_permission_pattern(tool_name: &str, args: &Value) -> String {
    // Keep patterns short/stable; ignore high-entropy fields like file contents.
    match tool_name {
        "write_file" => args
            .get("file_path")
            .or_else(|| args.get("path"))
            .and_then(|v| v.as_str())
            .map(|p| format!("tool:write_file {}", p.trim()))
            .unwrap_or_else(|| "tool:write_file".to_string()),
        "edit_file" => args
            .get("file_path")
            .or_else(|| args.get("path"))
            .and_then(|v| v.as_str())
            .map(|p| format!("tool:edit_file {}", p.trim()))
            .unwrap_or_else(|| "tool:edit_file".to_string()),
        "mkdir" => args
            .get("dir_path")
            .and_then(|v| v.as_str())
            .map(|p| format!("tool:mkdir {}", p.trim()))
            .unwrap_or_else(|| "tool:mkdir".to_string()),
        "delete_file" => args
            .get("file_path")
            .or_else(|| args.get("path"))
            .and_then(|v| v.as_str())
            .map(|p| format!("tool:delete_file {}", p.trim()))
            .unwrap_or_else(|| "tool:delete_file".to_string()),
        "copy_file" => {
            let src = args.get("src_path").and_then(|v| v.as_str()).unwrap_or_default();
            let dest = args.get("dest_path").and_then(|v| v.as_str()).unwrap_or_default();
            if src.trim().is_empty() || dest.trim().is_empty() {
                "tool:copy_file".to_string()
            } else {
                format!("tool:copy_file {} -> {}", src.trim(), dest.trim())
            }
        }
        "move_file" => {
            let src = args.get("src_path").and_then(|v| v.as_str()).unwrap_or_default();
            let dest = args.get("dest_path").and_then(|v| v.as_str()).unwrap_or_default();
            if src.trim().is_empty() || dest.trim().is_empty() {
                "tool:move_file".to_string()
            } else {
                format!("tool:move_file {} -> {}", src.trim(), dest.trim())
            }
        }
        "multi_edit" => {
            let files = args
                .get("files")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    let mut out = Vec::new();
                    for item in arr {
                        if let Some(path) = item
                            .get("file_path")
                            .or_else(|| item.get("path"))
                            .and_then(|v| v.as_str())
                        {
                            if !path.trim().is_empty() {
                                out.push(path.trim().to_string());
                            }
                        }
                    }
                    out.sort();
                    out
                })
                .unwrap_or_default();
            if files.is_empty() {
                "tool:multi_edit".to_string()
            } else {
                format!("tool:multi_edit {}", files.join(", "))
            }
        }
        "apply_patch" => {
            let patch = args.get("patch").and_then(|v| v.as_str()).unwrap_or_default();
            let mut files = Vec::new();
            for line in patch.lines() {
                let trimmed = line.trim();
                for prefix in ["*** Add File:", "*** Update File:", "*** Delete File:"] {
                    if trimmed.starts_with(prefix) {
                        let p = trimmed.trim_start_matches(prefix).trim();
                        if !p.is_empty() {
                            files.push(p.to_string());
                        }
                    }
                }
            }
            files.sort();
            files.dedup();
            if files.is_empty() {
                "tool:apply_patch".to_string()
            } else {
                format!("tool:apply_patch {}", files.join(", "))
            }
        }
        "run_shell_command" | "exec_command" => {
            let cmd = args
                .get("command")
                .or_else(|| args.get("cmd"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .trim()
                .to_string();
            if cmd.is_empty() {
                format!("tool:{} (empty)", tool_name)
            } else {
                let tokens = exec_policy::shell_split(&cmd);
                if tokens.is_empty() {
                    format!("tool:{} {}", tool_name, cmd)
                } else {
                    format!("tool:{} {}", tool_name, tokens.join(" "))
                }
            }
        }
        other => {
            let canon = canonicalize_args_json(&serde_json::to_string(args).unwrap_or_default())
                .unwrap_or_else(|| serde_json::to_string(args).unwrap_or_default());
            format!("tool:{} {}", other, canon)
        }
    }
}

pub fn is_tool_call_allowed(conn: &Connection, session_id: &str, tool_name: &str, args_json: &str) -> bool {
    let args: Value = serde_json::from_str(args_json).unwrap_or(Value::Null);
    let key = tool_permission_pattern(tool_name, &args);
    let (global, session) = load_patterns(conn, session_id);

    for (pat, allowed) in session.iter() {
        if *allowed && wildcard_match(&key, pat) {
            return true;
        }
    }
    for (pat, allowed) in global.iter() {
        if *allowed && wildcard_match(&key, pat) {
            return true;
        }
    }
    false
}

pub fn grant_tool_call_permission(
    conn: &Connection,
    session_id: &str,
    tool_call_id: &str,
    scope: PermissionScope,
) -> Result<String, String> {
    let record = get_tool_call(conn, tool_call_id).map_err(|e| e.to_string())?;
    let args: Value = serde_json::from_str(&record.args_json).unwrap_or(Value::Null);
    let pattern = tool_permission_pattern(&record.tool_name, &args);

    let key = match scope {
        PermissionScope::Always => GLOBAL_KEY.to_string(),
        PermissionScope::Session => session_key(session_id),
    };
    let mut map = parse_pattern_map(get_ui_state(conn, &key).ok().flatten());
    map.insert(pattern.clone(), true);
    write_pattern_map(conn, &key, &map)?;
    Ok(pattern)
}

pub fn permission_response_to_scope(resp: PermissionResponse) -> Option<PermissionScope> {
    match resp {
        PermissionResponse::Session => Some(PermissionScope::Session),
        PermissionResponse::Always => Some(PermissionScope::Always),
        _ => None,
    }
}
