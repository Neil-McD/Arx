//! write_stdin handler - writes to an interactive PTY session and returns output.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::pty_sessions::pty_sessions;
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct WriteStdinHandler;

#[derive(Deserialize)]
struct WriteStdinArgs {
    session_id: u64,
    #[serde(default)]
    chars: Option<String>,
    #[serde(default)]
    yield_time_ms: Option<u64>,
    #[serde(default)]
    max_output_bytes: Option<usize>,
}

#[async_trait]
impl ToolHandler for WriteStdinHandler {
    fn name(&self) -> &'static str {
        "write_stdin"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "write_stdin",
            description: "Send input to a running PTY session and fetch incremental output (auto-exec).",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "session_id": { "type": "integer", "description": "PTY session id from exec_command" },
                    "chars": { "type": "string", "description": "Bytes/chars to write to stdin (optional; empty means poll)" },
                    "yield_time_ms": { "type": "integer", "minimum": 0, "maximum": 10000, "description": "How long to wait for output before returning (default: 250ms)" },
                    "max_output_bytes": { "type": "integer", "minimum": 1, "maximum": 1048576, "description": "Max bytes to return from PTY output buffer (default: 65536)" }
                },
                "required": ["session_id"],
                "additionalProperties": false
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        false
    }

    fn is_parallel_safe(&self) -> bool {
        false
    }

    async fn handle(&self, args: Value, _ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: WriteStdinArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        let chars = args.chars.unwrap_or_default();
        let out = pty_sessions()
            .write_stdin(args.session_id, &chars, args.yield_time_ms, args.max_output_bytes)
            .await
            .map_err(ToolError::ExecutionFailed)?;

        let mut content = String::new();
        content.push_str(&format!("session_id: {}\n", args.session_id));
        if let Some(code) = out.exit_code {
            content.push_str(&format!("exit_code: {}\n", code));
        } else {
            content.push_str("exit_code: null\n");
        }
        content.push_str("output:\n");
        content.push_str(&out.output);
        Ok(ToolOutput::Success { content })
    }
}

