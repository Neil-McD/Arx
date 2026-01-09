//! list_dir handler - lists a slice of directory entries.
//!
//! Codex parity: supports paging (offset/limit) and controlled recursion depth.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct ListDirHandler;

const INDENTATION_SPACES: usize = 2;
const DEFAULT_OFFSET: usize = 1; // 1-indexed
const DEFAULT_LIMIT: usize = 25;
const DEFAULT_DEPTH: usize = 2;
const MAX_LIMIT: usize = 500;
const MAX_DEPTH: usize = 10;

fn default_offset() -> usize {
    DEFAULT_OFFSET
}

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

fn default_depth() -> usize {
    DEFAULT_DEPTH
}

#[derive(Deserialize)]
struct ListDirArgs {
    #[serde(alias = "path")]
    dir_path: String,
    #[serde(default = "default_offset")]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default = "default_depth")]
    depth: usize,
}

#[async_trait]
impl ToolHandler for ListDirHandler {
    fn name(&self) -> &'static str {
        "list_dir"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "list_dir",
            description: "List directory contents with paging and depth control.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "dir_path": { "type": "string", "description": "Directory to list (default: cwd)." },
                    "offset": { "type": "integer", "minimum": 1, "description": "1-indexed entry offset (default: 1)" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 500, "description": "Max entries to return (default: 25)" },
                    "depth": { "type": "integer", "minimum": 1, "maximum": 10, "description": "Recursion depth (default: 2)" },
                    "path": { "type": "string", "description": "Alias for dir_path (back-compat)" }
                },
                "required": ["dir_path"],
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
        let args: ListDirArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        if args.dir_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("dir_path is empty".to_string()));
        }
        if args.offset == 0 {
            return Err(ToolError::InvalidArgs(
                "offset must be a 1-indexed entry number".to_string(),
            ));
        }
        if args.limit == 0 {
            return Err(ToolError::InvalidArgs("limit must be greater than zero".to_string()));
        }
        if args.depth == 0 {
            return Err(ToolError::InvalidArgs("depth must be greater than zero".to_string()));
        }

        // Enforce workspace root boundary (default to cwd if unset)
        let root = ctx
            .workspace_root
            .as_deref()
            .unwrap_or_else(|| ctx.cwd.as_str());

        // Resolve path relative to cwd if not absolute
        let dir_path = if Path::new(&args.dir_path).is_absolute() {
            args.dir_path.clone()
        } else {
            Path::new(&ctx.cwd)
                .join(&args.dir_path)
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
        let path_canon = Path::new(&dir_path)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to resolve path: {}", e)))?;
        if !path_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("path outside workspace root".to_string()));
        }

        let limit = args.limit.min(MAX_LIMIT);
        let depth = args.depth.min(MAX_DEPTH);

        let output_lines = list_dir_slice(Path::new(&dir_path), args.offset, limit, depth)?;
        let mut content = String::new();
        content.push_str(&format!("Absolute path: {}\n", dir_path));
        if output_lines.is_empty() {
            content.push_str("(empty)\n");
        } else {
            content.push_str(&output_lines.join("\n"));
            content.push('\n');
        }
        Ok(ToolOutput::Success { content })
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DirEntryKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Clone)]
struct DirEntry {
    sort_key: String,
    display_name: String,
    depth: usize,
    kind: DirEntryKind,
}

fn list_dir_slice(path: &Path, offset: usize, limit: usize, depth: usize) -> Result<Vec<String>, ToolError> {
    if !path.exists() {
        return Err(ToolError::ExecutionFailed(format!(
            "path does not exist: {}",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(ToolError::ExecutionFailed(format!(
            "path is not a directory: {}",
            path.display()
        )));
    }

    let mut entries = Vec::new();
    collect_entries(path, Path::new(""), depth, &mut entries)?;
    if entries.is_empty() {
        return Ok(Vec::new());
    }

    let start_index = offset - 1;
    if start_index >= entries.len() {
        return Err(ToolError::InvalidArgs(
            "offset exceeds directory entry count".to_string(),
        ));
    }

    entries.sort_by(|a, b| a.sort_key.cmp(&b.sort_key));
    let end_index = (start_index + limit).min(entries.len());
    let slice = &entries[start_index..end_index];

    let mut formatted = Vec::with_capacity(slice.len() + 1);
    for entry in slice {
        formatted.push(format_entry_line(entry));
    }
    if end_index < entries.len() {
        formatted.push("More entries exist; increase offset/limit to continue.".to_string());
    }
    Ok(formatted)
}

fn collect_entries(
    dir_path: &Path,
    relative_prefix: &Path,
    depth: usize,
    entries: &mut Vec<DirEntry>,
) -> Result<(), ToolError> {
    let mut queue = VecDeque::new();
    queue.push_back((dir_path.to_path_buf(), relative_prefix.to_path_buf(), depth));

    while let Some((current_dir, prefix, remaining_depth)) = queue.pop_front() {
        let read_dir = std::fs::read_dir(&current_dir)
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to read directory: {}", e)))?;

        let mut dir_entries: Vec<(PathBuf, PathBuf, DirEntryKind, DirEntry)> = Vec::new();
        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_type = entry.file_type().ok();
            let kind = match file_type {
                Some(ft) if ft.is_dir() => DirEntryKind::Directory,
                Some(ft) if ft.is_symlink() => DirEntryKind::Symlink,
                Some(ft) if ft.is_file() => DirEntryKind::File,
                _ => DirEntryKind::Other,
            };

            let file_name = entry.file_name();
            let relative_path = if prefix.as_os_str().is_empty() {
                PathBuf::from(&file_name)
            } else {
                prefix.join(&file_name)
            };

            let display_name = file_name.to_string_lossy().to_string();
            let depth_count = prefix.components().count();
            let sort_key = relative_path.to_string_lossy().replace('\\', "/");

            dir_entries.push((
                entry.path(),
                relative_path,
                kind,
                DirEntry {
                    sort_key,
                    display_name,
                    depth: depth_count,
                    kind,
                },
            ));
        }

        dir_entries.sort_by(|a, b| a.3.sort_key.cmp(&b.3.sort_key));

        for (entry_path, relative_path, kind, dir_entry) in dir_entries {
            if kind == DirEntryKind::Directory && remaining_depth > 1 {
                queue.push_back((entry_path, relative_path, remaining_depth - 1));
            }
            entries.push(dir_entry);
        }
    }

    Ok(())
}

fn format_entry_line(entry: &DirEntry) -> String {
    let indent = " ".repeat(entry.depth * INDENTATION_SPACES);
    let mut name = entry.display_name.clone();
    match entry.kind {
        DirEntryKind::Directory => name.push('/'),
        DirEntryKind::Symlink => name.push('@'),
        DirEntryKind::Other => name.push('?'),
        DirEntryKind::File => {}
    }
    format!("{indent}{name}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_path() {
        let handler = ListDirHandler;
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
    async fn lists_directory() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("file.txt"), "content").unwrap();
        fs::create_dir(tmp.path().join("subdir")).unwrap();

        let handler = ListDirHandler;
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
                serde_json::json!({"path": tmp.path().to_string_lossy()}),
                &ctx,
            )
            .await;

        assert!(matches!(result, Ok(ToolOutput::Success { .. })));
        if let Ok(ToolOutput::Success { content }) = result {
            assert!(content.contains("subdir"));
            assert!(content.contains("file.txt"));
        }
    }
}
