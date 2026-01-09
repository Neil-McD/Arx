//! mkdir tool - creates a directory within the workspace (requires approval).

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::workspace_paths::resolve_workspace_write_path;

pub struct MkdirHandler;

#[derive(Deserialize)]
struct MkdirArgs {
    #[serde(alias = "path")]
    dir_path: String,
    #[serde(default)]
    parents: Option<bool>,
}

#[async_trait]
impl ToolHandler for MkdirHandler {
    fn name(&self) -> &'static str {
        "mkdir"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "mkdir",
            description: "Create a directory (within workspace). Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "dir_path": { "type": "string", "description": "Directory to create (relative to cwd unless absolute)." },
                    "parents": { "type": "boolean", "description": "Create parent directories as needed (default: true)." },
                    "path": { "type": "string", "description": "Alias for dir_path (back-compat)." }
                },
                "required": ["dir_path"],
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

    async fn handle(&self, args: Value, _ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: MkdirArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        if args.dir_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("dir_path is empty".to_string()));
        }
        let parents = args.parents.unwrap_or(true);

        let root = _ctx.workspace_root.as_deref().unwrap_or_else(|| _ctx.cwd.as_str());
        let cwd = _ctx.cwd.clone();
        let dir_path = args.dir_path.clone();

        let target =
            resolve_workspace_write_path(root, &cwd, &dir_path).map_err(ToolError::Rejected)?;
        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            if parents {
                std::fs::create_dir_all(&target)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            } else {
                std::fs::create_dir(&target)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            }
            Ok(format!("Created directory {}", target.display()))
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("mkdir task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_path() {
        let handler = MkdirHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let result = handler.handle(serde_json::json!({"dir_path": ""}), &ctx).await;
        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn creates_dir() {
        let handler = MkdirHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"dir_path": "a/b", "parents": true}), &ctx)
            .await
            .unwrap();
        assert!(matches!(result, ToolOutput::Success { .. }));
        assert!(tmp.path().join("a/b").is_dir());
    }
}
