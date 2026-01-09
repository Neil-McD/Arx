//! edit_file handler - structured text edits to a file (requires approval).
//!
//! This reduces reliance on complex patch formatting for small deterministic edits.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::tool_handlers::text_edits::{apply_string_edits, StringEdit};
use crate::workspace_paths::resolve_workspace_existing_path;

pub struct EditFileHandler;

#[derive(Deserialize)]
struct Edit {
    old_text: String,
    new_text: String,
    #[serde(default)]
    replace_all: bool,
    #[serde(default)]
    occurrence: Option<usize>, // 1-indexed
}

#[derive(Deserialize)]
struct EditFileArgs {
    #[serde(alias = "path")]
    file_path: String,
    edits: Vec<Edit>,
}

#[async_trait]
impl ToolHandler for EditFileHandler {
    fn name(&self) -> &'static str {
        "edit_file"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "edit_file",
            description: "Edit a text file (within workspace) by applying one or more deterministic string replacements. Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "File path to edit (relative to cwd unless absolute)." },
                    "edits": {
                        "type": "array",
                        "description": "Edits to apply in order",
                        "items": {
                            "type": "object",
                            "properties": {
                                "old_text": { "type": "string" },
                                "new_text": { "type": "string" },
                                "replace_all": { "type": "boolean", "description": "Replace all occurrences (default: false)." },
                                "occurrence": { "type": "integer", "minimum": 1, "description": "Replace the Nth occurrence (1-indexed). If omitted, requires exactly one match." }
                            },
                            "required": ["old_text", "new_text"],
                            "additionalProperties": false
                        }
                    },
                    "path": { "type": "string", "description": "Alias for file_path (back-compat)." }
                },
                "required": ["file_path", "edits"],
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

impl EditFileHandler {
    async fn handle_with_ctx(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: EditFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.file_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("file_path is empty".to_string()));
        }
        if args.edits.is_empty() {
            return Err(ToolError::InvalidArgs("edits is empty".to_string()));
        }
        for (idx, edit) in args.edits.iter().enumerate() {
            if edit.old_text.is_empty() {
                return Err(ToolError::InvalidArgs(format!(
                    "edits[{}].old_text is empty",
                    idx
                )));
            }
            if edit.replace_all && edit.occurrence.is_some() {
                return Err(ToolError::InvalidArgs(format!(
                    "edits[{}] cannot set both replace_all and occurrence",
                    idx
                )));
            }
        }

        let root = ctx.workspace_root.as_deref().unwrap_or_else(|| ctx.cwd.as_str());
        let cwd = ctx.cwd.clone();
        let file_path = args.file_path.clone();
        let edits = args
            .edits
            .into_iter()
            .map(|e| StringEdit {
                old_text: e.old_text,
                new_text: e.new_text,
                replace_all: e.replace_all,
                occurrence: e.occurrence,
            })
            .collect::<Vec<_>>();

        let target: PathBuf =
            resolve_workspace_existing_path(root, &cwd, &file_path, false).map_err(ToolError::Rejected)?;

        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            if !target.exists() {
                return Err(ToolError::ExecutionFailed("file not found".to_string()));
            }
            let meta = std::fs::symlink_metadata(&target)
                .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            if meta.file_type().is_symlink() {
                return Err(ToolError::Rejected("refusing to edit symlink".to_string()));
            }
            if !meta.is_file() {
                return Err(ToolError::ExecutionFailed("not a file".to_string()));
            }

            let content = std::fs::read_to_string(&target)
                .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            let (next, replacements) =
                apply_string_edits(&content, &edits).map_err(ToolError::ExecutionFailed)?;
            std::fs::write(&target, next)
                .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            Ok(format!(
                "Edited {} ({} replacement(s) applied)",
                target.display(),
                replacements
            ))
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("edit task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_edits() {
        let handler = EditFileHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"file_path": "a.txt", "edits": []}), &ctx)
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn applies_edits() {
        let handler = EditFileHandler;
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
            .handle(
                serde_json::json!({"file_path": "a.txt", "edits": [{"old_text":"x","new_text":"y"}]}),
                &ctx,
            )
            .await
            .unwrap();

        assert!(matches!(result, ToolOutput::Success { .. }));
        assert_eq!(std::fs::read_to_string(path).unwrap(), "y");
    }
}
