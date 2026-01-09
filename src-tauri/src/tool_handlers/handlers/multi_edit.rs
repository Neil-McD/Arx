//! multi_edit tool - apply deterministic edits across multiple files (requires approval).

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::tool_handlers::text_edits::{apply_string_edits, StringEdit};
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};
use crate::workspace_paths::resolve_workspace_existing_path;

pub struct MultiEditHandler;

const MAX_FILES: usize = 25;
const MAX_EDITS_PER_FILE: usize = 50;

#[derive(Deserialize)]
struct Edit {
    old_text: String,
    new_text: String,
    #[serde(default)]
    replace_all: bool,
    #[serde(default)]
    occurrence: Option<usize>,
}

#[derive(Deserialize)]
struct FileEdits {
    #[serde(alias = "path")]
    file_path: String,
    edits: Vec<Edit>,
}

#[derive(Deserialize)]
struct MultiEditArgs {
    files: Vec<FileEdits>,
}

#[async_trait]
impl ToolHandler for MultiEditHandler {
    fn name(&self) -> &'static str {
        "multi_edit"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "multi_edit",
            description: "Apply deterministic string-replacement edits across multiple files (within workspace). Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "files": {
                        "type": "array",
                        "description": "Per-file edits to apply",
                        "items": {
                            "type": "object",
                            "properties": {
                                "file_path": { "type": "string" },
                                "edits": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "old_text": { "type": "string" },
                                            "new_text": { "type": "string" },
                                            "replace_all": { "type": "boolean" },
                                            "occurrence": { "type": "integer", "minimum": 1 }
                                        },
                                        "required": ["old_text", "new_text"],
                                        "additionalProperties": false
                                    }
                                },
                                "path": { "type": "string", "description": "Alias for file_path (back-compat)." }
                            },
                            "required": ["file_path", "edits"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["files"],
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

impl MultiEditHandler {
    async fn handle_with_ctx(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: MultiEditArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.files.is_empty() {
            return Err(ToolError::InvalidArgs("files is empty".to_string()));
        }
        if args.files.len() > MAX_FILES {
            return Err(ToolError::InvalidArgs(format!("too many files (max {})", MAX_FILES)));
        }

        // Move owned values into the blocking task (spawn_blocking requires 'static captures).
        let root = ctx
            .workspace_root
            .clone()
            .unwrap_or_else(|| ctx.cwd.clone());
        let cwd = ctx.cwd.clone();

        // Validate and normalize edits before writing.
        let mut parsed: Vec<(String, Vec<StringEdit>)> = Vec::new(); // (file_path, edits)
        for (idx, f) in args.files.into_iter().enumerate() {
            if f.file_path.trim().is_empty() {
                return Err(ToolError::InvalidArgs(format!("files[{}].file_path is empty", idx)));
            }
            if f.edits.is_empty() {
                return Err(ToolError::InvalidArgs(format!("files[{}].edits is empty", idx)));
            }
            if f.edits.len() > MAX_EDITS_PER_FILE {
                return Err(ToolError::InvalidArgs(format!(
                    "files[{}] has too many edits (max {})",
                    idx, MAX_EDITS_PER_FILE
                )));
            }
            let mut out = Vec::new();
            for (j, e) in f.edits.into_iter().enumerate() {
                if e.old_text.is_empty() {
                    return Err(ToolError::InvalidArgs(format!(
                        "files[{}].edits[{}].old_text is empty",
                        idx, j
                    )));
                }
                if e.replace_all && e.occurrence.is_some() {
                    return Err(ToolError::InvalidArgs(format!(
                        "files[{}].edits[{}] cannot set both replace_all and occurrence",
                        idx, j
                    )));
                }
                out.push(StringEdit {
                    old_text: e.old_text,
                    new_text: e.new_text,
                    replace_all: e.replace_all,
                    occurrence: e.occurrence,
                });
            }
            parsed.push((f.file_path, out));
        }

        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            // Phase 1: resolve + compute edits, fail closed before writing anything.
            let mut planned: Vec<(PathBuf, String, usize)> = Vec::new(); // (path, new_content, replacements)
            let mut total_replacements = 0usize;
            for (file_path, edits) in parsed.iter() {
                let target = resolve_workspace_existing_path(root.as_str(), cwd.as_str(), file_path, false)
                    .map_err(ToolError::Rejected)?;
                if !target.exists() {
                    return Err(ToolError::ExecutionFailed(format!(
                        "file not found: {}",
                        target.display()
                    )));
                }
                let meta = std::fs::symlink_metadata(&target)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                if meta.file_type().is_symlink() {
                    return Err(ToolError::Rejected(format!(
                        "refusing to edit symlink: {}",
                        target.display()
                    )));
                }
                if !meta.is_file() {
                    return Err(ToolError::ExecutionFailed(format!(
                        "not a file: {}",
                        target.display()
                    )));
                }
                let content = std::fs::read_to_string(&target)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
                let (next, replacements) =
                    apply_string_edits(&content, edits).map_err(ToolError::ExecutionFailed)?;
                total_replacements += replacements;
                planned.push((target, next, replacements));
            }

            // Phase 2: write changes.
            for (path, content, _) in &planned {
                std::fs::write(path, content)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            }

            Ok(format!(
                "Multi-edit applied: {} file(s) changed, {} replacement(s)",
                planned.len(),
                total_replacements
            ))
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("multi_edit task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_files() {
        let handler = MultiEditHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let result = handler.handle(serde_json::json!({"files": []}), &ctx).await;
        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn applies_multi_edit() {
        let handler = MultiEditHandler;
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
        std::fs::write(&a, "x").unwrap();
        std::fs::write(&b, "y").unwrap();

        let result = handler
            .handle(
                serde_json::json!({
                    "files": [
                        {"file_path": "a.txt", "edits": [{"old_text":"x","new_text":"X"}]},
                        {"file_path": "b.txt", "edits": [{"old_text":"y","new_text":"Y"}]}
                    ]
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(matches!(result, ToolOutput::Success { .. }));
        assert_eq!(std::fs::read_to_string(a).unwrap(), "X");
        assert_eq!(std::fs::read_to_string(b).unwrap(), "Y");
    }
}
