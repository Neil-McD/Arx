use crate::db;
use rusqlite::Connection;
use std::path::Path;

pub fn canonical_workspace_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let candidate = Path::new(trimmed);
    let canonical = candidate
        .canonicalize()
        .unwrap_or_else(|_| candidate.to_path_buf());
    canonical.to_string_lossy().to_string()
}

pub fn normalize_workspace_fingerprint(value: Option<&str>) -> Option<String> {
    value
        .map(|raw| raw.trim())
        .filter(|raw| !raw.is_empty())
        .map(|raw| raw.to_string())
}

pub fn resolve_thread_workspace_fingerprint(
    conn: &Connection,
    thread: &db::ThreadRecord,
) -> Option<String> {
    if let Some(fingerprint) = normalize_workspace_fingerprint(thread.workspace_fingerprint.as_deref()) {
        return Some(fingerprint);
    }
    let project_id = thread
        .project_id
        .as_deref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())?;
    let project = db::get_project_by_id(conn, project_id).ok().flatten()?;
    normalize_workspace_fingerprint(Some(project.fingerprint.as_str()))
}

pub fn workspace_scope_id(
    workspace_path: &str,
    workspace_fingerprint: Option<&str>,
) -> String {
    if let Some(fingerprint) = normalize_workspace_fingerprint(workspace_fingerprint) {
        return fingerprint;
    }
    canonical_workspace_path(workspace_path)
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_workspace_path, normalize_workspace_fingerprint, workspace_scope_id,
    };

    #[test]
    fn workspace_scope_prefers_fingerprint() {
        let scope = workspace_scope_id("/tmp/project", Some("git:https://example/repo.git::."));
        assert_eq!(scope, "git:https://example/repo.git::.");
    }

    #[test]
    fn workspace_scope_falls_back_to_canonical_path() {
        let path = ".";
        let expected = canonical_workspace_path(path);
        let scope = workspace_scope_id(path, None);
        assert_eq!(scope, expected);
        assert!(!scope.is_empty());
    }

    #[test]
    fn normalize_workspace_fingerprint_trims_and_drops_empty_values() {
        assert_eq!(
            normalize_workspace_fingerprint(Some("  fp::alpha  ")),
            Some("fp::alpha".to_string())
        );
        assert_eq!(normalize_workspace_fingerprint(Some("   ")), None);
        assert_eq!(normalize_workspace_fingerprint(None), None);
    }
}
