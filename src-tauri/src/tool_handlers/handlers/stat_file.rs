//! stat_file handler - returns metadata for a path within the workspace.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct StatFileHandler;

#[derive(Deserialize)]
struct StatFileArgs {
    #[serde(alias = "path")]
    file_path: Option<String>,
}

#[async_trait]
impl ToolHandler for StatFileHandler {
    fn name(&self) -> &'static str {
        "stat_file"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "stat_file",
            description: "Get metadata about a file or directory (within workspace).",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "Path to stat (default: cwd)." },
                    "path": { "type": "string", "description": "Alias for file_path (back-compat)." }
                },
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
        let args: StatFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        // Enforce workspace root boundary (default to cwd if unset)
        let root = ctx
            .workspace_root
            .as_deref()
            .unwrap_or_else(|| ctx.cwd.as_str());

        let root_canon = Path::new(root)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("invalid workspace root: {}", e)))?;
        let cwd_canon = Path::new(&ctx.cwd)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("invalid cwd: {}", e)))?;
        if !cwd_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("cwd outside workspace root".to_string()));
        }

        let file_path = args
            .file_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| ctx.cwd.as_str());

        let file_path = if Path::new(file_path).is_absolute() {
            file_path.to_string()
        } else {
            Path::new(&ctx.cwd)
                .join(file_path)
                .to_string_lossy()
                .to_string()
        };

        let meta = std::fs::symlink_metadata(&file_path).map_err(|e| {
            ToolError::ExecutionFailed(format!("failed to stat {}: {}", file_path, e))
        })?;

        // Reject symlinks that resolve outside the workspace root.
        // (Symlinks that remain within the workspace are OK; we still report it's a symlink.)
        let canon = Path::new(&file_path)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to resolve path: {}", e)))?;
        if !canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("path outside workspace root".to_string()));
        }

        let kind = if meta.file_type().is_symlink() {
            "symlink"
        } else if meta.is_dir() {
            "dir"
        } else if meta.is_file() {
            "file"
        } else {
            "other"
        };

        let size_bytes = meta.len();
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        let created = meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::PermissionsExt;
            Some(meta.permissions().mode())
        };
        #[cfg(not(unix))]
        let mode: Option<u32> = None;

        let mut content = String::new();
        content.push_str(&format!("Absolute path: {}\n", file_path));
        content.push_str(&format!("Type: {}\n", kind));
        if meta.file_type().is_symlink() {
            if let Ok(target) = std::fs::read_link(&file_path) {
                let target_abs = if target.is_absolute() {
                    target
                } else {
                    Path::new(&file_path)
                        .parent()
                        .unwrap_or_else(|| Path::new("/"))
                        .join(target)
                };
                if let Ok(resolved) = target_abs.canonicalize() {
                    if resolved.starts_with(&root_canon) {
                        content.push_str(&format!(
                            "Symlink target: {}\n",
                            resolved.to_string_lossy()
                        ));
                    }
                }
            }
        }
        content.push_str(&format!("Size bytes: {}\n", size_bytes));
        if let Some(sec) = modified {
            content.push_str(&format!("Modified (unix secs): {}\n", sec));
        }
        if let Some(sec) = created {
            content.push_str(&format!("Created (unix secs): {}\n", sec));
        }
        if let Some(mode) = mode {
            content.push_str(&format!("Mode: {:o}\n", mode));
        }

        Ok(ToolOutput::Success { content })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn stats_file_successfully() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("a.txt");
        std::fs::write(&file, "hello").unwrap();

        let handler = StatFileHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let out = handler
            .handle(serde_json::json!({"path": "a.txt"}), &ctx)
            .await
            .unwrap();

        let content = match out {
            ToolOutput::Success { content } => content,
            other => panic!("unexpected tool output: {:?}", other),
        };
        assert!(content.contains("Type: file"));
        assert!(content.contains("Size bytes: 5"));
    }
}
