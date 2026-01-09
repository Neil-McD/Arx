//! delete_file tool - deletes a file within the workspace (requires approval).

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::workspace_paths::resolve_workspace_existing_path;

pub struct DeleteFileHandler;

#[derive(Deserialize)]
struct DeleteFileArgs {
    #[serde(alias = "path")]
    file_path: String,
    #[serde(default)]
    missing_ok: Option<bool>,
}

#[async_trait]
impl ToolHandler for DeleteFileHandler {
    fn name(&self) -> &'static str {
        "delete_file"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "delete_file",
            description: "Delete a file (within workspace). Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "File path to delete." },
                    "missing_ok": { "type": "boolean", "description": "If true, succeed when missing (default: false)." },
                    "path": { "type": "string", "description": "Alias for file_path (back-compat)." }
                },
                "required": ["file_path"],
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
        let args: DeleteFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        if args.file_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("file_path is empty".to_string()));
        }
        let missing_ok = args.missing_ok.unwrap_or(false);

        let root = _ctx.workspace_root.as_deref().unwrap_or_else(|| _ctx.cwd.as_str());
        let cwd = _ctx.cwd.clone();
        let file_path = args.file_path.clone();

        let target =
            resolve_workspace_existing_path(root, &cwd, &file_path, false).map_err(ToolError::Rejected)?;
        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            if !target.exists() {
                if missing_ok {
                    return Ok(format!("File already missing: {}", target.display()));
                }
                return Err(ToolError::ExecutionFailed("file not found".to_string()));
            }

            let meta = std::fs::symlink_metadata(&target)
                .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            if meta.file_type().is_symlink() {
                return Err(ToolError::Rejected("refusing to delete symlink".to_string()));
            }
            if !meta.is_file() {
                return Err(ToolError::ExecutionFailed("target is not a file".to_string()));
            }
            std::fs::remove_file(&target)
                .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            Ok(format!("Deleted {}", target.display()))
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("delete task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_path() {
        let handler = DeleteFileHandler;
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
            .handle(serde_json::json!({"file_path": ""}), &ctx)
            .await;
        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn deletes_file() {
        let handler = DeleteFileHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let path = tmp.path().join("a.txt");
        std::fs::write(&path, "x").unwrap();
        let result = handler
            .handle(serde_json::json!({"file_path": "a.txt"}), &ctx)
            .await
            .unwrap();
        assert!(matches!(result, ToolOutput::Success { .. }));
        assert!(!path.exists());
    }
}
