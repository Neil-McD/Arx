//! Codex-style tool router (provider-native tool call parsing).
//!
//! The goal is to prefer structured provider tool calls over brittle text parsing.
//! Text parsing should remain as a fallback only.

use serde_json::Value;

use crate::agent::ToolRejection;
use crate::tool_handlers::context::ToolCall;

pub fn from_openai_tool_calls(
    tool_calls: &[crate::agent::OpenAiToolCall],
) -> (Vec<ToolCall>, Vec<ToolRejection>) {
    let mut out = Vec::new();
    let mut rejections = Vec::new();

    for call in tool_calls {
        let args: Value = match serde_json::from_str(&call.function.arguments) {
            Ok(value) => value,
            Err(_) => {
                rejections.push(ToolRejection {
                    reason: "parse_error".to_string(),
                    raw_json: format!(
                        "{{\"tool\":\"{}\",\"arguments\":{}}}",
                        call.function.name, call.function.arguments
                    ),
                });
                continue;
            }
        };

        out.push(ToolCall {
            tool_name: call.function.name.clone(),
            call_id: Some(call.id.clone()),
            args,
        });
    }

    (out, rejections)
}

pub fn from_anthropic_content(
    content: &[crate::agent::AnthropicContentResponse],
) -> (String, Vec<ToolCall>, Vec<ToolRejection>) {
    let mut text_parts = Vec::new();
    let mut tool_calls = Vec::new();
    let mut rejections = Vec::new();

    for block in content {
        match block.kind.as_str() {
            "text" => {
                if let Some(text) = block.text.as_ref() {
                    text_parts.push(text.clone());
                }
            }
            "tool_use" => {
                let name = block.name.clone().unwrap_or_default();
                let input = block.input.clone().unwrap_or(Value::Null);
                let args = match input {
                    Value::Object(_) | Value::Null => input,
                    _ => {
                        rejections.push(ToolRejection {
                            reason: "parse_error".to_string(),
                            raw_json: format!("{{\"tool\":\"{}\"}}", name),
                        });
                        continue;
                    }
                };
                tool_calls.push(ToolCall {
                    tool_name: name,
                    call_id: block.id.clone(),
                    args,
                });
            }
            _ => {}
        }
    }

    (text_parts.join(""), tool_calls, rejections)
}

pub fn from_gemini_parts(
    parts: &[crate::agent::GeminiPartResponse],
) -> (String, Vec<ToolCall>, Vec<ToolRejection>) {
    let mut text_parts = Vec::new();
    let mut tool_calls = Vec::new();
    let rejections = Vec::new();

    for part in parts {
        if let Some(text) = part.text.as_ref() {
            if !text.is_empty() {
                text_parts.push(text.clone());
            }
        }
        if let Some(fc) = part.function_call.as_ref() {
            tool_calls.push(ToolCall {
                tool_name: fc.name.clone(),
                call_id: None,
                args: fc.args.clone(),
            });
        }
    }

    (text_parts.join(""), tool_calls, rejections)
}
