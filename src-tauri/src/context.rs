use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MAX_READ_BYTES: usize = 64 * 1024;
pub const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ContextSnippet {
    pub path: String,
    pub content: String,
    pub truncated: bool,
    pub total_bytes: u64,
    pub start: u64,
    pub end: u64,
}

#[derive(Debug, Clone)]
pub struct RedactionReport {
    pub blocked: bool,
    pub redactions: Vec<(String, usize)>,
}

static READ_CACHE: Lazy<Mutex<HashMap<String, ContextSnippet>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static READ_SET: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

pub struct ReadResult {
    pub snippet: ContextSnippet,
    pub from_cache: bool,
}

pub fn read_with_range(
    path: &str,
    offset_bytes: Option<u64>,
    max_bytes: usize,
) -> Result<ReadResult, String> {
    let cache_key = format!(
        "{}::{}::{}",
        path,
        offset_bytes.unwrap_or(0),
        max_bytes
    );
    {
        let cache = READ_CACHE.lock().unwrap();
        if let Some(existing) = cache.get(&cache_key) {
            return Ok(ReadResult {
                snippet: existing.clone(),
                from_cache: true,
            });
        }
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let total_bytes = metadata.len();
    if total_bytes > MAX_FILE_BYTES && offset_bytes.is_none() {
        return Err("file too large; use offset_bytes to read in chunks".to_string());
    }

    let offset = offset_bytes.unwrap_or(0);
    if offset > total_bytes {
        return Err("offset beyond end of file".to_string());
    }

    let bytes_to_read = std::cmp::min(max_bytes as u64, total_bytes.saturating_sub(offset));
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; bytes_to_read as usize];
    file.read_exact(&mut buffer).map_err(|e| e.to_string())?;

    let end = offset + bytes_to_read;
    let truncated = end < total_bytes;
    let content = String::from_utf8_lossy(&buffer).to_string();
    let snippet = ContextSnippet {
        path: path.to_string(),
        content,
        truncated,
        total_bytes,
        start: offset,
        end,
    };

    {
        let mut cache = READ_CACHE.lock().unwrap();
        cache.insert(cache_key, snippet.clone());
    }
    {
        let mut set = READ_SET.lock().unwrap();
        set.insert(path.to_string());
    }

    Ok(ReadResult {
        snippet,
        from_cache: false,
    })
}

pub fn redact_secrets(input: &str) -> (String, RedactionReport) {
    let mut output = input.to_string();
    let mut redactions = Vec::new();

    let patterns = [
        ("openai_key", r"sk-[A-Za-z0-9]{20,}"),
        ("anthropic_key", r"sk-ant-[A-Za-z0-9-_]{10,}"),
        ("google_key", r"AIza[0-9A-Za-z\\-_]{35}"),
        ("aws_access_key", r"AKIA[0-9A-Z]{16}"),
        ("aws_secret", r"(?i)aws_secret_access_key\\s*=\\s*[A-Za-z0-9/+=]{20,}"),
        ("generic_api_key", r"(?i)api[_-]?key\\s*[:=]\\s*[A-Za-z0-9-_]{16,}"),
        ("bearer", r"(?i)bearer\\s+[A-Za-z0-9\\-_.=]{16,}"),
        ("password", r"(?i)password\\s*[:=]\\s*[^\\s]{6,}"),
        ("private_key", r"-----BEGIN[ A-Z]*PRIVATE KEY-----[\\s\\S]+?-----END[ A-Z]*PRIVATE KEY-----"),
    ];

    for (name, pattern) in patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            let count = re.find_iter(&output).count();
            if count > 0 {
                output = re.replace_all(&output, "[REDACTED]").to_string();
                redactions.push((name.to_string(), count));
            }
        }
    }

    let blocked = redactions
        .iter()
        .any(|(kind, _)| kind == "private_key" || kind == "aws_secret");
    (
        output,
        RedactionReport {
            blocked,
            redactions,
        },
    )
}

pub fn already_read(path: &str) -> bool {
    let set = READ_SET.lock().unwrap();
    set.contains(path)
}

/// Find git root by walking up from start path
fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

/// Find AGENTS.md files from workspace_root down to start (cwd).
/// Stops at workspace_root instead of walking to filesystem root.
/// If workspace_root is None, uses git root detection as fallback.
pub fn find_agents_md(start: &Path, workspace_root: Option<&Path>) -> Vec<PathBuf> {
    // Determine the boundary - use provided workspace_root or detect git root
    let boundary = workspace_root
        .map(|p| p.to_path_buf())
        .or_else(|| find_git_root(start));

    let mut parts = Vec::new();
    let mut current = start.to_path_buf();

    loop {
        let override_path = current.join("AGENTS.override.md");
        if override_path.exists() {
            parts.push(override_path);
        } else {
            let agents = current.join("AGENTS.md");
            if agents.exists() {
                parts.push(agents);
            }
        }

        // Stop at workspace root boundary (don't go above it)
        if let Some(ref bound) = boundary {
            if current == *bound {
                break;
            }
        }

        if !current.pop() {
            break;
        }

        // Also stop if we've gone above the boundary
        if let Some(ref bound) = boundary {
            if !current.starts_with(bound) {
                break;
            }
        }
    }

    // Reverse to get root→cwd order
    parts.reverse();
    parts
}

/// Load and concatenate AGENTS.md files from workspace_root down to start (cwd).
/// Stops at workspace_root instead of walking to filesystem root.
/// If workspace_root is None, uses git root detection as fallback.
pub fn load_agents_md(
    start: &Path,
    workspace_root: Option<&Path>,
    max_bytes: usize,
) -> Result<String, String> {
    let mut out = Vec::new();
    let mut remaining = max_bytes;
    for path in find_agents_md(start, workspace_root) {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let slice = if bytes.len() > remaining { &bytes[..remaining] } else { &bytes };
        if !slice.is_empty() {
            out.push(String::from_utf8_lossy(slice).to_string());
            remaining = remaining.saturating_sub(slice.len());
        }
        if remaining == 0 {
            break;
        }
    }
    Ok(out.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::{read_with_range, MAX_FILE_BYTES};
    use std::fs;
    use uuid::Uuid;

    fn temp_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("arx-{}-{}", name, Uuid::new_v4()));
        path
    }

    #[test]
    fn reads_with_offset_and_truncation() {
        let path = temp_path("range");
        fs::write(&path, "abcdefghijklmnopqrstuvwxyz").unwrap();
        let result = read_with_range(path.to_str().unwrap(), Some(5), 5).unwrap();
        assert_eq!(result.snippet.content, "fghij");
        assert_eq!(result.snippet.start, 5);
        assert_eq!(result.snippet.end, 10);
        assert!(result.snippet.truncated);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn blocks_large_files_without_offset() {
        let path = temp_path("large");
        let payload = vec![b'a'; (MAX_FILE_BYTES as usize) + 1];
        fs::write(&path, payload).unwrap();
        let result = read_with_range(path.to_str().unwrap(), None, 16);
        assert!(result.is_err());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn cache_hits_second_read() {
        let path = temp_path("cache");
        fs::write(&path, "hello").unwrap();
        let first = read_with_range(path.to_str().unwrap(), None, 10).unwrap();
        assert!(!first.from_cache);
        let second = read_with_range(path.to_str().unwrap(), None, 10).unwrap();
        assert!(second.from_cache);
        fs::remove_file(path).unwrap();
    }
}
