use anyhow::Context as _;
use sha2::{Digest as _, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

pub struct BlobWriteResult {
    pub id: String,
    pub rel_path: String,
    pub byte_len: i64,
}

fn blob_root_for_db(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("blobs")
}

fn validate_blob_rel_path(rel_path: &str) -> anyhow::Result<PathBuf> {
    let path = Path::new(rel_path);
    if path.is_absolute() {
        anyhow::bail!("blob path must be relative");
    }

    let mut components = path.components();
    match components.next() {
        Some(Component::Normal(name)) if name == "blobs" => {}
        _ => anyhow::bail!("blob path must be under blobs/"),
    }

    for c in components {
        if matches!(c, Component::ParentDir) {
            anyhow::bail!("blob path must not contain '..'");
        }
    }

    Ok(path.to_path_buf())
}

fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for b in digest {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

pub fn blob_abs_path(db_path: &Path, rel_path: &str) -> anyhow::Result<PathBuf> {
    let rel = validate_blob_rel_path(rel_path)?;
    Ok(db_path.parent().unwrap_or_else(|| Path::new(".")).join(rel))
}

pub fn blob_id_from_rel_path(rel_path: &str) -> anyhow::Result<String> {
    let rel = validate_blob_rel_path(rel_path)?;
    let file_name = rel
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow::anyhow!("blob filename missing"))?;

    let id = file_name.strip_suffix(".bin").unwrap_or(file_name);
    if id.len() != 64 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        anyhow::bail!("blob filename must be a sha256 hex string");
    }

    // Optional consistency check: blobs/ab/cd/<id>.bin.
    let comps: Vec<String> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str().map(|v| v.to_string()),
            _ => None,
        })
        .collect();
    if comps.len() >= 4 && comps[0] == "blobs" {
        let shard_a = &id[0..2];
        let shard_b = &id[2..4];
        if comps[1] != shard_a || comps[2] != shard_b {
            anyhow::bail!("blob path shards must match sha256 prefix");
        }
    }

    Ok(id.to_ascii_lowercase())
}

pub fn write_blob(db_path: &Path, bytes: &[u8]) -> anyhow::Result<BlobWriteResult> {
    let id = hex_sha256(bytes);
    let shard_a = &id[0..2];
    let shard_b = &id[2..4];

    let rel_dir = PathBuf::from("blobs").join(shard_a).join(shard_b);
    let rel_path = rel_dir.join(format!("{}.bin", id));

    let root = db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let abs_dir = root.join(&rel_dir);
    fs::create_dir_all(&abs_dir)?;

    let abs_path = root.join(&rel_path);
    if abs_path.exists() {
        return Ok(BlobWriteResult {
            id,
            rel_path: rel_path.to_string_lossy().replace('\\', "/"),
            byte_len: bytes.len() as i64,
        });
    }

    let tmp_name = format!("{}.tmp.{}", id, Uuid::new_v4().simple());
    let abs_tmp_path = abs_dir.join(tmp_name);

    {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&abs_tmp_path)
            .with_context(|| format!("open temp blob for write: {}", abs_tmp_path.display()))?;
        file.write_all(bytes)
            .with_context(|| format!("write temp blob: {}", abs_tmp_path.display()))?;
        file.sync_all()
            .with_context(|| format!("fsync temp blob: {}", abs_tmp_path.display()))?;
    }

    match fs::rename(&abs_tmp_path, &abs_path) {
        Ok(()) => {}
        Err(err) if abs_path.exists() => {
            // Another writer may have created the same content-addressed blob first.
            let _ = fs::remove_file(&abs_tmp_path);
            let _ = err;
        }
        Err(err) => {
            return Err(err)
                .with_context(|| format!("rename blob into place: {}", abs_path.display()));
        }
    }

    Ok(BlobWriteResult {
        id,
        rel_path: rel_path.to_string_lossy().replace('\\', "/"),
        byte_len: bytes.len() as i64,
    })
}

pub fn blob_root(db_path: &Path) -> PathBuf {
    blob_root_for_db(db_path)
}
