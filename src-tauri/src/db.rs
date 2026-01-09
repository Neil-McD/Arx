use rusqlite::{params, Connection};
use crate::context;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone)]
pub struct DbState {
  pub db_path: PathBuf,
  pub key: String,
}

#[derive(serde::Serialize)]
pub struct SessionRecord {
  pub id: String,
  pub title: String,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(serde::Serialize)]
pub struct SessionResume {
  pub session_id: String,
  pub last_message_id: Option<String>,
  pub last_message_at: Option<i64>,
  pub last_response_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ProjectRecord {
  pub id: String,
  pub name: Option<String>,
  pub root_path: String,
  pub git_root: Option<String>,
  pub git_remote: Option<String>,
  pub fingerprint: String,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(serde::Serialize)]
pub struct ToolCallRecord {
  pub id: String,
  pub session_id: String,
  pub tool_name: String,
  pub args_json: String,
  pub status: String,
  pub output_summary_json: Option<String>,
  pub stdout_excerpt: Option<String>,
  pub stderr_excerpt: Option<String>,
  pub exit_code: Option<i32>,
  pub duration_ms: Option<i64>,
  pub raw_output_file_id: Option<String>,
  pub egress_policy: String,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(serde::Serialize)]
pub struct MemoryBlockRecord {
  pub id: String,
  pub label: String,
  pub scope: String,
  pub scope_id: Option<String>,
  pub value: String,
  pub format: String,
  pub char_limit: i64,
  pub read_only: i64,
  pub egress_policy: String,
  pub description: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(serde::Serialize)]
pub struct MessageRecord {
  pub id: String,
  pub session_id: String,
  pub role: String,
  pub content_json: String,
  pub created_at: i64,
}

#[derive(serde::Serialize)]
pub struct MemoryNoteRecord {
  pub id: String,
  pub title: String,
  pub body_md: String,
  pub source_session_id: Option<String>,
  pub tags_json: Option<String>,
  pub created_at: i64,
}

#[derive(serde::Serialize)]
pub struct AuditRecord {
  pub id: String,
  pub session_id: String,
  pub event_type: String,
  pub tool_name: Option<String>,
  pub risk_level: String,
  pub user_approved: i64,
  pub created_at: i64,
}

fn map_tool_call_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ToolCallRecord> {
  Ok(ToolCallRecord {
    id: row.get(0)?,
    session_id: row.get(1)?,
    tool_name: row.get(2)?,
    args_json: row.get(3)?,
    status: row.get(4)?,
    output_summary_json: row.get(5)?,
    stdout_excerpt: row.get(6)?,
    stderr_excerpt: row.get(7)?,
    exit_code: row.get(8)?,
    duration_ms: row.get(9)?,
    raw_output_file_id: row.get(10)?,
    egress_policy: row.get(11)?,
    created_at: row.get(12)?,
    updated_at: row.get(13)?,
  })
}

pub fn init_db(db_dir: &Path, key: &str) -> anyhow::Result<DbState> {
  fs::create_dir_all(db_dir)?;
  let db_path = db_dir.join("arx.db");
  let conn = open_conn(&db_path, key)?;
  run_migrations(&conn)?;

  Ok(DbState {
    db_path,
    key: key.to_string(),
  })
}

fn run_migrations(conn: &Connection) -> anyhow::Result<()> {
  conn.execute_batch(
    "
    CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_state (
      session_id TEXT PRIMARY KEY,
      last_message_id TEXT,
      last_message_at INTEGER,
      last_response_id TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_tags (
      session_id TEXT NOT NULL,
      community_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id, community_id),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      status TEXT NOT NULL,
      output_summary_json TEXT,
      stdout_excerpt TEXT,
      stderr_excerpt TEXT,
      exit_code INTEGER,
      duration_ms INTEGER,
      raw_output_file_id TEXT,
      egress_policy TEXT NOT NULL DEFAULT 'redact_then_send',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      risk_level TEXT NOT NULL,
      user_approved INTEGER NOT NULL,
      args_hash TEXT,
      command_preview_redacted TEXT,
      command_full_encrypted TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS personal_memory_items (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL,
      source_session_id TEXT,
      tags_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_notes_fts
    USING fts5(
      title,
      body_md,
      content='memory_notes',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS memory_notes_ai AFTER INSERT ON memory_notes BEGIN
      INSERT INTO memory_notes_fts(rowid, title, body_md)
      VALUES (new.rowid, new.title, new.body_md);
    END;

    CREATE TRIGGER IF NOT EXISTS memory_notes_ad AFTER DELETE ON memory_notes BEGIN
      INSERT INTO memory_notes_fts(memory_notes_fts, rowid, title, body_md)
      VALUES('delete', old.rowid, old.title, old.body_md);
    END;

    CREATE TRIGGER IF NOT EXISTS memory_notes_au AFTER UPDATE ON memory_notes BEGIN
      INSERT INTO memory_notes_fts(memory_notes_fts, rowid, title, body_md)
      VALUES('delete', old.rowid, old.title, old.body_md);
      INSERT INTO memory_notes_fts(rowid, title, body_md)
      VALUES (new.rowid, new.title, new.body_md);
    END;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      root_path TEXT NOT NULL,
      git_root TEXT,
      git_remote TEXT,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(fingerprint)
    );

    CREATE TABLE IF NOT EXISTS memory_blocks (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_id TEXT,
      value TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'md',
      char_limit INTEGER NOT NULL DEFAULT 4000,
      read_only INTEGER NOT NULL DEFAULT 0,
      egress_policy TEXT NOT NULL DEFAULT 'redact_then_send',
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(label, scope, scope_id)
    );

    CREATE TABLE IF NOT EXISTS context_injections (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      trigger_message_id TEXT,
      project_id TEXT,
      injected_blocks_json TEXT NOT NULL,
      injected_tool_calls_json TEXT NOT NULL,
      injected_notes_json TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      session_id TEXT,
      community_id TEXT,
      kind TEXT NOT NULL,
      local_path TEXT,
      cloud_object_key TEXT,
      sha256 TEXT,
      size_bytes INTEGER NOT NULL,
      pinned_local INTEGER NOT NULL,
      cache_evictable INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    ",
  )?;

  let _ = conn.execute("ALTER TABLE session_state ADD COLUMN last_response_id TEXT", []);
  let _ = conn.execute("ALTER TABLE tool_calls ADD COLUMN output_summary_json TEXT", []);
  let _ = conn.execute("ALTER TABLE tool_calls ADD COLUMN stdout_excerpt TEXT", []);
  let _ = conn.execute("ALTER TABLE tool_calls ADD COLUMN stderr_excerpt TEXT", []);
  let _ = conn.execute("ALTER TABLE tool_calls ADD COLUMN exit_code INTEGER", []);
  let _ = conn.execute("ALTER TABLE tool_calls ADD COLUMN duration_ms INTEGER", []);
  let _ = conn.execute("ALTER TABLE tool_calls ADD COLUMN raw_output_file_id TEXT", []);
  let _ = conn.execute(
    "ALTER TABLE tool_calls ADD COLUMN egress_policy TEXT NOT NULL DEFAULT 'redact_then_send'",
    [],
  );
  let _ = conn.execute(
    "INSERT INTO memory_notes_fts(memory_notes_fts) VALUES('rebuild')",
    [],
  );

  Ok(())
}

pub fn now_ts() -> i64 {
  let now = std::time::SystemTime::now();
  now.duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs() as i64
}

pub fn get_ui_state(conn: &Connection, key: &str) -> anyhow::Result<Option<String>> {
  let mut stmt = conn.prepare("SELECT value FROM ui_state WHERE key = ?1")?;
  let result = stmt.query_row(params![key], |row| row.get(0));
  match result {
    Ok(value) => Ok(Some(value)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn set_ui_state(conn: &Connection, key: &str, value: &str) -> anyhow::Result<()> {
  let ts = now_ts();
  conn.execute(
    "INSERT INTO ui_state (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    params![key, value, ts],
  )?;
  Ok(())
}

pub fn delete_ui_state(conn: &Connection, key: &str) -> anyhow::Result<()> {
  conn.execute("DELETE FROM ui_state WHERE key = ?1", params![key])?;
  Ok(())
}

pub fn create_session(conn: &Connection, title: &str) -> anyhow::Result<SessionRecord> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  conn.execute(
    "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
    params![id, title, ts, ts],
  )?;

  Ok(SessionRecord {
    id,
    title: title.to_string(),
    created_at: ts,
    updated_at: ts,
  })
}

pub fn list_sessions(conn: &Connection) -> anyhow::Result<Vec<SessionRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC",
  )?;

  let rows = stmt.query_map([], |row| {
    Ok(SessionRecord {
      id: row.get(0)?,
      title: row.get(1)?,
      created_at: row.get(2)?,
      updated_at: row.get(3)?,
    })
  })?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }

  Ok(out)
}

fn map_project_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRecord> {
  Ok(ProjectRecord {
    id: row.get(0)?,
    name: row.get(1)?,
    root_path: row.get(2)?,
    git_root: row.get(3)?,
    git_remote: row.get(4)?,
    fingerprint: row.get(5)?,
    created_at: row.get(6)?,
    updated_at: row.get(7)?,
  })
}

pub fn get_project_by_id(
  conn: &Connection,
  project_id: &str,
) -> anyhow::Result<Option<ProjectRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, name, root_path, git_root, git_remote, fingerprint, created_at, updated_at FROM projects WHERE id = ?1",
  )?;
  let result = stmt.query_row(params![project_id], map_project_row);
  match result {
    Ok(value) => Ok(Some(value)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn get_project_by_fingerprint(
  conn: &Connection,
  fingerprint: &str,
) -> anyhow::Result<Option<ProjectRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, name, root_path, git_root, git_remote, fingerprint, created_at, updated_at FROM projects WHERE fingerprint = ?1",
  )?;
  let result = stmt.query_row(params![fingerprint], map_project_row);
  match result {
    Ok(value) => Ok(Some(value)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn upsert_project(
  conn: &Connection,
  name: Option<&str>,
  root_path: &str,
  git_root: Option<&str>,
  git_remote: Option<&str>,
  fingerprint: &str,
) -> anyhow::Result<ProjectRecord> {
  let ts = now_ts();
  if let Some(existing) = get_project_by_fingerprint(conn, fingerprint)? {
    conn.execute(
      "UPDATE projects SET name = ?1, root_path = ?2, git_root = ?3, git_remote = ?4, updated_at = ?5 WHERE id = ?6",
      params![
        name,
        root_path,
        git_root,
        git_remote,
        ts,
        existing.id
      ],
    )?;
    return Ok(ProjectRecord {
      id: existing.id,
      name: name.map(|value| value.to_string()),
      root_path: root_path.to_string(),
      git_root: git_root.map(|value| value.to_string()),
      git_remote: git_remote.map(|value| value.to_string()),
      fingerprint: fingerprint.to_string(),
      created_at: existing.created_at,
      updated_at: ts,
    });
  }

  let id = Uuid::new_v4().to_string();
  conn.execute(
    "INSERT INTO projects (id, name, root_path, git_root, git_remote, fingerprint, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    params![id, name, root_path, git_root, git_remote, fingerprint, ts, ts],
  )?;
  Ok(ProjectRecord {
    id,
    name: name.map(|value| value.to_string()),
    root_path: root_path.to_string(),
    git_root: git_root.map(|value| value.to_string()),
    git_remote: git_remote.map(|value| value.to_string()),
    fingerprint: fingerprint.to_string(),
    created_at: ts,
    updated_at: ts,
  })
}

fn map_memory_block_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryBlockRecord> {
  Ok(MemoryBlockRecord {
    id: row.get(0)?,
    label: row.get(1)?,
    scope: row.get(2)?,
    scope_id: row.get(3)?,
    value: row.get(4)?,
    format: row.get(5)?,
    char_limit: row.get(6)?,
    read_only: row.get(7)?,
    egress_policy: row.get(8)?,
    description: row.get(9)?,
    created_at: row.get(10)?,
    updated_at: row.get(11)?,
  })
}

pub fn list_memory_blocks(
  conn: &Connection,
  scope: &str,
  scope_id: Option<&str>,
) -> anyhow::Result<Vec<MemoryBlockRecord>> {
  let mut stmt = if scope_id.is_some() {
    conn.prepare(
      "SELECT id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at FROM memory_blocks WHERE scope = ?1 AND scope_id = ?2 ORDER BY label ASC",
    )?
  } else {
    conn.prepare(
      "SELECT id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at FROM memory_blocks WHERE scope = ?1 AND scope_id IS NULL ORDER BY label ASC",
    )?
  };
  let rows = if let Some(scope_id) = scope_id {
    stmt.query_map(params![scope, scope_id], map_memory_block_row)?
  } else {
    stmt.query_map(params![scope], map_memory_block_row)?
  };
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn search_memory_notes(
  conn: &Connection,
  query: &str,
  limit: usize,
) -> anyhow::Result<Vec<MemoryNoteRecord>> {
  let mut stmt = conn.prepare(
    "SELECT m.id, m.title, m.body_md, m.source_session_id, m.tags_json, m.created_at
     FROM memory_notes_fts fts
     JOIN memory_notes m ON m.rowid = fts.rowid
     WHERE fts MATCH ?1
     ORDER BY bm25(fts)
     LIMIT ?2",
  )?;
  let rows = stmt.query_map(params![query, limit as i64], |row| {
    Ok(MemoryNoteRecord {
      id: row.get(0)?,
      title: row.get(1)?,
      body_md: row.get(2)?,
      source_session_id: row.get(3)?,
      tags_json: row.get(4)?,
      created_at: row.get(5)?,
    })
  })?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn create_memory_note(
  conn: &Connection,
  title: &str,
  body_md: &str,
  source_session_id: Option<&str>,
  tags: Option<Vec<String>>,
) -> anyhow::Result<MemoryNoteRecord> {
  let trimmed_title = title.trim();
  let trimmed_body = body_md.trim();
  if trimmed_title.is_empty() {
    return Err(anyhow::anyhow!("title is required"));
  }
  if trimmed_body.is_empty() {
    return Err(anyhow::anyhow!("body is required"));
  }
  let (_redacted_title, title_report) = context::redact_secrets(trimmed_title);
  if !title_report.redactions.is_empty() {
    return Err(anyhow::anyhow!("blocked: sensitive content detected"));
  }
  let (_redacted_body, body_report) = context::redact_secrets(trimmed_body);
  if !body_report.redactions.is_empty() {
    return Err(anyhow::anyhow!("blocked: sensitive content detected"));
  }
  let tags_clean = tags
    .unwrap_or_default()
    .into_iter()
    .map(|tag| tag.trim().to_string())
    .filter(|tag| !tag.is_empty())
    .collect::<Vec<_>>();
  let tags_json = if tags_clean.is_empty() {
    None
  } else {
    Some(serde_json::to_string(&tags_clean)?)
  };
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();
  conn.execute(
    "INSERT INTO memory_notes (id, title, body_md, source_session_id, tags_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    params![id, trimmed_title, trimmed_body, source_session_id, tags_json, ts],
  )?;
  Ok(MemoryNoteRecord {
    id,
    title: trimmed_title.to_string(),
    body_md: trimmed_body.to_string(),
    source_session_id: source_session_id.map(|id| id.to_string()),
    tags_json,
    created_at: ts,
  })
}

pub fn ensure_memory_block(
  conn: &Connection,
  label: &str,
  scope: &str,
  scope_id: Option<&str>,
  value: &str,
  format: &str,
  char_limit: i64,
  read_only: bool,
  egress_policy: &str,
  description: Option<&str>,
) -> anyhow::Result<()> {
  let mut exists_stmt = if scope_id.is_some() {
    conn.prepare(
      "SELECT 1 FROM memory_blocks WHERE label = ?1 AND scope = ?2 AND scope_id = ?3",
    )?
  } else {
    conn.prepare(
      "SELECT 1 FROM memory_blocks WHERE label = ?1 AND scope = ?2 AND scope_id IS NULL",
    )?
  };
  let exists = if let Some(scope_id) = scope_id {
    exists_stmt.query_row(params![label, scope, scope_id], |_| Ok(()))
  } else {
    exists_stmt.query_row(params![label, scope], |_| Ok(()))
  };
  if exists.is_ok() {
    return Ok(());
  }

  let id = Uuid::new_v4().to_string();
  let ts = now_ts();
  conn.execute(
    "INSERT INTO memory_blocks (id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    params![
      id,
      label,
      scope,
      scope_id,
      value,
      format,
      char_limit,
      if read_only { 1 } else { 0 },
      egress_policy,
      description,
      ts,
      ts,
    ],
  )?;
  Ok(())
}

pub fn get_memory_block_by_label(
  conn: &Connection,
  label: &str,
  scope: &str,
  scope_id: Option<&str>,
) -> anyhow::Result<Option<MemoryBlockRecord>> {
  let mut stmt = if scope_id.is_some() {
    conn.prepare(
      "SELECT id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at
       FROM memory_blocks WHERE label = ?1 AND scope = ?2 AND scope_id = ?3",
    )?
  } else {
    conn.prepare(
      "SELECT id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at
       FROM memory_blocks WHERE label = ?1 AND scope = ?2 AND scope_id IS NULL",
    )?
  };
  let result = if let Some(scope_id) = scope_id {
    stmt.query_row(params![label, scope, scope_id], map_memory_block_row)
  } else {
    stmt.query_row(params![label, scope], map_memory_block_row)
  };
  match result {
    Ok(record) => Ok(Some(record)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn ensure_session_resume_block(
  conn: &Connection,
  session_id: &str,
) -> anyhow::Result<MemoryBlockRecord> {
  if let Some(block) = get_memory_block_by_label(conn, "session_resume", "session", Some(session_id))? {
    return Ok(block);
  }
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();
  let value = "objective: null\nstatus: null\nlast_tool_results: []\nnext_steps: []\nblockers: []\n";
  conn.execute(
    "INSERT INTO memory_blocks (id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    params![
      id,
      "session_resume",
      "session",
      session_id,
      value,
      "yaml",
      2000,
      0,
      "redact_then_send",
      "Session checkpoint summary",
      ts,
      ts,
    ],
  )?;
  get_memory_block_by_label(conn, "session_resume", "session", Some(session_id))?
    .ok_or_else(|| anyhow::anyhow!("session resume block not found after insert"))
}

pub fn update_memory_block_value(
  conn: &Connection,
  block_id: &str,
  value: &str,
) -> anyhow::Result<()> {
  let ts = now_ts();
  conn.execute(
    "UPDATE memory_blocks SET value = ?1, updated_at = ?2 WHERE id = ?3",
    params![value, ts, block_id],
  )?;
  Ok(())
}

pub fn update_memory_block_direct(
  conn: &Connection,
  label: &str,
  scope: &str,
  scope_id: Option<&str>,
  value: &str,
) -> anyhow::Result<MemoryBlockRecord> {
  let block = get_memory_block_by_label(conn, label, scope, scope_id)?
    .ok_or_else(|| anyhow::anyhow!("memory block not found"))?;
  if block.read_only != 0 {
    return Err(anyhow::anyhow!("memory block is read-only"));
  }
  if value.trim().is_empty() {
    return Err(anyhow::anyhow!("value is empty"));
  }
  let (_redacted, report) = context::redact_secrets(value);
  if !report.redactions.is_empty() {
    return Err(anyhow::anyhow!("blocked: sensitive content detected"));
  }
  if value.chars().count() as i64 > block.char_limit {
    return Err(anyhow::anyhow!("value exceeds char limit"));
  }
  update_memory_block_value(conn, &block.id, value)?;
  get_memory_block_by_id(conn, &block.id)?
    .ok_or_else(|| anyhow::anyhow!("memory block missing after update"))
}

fn set_yaml_scalar(content: &str, key: &str, value: &str) -> String {
  let mut lines: Vec<String> = Vec::new();
  let mut found = false;
  let key_prefix = format!("{key}:");
  let escaped_value = value.replace('\'', "''");
  let rendered_value = format!("'{escaped_value}'");

  for line in content.lines() {
    let trimmed = line.trim_start();
    let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
    if !found && trimmed.starts_with(&key_prefix) && !trimmed.starts_with('-') {
      lines.push(format!("{indent}{key}: {rendered_value}"));
      found = true;
    } else {
      lines.push(line.to_string());
    }
  }

  if !found {
    if !lines.is_empty() {
      lines.push(format!("{key}: {rendered_value}"));
    } else {
      lines = vec![format!("{key}: {rendered_value}")];
    }
  }

  lines.join("\n")
}

pub fn update_working_set_last_action(
  conn: &Connection,
  project_id: &str,
  action: &str,
) -> anyhow::Result<()> {
  if action.trim().is_empty() {
    return Ok(());
  }
  let block = match get_memory_block_by_label(conn, "working_set", "project", Some(project_id))? {
    Some(block) => block,
    None => return Ok(()),
  };
  if block.read_only != 0 {
    return Ok(());
  }
  let updated = if block.format.to_lowercase() == "yaml" {
    set_yaml_scalar(&block.value, "last_action", action.trim())
  } else {
    format!("{}\nlast_action: {}", block.value.trim(), action.trim())
  };
  update_memory_block_value(conn, &block.id, &updated)?;
  Ok(())
}

fn get_memory_block_by_id(
  conn: &Connection,
  block_id: &str,
) -> anyhow::Result<Option<MemoryBlockRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, label, scope, scope_id, value, format, char_limit, read_only, egress_policy, description, created_at, updated_at
     FROM memory_blocks WHERE id = ?1",
  )?;
  let result = stmt.query_row(params![block_id], map_memory_block_row);
  match result {
    Ok(record) => Ok(Some(record)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn add_message(
  conn: &Connection,
  session_id: &str,
  role: &str,
  content_json: &str,
) -> anyhow::Result<()> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  conn.execute(
    "INSERT INTO messages (id, session_id, role, content_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    params![id, session_id, role, content_json, ts],
  )?;

  conn.execute(
    "INSERT INTO session_state (session_id, last_message_id, last_message_at, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(session_id) DO UPDATE SET last_message_id = excluded.last_message_id, last_message_at = excluded.last_message_at, updated_at = excluded.updated_at",
    params![session_id, id, ts, ts],
  )?;

  conn.execute(
    "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
    params![ts, session_id],
  )?;

  Ok(())
}

pub fn get_session_resume(conn: &Connection, session_id: &str) -> anyhow::Result<SessionResume> {
  let mut stmt = conn.prepare(
    "SELECT session_id, last_message_id, last_message_at, last_response_id FROM session_state WHERE session_id = ?1",
  )?;
  let result = stmt.query_row(params![session_id], |row| {
    Ok(SessionResume {
      session_id: row.get(0)?,
      last_message_id: row.get(1).ok(),
      last_message_at: row.get(2).ok(),
      last_response_id: row.get(3).ok(),
    })
  });
  match result {
    Ok(value) => Ok(value),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(SessionResume {
      session_id: session_id.to_string(),
      last_message_id: None,
      last_message_at: None,
      last_response_id: None,
    }),
    Err(err) => Err(err.into()),
  }
}

pub fn list_messages(conn: &Connection, session_id: &str) -> anyhow::Result<Vec<MessageRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, session_id, role, content_json, created_at FROM messages WHERE session_id = ?1 ORDER BY created_at ASC",
  )?;

  let rows = stmt.query_map(params![session_id], |row| {
    Ok(MessageRecord {
      id: row.get(0)?,
      session_id: row.get(1)?,
      role: row.get(2)?,
      content_json: row.get(3)?,
      created_at: row.get(4)?,
    })
  })?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }

  Ok(out)
}

pub fn propose_tool_call(
  conn: &Connection,
  session_id: &str,
  tool_name: &str,
  args_json: &str,
  risk_level: &str,
  command_preview_redacted: &str,
  tool_call_id_override: Option<&str>,
) -> anyhow::Result<ToolCallRecord> {
  validate_tool_call(tool_name, args_json)?;
  let id = tool_call_id_override
    .map(|value| value.to_string())
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let ts = now_ts();

  conn.execute(
    "INSERT INTO tool_calls (id, session_id, tool_name, args_json, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'proposed', ?5, ?6)",
    params![id, session_id, tool_name, args_json, ts, ts],
  )?;

  append_audit_log(
    conn,
    session_id,
    "propose",
    Some(tool_name),
    risk_level,
    0,
    None,
    Some(command_preview_redacted),
    None,
  )?;

  Ok(ToolCallRecord {
    id,
    session_id: session_id.to_string(),
    tool_name: tool_name.to_string(),
    args_json: args_json.to_string(),
    status: "proposed".to_string(),
    output_summary_json: None,
    stdout_excerpt: None,
    stderr_excerpt: None,
    exit_code: None,
    duration_ms: None,
    raw_output_file_id: None,
    egress_policy: "redact_then_send".to_string(),
    created_at: ts,
    updated_at: ts,
  })
}

fn validate_tool_call(tool_name: &str, args_json: &str) -> anyhow::Result<()> {
  crate::tool_handlers::validate_tool_args_json(tool_name, args_json)
}

pub fn list_tool_calls(conn: &Connection, session_id: &str) -> anyhow::Result<Vec<ToolCallRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, session_id, tool_name, args_json, status, output_summary_json, stdout_excerpt, stderr_excerpt, exit_code, duration_ms, raw_output_file_id, egress_policy, created_at, updated_at FROM tool_calls WHERE session_id = ?1 ORDER BY created_at DESC",
  )?;

  let rows = stmt.query_map(params![session_id], map_tool_call_row)?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }

  Ok(out)
}

pub fn list_tool_calls_by_status_since(
  conn: &Connection,
  session_id: &str,
  status: &str,
  min_created_at: i64,
) -> anyhow::Result<Vec<ToolCallRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, session_id, tool_name, args_json, status, output_summary_json, stdout_excerpt, stderr_excerpt, exit_code, duration_ms, raw_output_file_id, egress_policy, created_at, updated_at FROM tool_calls WHERE session_id = ?1 AND status = ?2 AND created_at >= ?3 ORDER BY created_at ASC",
  )?;
  let rows = stmt.query_map(params![session_id, status, min_created_at], map_tool_call_row)?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn get_tool_call_status(conn: &Connection, tool_call_id: &str) -> anyhow::Result<String> {
  let mut stmt = conn.prepare("SELECT status FROM tool_calls WHERE id = ?1")?;
  let status = stmt.query_row(params![tool_call_id], |row| row.get(0))?;
  Ok(status)
}

pub fn get_tool_call(conn: &Connection, tool_call_id: &str) -> anyhow::Result<ToolCallRecord> {
  let mut stmt = conn.prepare(
    "SELECT id, session_id, tool_name, args_json, status, output_summary_json, stdout_excerpt, stderr_excerpt, exit_code, duration_ms, raw_output_file_id, egress_policy, created_at, updated_at FROM tool_calls WHERE id = ?1",
  )?;
  let record = stmt.query_row(params![tool_call_id], map_tool_call_row)?;
  Ok(record)
}

pub fn list_tool_calls_with_output(
  conn: &Connection,
  session_id: &str,
  limit: usize,
) -> anyhow::Result<Vec<ToolCallRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, session_id, tool_name, args_json, status, output_summary_json, stdout_excerpt, stderr_excerpt, exit_code, duration_ms, raw_output_file_id, egress_policy, created_at, updated_at FROM tool_calls WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2",
  )?;
  let rows = stmt.query_map(params![session_id, limit as i64], map_tool_call_row)?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn update_tool_call_status(
  conn: &Connection,
  tool_call_id: &str,
  status: &str,
) -> anyhow::Result<()> {
  let ts = now_ts();
  conn.execute(
    "UPDATE tool_calls SET status = ?1, updated_at = ?2 WHERE id = ?3",
    params![status, ts, tool_call_id],
  )?;
  Ok(())
}

pub fn update_tool_call_output(
  conn: &Connection,
  tool_call_id: &str,
  output_summary_json: Option<&str>,
  stdout_excerpt: Option<&str>,
  stderr_excerpt: Option<&str>,
  exit_code: Option<i32>,
  duration_ms: Option<i64>,
  raw_output_file_id: Option<&str>,
  egress_policy: Option<&str>,
) -> anyhow::Result<()> {
  let ts = now_ts();
  conn.execute(
    "UPDATE tool_calls SET output_summary_json = ?1, stdout_excerpt = ?2, stderr_excerpt = ?3, exit_code = ?4, duration_ms = ?5, raw_output_file_id = ?6, egress_policy = ?7, updated_at = ?8 WHERE id = ?9",
    params![
      output_summary_json,
      stdout_excerpt,
      stderr_excerpt,
      exit_code,
      duration_ms,
      raw_output_file_id,
      egress_policy,
      ts,
      tool_call_id,
    ],
  )?;
  Ok(())
}

pub fn append_audit_log(
  conn: &Connection,
  session_id: &str,
  event_type: &str,
  tool_name: Option<&str>,
  risk_level: &str,
  user_approved: i32,
  args_hash: Option<&str>,
  command_preview_redacted: Option<&str>,
  command_full_encrypted: Option<&str>,
) -> anyhow::Result<()> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  conn.execute(
    "INSERT INTO audit_log (id, session_id, event_type, tool_name, risk_level, user_approved, args_hash, command_preview_redacted, command_full_encrypted, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    params![
      id,
      session_id,
      event_type,
      tool_name,
      risk_level,
      user_approved,
      args_hash,
      command_preview_redacted,
      command_full_encrypted,
      ts
    ],
  )?;

  Ok(())
}

pub fn list_audit_log(conn: &Connection, session_id: &str) -> anyhow::Result<Vec<AuditRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, session_id, event_type, tool_name, risk_level, user_approved, created_at FROM audit_log WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 100",
  )?;

  let rows = stmt.query_map(params![session_id], |row| {
    Ok(AuditRecord {
      id: row.get(0)?,
      session_id: row.get(1)?,
      event_type: row.get(2)?,
      tool_name: row.get(3)?,
      risk_level: row.get(4)?,
      user_approved: row.get(5)?,
      created_at: row.get(6)?,
    })
  })?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }

  Ok(out)
}

pub fn db_path(base_dir: &Path) -> PathBuf {
  base_dir.join("arx")
}

pub fn open_conn(db_path: &Path, key: &str) -> anyhow::Result<Connection> {
  let conn = Connection::open(db_path)?;
  conn.pragma_update(None, "key", key)?;
  conn.pragma_update(None, "foreign_keys", "ON")?;
  Ok(conn)
}

#[cfg(test)]
mod tests {
  use super::validate_tool_call;

  #[test]
  fn validates_run_shell_command_fields() {
    // command is required; shell/cwd are optional (defaulted in agent.rs)
    let ok = r#"{"command":"rg --files","shell":"zsh","cwd":"."}"#;
    assert!(validate_tool_call("run_shell_command", ok).is_ok());
    let missing_cmd = r#"{"command":"","shell":"zsh","cwd":"."}"#;
    assert!(validate_tool_call("run_shell_command", missing_cmd).is_err());
    let minimal = r#"{"command":"rg --files"}"#;
    assert!(validate_tool_call("run_shell_command", minimal).is_ok());
  }

  #[test]
  fn validates_read_file_fields() {
    // file_path is required; offset/limit are optional (defaulted in agent.rs)
    let ok = r#"{"file_path":"src/lib.rs","offset":1,"limit":1}"#;
    assert!(validate_tool_call("read_file", ok).is_ok());
    let missing_path = r#"{"file_path":"","offset":1,"limit":1}"#;
    assert!(validate_tool_call("read_file", missing_path).is_err());
    let minimal = r#"{"file_path":"src/lib.rs"}"#;
    assert!(validate_tool_call("read_file", minimal).is_ok());
  }

  #[test]
  fn validates_grep_files_fields() {
    let ok = r#"{"pattern":"foo","path":"."}"#;
    assert!(validate_tool_call("grep_files", ok).is_ok());
    let missing_pattern = r#"{"pattern":"","path":"."}"#;
    assert!(validate_tool_call("grep_files", missing_pattern).is_err());
  }
}
