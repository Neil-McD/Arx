//! Codex-style internal tool call context types.
//!
//! This module is intentionally small and provider-agnostic. It defines the
//! internal representation used by the agent loop when converting provider
//! tool calls into handler invocations.

use serde_json::Value;

// Keep these previews small so they don't blow up prompts/logs.
pub const TELEMETRY_PREVIEW_MAX_CHARS: usize = 2 * 1024;
pub const TELEMETRY_PREVIEW_MAX_LINES: usize = 64;
pub const TELEMETRY_PREVIEW_TRUNCATION_NOTICE: &str = "[... telemetry preview truncated ...]";

#[derive(Clone, Debug)]
pub struct ToolCall {
    pub tool_name: String,
    pub call_id: Option<String>,
    pub args: Value,
}

pub fn telemetry_preview(content: &str) -> String {
    let mut preview = String::new();
    let mut lines = 0usize;
    for line in content.lines() {
        if lines >= TELEMETRY_PREVIEW_MAX_LINES {
            break;
        }
        if !preview.is_empty() {
            preview.push('\n');
        }
        preview.push_str(line);
        lines += 1;
        if preview.chars().count() >= TELEMETRY_PREVIEW_MAX_CHARS {
            break;
        }
    }

    let truncated_by_lines = content.lines().count() > TELEMETRY_PREVIEW_MAX_LINES;
    let truncated_by_chars = content.chars().count() > TELEMETRY_PREVIEW_MAX_CHARS;
    if truncated_by_lines || truncated_by_chars {
        if !preview.ends_with('\n') {
            preview.push('\n');
        }
        preview.push_str(TELEMETRY_PREVIEW_TRUNCATION_NOTICE);
    }

    preview
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telemetry_preview_returns_original_when_small() {
        let content = "short output";
        assert_eq!(telemetry_preview(content), content);
    }

    #[test]
    fn telemetry_preview_truncates_large() {
        let content = "x\n".repeat(TELEMETRY_PREVIEW_MAX_LINES + 10);
        let preview = telemetry_preview(&content);
        assert!(preview.contains(TELEMETRY_PREVIEW_TRUNCATION_NOTICE));
    }
}
