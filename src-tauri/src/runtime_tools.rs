use crate::community_context;
use crate::hash_utils::hex_sha256;
use crate::{is_within_root, resolve_path_under_root, PlatformProxyConfig};
use std::io::BufRead;
use std::path::Path;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command as TokioCommand;

const RIPGREP_VERSION: &str = "14.1.1";
const COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR: &str =
    "evidence_required: community_memory_candidate_propose requires evidence.items with at least one provenance item";

fn resolve_scoped_path(root: &str, raw_path: &str) -> Result<std::path::PathBuf, String> {
    let cleaned = raw_path.trim();
    if cleaned.is_empty() {
        return Err("path is required".to_string());
    }
    let resolved = resolve_path_under_root(root, cleaned);
    let resolved_str = resolved.to_string_lossy().to_string();
    if !is_within_root(root, &resolved_str) {
        return Err(format!("path outside workspace scope: {}", cleaned));
    }
    Ok(resolved)
}

fn rel_path_display(root: &str, abs: &std::path::Path) -> String {
    let root_path = std::path::Path::new(root);
    let root_canon = root_path
        .canonicalize()
        .unwrap_or_else(|_| root_path.to_path_buf());
    let abs_canon = abs.canonicalize().unwrap_or_else(|_| abs.to_path_buf());
    abs_canon
        .strip_prefix(&root_canon)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| abs.to_string_lossy().to_string())
}

fn write_file_atomic(path: &std::path::Path, bytes: &[u8]) -> anyhow::Result<()> {
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    std::fs::create_dir_all(parent)?;

    let tmp_name = format!(
        ".arx.tmp.{}.{}",
        uuid::Uuid::new_v4().simple(),
        std::process::id()
    );
    let tmp_path = parent.join(tmp_name);
    {
        use std::io::Write as _;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

pub(crate) struct ToolExecResult {
    pub(crate) status: &'static str, // "ok" | "error"
    pub(crate) tool_result_content: String,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) artifacts: Vec<serde_json::Value>,
    pub(crate) reason: Option<String>,
}

pub(crate) fn tool_ok(content: String) -> ToolExecResult {
    ToolExecResult {
        status: "ok",
        stdout: content.as_bytes().to_vec(),
        stderr: Vec::new(),
        exit_code: Some(0),
        artifacts: Vec::new(),
        reason: None,
        tool_result_content: content,
    }
}

pub(crate) fn tool_error(message: String) -> ToolExecResult {
    ToolExecResult {
        status: "error",
        stdout: Vec::new(),
        stderr: message.as_bytes().to_vec(),
        exit_code: Some(1),
        artifacts: Vec::new(),
        reason: Some("tool_error".to_string()),
        tool_result_content: format!("error: {}", message),
    }
}

fn community_tool_arg_string(args: &serde_json::Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn community_tool_arg_object(args: &serde_json::Value, key: &str) -> Option<serde_json::Value> {
    args.get(key)
        .and_then(|value| value.as_object())
        .map(|obj| {
            let map = obj
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect::<serde_json::Map<String, serde_json::Value>>();
            serde_json::Value::Object(map)
        })
}

fn parse_required_community_tool_arg(
    args: &serde_json::Value,
    key: &str,
    fallback: Option<&str>,
) -> Result<String, String> {
    if let Some(value) = community_tool_arg_string(args, key) {
        return Ok(value);
    }
    let fallback_value = fallback
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    fallback_value.ok_or_else(|| format!("{} is required", key))
}

fn resolve_scoped_community_id(
    args: &serde_json::Value,
    thread_community_id: Option<&str>,
) -> Result<String, String> {
    let scoped = thread_community_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "community tools require an active thread community context".to_string())?;

    if let Some(requested) = community_tool_arg_string(args, "community_id") {
        if requested != scoped {
            // Community scope is controlled by thread context; model-provided community_id is ignored.
        }
    }

    Ok(scoped)
}

fn parse_optional_community_limit(args: &serde_json::Value) -> Option<usize> {
    args.get("limit")
        .and_then(|value| value.as_i64().or_else(|| value.as_u64().map(|v| v as i64)))
        .map(|value| {
            value.clamp(
                1,
                community_context::COMMUNITY_CONTEXT_COMPILED_LIMIT as i64,
            ) as usize
        })
}

fn has_valid_community_evidence_provenance_item(item: &serde_json::Value) -> bool {
    let Some(obj) = item.as_object() else {
        return false;
    };
    let source_type = obj
        .get("source_type")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let source_id = obj
        .get("source_id")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or("");
    matches!(source_type.as_str(), "chat" | "resource" | "memory") && !source_id.is_empty()
}

fn parse_required_community_memory_evidence(args: &serde_json::Value) -> Result<serde_json::Value, String> {
    let evidence = community_tool_arg_object(args, "evidence")
        .ok_or_else(|| COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR.to_string())?;
    let has_provenance = evidence
        .get("items")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .any(|item| has_valid_community_evidence_provenance_item(item))
        })
        .unwrap_or(false);
    if !has_provenance {
        return Err(COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR.to_string());
    }
    Ok(evidence)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CommunitySearchSourceType {
    Chat,
    Resource,
    Memory,
}

fn parse_community_search_source_types(args: &serde_json::Value) -> Vec<CommunitySearchSourceType> {
    let raw_values = args
        .get("source_types")
        .and_then(|value| value.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|entry| entry.as_str())
                .map(|entry| entry.trim().to_ascii_lowercase())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if raw_values.is_empty() {
        return vec![
            CommunitySearchSourceType::Chat,
            CommunitySearchSourceType::Resource,
            CommunitySearchSourceType::Memory,
        ];
    }
    let mut out = Vec::new();
    for raw in raw_values {
        let source = match raw.as_str() {
            "chat" => Some(CommunitySearchSourceType::Chat),
            "resource" => Some(CommunitySearchSourceType::Resource),
            "memory" => Some(CommunitySearchSourceType::Memory),
            _ => None,
        };
        if let Some(source) = source {
            if !out.contains(&source) {
                out.push(source);
            }
        }
    }
    if out.is_empty() {
        vec![
            CommunitySearchSourceType::Chat,
            CommunitySearchSourceType::Resource,
            CommunitySearchSourceType::Memory,
        ]
    } else {
        out
    }
}

fn source_types_to_json_values(source_types: &[CommunitySearchSourceType]) -> Vec<&'static str> {
    source_types
        .iter()
        .map(|source| match source {
            CommunitySearchSourceType::Chat => "chat",
            CommunitySearchSourceType::Resource => "resource",
            CommunitySearchSourceType::Memory => "memory",
        })
        .collect()
}

fn truncate_for_tool_preview(value: &str, max_chars: usize) -> String {
    if max_chars == 0 {
        return String::new();
    }
    let trimmed = value.trim();
    let mut out = String::new();
    for (index, ch) in trimmed.chars().enumerate() {
        if index >= max_chars {
            out.push_str("...");
            return out;
        }
        out.push(ch);
    }
    out
}

pub(crate) async fn run_community_capability_tool(
    tool_name: &str,
    args: &serde_json::Value,
    platform_proxy: Option<&PlatformProxyConfig>,
    _cloud_user_id: Option<&str>,
    thread_community_id: Option<&str>,
) -> ToolExecResult {
    let Some(proxy) = platform_proxy else {
        return tool_error("community tools require a signed-in cloud session".to_string());
    };

    match tool_name {
        "community_search" => {
            let community_id = match resolve_scoped_community_id(args, thread_community_id) {
                Ok(value) => value,
                Err(err) => return tool_error(err),
            };
            let query = community_tool_arg_string(args, "query").unwrap_or_default();
            let limit = parse_optional_community_limit(args);
            let source_types = parse_community_search_source_types(args);
            let source_type_values = source_types_to_json_values(source_types.as_slice());
            match community_context::search_community_via_canonical_harness_strict(
                proxy,
                community_id.as_str(),
                None,
                query.as_str(),
                limit,
                source_type_values.as_slice(),
            )
            .await
            {
                Ok(payload) => tool_ok(payload.to_string()),
                Err(err) => tool_error(err),
            }
        }
        "community_memory_candidate_propose" => {
            let community_id = match resolve_scoped_community_id(args, thread_community_id) {
                Ok(value) => value,
                Err(err) => return tool_error(err),
            };
            let memory_text = match parse_required_community_tool_arg(args, "memory_text", None) {
                Ok(value) => value,
                Err(err) => return tool_error(err),
            };
            let title = community_tool_arg_string(args, "title");
            let evidence = match parse_required_community_memory_evidence(args) {
                Ok(value) => value,
                Err(err) => return tool_error(err),
            };
            let request_key = community_tool_arg_string(args, "request_key");
            match community_context::propose_community_memory_candidate_strict(
                proxy,
                community_id.as_str(),
                title.as_deref(),
                memory_text.as_str(),
                &evidence,
                request_key.as_deref(),
            )
            .await
            {
                Ok(result) => tool_ok(
                    serde_json::json!({
                        "ok": true,
                        "tool": "community_memory_candidate_propose",
                        "community_scope": "thread_context",
                        "title": title,
                        "memory_text_preview": truncate_for_tool_preview(memory_text.as_str(), 200),
                        "result": result
                    })
                    .to_string(),
                ),
                Err(err) => tool_error(err),
            }
        }
        _ => tool_error(format!("unsupported community tool: {}", tool_name)),
    }
}

fn is_ignored_component(name: &str) -> bool {
    matches!(name, ".git" | "node_modules" | "dist" | "target" | "blobs")
}

fn is_ignored_path(path: &std::path::Path) -> bool {
    path.components().any(|c| match c {
        std::path::Component::Normal(s) => s.to_str().map(is_ignored_component).unwrap_or(false),
        _ => false,
    })
}

fn pattern_needs_pcre2(pat: &str) -> bool {
    pat.contains("(?=")
        || pat.contains("(?!")
        || pat.contains("(?<=")
        || pat.contains("(?<!")
        || pat.contains("(?<")
        || pat.contains("\\1")
        || pat.contains("\\2")
        || pat.contains("\\k<")
}

fn ripgrep_exe_name() -> &'static str {
    if cfg!(windows) {
        "rg.exe"
    } else {
        "rg"
    }
}

fn ripgrep_platform_config() -> Result<(&'static str, &'static str), String> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Ok(("aarch64-apple-darwin", "tar.gz"));
    }
    if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        return Ok(("x86_64-apple-darwin", "tar.gz"));
    }
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        return Ok(("x86_64-unknown-linux-musl", "tar.gz"));
    }
    if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        return Ok(("aarch64-unknown-linux-gnu", "tar.gz"));
    }
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        return Ok(("x86_64-pc-windows-msvc", "zip"));
    }
    Err("unsupported platform for bundled ripgrep".to_string())
}

fn ripgrep_archive_sha256(platform: &str, ext: &str) -> Option<&'static str> {
    match (platform, ext) {
        ("aarch64-apple-darwin", "tar.gz") => {
            Some("24ad76777745fbff131c8fbc466742b011f925bfa4fffa2ded6def23b5b937be")
        }
        ("x86_64-apple-darwin", "tar.gz") => {
            Some("fc87e78f7cb3fea12d69072e7ef3b21509754717b746368fd40d88963630e2b3")
        }
        ("x86_64-unknown-linux-musl", "tar.gz") => {
            Some("4cf9f2741e6c465ffdb7c26f38056a59e2a2544b51f7cc128ef28337eeae4d8e")
        }
        ("aarch64-unknown-linux-gnu", "tar.gz") => {
            Some("c827481c4ff4ea10c9dc7a4022c8de5db34a5737cb74484d62eb94a95841ab2f")
        }
        ("x86_64-pc-windows-msvc", "zip") => {
            Some("d0f534024c42afd6cb4d38907c25cd2b249b79bbe6cc1dbee8e3e37c2b6e25a1")
        }
        _ => None,
    }
}

fn find_executable_in_path(exe_name: &str) -> Option<std::path::PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(exe_name);
        if candidate.exists() && candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn ripgrep_bin_dir(db_path: &Path) -> Result<std::path::PathBuf, String> {
    Ok(db_path
        .parent()
        .ok_or_else(|| "failed to resolve app data dir".to_string())?
        .join("bin"))
}

fn find_file_recursive(root: &Path, filename: &str) -> Option<std::path::PathBuf> {
    let read_dir = std::fs::read_dir(root).ok()?;
    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_type = entry.file_type().ok()?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if let Some(found) = find_file_recursive(&path, filename) {
                return Some(found);
            }
            continue;
        }
        if file_type.is_file() {
            if path.file_name().and_then(|v| v.to_str()) == Some(filename) {
                return Some(path);
            }
        }
    }
    None
}

fn run_checked_command(cmd: &mut std::process::Command, label: &str) -> Result<(), String> {
    let output = cmd
        .output()
        .map_err(|e| format!("{} failed: {}", label, e))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        return Err(format!("{} failed", label));
    }
    Err(format!("{} failed: {}", label, stderr))
}

fn is_safe_archive_rel_path(path: &Path) -> bool {
    if path.is_absolute() {
        return false;
    }
    let mut saw_component = false;
    for component in path.components() {
        match component {
            std::path::Component::Normal(_) => saw_component = true,
            std::path::Component::CurDir => {}
            std::path::Component::Prefix(_)
            | std::path::Component::RootDir
            | std::path::Component::ParentDir => return false,
        }
    }
    saw_component
}

fn validate_tar_archive_entries(archive_path: &Path) -> Result<(), String> {
    let output = std::process::Command::new("tar")
        .arg("-tzf")
        .arg(archive_path)
        .output()
        .map_err(|e| format!("tar list failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err("tar list failed".to_string());
        }
        return Err(format!("tar list failed: {}", stderr));
    }
    let listing = String::from_utf8_lossy(&output.stdout);
    for line in listing.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let candidate = Path::new(trimmed);
        if !is_safe_archive_rel_path(candidate) {
            return Err(format!("unsafe tar entry path: {}", trimmed));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn validate_zip_archive_entries_windows(archive_path: &Path) -> Result<(), String> {
    let archive_str = archive_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('{}')
try {{
  foreach ($entry in $zip.Entries) {{
    $name = $entry.FullName
    if ([string]::IsNullOrWhiteSpace($name)) {{ continue }}
    if ($name.StartsWith('/')) {{ throw "unsafe zip entry: $name" }}
    if ($name.StartsWith('\')) {{ throw "unsafe zip entry: $name" }}
    if ($name.Contains('..')) {{ throw "unsafe zip entry: $name" }}
    if ($name -match '^[A-Za-z]:') {{ throw "unsafe zip entry: $name" }}
  }}
}} finally {{
  $zip.Dispose()
}}"#,
        archive_str
    );
    let output = std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|e| format!("zip safety check failed: {}", e))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        return Err("zip safety check failed".to_string());
    }
    Err(format!("zip safety check failed: {}", stderr))
}

async fn ensure_ripgrep(db_path: &Path) -> Result<std::path::PathBuf, String> {
    let exe_name = ripgrep_exe_name();

    if let Ok(override_path) = std::env::var("ARX_RIPGREP_PATH") {
        let p = std::path::PathBuf::from(override_path);
        if p.exists() && p.is_file() {
            return Ok(p);
        }
        return Err("ARX_RIPGREP_PATH points to a missing file".to_string());
    }

    if let Some(path) = find_executable_in_path(exe_name) {
        return Ok(path);
    }

    let bin_dir = ripgrep_bin_dir(db_path)?;
    let managed = bin_dir.join(exe_name);
    if managed.exists() && managed.is_file() {
        return Ok(managed);
    }

    let (platform, ext) = ripgrep_platform_config()?;
    let expected_archive_sha256 = ripgrep_archive_sha256(platform, ext).ok_or_else(|| {
        format!(
            "missing pinned ripgrep archive checksum for platform {} ({})",
            platform, ext
        )
    })?;
    let filename = format!("ripgrep-{}-{}.{}", RIPGREP_VERSION, platform, ext);
    let url = format!(
        "https://github.com/BurntSushi/ripgrep/releases/download/{}/{}",
        RIPGREP_VERSION, filename
    );

    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("create bin dir failed: {}", e))?;

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("ripgrep download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!(
            "ripgrep download failed (status {})",
            resp.status()
        ));
    }
    let archive_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("ripgrep download read failed: {}", e))?
        .to_vec();
    let archive_sha256 = hex_sha256(&archive_bytes);
    if archive_sha256 != expected_archive_sha256 {
        return Err(format!(
            "ripgrep archive checksum mismatch for {} (expected {}, got {})",
            filename, expected_archive_sha256, archive_sha256
        ));
    }

    let archive_path = bin_dir.join(&filename);
    write_file_atomic(&archive_path, &archive_bytes)
        .map_err(|e| format!("write ripgrep archive failed: {}", e))?;

    let extract_dir = bin_dir.join(format!(
        ".arx.ripgrep.extract.{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("create extract dir failed: {}", e))?;

    let pre_extract_validation = match ext {
        "tar.gz" => validate_tar_archive_entries(&archive_path),
        "zip" => {
            #[cfg(windows)]
            {
                validate_zip_archive_entries_windows(&archive_path)
            }
            #[cfg(not(windows))]
            {
                Err("zip extraction is only supported on Windows".to_string())
            }
        }
        other => Err(format!("unsupported ripgrep archive type: {}", other)),
    };
    if let Err(err) = pre_extract_validation {
        let _ = std::fs::remove_file(&archive_path);
        let _ = std::fs::remove_dir_all(&extract_dir);
        return Err(err);
    }

    let extract_result = match ext {
        "tar.gz" => {
            let mut cmd = std::process::Command::new("tar");
            cmd.arg("-xzf")
                .arg(&archive_path)
                .arg("-C")
                .arg(&extract_dir);
            run_checked_command(&mut cmd, "tar extract")
        }
        "zip" => {
            if cfg!(windows) {
                let archive_str = archive_path.to_string_lossy().replace('\'', "''");
                let dest_str = extract_dir.to_string_lossy().replace('\'', "''");
                let mut cmd = std::process::Command::new("powershell");
                cmd.arg("-NoProfile").arg("-Command").arg(format!(
                    "Expand-Archive -Force -Path '{}' -DestinationPath '{}'",
                    archive_str, dest_str
                ));
                run_checked_command(&mut cmd, "powershell Expand-Archive")
            } else {
                Err("zip extraction is only supported on Windows".to_string())
            }
        }
        other => Err(format!("unsupported ripgrep archive type: {}", other)),
    };

    let extracted_bin_path = if extract_result.is_ok() {
        find_file_recursive(&extract_dir, exe_name)
            .ok_or_else(|| format!("{} not found in extracted ripgrep archive", exe_name))
    } else {
        Err(extract_result
            .err()
            .unwrap_or_else(|| "extract failed".to_string()))
    };

    let cleanup = || {
        let _ = std::fs::remove_file(&archive_path);
        let _ = std::fs::remove_dir_all(&extract_dir);
    };

    let extracted_bin_path = match extracted_bin_path {
        Ok(v) => v,
        Err(err) => {
            cleanup();
            return Err(err);
        }
    };
    let extract_dir_canon = extract_dir.canonicalize().map_err(|e| {
        cleanup();
        format!("canonicalize extract dir failed: {}", e)
    })?;
    let extracted_bin_canon = extracted_bin_path.canonicalize().map_err(|e| {
        cleanup();
        format!("canonicalize extracted ripgrep failed: {}", e)
    })?;
    if !extracted_bin_canon.starts_with(&extract_dir_canon) {
        cleanup();
        return Err("extracted ripgrep path escaped extraction directory".to_string());
    }
    let extracted_meta = std::fs::symlink_metadata(&extracted_bin_canon).map_err(|e| {
        cleanup();
        format!("ripgrep extracted metadata failed: {}", e)
    })?;
    if extracted_meta.file_type().is_symlink() || !extracted_meta.is_file() {
        cleanup();
        return Err("extracted ripgrep is not a regular file".to_string());
    }

    let bin_bytes = std::fs::read(&extracted_bin_path).map_err(|e| {
        cleanup();
        format!("read extracted ripgrep failed: {}", e)
    })?;

    write_file_atomic(&managed, &bin_bytes).map_err(|e| {
        cleanup();
        format!("write ripgrep failed: {}", e)
    })?;

    cleanup();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let mut perms = std::fs::metadata(&managed)
            .map_err(|e| format!("ripgrep metadata failed: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&managed, perms)
            .map_err(|e| format!("ripgrep chmod failed: {}", e))?;
    }

    Ok(managed)
}

fn run_ripgrep_grep(
    rg_path: &Path,
    workspace_root: &str,
    base_rel: &str,
    pat: &str,
    include: Option<&str>,
    max_hits: usize,
    needs_pcre2: bool,
) -> Result<(Vec<String>, bool, bool), String> {
    use std::io::{BufRead, BufReader, Read as _};
    use std::process::Stdio;

    let mut cmd = std::process::Command::new(rg_path);
    cmd.current_dir(workspace_root)
        .arg("-nH")
        .arg("--color")
        .arg("never")
        .arg("--no-messages")
        .arg("--hidden")
        .arg("--no-follow")
        .arg("--max-filesize")
        .arg("2M");

    for glob in [
        "!.git/**",
        "!node_modules/**",
        "!dist/**",
        "!target/**",
        "!blobs/**",
    ] {
        cmd.arg("--glob").arg(glob);
    }

    if needs_pcre2 {
        cmd.arg("--pcre2");
    }

    cmd.arg("--regexp").arg(pat);

    if let Some(include) = include.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        cmd.arg("--glob").arg(include);
    }

    cmd.arg(base_rel)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => return Err(format!("ripgrep spawn failed: {}", err)),
    };

    let stderr_handle = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut out: Vec<u8> = Vec::new();
            let _ = stderr.read_to_end(&mut out);
            out
        })
    });

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture ripgrep stdout".to_string())?;
    let reader = BufReader::new(stdout);

    let mut hits: Vec<String> = Vec::new();
    let mut truncated = false;

    for line in reader.lines() {
        let line = match line {
            Ok(v) => v,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        hits.push(line.replace('\\', "/"));
        if hits.len() >= max_hits {
            truncated = true;
            let _ = child.kill();
            break;
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("ripgrep wait failed: {}", e))?;
    let exit_code = status.code();
    let stderr_bytes = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    let stderr_text = String::from_utf8_lossy(&stderr_bytes).trim().to_string();

    if truncated {
        return Ok((hits, true, false));
    }

    match exit_code {
        Some(0) => Ok((hits, false, false)),
        Some(1) => Ok((Vec::new(), false, false)),
        Some(2) => {
            if hits.is_empty() {
                let msg = if stderr_text.is_empty() {
                    "ripgrep failed".to_string()
                } else {
                    format!("ripgrep failed: {}", stderr_text)
                };
                Err(msg)
            } else {
                Ok((hits, false, true))
            }
        }
        Some(code) => {
            let msg = if stderr_text.is_empty() {
                format!("ripgrep failed (exit code {})", code)
            } else {
                format!("ripgrep failed (exit code {}): {}", code, stderr_text)
            };
            Err(msg)
        }
        None => Err("ripgrep failed (terminated)".to_string()),
    }
}

pub(crate) fn normalize_agent_tool_name(tool_name: &str) -> String {
    let trimmed = tool_name.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lower = trimmed.to_lowercase();
    match lower.as_str() {
        "list" | "ls" => "list_dir".to_string(),
        "updateplan" => "update_plan".to_string(),
        _ => lower,
    }
}

pub(crate) fn is_known_agent_tool_name(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "update_plan"
            | "community_search"
            | "community_memory_candidate_propose"
            | "read"
            | "list_dir"
            | "sha256"
            | "write"
            | "edit"
            | "glob"
            | "grep"
            | "bash"
    )
}

async fn read_limited(mut reader: impl tokio::io::AsyncRead + Unpin, max_bytes: usize) -> Vec<u8> {
    let mut out = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        if out.len() < max_bytes {
            let remaining = max_bytes - out.len();
            out.extend_from_slice(&buf[..std::cmp::min(remaining, n)]);
        }
    }
    out
}

pub(crate) async fn run_agent_tool(
    workspace_root: &str,
    db_path: &Path,
    tool_name: &str,
    args: &serde_json::Value,
) -> ToolExecResult {
    let workspace_root = workspace_root.trim();
    if workspace_root.is_empty() || !std::path::Path::new(workspace_root).is_absolute() {
        return tool_error(
            "workspace not bound; select a workspace before using tools".to_string(),
        );
    }

    let Some(obj) = args.as_object() else {
        return tool_error("args must be an object".to_string());
    };

    match tool_name {
        "read" => {
            let path = obj
                .get("path")
                .or_else(|| obj.get("file_path"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let offset = obj
                .get("offset")
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
                .max(0) as usize;
            let limit = obj
                .get("limit")
                .and_then(|v| v.as_i64())
                .unwrap_or(200)
                .max(1) as usize;
            let abs = match resolve_scoped_path(workspace_root, path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            let meta = match std::fs::metadata(&abs) {
                Ok(m) => m,
                Err(err) => return tool_error(format!("read failed: {}", err)),
            };
            if meta.is_dir() {
                return tool_error("path is a directory; use list_dir for folders".to_string());
            }
            let file = match std::fs::File::open(&abs) {
                Ok(f) => f,
                Err(err) => return tool_error(format!("open failed: {}", err)),
            };
            let reader = std::io::BufReader::new(file);
            let mut out = String::new();
            for (idx, line) in reader.lines().skip(offset).take(limit).enumerate() {
                let line_no = offset + idx + 1;
                match line {
                    Ok(line) => {
                        out.push_str(&format!("{:4}| {}\n", line_no, line));
                    }
                    Err(_) => break,
                }
            }
            if out.trim().is_empty() {
                out = "(empty)".to_string();
            }
            tool_ok(out)
        }
        "list_dir" => {
            let path = obj
                .get("path")
                .or_else(|| obj.get("dir_path"))
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .trim();
            let abs = match resolve_scoped_path(workspace_root, path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            let meta = match std::fs::metadata(&abs) {
                Ok(m) => m,
                Err(err) => return tool_error(format!("list_dir failed: {}", err)),
            };
            if !meta.is_dir() {
                return tool_error("path is not a directory".to_string());
            }

            let mut dirs: Vec<String> = Vec::new();
            let mut files: Vec<String> = Vec::new();
            let read_dir = match std::fs::read_dir(&abs) {
                Ok(rd) => rd,
                Err(err) => return tool_error(format!("list_dir failed: {}", err)),
            };
            for entry in read_dir.flatten() {
                let file_name = entry.file_name();
                let name = file_name.to_string_lossy().to_string();
                if is_ignored_component(name.as_str()) {
                    continue;
                }
                let file_type = match entry.file_type() {
                    Ok(ft) => ft,
                    Err(_) => continue,
                };
                if file_type.is_dir() {
                    dirs.push(format!("{}/", name));
                } else if file_type.is_file() {
                    files.push(name);
                }
            }
            dirs.sort();
            files.sort();
            let rel = rel_path_display(workspace_root, &abs);
            let mut out_lines: Vec<String> = Vec::new();
            out_lines.push(format!(
                "dir: {} ({} dirs, {} files)",
                rel,
                dirs.len(),
                files.len()
            ));
            if !dirs.is_empty() || !files.is_empty() {
                out_lines.push(String::new());
                out_lines.extend(dirs);
                out_lines.extend(files);
            }
            tool_ok(out_lines.join("\n"))
        }
        "sha256" => {
            let path = obj
                .get("path")
                .or_else(|| obj.get("file_path"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let abs = match resolve_scoped_path(workspace_root, path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            if !abs.exists() {
                return tool_error("file does not exist".to_string());
            }
            let bytes = match std::fs::read(&abs) {
                Ok(b) => b,
                Err(err) => return tool_error(format!("read failed: {}", err)),
            };
            let sha = hex_sha256(&bytes);
            let mut result = tool_ok(sha.clone());
            result.artifacts.push(serde_json::json!({
              "type": "file_hash",
              "path": rel_path_display(workspace_root, &abs),
              "sha256": sha,
              "byte_len": bytes.len()
            }));
            result
        }
        "glob" => {
            let pat = obj
                .get("pat")
                .or_else(|| obj.get("pattern"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if pat.is_empty() {
                return tool_error("pat is required".to_string());
            }
            let base = obj
                .get("path")
                .or_else(|| obj.get("cwd"))
                .or_else(|| obj.get("workdir"))
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .trim();
            let base_abs = match resolve_scoped_path(workspace_root, base) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            if !base_abs.exists() {
                return tool_error("path does not exist".to_string());
            }

            let pattern_abs = if std::path::Path::new(pat).is_absolute() {
                std::path::PathBuf::from(pat)
            } else {
                base_abs.join(pat)
            };
            let pattern = pattern_abs.to_string_lossy().replace('\\', "/");

            // Guardrail: ensure the non-wildcard prefix stays within the workspace scope.
            let prefix = pattern
                .char_indices()
                .find(|(_idx, ch)| matches!(ch, '*' | '?' | '[' | '{'))
                .map(|(idx, _)| pattern[..idx].to_string())
                .unwrap_or_else(|| pattern.clone());
            let prefix_path = if prefix.trim().is_empty() {
                base_abs.to_string_lossy().to_string()
            } else {
                prefix
            };
            if !is_within_root(workspace_root, &prefix_path) {
                return tool_error("pat resolves outside workspace scope".to_string());
            }

            let mut hits: Vec<(i64, String)> = Vec::new();
            let mut total_matches: usize = 0;
            const MAX_HITS: usize = 200;
            match glob::glob(&pattern) {
                Ok(paths) => {
                    for p in paths.flatten() {
                        if is_ignored_path(&p) {
                            continue;
                        }
                        let rel = rel_path_display(workspace_root, &p);
                        if std::path::Path::new(&rel).is_absolute() {
                            continue;
                        }
                        total_matches += 1;
                        let mtime = std::fs::metadata(&p)
                            .and_then(|m| m.modified())
                            .ok()
                            .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);
                        hits.push((mtime, rel));
                    }
                }
                Err(err) => return tool_error(format!("invalid glob: {}", err)),
            }
            hits.sort_by(|a, b| b.0.cmp(&a.0));
            let truncated = hits.len() > MAX_HITS;
            if hits.len() > MAX_HITS {
                hits.truncate(MAX_HITS);
            }
            let mut out_lines: Vec<String> = Vec::new();
            out_lines.push(format!(
                "matches: {} (returned: {}{}) (ignored: .git,node_modules,dist,target,blobs)",
                total_matches,
                hits.len(),
                if truncated { ", truncated" } else { "" }
            ));
            if !hits.is_empty() {
                out_lines.push(String::new());
                out_lines.extend(hits.into_iter().map(|(_mtime, rel)| rel));
            }
            tool_ok(out_lines.join("\n"))
        }
        "grep" => {
            let pat = obj
                .get("pat")
                .or_else(|| obj.get("query"))
                .or_else(|| obj.get("pattern"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if pat.is_empty() {
                return tool_error("pat is required".to_string());
            }
            let base = obj
                .get("path")
                .or_else(|| obj.get("cwd"))
                .or_else(|| obj.get("workdir"))
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .trim();
            let include = obj
                .get("include")
                .or_else(|| obj.get("glob"))
                .and_then(|v| v.as_str())
                .map(|v| v.trim())
                .filter(|v| !v.is_empty());
            let base_abs = match resolve_scoped_path(workspace_root, base) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            if !base_abs.exists() {
                return tool_error("path does not exist".to_string());
            }

            const MAX_HITS: usize = 50;

            let needs_pcre2 = pattern_needs_pcre2(pat);
            let mut base_rel = rel_path_display(workspace_root, &base_abs);
            if base_rel.trim().is_empty() {
                base_rel = ".".to_string();
            }
            let mut rg_err: Option<String> = None;
            let rg_path = match ensure_ripgrep(db_path).await {
                Ok(path) => Some(path),
                Err(err) => {
                    rg_err = Some(err);
                    None
                }
            };

            if let Some(rg_path) = rg_path {
                match run_ripgrep_grep(
                    &rg_path,
                    workspace_root,
                    &base_rel,
                    pat,
                    include,
                    MAX_HITS,
                    needs_pcre2,
                ) {
                    Ok((hits, truncated, had_errors)) => {
                        let mut out_lines: Vec<String> = Vec::new();
                        out_lines.push(format!(
                            "hits: {}{} (backend: rg{})",
                            hits.len(),
                            if truncated { " (truncated)" } else { "" },
                            if needs_pcre2 { ", pcre2" } else { "" }
                        ));
                        if had_errors {
                            out_lines
                                .push("(some paths were inaccessible and skipped)".to_string());
                        }
                        if !hits.is_empty() {
                            out_lines.push(String::new());
                            out_lines.extend(hits);
                        }
                        return tool_ok(out_lines.join("\n"));
                    }
                    Err(err) => {
                        if needs_pcre2 {
                            return tool_error(err);
                        }
                        // Fall through to Rust scan.
                        rg_err = Some(err);
                    }
                }
            } else if needs_pcre2 {
                return tool_error(match rg_err {
                    Some(err) => {
                        format!("unsupported regex feature (look-around/backrefs); {}", err)
                    }
                    None => "unsupported regex feature (look-around/backrefs); ripgrep unavailable"
                        .to_string(),
                });
            }

            let re = match regex::Regex::new(pat) {
                Ok(re) => re,
                Err(err) => return tool_error(format!("invalid regex: {}", err)),
            };

            let mut stack = vec![base_abs];
            let mut hits: Vec<String> = Vec::new();
            const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
            let mut scanned_files: u64 = 0;
            let mut skipped_large: u64 = 0;
            let mut skipped_binary: u64 = 0;

            while let Some(dir) = stack.pop() {
                if hits.len() >= MAX_HITS {
                    break;
                }
                if is_ignored_path(&dir) {
                    continue;
                }
                let read_dir = match std::fs::read_dir(&dir) {
                    Ok(rd) => rd,
                    Err(_) => continue,
                };
                for entry in read_dir.flatten() {
                    let path = entry.path();
                    if is_ignored_path(&path) {
                        continue;
                    }
                    let file_type = match entry.file_type() {
                        Ok(ft) => ft,
                        Err(_) => continue,
                    };
                    if file_type.is_dir() {
                        stack.push(path);
                        continue;
                    }
                    if !file_type.is_file() {
                        continue;
                    }
                    scanned_files += 1;

                    let meta = match std::fs::metadata(&path) {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    if meta.len() > MAX_FILE_BYTES {
                        skipped_large += 1;
                        continue;
                    }

                    let bytes = match std::fs::read(&path) {
                        Ok(b) => b,
                        Err(_) => continue,
                    };
                    if bytes.iter().any(|b| *b == 0) {
                        skipped_binary += 1;
                        continue;
                    }
                    let text = String::from_utf8_lossy(&bytes);
                    for (idx, line) in text.lines().enumerate() {
                        if re.is_match(line) {
                            let rel = rel_path_display(workspace_root, &path);
                            hits.push(format!("{}:{}:{}", rel, idx + 1, line));
                            if hits.len() >= MAX_HITS {
                                break;
                            }
                        }
                    }
                    if hits.len() >= MAX_HITS {
                        break;
                    }
                }
            }

            let mut out_lines: Vec<String> = Vec::new();
            let backend_note = rg_err
                .as_ref()
                .map(|err| {
                    let trimmed = err.trim();
                    if trimmed.is_empty() {
                        String::new()
                    } else if trimmed.len() > 120 {
                        format!(", rg unavailable: {}...", &trimmed[..117])
                    } else {
                        format!(", rg unavailable: {}", trimmed)
                    }
                })
                .unwrap_or_default();
            out_lines.push(format!(
          "hits: {}{} (backend: rust{}; scanned_files: {}, skipped_large: {}, skipped_binary: {})",
          hits.len(),
          if hits.len() >= MAX_HITS { " (truncated)" } else { "" },
          backend_note,
          scanned_files,
          skipped_large,
          skipped_binary
        ));
            if !hits.is_empty() {
                out_lines.push(String::new());
                out_lines.extend(hits);
            }
            tool_ok(out_lines.join("\n"))
        }
        "write" => {
            #[derive(Clone)]
            enum ExpectedBeforeSha {
                Create,
                Hash(String),
            }

            let parse_expected_before = |obj: &serde_json::Map<String, serde_json::Value>| -> Result<Option<ExpectedBeforeSha>, ToolExecResult> {
        match obj.get("expected_before_sha256") {
          None => Ok(None),
          Some(serde_json::Value::Null) => Ok(Some(ExpectedBeforeSha::Create)),
          Some(serde_json::Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
              Ok(None)
            } else {
              Ok(Some(ExpectedBeforeSha::Hash(trimmed.to_string())))
            }
          }
          Some(_) => Err(tool_error("expected_before_sha256 must be string or null".to_string())),
        }
      };

            if let Some(writes) = obj.get("writes").and_then(|v| v.as_array()) {
                if writes.is_empty() {
                    return tool_error("writes must be a non-empty array".to_string());
                }

                struct PreparedWrite {
                    rel: String,
                    abs: std::path::PathBuf,
                    content: String,
                    before_bytes: Option<Vec<u8>>,
                }

                let mut prepared: Vec<PreparedWrite> = Vec::new();
                for (idx, entry) in writes.iter().enumerate() {
                    let Some(entry_obj) = entry.as_object() else {
                        return tool_error(format!("writes[{}] must be an object", idx));
                    };

                    let path = entry_obj
                        .get("path")
                        .or_else(|| entry_obj.get("filePath"))
                        .or_else(|| entry_obj.get("filepath"))
                        .or_else(|| entry_obj.get("file_path"))
                        .or_else(|| entry_obj.get("filename"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if path.is_empty() {
                        return tool_error(format!("writes[{}].path is required", idx));
                    }

                    let content = entry_obj
                        .get("content")
                        .or_else(|| entry_obj.get("text"))
                        .or_else(|| entry_obj.get("contents"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let expected = match parse_expected_before(entry_obj) {
                        Ok(v) => v,
                        Err(e) => return e,
                    };

                    let abs = match resolve_scoped_path(workspace_root, &path) {
                        Ok(v) => v,
                        Err(e) => return tool_error(e),
                    };

                    let meta = match std::fs::metadata(&abs) {
                        Ok(m) => Some(m),
                        Err(_) => None,
                    };
                    if meta.as_ref().is_some_and(|m| m.is_dir()) {
                        return tool_error(format!("writes[{}].path is a directory", idx));
                    }

                    let exists = meta.is_some();
                    let before_bytes = if exists {
                        std::fs::read(&abs).ok()
                    } else {
                        None
                    };
                    if exists {
                        let before_hash = hex_sha256(before_bytes.as_ref().unwrap_or(&Vec::new()));
                        match expected.clone() {
                            Some(ExpectedBeforeSha::Create) => {
                                return tool_error(format!(
                  "writes[{}]: expected_before_sha256 was null (create), but file exists; refuse overwrite",
                  idx
                ));
                            }
                            Some(ExpectedBeforeSha::Hash(expected_hash)) => {
                                if before_hash != expected_hash {
                                    return tool_error(format!(
                    "writes[{}]: expected_before_sha256 mismatch (expected {}, got {})",
                    idx, expected_hash, before_hash
                  ));
                                }
                            }
                            None => {}
                        }
                    }

                    let rel = rel_path_display(workspace_root, &abs);
                    prepared.push(PreparedWrite {
                        rel,
                        abs,
                        content,
                        before_bytes,
                    });
                }

                let mut artifacts: Vec<serde_json::Value> = Vec::new();
                let mut changed: Vec<String> = Vec::new();
                for item in prepared {
                    if let Err(err) = write_file_atomic(&item.abs, item.content.as_bytes()) {
                        return tool_error(format!("write failed ({}): {}", item.rel, err));
                    }
                    let after_bytes = std::fs::read(&item.abs)
                        .unwrap_or_else(|_| item.content.as_bytes().to_vec());
                    let after_hash = hex_sha256(&after_bytes);
                    let before_hash = item.before_bytes.as_ref().map(|b| hex_sha256(b));

                    changed.push(item.rel.clone());
                    artifacts.push(serde_json::json!({
                      "type": "file_write",
                      "path": item.rel,
                      "before_sha256": before_hash,
                      "after_sha256": after_hash,
                      "byte_len": after_bytes.len()
                    }));
                }

                changed.sort();
                changed.dedup();
                let summary = format!(
                    "ok\nwrote {} file(s):\n{}",
                    changed.len(),
                    changed.join("\n")
                );
                let mut result = tool_ok(summary);
                result.artifacts = artifacts;
                return result;
            }

            let path = obj
                .get("path")
                .or_else(|| obj.get("filePath"))
                .or_else(|| obj.get("filepath"))
                .or_else(|| obj.get("file_path"))
                .or_else(|| obj.get("filename"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if path.is_empty() {
                return tool_error(
          "path is required. Provide {\"path\":\"folder/file.txt\",\"content\":\"...\"}. For multiple files, you can also use {\"writes\":[{\"path\":\"a.txt\",\"content\":\"...\"}]}."
            .to_string(),
        );
            }
            let content = obj
                .get("content")
                .or_else(|| obj.get("text"))
                .or_else(|| obj.get("contents"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let expected = match parse_expected_before(obj) {
                Ok(v) => v,
                Err(e) => return e,
            };

            let abs = match resolve_scoped_path(workspace_root, path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };

            if std::fs::metadata(&abs).ok().is_some_and(|m| m.is_dir()) {
                return tool_error("path is a directory; use a file path".to_string());
            }

            let exists = abs.exists();
            let before_bytes = if exists {
                std::fs::read(&abs).ok()
            } else {
                None
            };
            if exists {
                let before_bytes = before_bytes.clone().unwrap_or_default();
                let before_hash = hex_sha256(&before_bytes);
                match expected {
                    Some(ExpectedBeforeSha::Create) => {
                        return tool_error(
              "expected_before_sha256 was null (create), but file exists; refuse overwrite".to_string(),
            );
                    }
                    Some(ExpectedBeforeSha::Hash(expected_hash)) => {
                        if before_hash != expected_hash {
                            return tool_error(format!(
                                "expected_before_sha256 mismatch (expected {}, got {})",
                                expected_hash, before_hash
                            ));
                        }
                    }
                    None => {
                        // Nano-style: if no precondition is provided, proceed using current file content.
                    }
                }
            }

            if let Err(err) = write_file_atomic(&abs, content.as_bytes()) {
                return tool_error(format!("write failed: {}", err));
            }

            let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| content.as_bytes().to_vec());
            let after_hash = hex_sha256(&after_bytes);
            let before_hash = before_bytes.as_ref().map(|b| hex_sha256(b));

            let mut result = tool_ok("ok".to_string());
            result.artifacts.push(serde_json::json!({
              "type": "file_write",
              "path": rel_path_display(workspace_root, &abs),
              "before_sha256": before_hash,
              "after_sha256": after_hash,
              "byte_len": after_bytes.len()
            }));
            result
        }
        "edit" => {
            let path = obj
                .get("path")
                .or_else(|| obj.get("filePath"))
                .or_else(|| obj.get("filepath"))
                .or_else(|| obj.get("file_path"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if path.is_empty() {
                return tool_error("path is required".to_string());
            }
            let old = obj
                .get("old")
                .or_else(|| obj.get("oldString"))
                .or_else(|| obj.get("old_string"))
                .or_else(|| obj.get("find"))
                .or_else(|| obj.get("from"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let new = obj
                .get("new")
                .or_else(|| obj.get("newString"))
                .or_else(|| obj.get("new_string"))
                .or_else(|| obj.get("replace"))
                .or_else(|| obj.get("to"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let all = obj
                .get("all")
                .or_else(|| obj.get("replaceAll"))
                .or_else(|| obj.get("replace_all"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let expected = obj
                .get("expected_before_sha256")
                .or_else(|| obj.get("expectedBeforeSha256"))
                .and_then(|v| v.as_str())
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty());
            let abs = match resolve_scoped_path(workspace_root, path) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            let exists = abs.exists();
            let before_bytes = if exists {
                match std::fs::read(&abs) {
                    Ok(b) => Some(b),
                    Err(err) => return tool_error(format!("read failed: {}", err)),
                }
            } else {
                None
            };
            let before_hash = before_bytes.as_ref().map(|b| hex_sha256(b));

            if exists {
                if let Some(expected) = expected.as_deref() {
                    if before_hash.as_deref() != Some(expected) {
                        return tool_error(format!(
                            "expected_before_sha256 mismatch (expected {}, got {})",
                            expected,
                            before_hash.clone().unwrap_or_default()
                        ));
                    }
                }
            } else if expected.is_some() {
                return tool_error(
                    "expected_before_sha256 provided, but file does not exist".to_string(),
                );
            }

            if old.is_empty() {
                if let Err(err) = write_file_atomic(&abs, new.as_bytes()) {
                    return tool_error(format!("write failed: {}", err));
                }
                let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| new.as_bytes().to_vec());
                let after_hash = hex_sha256(&after_bytes);

                let mut result = tool_ok(if exists {
                    "ok".to_string()
                } else {
                    "ok (created)".to_string()
                });
                result.artifacts.push(serde_json::json!({
                  "type": "file_edit",
                  "path": rel_path_display(workspace_root, &abs),
                  "before_sha256": before_hash,
                  "after_sha256": after_hash,
                  "byte_len": after_bytes.len()
                }));
                return result;
            }

            if !exists {
                return tool_error("file does not exist".to_string());
            }

            let text = String::from_utf8_lossy(before_bytes.as_ref().unwrap()).to_string();
            if !text.contains(old) {
                return tool_error(
          "old_string not found; use read to inspect the file, then retry with a more specific old_string (or use write to overwrite the file)".to_string(),
        );
            }
            let count = text.matches(old).count();
            let replaced = if all {
                text.replace(old, new)
            } else {
                text.replacen(old, new, 1)
            };
            if let Err(err) = write_file_atomic(&abs, replaced.as_bytes()) {
                return tool_error(format!("write failed: {}", err));
            }
            let after_bytes = std::fs::read(&abs).unwrap_or_else(|_| replaced.as_bytes().to_vec());
            let after_hash = hex_sha256(&after_bytes);

            let mut result = tool_ok(if !all && count > 1 {
                format!(
          "ok (replaced first occurrence; old_string appears {} times; use replaceAll=true to replace all)",
          count
        )
            } else {
                "ok".to_string()
            });
            result.artifacts.push(serde_json::json!({
              "type": "file_edit",
              "path": rel_path_display(workspace_root, &abs),
              "before_sha256": before_hash,
              "after_sha256": after_hash,
              "byte_len": after_bytes.len()
            }));
            result
        }
        "bash" => {
            let cmd = obj
                .get("cmd")
                .or_else(|| obj.get("command"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if cmd.is_empty() {
                return tool_error("cmd is required".to_string());
            }
            let cwd = obj
                .get("cwd")
                .or_else(|| obj.get("workdir"))
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .trim();
            let cwd_abs = match resolve_scoped_path(workspace_root, cwd) {
                Ok(v) => v,
                Err(e) => return tool_error(e),
            };
            if !cwd_abs.exists() {
                if let Err(err) = std::fs::create_dir_all(&cwd_abs) {
                    return tool_error(format!(
                        "cwd does not exist and could not be created: {}",
                        err
                    ));
                }
            }

            let mut command = if cfg!(windows) {
                let mut c = TokioCommand::new("cmd");
                c.arg("/C").arg(cmd);
                c
            } else {
                let mut c = TokioCommand::new("sh");
                c.arg("-lc").arg(cmd);
                c
            };
            command
                .current_dir(&cwd_abs)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            let mut child = match command.spawn() {
                Ok(c) => c,
                Err(err) => return tool_error(format!("spawn failed: {}", err)),
            };
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            let stdout_fut = async move {
                if let Some(stdout) = stdout {
                    read_limited(stdout, 1024 * 1024).await
                } else {
                    Vec::new()
                }
            };
            let stderr_fut = async move {
                if let Some(stderr) = stderr {
                    read_limited(stderr, 256 * 1024).await
                } else {
                    Vec::new()
                }
            };
            let stdout_task = tokio::spawn(stdout_fut);
            let stderr_task = tokio::spawn(stderr_fut);

            let mut timed_out = false;
            let status = tokio::select! {
              res = child.wait() => res.ok(),
              _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {
                timed_out = true;
                let _ = child.kill().await;
                let _ = child.wait().await;
                None
              }
            };

            let stdout = stdout_task.await.unwrap_or_default();
            let stderr = stderr_task.await.unwrap_or_default();
            let exit_code = status.and_then(|s| s.code());

            let tool_result_content = if timed_out {
                let mut out = String::from_utf8_lossy(&stdout).to_string();
                if !out.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str("(timed out after 30s)");
                out
            } else {
                let mut out = String::from_utf8_lossy(&stdout).to_string();
                if !stderr.is_empty() {
                    if !out.is_empty() && !out.ends_with('\n') {
                        out.push('\n');
                    }
                    out.push_str(&String::from_utf8_lossy(&stderr));
                }
                if out.trim().is_empty() {
                    "(empty)".to_string()
                } else {
                    out.trim().to_string()
                }
            };

            ToolExecResult {
                status: if timed_out { "error" } else { "ok" },
                tool_result_content,
                stdout,
                stderr,
                exit_code,
                artifacts: Vec::new(),
                reason: if timed_out {
                    Some("timeout".to_string())
                } else {
                    None
                },
            }
        }
        _ => tool_error(format!("unknown tool: {}", tool_name)),
    }
}
