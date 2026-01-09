//! read_file handler - reads a slice of a text file.
//!
//! Codex parity: reads by (offset,line limit) with line numbers. This produces
//! stable diffs and makes it easy for the model to reference locations.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::io::BufRead;
use std::path::{Path, PathBuf};

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct ReadFileHandler;

const DEFAULT_OFFSET: usize = 1; // 1-indexed
const DEFAULT_LIMIT: usize = 2000;
const MAX_LIMIT: usize = 4000;
const MAX_LINE_LENGTH: usize = 500;
const TAB_WIDTH: usize = 4;

fn default_offset() -> usize {
    DEFAULT_OFFSET
}

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Deserialize)]
struct ReadFileArgs {
    #[serde(alias = "path")]
    file_path: String,
    #[serde(default = "default_offset")]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
}

#[async_trait]
impl ToolHandler for ReadFileHandler {
    fn name(&self) -> &'static str {
        "read_file"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "read_file",
            description: "Read a text file from disk (within workspace) with line offsets and line numbers.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "File path to read (default: relative to cwd)." },
                    "offset": { "type": "integer", "minimum": 1, "description": "1-indexed start line (default: 1)" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 4000, "description": "Max lines to return (default: 2000)" },
                    "path": { "type": "string", "description": "Alias for file_path (back-compat)" }
                },
                "required": ["file_path"],
                "additionalProperties": false
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        false // Read-only operation
    }

    fn is_parallel_safe(&self) -> bool {
        true // Reading is safe in parallel
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: ReadFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.file_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("file_path is empty".to_string()));
        }
        if args.offset == 0 {
            return Err(ToolError::InvalidArgs(
                "offset must be a 1-indexed line number".to_string(),
            ));
        }
        if args.limit == 0 {
            return Err(ToolError::InvalidArgs("limit must be greater than zero".to_string()));
        }

        // Enforce workspace root boundary (default to cwd if unset)
        let root = ctx
            .workspace_root
            .as_deref()
            .unwrap_or_else(|| ctx.cwd.as_str());

        // Resolve file path relative to cwd if not absolute
        let file_path = if Path::new(&args.file_path).is_absolute() {
            args.file_path.clone()
        } else {
            Path::new(&ctx.cwd)
                .join(&args.file_path)
                .to_string_lossy()
                .to_string()
        };

        // Ensure cwd and target path are within workspace root
        let root_canon = Path::new(root)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("invalid workspace root: {}", e)))?;
        let cwd_canon = Path::new(&ctx.cwd)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("invalid cwd: {}", e)))?;
        if !cwd_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("cwd outside workspace root".to_string()));
        }
        let path_canon = Path::new(&file_path)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to resolve path: {}", e)))?;
        if !path_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("path outside workspace root".to_string()));
        }

        let offset = args.offset;
        let limit = args.limit.min(MAX_LIMIT);
        let pathbuf = PathBuf::from(&file_path);

        let lines = tokio::task::spawn_blocking(move || read_lines_slice(&pathbuf, offset, limit))
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("read task failed: {}", e)))?
            .map_err(ToolError::ExecutionFailed)?;

        let end_line = offset + lines.len().saturating_sub(1);
        let mut content = String::new();
        content.push_str(&format!(
            "# File: {} (lines {}-{})\n\n",
            file_path, offset, end_line
        ));
        content.push_str(&lines.join("\n"));
        content.push('\n');
        Ok(ToolOutput::Success { content })
    }
}

fn read_lines_slice(path: &Path, offset: usize, limit: usize) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("failed to read file {}: {}", path.display(), e))?;
    let mut reader = std::io::BufReader::new(file);

    let mut collected = Vec::new();
    let mut buffer = String::new();
    let mut seen = 0usize;

    loop {
        buffer.clear();
        let bytes = reader
            .read_line(&mut buffer)
            .map_err(|e| format!("failed to read file {}: {}", path.display(), e))?;
        if bytes == 0 {
            break;
        }

        if buffer.ends_with('\n') {
            buffer.pop();
            if buffer.ends_with('\r') {
                buffer.pop();
            }
        }

        seen += 1;
        if seen < offset {
            continue;
        }
        if collected.len() == limit {
            break;
        }

        let formatted = format_line(&buffer);
        collected.push(format!("L{seen}: {formatted}"));
        if collected.len() == limit {
            break;
        }
    }

    if seen < offset {
        return Err("offset exceeds file length".to_string());
    }

    Ok(collected)
}

fn format_line(line: &str) -> String {
    let expanded = expand_tabs(line, TAB_WIDTH);
    if expanded.len() > MAX_LINE_LENGTH {
        let mut out: String = expanded.chars().take(MAX_LINE_LENGTH).collect();
        out.push_str("...");
        out
    } else {
        expanded
    }
}

fn expand_tabs(input: &str, tab_width: usize) -> String {
    if !input.contains('\t') {
        return input.to_string();
    }
    let mut out = String::new();
    for ch in input.chars() {
        if ch == '\t' {
            out.push_str(&" ".repeat(tab_width));
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_path() {
        let handler = ReadFileHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler.handle(serde_json::json!({"path": ""}), &ctx).await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn reads_file_successfully() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.txt");
        fs::write(&file_path, "hello world").unwrap();

        let handler = ReadFileHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(
                serde_json::json!({"path": file_path.to_string_lossy()}),
                &ctx,
            )
            .await;

        assert!(matches!(result, Ok(ToolOutput::Success { .. })));
        if let Ok(ToolOutput::Success { content }) = result {
            assert!(content.contains("hello world"));
            assert!(content.contains("L1:"));
        }
    }
}
