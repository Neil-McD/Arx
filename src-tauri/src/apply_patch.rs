use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApplyPatchResult {
    pub applied: bool,
    pub changed_files: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug)]
struct Hunk {
    lines: Vec<HunkLine>,
}

#[derive(Debug, Clone)]
struct HunkLine {
    kind: char,
    text: String,
}

#[derive(Debug)]
enum FileOp {
    Add { path: String, lines: Vec<String> },
    Delete { path: String },
    Update {
        path: String,
        move_to: Option<String>,
        hunks: Vec<Hunk>,
    },
}

pub fn apply_patch_to_root(root: &Path, patch: &str) -> ApplyPatchResult {
    match parse_patch(patch) {
        Ok(ops) => {
            if ops.is_empty() {
                return ApplyPatchResult {
                    applied: false,
                    changed_files: Vec::new(),
                    errors: vec!["patch contains no operations".to_string()],
                };
            }
            apply_ops(root, ops)
        }
        Err(err) => ApplyPatchResult {
            applied: false,
            changed_files: Vec::new(),
            errors: vec![err],
        },
    }
}

fn parse_patch(patch: &str) -> Result<Vec<FileOp>, String> {
    let mut lines = patch.lines().peekable();
    let first = lines.next().ok_or_else(|| "patch is empty".to_string())?;
    if first.trim() != "*** Begin Patch" {
        return Err("patch must start with \"*** Begin Patch\"".to_string());
    }

    let mut ops = Vec::new();
    while let Some(line) = lines.peek() {
        let trimmed = line.trim();
        if trimmed == "*** End Patch" {
            lines.next();
            return Ok(ops);
        }
        if trimmed.starts_with("*** Add File:") {
            ops.push(parse_add_file(&mut lines)?);
            continue;
        }
        if trimmed.starts_with("*** Delete File:") {
            ops.push(parse_delete_file(&mut lines)?);
            continue;
        }
        if trimmed.starts_with("*** Update File:") {
            ops.push(parse_update_file(&mut lines)?);
            continue;
        }
        return Err(format!("unexpected patch line: {trimmed}"));
    }

    Err("patch missing \"*** End Patch\"".to_string())
}

fn parse_add_file(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Result<FileOp, String> {
    let header = lines.next().ok_or_else(|| "missing add file header".to_string())?;
    let path = header
        .trim()
        .trim_start_matches("*** Add File:")
        .trim()
        .to_string();
    if path.is_empty() {
        return Err("add file missing path".to_string());
    }

    let mut content = Vec::new();
    while let Some(line) = lines.peek() {
        let trimmed = line.trim();
        if trimmed.starts_with("*** ") || trimmed == "*** End Patch" {
            break;
        }
        let raw = lines.next().unwrap();
        if !raw.starts_with('+') {
            return Err("add file lines must start with '+'".to_string());
        }
        content.push(raw[1..].to_string());
    }

    Ok(FileOp::Add { path, lines: content })
}

fn parse_delete_file(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Result<FileOp, String> {
    let header = lines.next().ok_or_else(|| "missing delete file header".to_string())?;
    let path = header
        .trim()
        .trim_start_matches("*** Delete File:")
        .trim()
        .to_string();
    if path.is_empty() {
        return Err("delete file missing path".to_string());
    }
    Ok(FileOp::Delete { path })
}

fn parse_update_file(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Result<FileOp, String> {
    let header = lines.next().ok_or_else(|| "missing update file header".to_string())?;
    let path = header
        .trim()
        .trim_start_matches("*** Update File:")
        .trim()
        .to_string();
    if path.is_empty() {
        return Err("update file missing path".to_string());
    }

    let mut move_to = None;
    if let Some(next) = lines.peek() {
        let trimmed = next.trim();
        if trimmed.starts_with("*** Move to:") {
            let move_line = lines.next().unwrap();
            let new_path = move_line.trim().trim_start_matches("*** Move to:").trim();
            if new_path.is_empty() {
                return Err("move to missing path".to_string());
            }
            move_to = Some(new_path.to_string());
        }
    }

    let mut hunks = Vec::new();
    while let Some(line) = lines.peek() {
        let trimmed = line.trim();
        if trimmed.starts_with("*** ") || trimmed == "*** End Patch" {
            break;
        }
        if trimmed.starts_with("@@") {
            hunks.push(parse_hunk(lines)?);
            continue;
        }
        return Err(format!("unexpected update line: {trimmed}"));
    }

    if hunks.is_empty() {
        return Err(format!("update file requires at least one hunk: {path}"));
    }

    Ok(FileOp::Update { path, move_to, hunks })
}

fn parse_hunk(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Result<Hunk, String> {
    let _header = lines.next().ok_or_else(|| "missing hunk header".to_string())?;
    let mut hunk_lines = Vec::new();
    while let Some(line) = lines.peek() {
        let trimmed = line.trim();
        if trimmed.starts_with("@@")
            || trimmed.starts_with("*** ")
            || trimmed == "*** End Patch"
            || trimmed == "*** End of File"
        {
            if trimmed == "*** End of File" {
                lines.next();
            }
            break;
        }
        let raw = lines.next().unwrap();
        if raw.is_empty() {
            return Err("hunk line missing prefix".to_string());
        }
        let kind = raw.chars().next().unwrap();
        if kind != ' ' && kind != '+' && kind != '-' {
            return Err(format!("invalid hunk line prefix: {kind}"));
        }
        hunk_lines.push(HunkLine {
            kind,
            text: raw[1..].to_string(),
        });
    }
    if hunk_lines.is_empty() {
        return Err("hunk has no lines".to_string());
    }
    Ok(Hunk { lines: hunk_lines })
}

fn apply_ops(root: &Path, ops: Vec<FileOp>) -> ApplyPatchResult {
    let mut changed_files = Vec::new();
    for op in ops {
        let result = match &op {
            FileOp::Add { path, lines } => apply_add(root, path, lines),
            FileOp::Delete { path } => apply_delete(root, path),
            FileOp::Update { path, move_to, hunks } => {
                apply_update(root, path, move_to.as_deref(), hunks)
            }
        };
        if let Err(err) = result {
            return ApplyPatchResult {
                applied: false,
                changed_files,
                errors: vec![err],
            };
        }
        match op {
            FileOp::Add { path, .. } => changed_files.push(path),
            FileOp::Delete { path } => changed_files.push(path),
            FileOp::Update { path, move_to, .. } => {
                let is_rename = move_to.as_ref().is_some_and(|new_path| new_path != &path);
                if let Some(new_path) = move_to {
                    if is_rename {
                        changed_files.push(path);
                    }
                    changed_files.push(new_path);
                } else {
                    changed_files.push(path);
                };
            }
        }
    }

    ApplyPatchResult {
        applied: true,
        changed_files,
        errors: Vec::new(),
    }
}

fn apply_add(root: &Path, rel_path: &str, lines: &[String]) -> Result<(), String> {
    let target = resolve_path(root, rel_path)?;
    if target.exists() {
        return Err(format!("file already exists: {rel_path}"));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = lines.join("\n");
    let content = format!("{content}\n");
    fs::write(target, content).map_err(|e| e.to_string())
}

fn apply_delete(root: &Path, rel_path: &str) -> Result<(), String> {
    let target = resolve_path(root, rel_path)?;
    if !target.exists() {
        return Err(format!("file not found: {rel_path}"));
    }
    fs::remove_file(target).map_err(|e| e.to_string())
}

fn apply_update(
    root: &Path,
    rel_path: &str,
    move_to: Option<&str>,
    hunks: &[Hunk],
) -> Result<(), String> {
    let target = resolve_path(root, rel_path)?;
    if !target.exists() {
        return Err(format!("file not found: {rel_path}"));
    }
    let content = fs::read_to_string(&target).map_err(|e| e.to_string())?;
    let has_trailing_newline = content.ends_with('\n');
    let mut lines: Vec<String> = content.lines().map(|line| line.to_string()).collect();
    let mut search_start = 0usize;
    for (index, hunk) in hunks.iter().enumerate() {
        let mut old_lines = Vec::new();
        let mut new_lines = Vec::new();
        for line in &hunk.lines {
            if line.kind == ' ' || line.kind == '-' {
                old_lines.push(line.text.clone());
            }
            if line.kind == ' ' || line.kind == '+' {
                new_lines.push(line.text.clone());
            }
        }
        let pos = find_subslice(&lines, &old_lines, search_start)
            .ok_or_else(|| format!("hunk {} context not found in {}", index + 1, rel_path))?;
        lines.splice(pos..pos + old_lines.len(), new_lines.clone());
        search_start = pos + new_lines.len();
    }
    let mut new_content = lines.join("\n");
    if has_trailing_newline {
        new_content.push('\n');
    }

    let dest = if let Some(path) = move_to {
        resolve_path(root, path)?
    } else {
        target.clone()
    };
    if dest != target {
        if dest.exists() {
            return Err(format!("target already exists: {}", dest.display()));
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&dest, new_content).map_err(|e| e.to_string())?;
    if dest != target {
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn resolve_path(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(rel_path);
    if rel.is_absolute() {
        return Err("absolute paths are not allowed".to_string());
    }
    for component in rel.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("parent dir segments are not allowed".to_string());
        }
    }
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;

    // Prevent symlink traversal. Without a true OS sandbox, this is the main way
    // a path that *looks* inside the workspace can still target something outside.
    //
    // Note: This is not fully race-free (TOCTOU), but it closes the common escape
    // hatch and prevents accidental writes outside the workspace root.
    let mut joined = root_canon.clone();
    for component in rel.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(seg) => {
                joined.push(seg);
                if let Ok(meta) = fs::symlink_metadata(&joined) {
                    if meta.file_type().is_symlink() {
                        return Err("symlink segments are not allowed".to_string());
                    }
                }
            }
            std::path::Component::RootDir
            | std::path::Component::ParentDir
            | std::path::Component::Prefix(_) => {
                return Err("unsupported path component".to_string());
            }
        }
    }

    if !joined.starts_with(&root_canon) {
        return Err("path escapes workspace root".to_string());
    }

    // If the path exists, canonicalize it to ensure it still resolves under root.
    if joined.exists() {
        let canon = joined.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(&root_canon) {
            return Err("path escapes workspace root".to_string());
        }
    }

    Ok(joined)
}

fn find_subslice(
    haystack: &[String],
    needle: &[String],
    start: usize,
) -> Option<usize> {
    if needle.is_empty() {
        return Some(start.min(haystack.len()));
    }
    if needle.len() > haystack.len() {
        return None;
    }
    for idx in start..=haystack.len() - needle.len() {
        if haystack[idx..idx + needle.len()] == *needle {
            return Some(idx);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::apply_patch_to_root;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs as unix_fs;

    fn temp_root() -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("arx-apply-patch-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn rejects_empty_patch_ops() {
        let root = temp_root();
        let patch = "*** Begin Patch\n*** End Patch";
        let result = apply_patch_to_root(&root, patch);
        assert!(!result.applied);
        assert_eq!(result.errors, vec!["patch contains no operations"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_missing_file_errors() {
        let root = temp_root();
        let patch = "\
*** Begin Patch
*** Update File: missing.txt
@@
-old
+new
*** End Patch";
        let result = apply_patch_to_root(&root, patch);
        assert!(!result.applied);
        assert!(result.errors[0].contains("file not found: missing.txt"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn multi_hunk_error_includes_index() {
        let root = temp_root();
        let file_path = root.join("note.txt");
        fs::write(&file_path, "alpha\nbeta\ngamma\n").unwrap();
        let patch = "\
*** Begin Patch
*** Update File: note.txt
@@
 alpha
-beta
+beta-1
@@
 delta
-epsilon
+epsilon-1
*** End Patch";
        let result = apply_patch_to_root(&root, patch);
        assert!(!result.applied);
        assert!(result.errors[0].contains("hunk 2 context not found in note.txt"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn rejects_symlink_traversal_in_path() {
        let root = temp_root();
        let outside = temp_root();
        unix_fs::symlink(&outside, root.join("link")).unwrap();

        let patch = r#"*** Begin Patch
*** Add File: link/evil.txt
+oops
*** End Patch"#;
        let result = apply_patch_to_root(&root, patch);
        assert!(!result.applied);
        assert!(result.errors[0].contains("symlink"));

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn rejects_symlink_target_file() {
        let root = temp_root();
        let outside = temp_root();
        fs::write(outside.join("outside.txt"), "hello").unwrap();
        unix_fs::symlink(outside.join("outside.txt"), root.join("evil.txt")).unwrap();

        let patch = r#"*** Begin Patch
*** Delete File: evil.txt
*** End Patch"#;
        let result = apply_patch_to_root(&root, patch);
        assert!(!result.applied);
        assert!(result.errors[0].contains("symlink"));

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
}
