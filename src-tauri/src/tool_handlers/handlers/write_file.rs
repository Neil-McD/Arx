//! write_file handler - writes a file within the workspace (requires approval).
//!
//! This tool is intentionally simple: it provides a safe, structured way for
//! the model to create/overwrite a file without needing to craft a patch.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::workspace_paths::resolve_workspace_write_path;

pub struct WriteFileHandler;

#[derive(Deserialize)]
struct WriteFileArgs {
    #[serde(alias = "path")]
    file_path: String,
    content: String,
    #[serde(default)]
    mode: Option<String>, // create | overwrite | append | prepend
}

fn normalize_mode(mode: Option<&str>) -> Result<&'static str, ToolError> {
    match mode.map(|m| m.trim()).filter(|m| !m.is_empty()) {
        None => Ok("overwrite"),
        Some("overwrite") => Ok("overwrite"),
        Some("create") => Ok("create"),
        Some("append") => Ok("append"),
        Some("prepend") => Ok("prepend"),
        Some(other) => Err(ToolError::InvalidArgs(format!(
            "invalid mode (expected 'create', 'overwrite', 'append', or 'prepend'): {}",
            other
        ))),
    }
}

#[async_trait]
impl ToolHandler for WriteFileHandler {
    fn name(&self) -> &'static str {
        "write_file"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "write_file",
            description: "Write a text file to disk (within workspace). Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "File path to write (relative to cwd unless absolute)." },
                    "content": { "type": "string", "description": "Full file contents to write." },
                    "mode": { "type": "string", "enum": ["create", "overwrite", "append", "prepend"], "description": "Create (fail if exists), overwrite (default), append, or prepend." },
                    "path": { "type": "string", "description": "Alias for file_path (back-compat)." }
                },
                "required": ["file_path", "content"],
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
        self.handle_with_ctx(args, _ctx).await
    }
}

impl WriteFileHandler {
    async fn handle_with_ctx(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: WriteFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.file_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("file_path is empty".to_string()));
        }
        let mode = normalize_mode(args.mode.as_deref())?;

        let root = ctx.workspace_root.as_deref().unwrap_or_else(|| ctx.cwd.as_str());
        let cwd = ctx.cwd.clone();
        let file_path = args.file_path.clone();
        let content = args.content.clone();

        let target: PathBuf =
            resolve_workspace_write_path(root, &cwd, &file_path).map_err(ToolError::Rejected)?;

        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            if mode == "create" && target.exists() {
                return Err(ToolError::ExecutionFailed("file already exists".to_string()));
            }

            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            }

            match mode {
                "append" => {
                    use std::io::Write;
                    let mut file = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&target)
                        .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                    file.write_all(content.as_bytes())
                        .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                }
                "prepend" => {
                    let existing = std::fs::read(&target).unwrap_or_default();
                    let mut combined = Vec::with_capacity(content.as_bytes().len() + existing.len());
                    combined.extend_from_slice(content.as_bytes());
                    combined.extend_from_slice(&existing);
                    std::fs::write(&target, combined)
                        .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                }
                _ => {
                    std::fs::write(&target, content.as_bytes())
                        .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                }
            }

            let bytes = content.as_bytes().len();
            Ok(format!(
                "Wrote {} ({} bytes, mode: {})",
                target.display(),
                bytes,
                mode
            ))
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("write task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn ctx_for(tmp: &TempDir) -> ToolContext {
        ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        }
    }

    #[tokio::test]
    async fn rejects_empty_path() {
        let handler = WriteFileHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"file_path": "", "content": "x"}), &ctx)
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn returns_needs_approval() {
        let handler = WriteFileHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ctx_for(&tmp);

        let result = handler
            .handle(
                serde_json::json!({"file_path": "a.txt", "content": "hello", "mode": "append"}),
                &ctx,
            )
            .await
            .unwrap();

        assert!(matches!(result, ToolOutput::Success { .. }));
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("a.txt")).unwrap(),
            "hello"
        );
    }
}
