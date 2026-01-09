//! move_file tool - moves/renames a file within the workspace (requires approval).

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::workspace_paths::{resolve_workspace_existing_path, resolve_workspace_write_path};

pub struct MoveFileHandler;

#[derive(Deserialize)]
struct MoveFileArgs {
    src_path: String,
    dest_path: String,
    #[serde(default)]
    overwrite: Option<bool>,
}

#[async_trait]
impl ToolHandler for MoveFileHandler {
    fn name(&self) -> &'static str {
        "move_file"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "move_file",
            description: "Move/rename a file (within workspace). Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "src_path": { "type": "string", "description": "Source file path." },
                    "dest_path": { "type": "string", "description": "Destination file path." },
                    "overwrite": { "type": "boolean", "description": "Overwrite destination if it exists (default: false)." }
                },
                "required": ["src_path", "dest_path"],
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
        let args: MoveFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        if args.src_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("src_path is empty".to_string()));
        }
        if args.dest_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("dest_path is empty".to_string()));
        }
        let overwrite = args.overwrite.unwrap_or(false);

        let root = _ctx.workspace_root.as_deref().unwrap_or_else(|| _ctx.cwd.as_str());
        let cwd = _ctx.cwd.clone();
        let src_path = args.src_path.clone();
        let dest_path = args.dest_path.clone();

        let src =
            resolve_workspace_existing_path(root, &cwd, &src_path, false).map_err(ToolError::Rejected)?;
        let dest =
            resolve_workspace_write_path(root, &cwd, &dest_path).map_err(ToolError::Rejected)?;

        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            if !src.exists() {
                return Err(ToolError::ExecutionFailed("source not found".to_string()));
            }
            let src_meta = std::fs::symlink_metadata(&src)
                .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            if src_meta.file_type().is_symlink() {
                return Err(ToolError::Rejected("refusing to move symlink".to_string()));
            }
            if !src_meta.is_file() {
                return Err(ToolError::ExecutionFailed("source is not a file".to_string()));
            }

            if dest.exists() && !overwrite {
                return Err(ToolError::ExecutionFailed(
                    "destination already exists".to_string(),
                ));
            }
            if dest.exists() && overwrite {
                let dest_meta = std::fs::symlink_metadata(&dest)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                if !dest_meta.is_file() {
                    return Err(ToolError::ExecutionFailed(
                        "destination is not a file".to_string(),
                    ));
                }
                std::fs::remove_file(&dest)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            }
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            }

            if let Err(err) = std::fs::rename(&src, &dest) {
                // Cross-device rename fallback.
                let bytes = std::fs::copy(&src, &dest)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                std::fs::remove_file(&src)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                return Ok(format!(
                    "Moved {} -> {} (copied {} bytes; rename failed: {})",
                    src.display(),
                    dest.display(),
                    bytes,
                    err
                ));
            }

            Ok(format!("Moved {} -> {}", src.display(), dest.display()))
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("move task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_dest() {
        let handler = MoveFileHandler;
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
            .handle(
                serde_json::json!({"src_path":"a.txt","dest_path":""}),
                &ctx,
            )
            .await;
        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn moves_file() {
        let handler = MoveFileHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let a = tmp.path().join("a.txt");
        let b = tmp.path().join("b.txt");
        std::fs::write(&a, "hello").unwrap();
        let result = handler
            .handle(
                serde_json::json!({"src_path":"a.txt","dest_path":"b.txt"}),
                &ctx,
            )
            .await
            .unwrap();
        assert!(matches!(result, ToolOutput::Success { .. }));
        assert!(!a.exists());
        assert_eq!(std::fs::read_to_string(b).unwrap(), "hello");
    }
}
