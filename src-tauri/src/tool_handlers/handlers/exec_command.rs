//! exec_command handler - starts an interactive PTY session (requires approval).
//!
//! This tool is for long-running or interactive commands. Use `write_stdin` to
//! send input and fetch incremental output.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

use crate::db::{get_ui_state, open_conn};
use crate::exec_policy;
use crate::pty_sessions::{pty_sessions, ShellKind};
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::workspace_paths::is_within_root;

pub struct ExecCommandHandler;

#[derive(Deserialize)]
struct ExecCommandArgs {
    #[serde(alias = "command")]
    cmd: String,
    #[serde(default = "default_shell")]
    shell: String,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    workdir: Option<String>,
    #[serde(default)]
    yield_time_ms: Option<u64>,
    #[serde(default)]
    max_output_bytes: Option<usize>,
}

fn default_shell() -> String {
    "zsh".to_string()
}

#[async_trait]
impl ToolHandler for ExecCommandHandler {
    fn name(&self) -> &'static str {
        "exec_command"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "exec_command",
            description:
                "Start an interactive PTY session for a command. Requires user approval. Use write_stdin to continue/poll.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cmd": { "type": "string", "description": "Command to execute (shell string)." },
                    "command": { "type": "string", "description": "Alias for cmd (back-compat)." },
                    "shell": {
                        "type": "string",
                        "enum": ["bash", "zsh", "fish", "powershell", "cmd"],
                        "description": "Shell to use (default: zsh)"
                    },
                    "cwd": { "type": "string", "description": "Working directory (default: current cwd)" },
                    "workdir": { "type": "string", "description": "Alias for cwd" },
                    "yield_time_ms": { "type": "integer", "minimum": 0, "maximum": 10000, "description": "How long to wait for initial output before returning (default: 250ms)" },
                    "max_output_bytes": { "type": "integer", "minimum": 1, "maximum": 1048576, "description": "Max bytes to return from PTY output buffer (default: 65536)" }
                },
                "required": ["cmd"],
                "additionalProperties": false
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        true
    }

    fn is_parallel_safe(&self) -> bool {
        false
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: ExecCommandArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.cmd.trim().is_empty() {
            return Err(ToolError::InvalidArgs("cmd is empty".to_string()));
        }

        let effective_cwd = args
            .cwd
            .or(args.workdir)
            .unwrap_or_else(|| ctx.cwd.clone());
        let effective_cwd = if Path::new(&effective_cwd).is_absolute() {
            effective_cwd
        } else {
            Path::new(&ctx.cwd)
                .join(&effective_cwd)
                .to_string_lossy()
                .to_string()
        };

        let root = ctx.workspace_root.as_deref().unwrap_or_else(|| ctx.cwd.as_str());
        if !is_within_root(root, &effective_cwd) {
            return Err(ToolError::Rejected("cwd outside workspace root".to_string()));
        }

        // Apply exec policy forbids even after approval.
        let conn = open_conn(&ctx.db_path, &ctx.db_key)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        let tokens = exec_policy::shell_split(&args.cmd);
        let rules = get_ui_state(&conn, "exec_policy_rules")
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?
            .unwrap_or_default();
        let session_key = format!("exec_policy_session_rules::{}", ctx.session_id);
        let session_rules = get_ui_state(&conn, &session_key)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?
            .unwrap_or_default();
        let parsed_rules = exec_policy::parse_rules(&rules).unwrap_or_default();
        let parsed_session_rules = exec_policy::parse_rules(&session_rules).unwrap_or_default();
        let mut combined = Vec::new();
        combined.extend(parsed_session_rules);
        combined.extend(parsed_rules);
        combined.extend(exec_policy::default_rules());
        if let exec_policy::ExecDecision::Forbid = exec_policy::classify_command(&tokens, &combined) {
            return Err(ToolError::Rejected("command blocked by policy".to_string()));
        }

        let shell_kind = ShellKind::from_str(&args.shell).unwrap_or(ShellKind::Zsh);
        let result = pty_sessions()
            .exec_command(
                &args.cmd,
                shell_kind,
                &effective_cwd,
                args.yield_time_ms,
                args.max_output_bytes,
            )
            .await
            .map_err(ToolError::ExecutionFailed)?;

        let mut out = String::new();
        out.push_str(&format!("session_id: {}\n", result.session_id));
        if let Some(code) = result.exit_code {
            out.push_str(&format!("exit_code: {}\n", code));
        } else {
            out.push_str("exit_code: null\n");
        }
        out.push_str("output:\n");
        out.push_str(&result.output);

        Ok(ToolOutput::Success { content: out })
    }
}
