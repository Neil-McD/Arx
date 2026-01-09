use std::path::{Path, PathBuf};

pub fn is_within_root(workspace_root: &str, cwd: &str) -> bool {
    let root = Path::new(workspace_root);
    let cwd = Path::new(cwd);
    if !root.is_absolute() || !cwd.is_absolute() {
        return false;
    }
    let Ok(root_canon) = root.canonicalize() else {
        return false;
    };
    let Ok(cwd_canon) = cwd.canonicalize() else {
        return false;
    };
    cwd_canon.starts_with(&root_canon)
}

pub fn resolve_workspace_write_path(
    workspace_root: &str,
    cwd: &str,
    file_path: &str,
) -> Result<PathBuf, String> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err("file_path is empty".to_string());
    }

    let rel = Path::new(file_path);
    let root_canon = Path::new(workspace_root)
        .canonicalize()
        .map_err(|e| format!("invalid workspace root: {}", e))?;

    let cwd_canon = Path::new(cwd)
        .canonicalize()
        .map_err(|e| format!("invalid cwd: {}", e))?;
    if !cwd_canon.starts_with(&root_canon) {
        return Err("cwd outside workspace root".to_string());
    }

    if rel.is_absolute() {
        let target = rel.to_path_buf();
        if !target.starts_with(&root_canon) {
            return Err("path outside workspace root".to_string());
        }
        let rel_to_root = target
            .strip_prefix(&root_canon)
            .map_err(|_| "path outside workspace root".to_string())?;
        let mut joined = root_canon.clone();
        for component in rel_to_root.components() {
            match component {
                std::path::Component::CurDir => {}
                std::path::Component::Normal(seg) => {
                    joined.push(seg);
                    if let Ok(meta) = std::fs::symlink_metadata(&joined) {
                        if meta.file_type().is_symlink() {
                            return Err("symlink segments are not allowed".to_string());
                        }
                    }
                }
                std::path::Component::ParentDir => {
                    if joined == root_canon {
                        return Err("path escapes workspace root".to_string());
                    }
                    joined.pop();
                }
                std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                    return Err("unsupported path component".to_string());
                }
            }
        }
        return Ok(joined);
    }

    // Resolve relative to the current working directory, while preventing
    // escapes above the workspace root.
    let mut joined = cwd_canon.clone();
    for component in rel.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(seg) => {
                joined.push(seg);
                if let Ok(meta) = std::fs::symlink_metadata(&joined) {
                    if meta.file_type().is_symlink() {
                        return Err("symlink segments are not allowed".to_string());
                    }
                }
            }
            std::path::Component::ParentDir => {
                if joined == root_canon {
                    return Err("path escapes workspace root".to_string());
                }
                joined.pop();
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("unsupported path component".to_string());
            }
        }
    }

    if !joined.starts_with(&root_canon) {
        return Err("path escapes workspace root".to_string());
    }

    Ok(joined)
}

pub fn resolve_workspace_existing_path(
    workspace_root: &str,
    cwd: &str,
    file_path: &str,
    allow_final_symlink: bool,
) -> Result<PathBuf, String> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err("file_path is empty".to_string());
    }

    let rel = Path::new(file_path);
    let root_canon = Path::new(workspace_root)
        .canonicalize()
        .map_err(|e| format!("invalid workspace root: {}", e))?;
    let cwd_canon = Path::new(cwd)
        .canonicalize()
        .map_err(|e| format!("invalid cwd: {}", e))?;
    if !cwd_canon.starts_with(&root_canon) {
        return Err("cwd outside workspace root".to_string());
    }

    let (base, rel_components): (PathBuf, Vec<std::path::Component<'_>>) = if rel.is_absolute() {
        if !rel.starts_with(&root_canon) {
            return Err("path outside workspace root".to_string());
        }
        let rel_to_root = rel
            .strip_prefix(&root_canon)
            .map_err(|_| "path outside workspace root".to_string())?;
        (root_canon.clone(), rel_to_root.components().collect())
    } else {
        (cwd_canon.clone(), rel.components().collect())
    };

    let total = rel_components.len();
    let mut joined = base;
    for (idx, component) in rel_components.into_iter().enumerate() {
        let is_last = idx + 1 == total;
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(seg) => {
                joined.push(seg);
                if let Ok(meta) = std::fs::symlink_metadata(&joined) {
                    if meta.file_type().is_symlink() && !(allow_final_symlink && is_last) {
                        return Err("symlink segments are not allowed".to_string());
                    }
                }
            }
            std::path::Component::ParentDir => {
                if joined == root_canon {
                    return Err("path escapes workspace root".to_string());
                }
                joined.pop();
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("unsupported path component".to_string());
            }
        }
    }

    if !joined.starts_with(&root_canon) {
        return Err("path escapes workspace root".to_string());
    }

    Ok(joined)
}

