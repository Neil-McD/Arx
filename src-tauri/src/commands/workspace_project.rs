use std::path::Path;
use std::process::Command;

struct ProjectIdentity {
    name: Option<String>,
    root_path: String,
    git_root: Option<String>,
    git_remote: Option<String>,
    fingerprint: String,
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn normalize_git_remote(value: &str) -> String {
    value.trim().to_string()
}

fn compute_project_identity(path: &Path) -> Result<ProjectIdentity, String> {
    let canonical = match path.canonicalize() {
        Ok(path) => path,
        Err(_) => path.to_path_buf(),
    };
    let root_path = canonical.to_string_lossy().to_string();
    let name = canonical
        .file_name()
        .map(|value| value.to_string_lossy().to_string());

    let git_root = run_git(&canonical, &["rev-parse", "--show-toplevel"]);
    let git_remote = git_root
        .as_deref()
        .and_then(|root| run_git(Path::new(root), &["config", "--get", "remote.origin.url"]))
        .map(|value| normalize_git_remote(&value));

    let fingerprint = if let Some(root) = git_root.as_deref() {
        let root_pathbuf = Path::new(root);
        let rel = canonical
            .strip_prefix(root_pathbuf)
            .unwrap_or_else(|_| Path::new(""));
        let rel_str = rel
            .to_string_lossy()
            .trim_start_matches(std::path::MAIN_SEPARATOR)
            .to_string();
        let repo_id = git_remote
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| root.to_string());
        if rel_str.is_empty() {
            format!("git:{}::.", repo_id)
        } else {
            format!("git:{}::{}", repo_id, rel_str)
        }
    } else {
        format!("path:{}", root_path)
    };

    Ok(ProjectIdentity {
        name,
        root_path,
        git_root,
        git_remote,
        fingerprint,
    })
}

#[tauri::command]
pub(crate) fn get_workspace_root_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<String, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let value = crate::db::get_ui_state(&conn, "workspace_root")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "workspace root not set".to_string())?;
    Ok(value)
}

#[tauri::command]
pub(crate) fn is_path_within_workspace_cmd(
    state: tauri::State<crate::db::DbState>,
    path: String,
) -> Result<bool, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let workspace_root = crate::db::get_ui_state(&conn, "workspace_root")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "workspace root not set".to_string())?;
    let resolved = crate::resolve_path_under_root(&workspace_root, &path);
    Ok(crate::is_within_root(
        &workspace_root,
        resolved.to_string_lossy().as_ref(),
    ))
}

#[tauri::command]
pub(crate) fn set_active_project_cmd(
    state: tauri::State<crate::db::DbState>,
    project_id: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    match project_id {
        Some(value) => {
            let project = crate::db::get_project_by_id(&conn, &value).map_err(|e| e.to_string())?;
            if project.is_none() {
                return Err("project not found".to_string());
            }
            crate::db::set_ui_state(&conn, "active_project_id", &value)
                .map_err(|e| e.to_string())?;
            let _ = crate::db::delete_ui_state(&conn, "active_project_path");
            Ok(())
        }
        None => {
            crate::db::delete_ui_state(&conn, "active_project_id").map_err(|e| e.to_string())?;
            crate::db::delete_ui_state(&conn, "active_project_path").map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) fn get_active_project_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Option<crate::db::ProjectRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    if let Some(project_id) =
        crate::db::get_ui_state(&conn, "active_project_id").map_err(|e| e.to_string())?
    {
        if let Some(project) =
            crate::db::get_project_by_id(&conn, &project_id).map_err(|e| e.to_string())?
        {
            return Ok(Some(project));
        }
    }

    if let Some(path) =
        crate::db::get_ui_state(&conn, "active_project_path").map_err(|e| e.to_string())?
    {
        let identity = compute_project_identity(Path::new(&path))?;
        let project = crate::db::upsert_project(
            &conn,
            identity.name.as_deref(),
            &identity.root_path,
            identity.git_root.as_deref(),
            identity.git_remote.as_deref(),
            &identity.fingerprint,
        )
        .map_err(|e| e.to_string())?;

        return Ok(Some(project));
    }

    Ok(None)
}

#[tauri::command]
pub(crate) fn list_projects_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Vec<crate::db::ProjectRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_project_cmd(
    state: tauri::State<crate::db::DbState>,
    path: String,
) -> Result<crate::db::ProjectRecord, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("path required".to_string());
    }
    let path = if std::path::Path::new(trimmed).is_absolute() {
        std::path::PathBuf::from(trimmed)
    } else {
        let root = crate::db::get_ui_state(&conn, "workspace_root")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "workspace root not set".to_string())?;
        std::path::Path::new(&root).join(trimmed)
    };
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let identity = compute_project_identity(&path)?;
    let record = crate::db::upsert_project(
        &conn,
        identity.name.as_deref(),
        &identity.root_path,
        identity.git_root.as_deref(),
        identity.git_remote.as_deref(),
        &identity.fingerprint,
    )
    .map_err(|e| e.to_string())?;

    Ok(record)
}

#[tauri::command]
pub(crate) fn delete_project_cmd(
    state: tauri::State<crate::db::DbState>,
    project_id: String,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::delete_project(&conn, &project_id).map_err(|e| e.to_string())?;
    if let Some(active_project_id) =
        crate::db::get_ui_state(&conn, "active_project_id").map_err(|e| e.to_string())?
    {
        if active_project_id == project_id {
            let _ = crate::db::delete_ui_state(&conn, "active_project_id");
            let _ = crate::db::delete_ui_state(&conn, "active_project_path");
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn update_project_name_cmd(
    state: tauri::State<crate::db::DbState>,
    project_id: String,
    name: Option<String>,
) -> Result<crate::db::ProjectRecord, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let updated = crate::db::update_project_name(&conn, &project_id, name.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(updated)
}
