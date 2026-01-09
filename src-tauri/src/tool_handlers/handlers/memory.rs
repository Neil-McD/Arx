//! Memory handler - Codex-style memory block updates.
//!
//! This handler allows the agent to update its own memory blocks
//! for learning preferences and context across sessions.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::db::{open_conn, update_memory_block_direct};
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

/// Handler for memory block updates (Codex-style)
pub struct MemoryHandler;

#[derive(Deserialize)]
struct MemoryArgs {
    label: String,
    value: String,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    scope_id: Option<String>,
    #[serde(default)]
    rationale: Option<String>,
}

/// Labels that the agent is allowed to auto-update
const ALLOWED_LABELS: &[&str] = &["persona", "preferences", "codebase_context"];

#[async_trait]
impl ToolHandler for MemoryHandler {
    fn name(&self) -> &'static str {
        "propose_memory_update"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "propose_memory_update",
            description: "Update local memory blocks with preferences or project context.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "label": {
                        "type": "string",
                        "description": "Memory block label (e.g., persona, preferences, codebase_context)"
                    },
                    "scope": {
                        "type": "string",
                        "enum": ["global", "project", "session"],
                        "description": "Scope of the memory block"
                    },
                    "scope_id": {
                        "type": ["string", "null"],
                        "description": "ID for project or session scope"
                    },
                    "value": {
                        "type": "string",
                        "description": "New value for the memory block"
                    },
                    "rationale": {
                        "type": "string",
                        "description": "Explanation for why this update is needed"
                    }
                },
                "required": ["label", "value"]
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        false // Auto-apply memory updates
    }

    fn is_parallel_safe(&self) -> bool {
        true // Memory updates are safe in parallel
    }

    fn auto_apply(&self) -> bool {
        true // This is the key Codex-style behavior
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: MemoryArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        // Validate required fields
        if args.label.trim().is_empty() {
            return Err(ToolError::InvalidArgs("label is empty".to_string()));
        }
        if args.value.trim().is_empty() {
            return Err(ToolError::InvalidArgs("value is empty".to_string()));
        }

        // Check if label is allowed for auto-update
        if !ALLOWED_LABELS.contains(&args.label.as_str()) {
            return Err(ToolError::Rejected(format!(
                "label '{}' is not allowed for auto-update. Allowed: {:?}",
                args.label, ALLOWED_LABELS
            )));
        }

        // Determine scope
        let scope = args.scope.as_deref().unwrap_or_else(|| {
            if args.label == "codebase_context" {
                "project"
            } else {
                "global"
            }
        });

        // Determine scope_id
        let scope_id = match scope {
            "project" => ctx.project_id.clone(),
            "session" => Some(ctx.session_id.clone()),
            _ => None,
        };

        // Open database connection and update
        let conn = open_conn(&ctx.db_path, &ctx.db_key).map_err(|e| {
            ToolError::ExecutionFailed(format!("failed to open database: {}", e))
        })?;

        match update_memory_block_direct(&conn, &args.label, scope, scope_id.as_deref(), &args.value)
        {
            Ok(_block) => {
                let message = if let Some(rationale) = &args.rationale {
                    format!(
                        "Updated {} block (scope: {}): {}",
                        args.label, scope, rationale
                    )
                } else {
                    format!("Updated {} block (scope: {})", args.label, scope)
                };

                Ok(ToolOutput::AutoApplied { content: message })
            }
            Err(e) => Err(ToolError::ExecutionFailed(format!(
                "failed to update memory block: {}",
                e
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_empty_label() {
        let handler = MemoryHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"label": "", "value": "test"}), &ctx)
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn rejects_disallowed_label() {
        let handler = MemoryHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(
                serde_json::json!({"label": "secret_stuff", "value": "test"}),
                &ctx,
            )
            .await;

        assert!(matches!(result, Err(ToolError::Rejected(_))));
    }

    #[test]
    fn handler_is_auto_apply() {
        let handler = MemoryHandler;
        assert!(handler.auto_apply());
        assert!(!handler.requires_approval());
    }
}
