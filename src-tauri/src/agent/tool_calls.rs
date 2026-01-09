use crate::agent::types::ToolRejection;
use crate::tool_handlers::context::ToolCall;
use serde_json::Value;

pub fn normalize_tool_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut s = trimmed.to_lowercase();
    s = s.replace('-', "_");
    s = s.replace(' ', "_");
    s
}

/// Extract TOOL_CALL blocks from model text output.
///
/// Supported forms:
/// - `TOOL_CALL: {...json...}`
/// - fenced JSON blocks immediately following a TOOL_CALL line
pub fn extract_tool_calls(content: &str) -> (String, Vec<ToolCall>, Vec<ToolRejection>) {
    let mut assistant_lines = Vec::new();
    let mut tool_calls = Vec::new();
    let mut rejections = Vec::new();

    let mut iter = content.lines().peekable();
    while let Some(line) = iter.next() {
        let trimmed = line.trim_start();
        if !trimmed.starts_with("TOOL_CALL:") {
            assistant_lines.push(line.to_string());
            continue;
        }

        let after = trimmed.trim_start_matches("TOOL_CALL:").trim();
        let mut json_buf = String::new();
        if !after.is_empty() {
            json_buf.push_str(after);
        } else if let Some(next) = iter.peek() {
            // Support a fenced block right after TOOL_CALL:
            if next.trim() == "```json" || next.trim() == "```" {
                let _ = iter.next(); // consume fence
                while let Some(block_line) = iter.next() {
                    if block_line.trim() == "```" {
                        break;
                    }
                    json_buf.push_str(block_line);
                    json_buf.push('\n');
                }
            }
        }

        if json_buf.trim().is_empty() {
            rejections.push(ToolRejection {
                reason: "parse_error".to_string(),
                raw_json: String::new(),
            });
            continue;
        }

        let value: Value = match serde_json::from_str(&json_buf) {
            Ok(v) => v,
            Err(_) => {
                rejections.push(ToolRejection {
                    reason: "parse_error".to_string(),
                    raw_json: json_buf.chars().take(500).collect(),
                });
                continue;
            }
        };

        let tool_name = value
            .get("tool")
            .and_then(|v| v.as_str())
            .map(normalize_tool_name)
            .unwrap_or_default();
        if tool_name.is_empty() {
            rejections.push(ToolRejection {
                reason: "unknown_tool".to_string(),
                raw_json: json_buf.chars().take(500).collect(),
            });
            continue;
        }

        let args = value
            .as_object()
            .map(|obj| {
                let mut clone = obj.clone();
                clone.remove("tool");
                Value::Object(clone)
            })
            .unwrap_or(Value::Null);

        tool_calls.push(ToolCall {
            tool_name,
            call_id: None,
            args,
        });
    }

    (assistant_lines.join("\n").trim().to_string(), tool_calls, rejections)
}

