//! read_many handler - reads multiple files (bounded) within the workspace.
//!
//! This avoids repetitive `read_file` calls when the model needs a handful of
//! small files to proceed.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct ReadManyHandler;

const DEFAULT_OFFSET: usize = 1;
const DEFAULT_LIMIT: usize = 300;
const MAX_LIMIT: usize = 2000;
const MAX_FILES: usize = 25;
const MAX_TOTAL_LINES: usize = 8000;

fn default_offset() -> usize {
    DEFAULT_OFFSET
}

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Deserialize)]
struct ReadManyArgs {
    #[serde(alias = "paths", alias = "file_paths")]
    files: Vec<String>,
    #[serde(default = "default_offset")]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
}

#[async_trait]
impl ToolHandler for ReadManyHandler {
    fn name(&self) -> &'static str {
        "read_many"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "read_many",
            description: "Read multiple text files (within workspace), each with the same line offset and limit. Output is bounded.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "files": { "type": "array", "items": { "type": "string" }, "description": "List of file paths to read." },
                    "offset": { "type": "integer", "minimum": 1, "description": "1-indexed start line (default: 1)." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 2000, "description": "Max lines per file (default: 300)." },
                    "paths": { "type": "array", "items": { "type": "string" }, "description": "Alias for files (back-compat)." }
                },
                "required": ["files"],
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
        let args: ReadManyArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.files.is_empty() {
            return Err(ToolError::InvalidArgs("files is empty".to_string()));
        }
        if args.files.len() > MAX_FILES {
            return Err(ToolError::InvalidArgs(format!(
                "too many files (max {})",
                MAX_FILES
            )));
        }
        if args.offset == 0 {
            return Err(ToolError::InvalidArgs(
                "offset must be a 1-indexed line number".to_string(),
            ));
        }
        if args.limit == 0 {
            return Err(ToolError::InvalidArgs("limit must be greater than zero".to_string()));
        }
        let limit = args.limit.min(MAX_LIMIT);

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

        let cwd = ctx.cwd.clone();
        let files = args.files.clone();
        let offset = args.offset;
        let result = tokio::task::spawn_blocking(move || {
            read_many_impl(&cwd, &root_canon, files, offset, limit)
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("read task failed: {}", e)))??;

        Ok(ToolOutput::Success { content: result })
    }
}

fn read_many_impl(
    cwd: &str,
    root_canon: &Path,
    files: Vec<String>,
    offset: usize,
    limit: usize,
) -> Result<String, ToolError> {
    let mut out = String::new();
    let mut total_lines = 0usize;

    for (idx, file) in files.into_iter().enumerate() {
        if idx > 0 {
            out.push_str("\n---\n\n");
        }

        let file_trim = file.trim();
        if file_trim.is_empty() {
            out.push_str("# File: (empty)\n\nERROR: empty path\n");
            continue;
        }

        let abs = if Path::new(file_trim).is_absolute() {
            file_trim.to_string()
        } else {
            Path::new(cwd).join(file_trim).to_string_lossy().to_string()
        };

        let canon = match Path::new(&abs).canonicalize() {
            Ok(p) => p,
            Err(e) => {
                out.push_str(&format!("# File: {}\n\nERROR: failed to resolve path: {}\n", abs, e));
                continue;
            }
        };
        if !canon.starts_with(root_canon) {
            out.push_str(&format!(
                "# File: {}\n\nERROR: path outside workspace root\n",
                abs
            ));
            continue;
        }

        let pathbuf = PathBuf::from(&abs);
        match read_lines_slice(&pathbuf, offset, limit) {
            Ok(lines) => {
                let end_line = offset + lines.len().saturating_sub(1);
                out.push_str(&format!(
                    "# File: {} (lines {}-{})\n\n",
                    abs, offset, end_line
                ));
                for line in lines {
                    if total_lines >= MAX_TOTAL_LINES {
                        out.push_str("\n[... read_many truncated (max total lines reached) ...]\n");
                        return Ok(out);
                    }
                    out.push_str(&line);
                    out.push('\n');
                    total_lines += 1;
                }
            }
            Err(e) => {
                out.push_str(&format!("# File: {}\n\nERROR: {}\n", abs, e));
            }
        }
    }

    Ok(out)
}

fn read_lines_slice(path: &Path, offset: usize, limit: usize) -> Result<Vec<String>, String> {
    use std::io::BufRead;

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

        collected.push(format!("L{seen}: {buffer}"));
        if collected.len() == limit {
            break;
        }
    }

    if seen < offset {
        return Err("offset exceeds file length".to_string());
    }

    Ok(collected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn reads_multiple_files() {
        let tmp = TempDir::new().unwrap();
        std::fs::write(tmp.path().join("a.txt"), "a1\na2\n").unwrap();
        std::fs::write(tmp.path().join("b.txt"), "b1\nb2\n").unwrap();

        let handler = ReadManyHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let out = handler
            .handle(serde_json::json!({"files": ["a.txt", "b.txt"], "limit": 10}), &ctx)
            .await
            .unwrap();

        let content = match out {
            ToolOutput::Success { content } => content,
            other => panic!("unexpected tool output: {:?}", other),
        };
        assert!(content.contains("a1"));
        assert!(content.contains("b1"));
    }
}
