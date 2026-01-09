//! Apply patch handler - applies unified diff patches to files.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

/// Handler for applying unified diff patches
pub struct ApplyPatchHandler;

#[derive(Deserialize)]
struct ApplyPatchArgs {
    patch: String,
}

/// Normalize patch format (from agent.rs)
fn normalize_patch(patch: &str) -> String {
    fn normalize_patch_marker(line: &str, marker: &str, normalized: &str) -> Option<String> {
        let trimmed = line.trim();
        let mut rest = trimmed;
        while let Some(r) = rest.strip_prefix('*') {
            rest = r.trim_start();
        }
        if rest.eq_ignore_ascii_case(marker) {
            Some(normalized.to_string())
        } else {
            None
        }
    }

    fn normalize_patch_directive(line: &str) -> Option<String> {
        let trimmed = line.trim_start();
        let mut rest = trimmed;
        while let Some(r) = rest.strip_prefix('*') {
            rest = r.trim_start();
        }
        for directive in ["Add File:", "Update File:", "Delete File:", "Move to:"] {
            if rest.starts_with(directive) {
                return Some(format!("*** {}", rest));
            }
        }
        None
    }

    let mut out = Vec::new();
    let mut in_header = true;
    for line in patch.lines() {
        let trimmed = line.trim_start();
        let first = line.as_bytes().first().copied();
        let is_diff_line = matches!(first, Some(b'+') | Some(b'-'));
        let is_context_line = matches!(first, Some(b' ') | Some(b'\t'));
        let is_hunk = trimmed.starts_with("@@");

        if !is_diff_line && (!is_context_line || in_header) {
            if let Some(marker) = normalize_patch_marker(line, "Begin Patch", "*** Begin Patch") {
                out.push(marker);
                continue;
            }
            if let Some(marker) = normalize_patch_marker(line, "End Patch", "*** End Patch") {
                out.push(marker);
                continue;
            }
            if let Some(directive) = normalize_patch_directive(line) {
                out.push(directive);
                continue;
            }
        }

        if is_hunk || is_diff_line || is_context_line {
            in_header = false;
        }
        out.push(line.to_string());
    }
    out.join("\n")
}

#[async_trait]
impl ToolHandler for ApplyPatchHandler {
    fn name(&self) -> &'static str {
        "apply_patch"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "apply_patch",
            description: "Apply a unified diff patch to files. Requires user approval.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "patch": {
                        "type": "string",
                        "description": "The unified diff patch to apply"
                    }
                },
                "required": ["patch"]
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        true
    }

    fn is_parallel_safe(&self) -> bool {
        false // Patches modify files
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: ApplyPatchArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        let patch = normalize_patch(&args.patch);

        if patch.trim().is_empty() {
            return Err(ToolError::InvalidArgs("patch is empty".to_string()));
        }

        let root = ctx
            .workspace_root
            .as_deref()
            .unwrap_or_else(|| ctx.cwd.as_str())
            .to_string();
        let patch_owned = patch.clone();

        let result = tokio::task::spawn_blocking(move || -> Result<String, ToolError> {
            let root_path = PathBuf::from(root);
            let result = crate::apply_patch::apply_patch_to_root(&root_path, &patch_owned);
            if result.applied {
                let file_count = result.changed_files.len();
                let list = if result.changed_files.is_empty() {
                    "no files changed".to_string()
                } else {
                    result.changed_files.join(", ")
                };
                Ok(format!("Patch applied to {} file(s): {}", file_count, list))
            } else {
                let error = if result.errors.is_empty() {
                    "unknown error".to_string()
                } else {
                    result.errors.join("; ")
                };
                Err(ToolError::ExecutionFailed(format!("Patch failed: {}", error)))
            }
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("apply_patch task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_patch() {
        let handler = ApplyPatchHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"patch": ""}), &ctx)
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn applies_patch() {
        let handler = ApplyPatchHandler;
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("main.rs");
        std::fs::write(&file, "fn main() {\n    println!(\"Hello\");\n}\n").unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let patch = r#"*** Begin Patch
*** Update File: main.rs
@@
+// New comment
 fn main() {
     println!("Hello");
 }
*** End Patch"#;

        let result = handler
            .handle(serde_json::json!({"patch": patch}), &ctx)
            .await
            .unwrap();

        assert!(matches!(result, ToolOutput::Success { .. }));
        let next = std::fs::read_to_string(&file).unwrap();
        assert!(next.contains("// New comment"));
    }
}
