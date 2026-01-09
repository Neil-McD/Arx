//! get_memory_block tool - retrieve a specific memory block by label/scope.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::db;
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct GetMemoryBlockHandler;

#[derive(Deserialize)]
struct GetMemoryBlockArgs {
    label: String,
    #[serde(default)]
    scope: Option<String>, // global | project | session
    #[serde(default)]
    scope_id: Option<String>,
}

#[async_trait]
impl ToolHandler for GetMemoryBlockHandler {
    fn name(&self) -> &'static str {
        "get_memory_block"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "get_memory_block",
            description: "Get a memory block by label (and optional scope).",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "label": { "type": "string", "description": "Memory block label (e.g., persona, preferences, codebase_context, session_resume)" },
                    "scope": { "type": "string", "enum": ["global", "project", "session"], "description": "Scope to fetch (default: global)" },
                    "scope_id": { "type": "string", "description": "Scope id (required for project/session unless active project/session context provides it)" }
                },
                "required": ["label"],
                "additionalProperties": false
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        false
    }

    fn is_parallel_safe(&self) -> bool {
        true
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: GetMemoryBlockArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        let label = args.label.trim();
        if label.is_empty() {
            return Err(ToolError::InvalidArgs("label is empty".to_string()));
        }

        let scope = args
            .scope
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("global");

        let scope_id = match scope {
            "global" => None,
            "project" => args
                .scope_id
                .clone()
                .or_else(|| ctx.project_id.clone()),
            "session" => args.scope_id.clone().or_else(|| Some(ctx.session_id.clone())),
            _ => return Err(ToolError::InvalidArgs("invalid scope".to_string())),
        };

        if scope != "global" && scope_id.is_none() {
            return Err(ToolError::InvalidArgs("scope_id required for non-global scope".to_string()));
        }

        let conn = db::open_conn(&ctx.db_path, &ctx.db_key)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        let block = db::get_memory_block_by_label(&conn, label, scope, scope_id.as_deref())
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        let Some(block) = block else {
            return Ok(ToolOutput::Success {
                content: "Memory block not found.".to_string(),
            });
        };

        let mut content = String::new();
        content.push_str(&format!(
            "Memory block: {} (scope: {}, scope_id: {})\n",
            block.label,
            block.scope,
            block.scope_id.clone().unwrap_or_else(|| "null".to_string())
        ));
        if let Some(desc) = block.description.as_deref() {
            if !desc.trim().is_empty() {
                content.push_str(&format!("Description: {}\n", desc.trim()));
            }
        }
        content.push('\n');
        content.push_str(&block.value);
        if !content.ends_with('\n') {
            content.push('\n');
        }

        Ok(ToolOutput::Success { content })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_label() {
        let handler = GetMemoryBlockHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"label": ""}), &ctx)
            .await;
        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }
}

