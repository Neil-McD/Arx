//! list_files handler - lists files under a directory with optional glob filters.
//!
//! This is a high-leverage “read primitive” for autonomy: it avoids falling back
//! to `run_shell_command` for `find`/`ls`/`rg --files` exploration.

use async_trait::async_trait;
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct ListFilesHandler;

const DEFAULT_LIMIT: usize = 200;
const MAX_LIMIT: usize = 5000;
const DEFAULT_DEPTH: usize = 6;

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

fn default_depth() -> usize {
    DEFAULT_DEPTH
}

#[derive(Deserialize)]
struct ListFilesArgs {
    #[serde(alias = "path", alias = "dir_path")]
    dir_path: Option<String>,
    #[serde(default)]
    include: Option<String>,
    #[serde(default)]
    exclude: Option<String>,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
    #[serde(default = "default_depth")]
    depth: usize,
}

#[async_trait]
impl ToolHandler for ListFilesHandler {
    fn name(&self) -> &'static str {
        "list_files"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "list_files",
            description: "List files under a directory (within workspace). Supports simple glob filters and pagination.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "dir_path": { "type": "string", "description": "Directory to search (default: cwd)." },
                    "include": { "type": "string", "description": "Optional glob filter (e.g., '*.rs' or 'src/**/*.ts')." },
                    "exclude": { "type": "string", "description": "Optional glob exclude filter." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 5000, "description": "Max paths to return (default: 200)." },
                    "offset": { "type": "integer", "minimum": 0, "description": "Skip this many results (default: 0)." },
                    "depth": { "type": "integer", "minimum": 0, "maximum": 32, "description": "Max directory recursion depth (default: 6)." },
                    "path": { "type": "string", "description": "Alias for dir_path (back-compat)." }
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
        let args: ListFilesArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

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

        let dir_path = args
            .dir_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| ctx.cwd.as_str());

        let dir_path = if Path::new(dir_path).is_absolute() {
            dir_path.to_string()
        } else {
            Path::new(&ctx.cwd)
                .join(dir_path)
                .to_string_lossy()
                .to_string()
        };

        let dir_canon = Path::new(&dir_path)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to resolve path: {}", e)))?;
        if !dir_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("path outside workspace root".to_string()));
        }

        let include_re = args
            .include
            .as_deref()
            .map(str::trim)
            .and_then(|s| if s.is_empty() { None } else { Some(s) })
            .map(glob_to_regex)
            .transpose()?;
        let exclude_re = args
            .exclude
            .as_deref()
            .map(str::trim)
            .and_then(|s| if s.is_empty() { None } else { Some(s) })
            .map(glob_to_regex)
            .transpose()?;

        let offset = args.offset;
        let depth = args.depth.min(32);

        let dir_for_walk = dir_path.clone();
        let results = tokio::task::spawn_blocking(move || {
            list_files_walk(
                Path::new(&dir_for_walk),
                include_re.as_ref(),
                exclude_re.as_ref(),
                depth,
            )
        })
        .await
        .map_err(|e| ToolError::ExecutionFailed(format!("list task failed: {}", e)))??;

        let mut results = results;
        results.sort();

        let slice = results
            .into_iter()
            .skip(offset)
            .take(limit)
            .collect::<Vec<_>>();

        let mut content = String::new();
        content.push_str(&format!("Absolute path: {}\n", dir_path));
        content.push_str(&format!("Offset: {}\nLimit: {}\nDepth: {}\n\n", offset, limit, depth));
        if slice.is_empty() {
            content.push_str("No files found.\n");
        } else {
            content.push_str(&slice.join("\n"));
            content.push('\n');
        }

        Ok(ToolOutput::Success { content })
    }
}

fn list_files_walk(
    root: &Path,
    include: Option<&Regex>,
    exclude: Option<&Regex>,
    depth: usize,
) -> Result<Vec<String>, ToolError> {
    let mut out = Vec::new();
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::new();
    queue.push_back((root.to_path_buf(), 0));

    while let Some((dir, d)) = queue.pop_front() {
        if d > depth {
            continue;
        }
        let entries = fs::read_dir(&dir)
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to read dir {}: {}", dir.display(), e)))?;
        for entry in entries {
            let entry = entry
                .map_err(|e| ToolError::ExecutionFailed(format!("failed to read dir entry: {}", e)))?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|e| ToolError::ExecutionFailed(format!("failed to stat {}: {}", path.display(), e)))?;

            // Skip symlinks to keep the workspace boundary meaningful without a sandbox.
            if file_type.is_symlink() {
                continue;
            }

            if file_type.is_dir() {
                if d < depth {
                    queue.push_back((path, d + 1));
                }
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let rel = path.strip_prefix(root).unwrap_or(&path);
            let rel_norm = normalize_rel_path(rel);

            if let Some(re) = exclude {
                if re.is_match(&rel_norm) {
                    continue;
                }
            }
            if let Some(re) = include {
                if !re.is_match(&rel_norm) {
                    continue;
                }
            }

            out.push(rel_norm);
        }
    }

    Ok(out)
}

fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn glob_to_regex(glob: &str) -> Result<Regex, ToolError> {
    // Minimal glob-to-regex:
    // - `**` matches across path separators
    // - `*` matches within a path segment
    // - `?` matches a single char within a path segment
    let mut re = String::new();
    re.push('^');

    let mut chars = glob.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '*' => {
                if chars.peek() == Some(&'*') {
                    // consume second '*'
                    let _ = chars.next();
                    re.push_str(".*");
                } else {
                    re.push_str("[^/]*");
                }
            }
            '?' => re.push_str("[^/]"),
            '.' | '+' | '(' | ')' | '|' | '^' | '$' | '{' | '}' | '[' | ']' | '\\' => {
                re.push('\\');
                re.push(ch);
            }
            _ => re.push(ch),
        }
    }

    re.push('$');
    Regex::new(&re).map_err(|e| ToolError::InvalidArgs(format!("invalid glob pattern: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn lists_files_with_glob() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::write(tmp.path().join("src/a.rs"), "fn a() {}").unwrap();
        std::fs::write(tmp.path().join("src/b.ts"), "export {}").unwrap();

        let handler = ListFilesHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let out = handler
            .handle(
                serde_json::json!({"dir_path": ".", "include": "**/*.rs", "limit": 50}),
                &ctx,
            )
            .await
            .unwrap();

        let content = match out {
            ToolOutput::Success { content } => content,
            other => panic!("unexpected tool output: {:?}", other),
        };
        assert!(content.contains("src/a.rs"));
        assert!(!content.contains("src/b.ts"));
    }
}

