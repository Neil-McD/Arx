//! Shell command handler - executes commands via PTY.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::tool_handlers::{RiskLevel, ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

/// Handler for shell command execution
pub struct ShellHandler;

#[derive(Deserialize)]
struct ShellArgs {
    command: String,
    #[serde(default = "default_shell")]
    shell: String,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    workdir: Option<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    explanation: Option<String>,
}

fn default_shell() -> String {
    "zsh".to_string()
}

#[async_trait]
impl ToolHandler for ShellHandler {
    fn name(&self) -> &'static str {
        "run_shell_command"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "run_shell_command",
            description: "Execute a shell command via PTY. Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "The command to execute" },
                    "shell": {
                        "type": "string",
                        "enum": ["bash", "zsh", "fish", "powershell", "cmd"],
                        "description": "Shell to use"
                    },
                    "cwd": { "type": "string", "description": "Working directory" },
                    "workdir": { "type": "string", "description": "Working directory (alias for cwd)" },
                    "timeout_ms": {
                        "type": "integer",
                        "minimum": 1000,
                        "maximum": 1800000,
                        "description": "Timeout in milliseconds"
                    },
                    "explanation": { "type": "string", "description": "Explanation of what this command does" }
                },
                "required": ["command"]
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        true
    }

    fn is_parallel_safe(&self) -> bool {
        false // Shell commands can have side effects
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: ShellArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.command.trim().is_empty() {
            return Err(ToolError::InvalidArgs("command is empty".to_string()));
        }

        // Determine working directory (will be used when executing)
        let _cwd = args
            .cwd
            .or(args.workdir)
            .unwrap_or_else(|| ctx.cwd.clone());

        // Create preview for approval
        let preview = if let Some(explanation) = &args.explanation {
            format!("{}\n\n$ {}", explanation, args.command)
        } else {
            format!("$ {}", args.command)
        };

        // Return NeedsApproval - actual execution happens via Tauri command
        // The frontend will call run_shell_command_cmd after user approves
        Ok(ToolOutput::NeedsApproval {
            tool_call_id: uuid::Uuid::new_v4().to_string(),
            preview,
            risk_level: RiskLevel::High,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_empty_command() {
        let handler = ShellHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"command": ""}), &ctx)
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn returns_needs_approval() {
        let handler = ShellHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"command": "ls -la"}), &ctx)
            .await;

        assert!(matches!(result, Ok(ToolOutput::NeedsApproval { .. })));
    }
}
