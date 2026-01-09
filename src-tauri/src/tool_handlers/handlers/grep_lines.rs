//! grep_lines handler - searches for matching lines (file:line:content).
//!
//! Complements `grep_files` (paths only) for tasks where the model needs the
//! exact matching lines.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::process::Command;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct GrepLinesHandler;

const DEFAULT_LIMIT: usize = 200;
const MAX_LIMIT: usize = 2000;

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Deserialize)]
struct GrepLinesArgs {
    pattern: String,
    #[serde(default)]
    include: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    max_count_per_file: Option<usize>,
}

#[async_trait]
impl ToolHandler for GrepLinesHandler {
    fn name(&self) -> &'static str {
        "grep_lines"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "grep_lines",
            description: "Search for matching lines using ripgrep (rg). Returns lines as `path:line:match` (within workspace).",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Regex pattern to search for" },
                    "include": { "type": "string", "description": "Optional glob filter for files (e.g., '*.rs')" },
                    "path": { "type": "string", "description": "Directory or file to search (default: cwd)" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 2000, "description": "Max matching lines to return (default: 200)" },
                    "max_count_per_file": { "type": "integer", "minimum": 1, "maximum": 200, "description": "Optional rg --max-count per file to limit output size." }
                },
                "required": ["pattern"],
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
        let args: GrepLinesArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        let pattern = args.pattern.trim();
        if pattern.is_empty() {
            return Err(ToolError::InvalidArgs("pattern is empty".to_string()));
        }
        if args.limit == 0 {
            return Err(ToolError::InvalidArgs("limit must be greater than zero".to_string()));
        }
        let limit = args.limit.min(MAX_LIMIT);

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

        let search_path = args.path.as_deref().unwrap_or_else(|| ctx.cwd.as_str());
        let search_path = if Path::new(search_path).is_absolute() {
            search_path.to_string()
        } else {
            Path::new(&ctx.cwd)
                .join(search_path)
                .to_string_lossy()
                .to_string()
        };

        let search_canon = Path::new(&search_path)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to resolve path: {}", e)))?;
        if !search_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("path outside workspace root".to_string()));
        }

        if !rg_available() {
            return Err(ToolError::ExecutionFailed(
                "ripgrep (rg) not found in PATH".to_string(),
            ));
        }

        let include = args
            .include
            .as_deref()
            .map(str::trim)
            .and_then(|val| if val.is_empty() { None } else { Some(val.to_string()) });

        let max_count_per_file = args.max_count_per_file.map(|v| v.min(200)).unwrap_or(50);
        let output = run_rg_lines(pattern, include.as_deref(), &search_path, &ctx.cwd, max_count_per_file)?;

        let mut results = Vec::new();
        for line in output.lines() {
            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                continue;
            }
            results.push(trimmed.to_string());
            if results.len() == limit {
                break;
            }
        }

        let content = if results.is_empty() {
            "No matches found.".to_string()
        } else {
            results.join("\n") + "\n"
        };

        Ok(ToolOutput::Success { content })
    }
}

fn rg_available() -> bool {
    Command::new("rg")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_rg_lines(
    pattern: &str,
    include: Option<&str>,
    search_path: &str,
    cwd: &str,
    max_count_per_file: usize,
) -> Result<String, ToolError> {
    let mut cmd = Command::new("rg");
    cmd.current_dir(cwd)
        .arg("--line-number")
        .arg("--no-heading")
        .arg("--color")
        .arg("never")
        .arg("--no-messages")
        .arg("--max-count")
        .arg(max_count_per_file.to_string())
        .arg("--regexp")
        .arg(pattern);

    if let Some(glob) = include {
        cmd.arg("--glob").arg(glob);
    }

    cmd.arg("--").arg(search_path);

    let output = cmd
        .output()
        .map_err(|e| ToolError::ExecutionFailed(format!("failed to run rg: {}", e)))?;

    match output.status.code() {
        Some(0) | Some(1) => Ok(String::from_utf8_lossy(&output.stdout).to_string()),
        _ => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(ToolError::ExecutionFailed(format!("rg failed: {}", stderr)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_pattern() {
        let handler = GrepLinesHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"pattern": ""}), &ctx)
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }

    #[tokio::test]
    async fn searches_lines_when_rg_available() {
        if !rg_available() {
            return;
        }
        let tmp = TempDir::new().unwrap();
        std::fs::write(tmp.path().join("a.txt"), "alpha\nbeta\n").unwrap();
        std::fs::write(tmp.path().join("b.txt"), "gamma\n").unwrap();

        let handler = GrepLinesHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let out = handler
            .handle(serde_json::json!({"pattern":"beta", "path":"."}), &ctx)
            .await
            .unwrap();
        let content = match out {
            ToolOutput::Success { content } => content,
            other => panic!("unexpected tool output: {:?}", other),
        };
        assert!(content.contains("a.txt:2:beta"));
    }
}

