use rusqlite::{params, Connection};
use crate::context;
use anyhow::Context as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
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
pub struct ThreadRecord {
  pub id: String,
  pub title: Option<String>,
  pub engine_id: String,
  pub model_id: Option<String>,
  pub workspace_path: Option<String>,
  pub community_id: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
  pub last_event_at: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct EventRecord {
  pub id: String,
  pub thread_id: String,
  pub r#type: String,
  pub created_at: i64,
  pub text: Option<String>,
  pub payload_json: Option<String>,
  pub blob_ref: Option<String>,
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
pub struct PersonalMemoryItemRecord {
  pub id: String,
  pub content: String,
  pub scope: String,
  pub scope_id: Option<String>,
  pub pinned: i64,
  pub provenance_event_id: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
}

pub fn init_db(db_dir: &Path, key: &str) -> anyhow::Result<DbState> {
  fs::create_dir_all(db_dir)?;
  let db_path = db_dir.join("arx.db");
  init_db_at(&db_path, key)
}

pub fn init_db_at(db_path: &Path, key: &str) -> anyhow::Result<DbState> {
  let conn = open_conn(db_path, key)?;
  run_migrations(&conn).with_context(|| {
    format!(
      "db migrations failed for {}",
      db_path.to_string_lossy().to_string()
    )
  })?;

  Ok(DbState {
    db_path: db_path.to_path_buf(),
    key: key.to_string(),
  })
}

pub fn backup_db_files(db_dir: &Path) -> anyhow::Result<bool> {
  let db_path = db_dir.join("arx.db");
  if !db_path.exists() {
    return Ok(true);
  }
  let ts = now_ts();
  for suffix in ["", "-wal", "-shm"] {
    let from = db_dir.join(format!("arx.db{}", suffix));
    if !from.exists() {
      continue;
    }
    let to = db_dir.join(format!("arx.db.bak.{}{}", ts, suffix));
    match fs::rename(&from, &to) {
      Ok(()) => {}
      Err(rename_err) => {
        fs::copy(&from, &to).with_context(|| {
          format!(
            "failed to back up DB file {} to {} after rename error: {rename_err}",
            from.to_string_lossy(),
            to.to_string_lossy()
          )
        })?;
        fs::remove_file(&from).with_context(|| {
          format!(
            "failed to remove original DB file after backup ({}); the DB may be locked",
            from.to_string_lossy()
          )
        })?;
      }
    }
  }
  Ok(true)
}

fn run_migrations(conn: &Connection) -> anyhow::Result<()> {
  migrate_legacy_personal_memory_items(conn)
    .context("migrations: migrate legacy personal_memory_items schema")?;
  migrate_threads_harness_to_engine(conn)
    .context("migrations: migrate threads harness_id to engine_id/model_id")?;

  conn
    .execute_batch(
      "
    CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );

    -- Legacy internal tool tables removed for MVP (threads/events are the only truth).

    CREATE TABLE IF NOT EXISTS personal_memory_items (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_id TEXT,
      pinned INTEGER DEFAULT 0,
      provenance_event_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_personal_memory_items_scope_updated_at
      ON personal_memory_items(scope, scope_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_personal_memory_items_pinned_updated_at
      ON personal_memory_items(pinned DESC, updated_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS personal_memory_items_fts
    USING fts5(
      content,
      content='personal_memory_items',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS personal_memory_items_ai AFTER INSERT ON personal_memory_items BEGIN
      INSERT INTO personal_memory_items_fts(rowid, content)
      VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS personal_memory_items_ad AFTER DELETE ON personal_memory_items BEGIN
      INSERT INTO personal_memory_items_fts(personal_memory_items_fts, rowid, content)
      VALUES('delete', old.rowid, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS personal_memory_items_au AFTER UPDATE ON personal_memory_items BEGIN
      INSERT INTO personal_memory_items_fts(personal_memory_items_fts, rowid, content)
      VALUES('delete', old.rowid, old.content);
      INSERT INTO personal_memory_items_fts(rowid, content)
      VALUES (new.rowid, new.content);
    END;

    -- Legacy UI feature: local notes (not part of MVP contract truth yet).
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

    -- Legacy UI feature: workspace/project cache (threads.workspace_path is the contract primitive).
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

    -- Legacy UI feature: template-backed blocks (contract target is flat personal_memory_items).
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

    -- ============================================================
    -- Contract-aligned schema (MVP ground truth)
    -- ============================================================

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT,
      engine_id TEXT NOT NULL,
      model_id TEXT,
      workspace_path TEXT,
      community_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
      updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
      last_event_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      text TEXT,
      payload_json TEXT,
      blob_ref TEXT,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_thread_created_at
      ON events(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_thread_type_created_at
      ON events(thread_id, type, created_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts
    USING fts5(
      text,
      thread_id UNINDEXED,
      content='events',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
      INSERT INTO events_fts(rowid, text, thread_id)
      VALUES (new.rowid, new.text, new.thread_id);
    END;

    CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, text, thread_id)
      VALUES('delete', old.rowid, old.text, old.thread_id);
    END;

    CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, text, thread_id)
      VALUES('delete', old.rowid, old.text, old.thread_id);
      INSERT INTO events_fts(rowid, text, thread_id)
      VALUES (new.rowid, new.text, new.thread_id);
    END;

    CREATE TABLE IF NOT EXISTS community_artifacts_cache (
      artifact_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL,
      visibility TEXT NOT NULL,
      injectable INTEGER NOT NULL,
      pinned INTEGER NOT NULL,
      helpful_count INTEGER DEFAULT 0,
      unhelpful_count INTEGER DEFAULT 0,
      author_name TEXT,
      content_hash TEXT,
      fetched_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS community_artifacts_cache_fts
    USING fts5(
      title,
      body_md,
      content='community_artifacts_cache',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS community_artifacts_cache_ai AFTER INSERT ON community_artifacts_cache BEGIN
      INSERT INTO community_artifacts_cache_fts(rowid, title, body_md)
      VALUES (new.rowid, new.title, new.body_md);
    END;

    CREATE TRIGGER IF NOT EXISTS community_artifacts_cache_ad AFTER DELETE ON community_artifacts_cache BEGIN
      INSERT INTO community_artifacts_cache_fts(community_artifacts_cache_fts, rowid, title, body_md)
      VALUES('delete', old.rowid, old.title, old.body_md);
    END;

    CREATE TRIGGER IF NOT EXISTS community_artifacts_cache_au AFTER UPDATE ON community_artifacts_cache BEGIN
      INSERT INTO community_artifacts_cache_fts(community_artifacts_cache_fts, rowid, title, body_md)
      VALUES('delete', old.rowid, old.title, old.body_md);
      INSERT INTO community_artifacts_cache_fts(rowid, title, body_md)
      VALUES (new.rowid, new.title, new.body_md);
    END;
    ",
    )
    .context("migrations: create/update tables + FTS triggers")?;

  // Old ALTERs left intentionally removed; legacy tables may still exist in older DBs.
  let _ = conn.execute(
    "INSERT INTO memory_notes_fts(memory_notes_fts) VALUES('rebuild')",
    [],
  );

  backfill_contract_tables(conn).context("migrations: backfill threads/events from legacy tables")?;

  Ok(())
}

fn migrate_legacy_personal_memory_items(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "personal_memory_items")? {
    return Ok(());
  }

  let mut stmt = conn.prepare("PRAGMA table_info('personal_memory_items')")?;
  let cols = stmt
    .query_map([], |row| row.get::<_, String>(1))?
    .collect::<Result<Vec<_>, _>>()?;

  // Contract schema already present.
  if cols.iter().any(|c| c == "content") {
    return Ok(());
  }

  // Known legacy schema (key/value).
  let has_key = cols.iter().any(|c| c == "key");
  let has_value = cols.iter().any(|c| c == "value");
  if !(has_key && has_value) {
    // Unknown legacy shape; leave untouched.
    return Ok(());
  }

  if table_exists(conn, "personal_memory_items_kv")? {
    return Ok(());
  }

  conn.execute(
    "ALTER TABLE personal_memory_items RENAME TO personal_memory_items_kv",
    [],
  )?;

  Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> anyhow::Result<bool> {
  let mut stmt = conn.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
  )?;
  let result = stmt.query_row(params![name], |row| row.get::<_, i64>(0));
  match result {
    Ok(_) => Ok(true),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
    Err(err) => Err(err.into()),
  }
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> anyhow::Result<bool> {
  let mut stmt = conn.prepare(&format!("PRAGMA table_info('{}')", table))?;
  let cols = stmt
    .query_map([], |row| row.get::<_, String>(1))?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(cols.iter().any(|c| c == column))
}

fn migrate_threads_harness_to_engine(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "threads")? {
    return Ok(());
  }

  let has_engine_id = column_exists(conn, "threads", "engine_id")?;
  let has_harness_id = column_exists(conn, "threads", "harness_id")?;
  let has_model_id = column_exists(conn, "threads", "model_id")?;

  // Already in contract shape; add model_id if older DB predates OpenRouter support.
  if has_engine_id {
    if !has_model_id {
      let _ = conn.execute("ALTER TABLE threads ADD COLUMN model_id TEXT", []);
    }
    return Ok(());
  }

  // Migrate Claude's harness_id schema back to contract engine_id.
  if has_harness_id {
    conn.execute_batch(
      "
      CREATE TABLE threads_new (
        id TEXT PRIMARY KEY,
        title TEXT,
        engine_id TEXT NOT NULL,
        model_id TEXT,
        workspace_path TEXT,
        community_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
        updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
        last_event_at INTEGER
      );

      INSERT INTO threads_new (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
      SELECT
        id,
        title,
        CASE
          WHEN harness_id IS NOT NULL AND TRIM(harness_id) <> '' THEN harness_id
          WHEN model_id IS NOT NULL AND TRIM(model_id) <> '' THEN 'openrouter_chat'
          ELSE 'codex_cli'
        END,
        model_id,
        workspace_path,
        community_id,
        created_at,
        updated_at,
        last_event_at
      FROM threads;

      DROP TABLE threads;

      ALTER TABLE threads_new RENAME TO threads;
      "
    )?;
  }

  Ok(())
}

fn backfill_contract_tables(conn: &Connection) -> anyhow::Result<()> {
  let has_sessions = table_exists(conn, "sessions")?;
  let has_messages = table_exists(conn, "messages")?;

  // Threads: 1:1 with legacy sessions (same id), best-effort defaults.
  if has_sessions {
    if table_exists(conn, "session_state")? {
      conn.execute(
        "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
         SELECT
           s.id,
           s.title,
           'codex_cli',
           NULL,
           NULL,
           NULL,
           COALESCE(s.created_at, CAST(strftime('%s','now') AS INTEGER)),
           COALESCE(s.updated_at, s.created_at, CAST(strftime('%s','now') AS INTEGER)),
           COALESCE(ss.last_message_at, COALESCE(s.updated_at, s.created_at))
         FROM sessions s
         LEFT JOIN session_state ss ON ss.session_id = s.id
         WHERE NOT EXISTS (SELECT 1 FROM threads t WHERE t.id = s.id)",
        [],
      )
      .context("backfill: insert threads from sessions + session_state")?;
    } else {
      conn.execute(
        "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
         SELECT
           s.id,
           s.title,
           'codex_cli',
           NULL,
           NULL,
           NULL,
           COALESCE(s.created_at, CAST(strftime('%s','now') AS INTEGER)),
           COALESCE(s.updated_at, s.created_at, CAST(strftime('%s','now') AS INTEGER)),
           COALESCE(s.updated_at, s.created_at)
         FROM sessions s
         WHERE NOT EXISTS (SELECT 1 FROM threads t WHERE t.id = s.id)",
        [],
      )
      .context("backfill: insert threads from sessions")?;
    }
  }

  // Events: mirror legacy messages. Uses the message id as event id for dedupe.
  if has_messages {
    let mut stmt = conn
      .prepare(
      "SELECT id, session_id, role, content_json, created_at
       FROM messages
       ORDER BY created_at ASC",
      )
      .context("backfill: prepare legacy messages query")?;
    let rows = stmt.query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, i64>(4)?,
      ))
    })?;

    for row in rows {
      let (id, thread_id, role, content_json, created_at) = row?;
      // Dedupe: if an event already exists with this id, skip.
      let exists = conn.query_row(
        "SELECT 1 FROM events WHERE id = ?1 LIMIT 1",
        params![id],
        |_r| Ok(true),
      );
      if matches!(exists, Ok(true)) {
        continue;
      }

      let event_type = match role.trim().to_ascii_lowercase().as_str() {
        "user" => "user_message",
        "assistant" => "assistant_message",
        _ => "engine_io_chunk",
      };

      let text = extract_text_from_content_json(&content_json);
      let payload = serde_json::json!({
        "role": role,
        "content": serde_json::from_str::<serde_json::Value>(&content_json).unwrap_or(serde_json::Value::Null)
      });
      let payload_json = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());

      conn.execute(
        "INSERT INTO events (id, thread_id, type, created_at, text, payload_json, blob_ref)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
        params![id, thread_id, event_type, created_at, text.as_deref(), payload_json],
      )
      .with_context(|| format!("backfill: insert event from legacy message {id}"))?;
    }
  }

  // Ensure last_event_at is consistent with events.
  conn.execute(
    "UPDATE threads
     SET last_event_at = (
       SELECT MAX(created_at) FROM events e WHERE e.thread_id = threads.id
     )",
    [],
  )
  .context("backfill: set threads.last_event_at from events")?;

  // Some legacy DBs may have NULL timestamps even if columns are now NOT NULL.
  conn.execute(
    "UPDATE threads
     SET created_at = COALESCE(created_at, updated_at, last_event_at, CAST(strftime('%s','now') AS INTEGER))",
    [],
  )
  .context("backfill: heal threads.created_at NULLs")?;

  // Keep updated_at >= last_event_at for sorting/resume semantics.
  conn.execute(
    "UPDATE threads
     SET updated_at = COALESCE(MAX(updated_at, last_event_at), created_at, CAST(strftime('%s','now') AS INTEGER))",
    [],
  )
  .context("backfill: heal threads.updated_at NULLs")?;

  Ok(())
}

fn extract_text_from_content_json(content_json: &str) -> Option<String> {
  let value: serde_json::Value = serde_json::from_str(content_json).ok()?;
  value
    .get("text")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

pub fn now_ts() -> i64 {
  let now = std::time::SystemTime::now();
  now.duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs() as i64
}

pub fn create_personal_memory_item(
  conn: &Connection,
  content: &str,
  scope: &str,
  scope_id: Option<&str>,
  pinned: bool,
  provenance_event_id: Option<&str>,
) -> anyhow::Result<PersonalMemoryItemRecord> {
  let trimmed = content.trim();
  if trimmed.is_empty() {
    return Err(anyhow::anyhow!("content is required"));
  }
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();
  conn.execute(
    "INSERT INTO personal_memory_items (id, content, scope, scope_id, pinned, provenance_event_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    params![
      id,
      trimmed,
      scope.trim(),
      scope_id,
      if pinned { 1 } else { 0 },
      provenance_event_id,
      ts,
      ts
    ],
  )?;

  Ok(PersonalMemoryItemRecord {
    id,
    content: trimmed.to_string(),
    scope: scope.trim().to_string(),
    scope_id: scope_id.map(|v| v.to_string()),
    pinned: if pinned { 1 } else { 0 },
    provenance_event_id: provenance_event_id.map(|v| v.to_string()),
    created_at: ts,
    updated_at: ts,
  })
}

pub fn list_personal_memory_items(
  conn: &Connection,
  scope: Option<&str>,
  scope_id: Option<&str>,
  limit: usize,
) -> anyhow::Result<Vec<PersonalMemoryItemRecord>> {
  let mut sql =
    "SELECT id, content, scope, scope_id, pinned, provenance_event_id, created_at, updated_at
     FROM personal_memory_items"
      .to_string();
  let mut where_clauses: Vec<&str> = Vec::new();
  if scope.is_some() {
    where_clauses.push("scope = ?1");
  }
  if scope_id.is_some() {
    where_clauses.push("scope_id = ?2");
  }
  if !where_clauses.is_empty() {
    sql.push_str(" WHERE ");
    sql.push_str(&where_clauses.join(" AND "));
  }
  sql.push_str(" ORDER BY pinned DESC, updated_at DESC LIMIT ?3");

  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt.query_map(
    params![scope, scope_id, limit as i64],
    |row| {
      Ok(PersonalMemoryItemRecord {
        id: row.get(0)?,
        content: row.get(1)?,
        scope: row.get(2)?,
        scope_id: row.get(3)?,
        pinned: row.get(4)?,
        provenance_event_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
      })
    },
  )?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn search_personal_memory_items(
  conn: &Connection,
  query: &str,
  limit: usize,
) -> anyhow::Result<Vec<PersonalMemoryItemRecord>> {
  let q = query.trim();
  if q.is_empty() {
    return Ok(Vec::new());
  }

  let mut stmt = conn.prepare(
    "SELECT p.id, p.content, p.scope, p.scope_id, p.pinned, p.provenance_event_id, p.created_at, p.updated_at
     FROM personal_memory_items_fts fts
     JOIN personal_memory_items p ON p.rowid = fts.rowid
     WHERE personal_memory_items_fts MATCH ?1
     ORDER BY p.pinned DESC, p.updated_at DESC
     LIMIT ?2",
  )?;
  let rows = stmt.query_map(params![q, limit as i64], |row| {
    Ok(PersonalMemoryItemRecord {
      id: row.get(0)?,
      content: row.get(1)?,
      scope: row.get(2)?,
      scope_id: row.get(3)?,
      pinned: row.get(4)?,
      provenance_event_id: row.get(5)?,
      created_at: row.get(6)?,
      updated_at: row.get(7)?,
    })
  })?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn set_personal_memory_item_pinned(
  conn: &Connection,
  id: &str,
  pinned: bool,
) -> anyhow::Result<()> {
  let ts = now_ts();
  conn.execute(
    "UPDATE personal_memory_items SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
    params![if pinned { 1 } else { 0 }, ts, id],
  )?;
  Ok(())
}

pub fn delete_personal_memory_item(conn: &Connection, id: &str) -> anyhow::Result<()> {
  conn.execute("DELETE FROM personal_memory_items WHERE id = ?1", params![id])?;
  Ok(())
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

pub fn create_thread(
  conn: &Connection,
  title: &str,
  engine_id: &str,
  model_id: Option<&str>,
) -> anyhow::Result<ThreadRecord> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  conn.execute(
    "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
     VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5, ?6, NULL)",
    params![id, title, engine_id, model_id, ts, ts],
  )?;

  Ok(ThreadRecord {
    id,
    title: Some(title.to_string()),
    engine_id: engine_id.to_string(),
    model_id: model_id.map(|s| s.to_string()),
    workspace_path: None,
    community_id: None,
    created_at: ts,
    updated_at: ts,
    last_event_at: None,
  })
}

/// Legacy wrapper for backward compatibility
pub fn create_session(conn: &Connection, title: &str) -> anyhow::Result<SessionRecord> {
  let thread = create_thread(conn, title, "codex_cli", None)?;
  Ok(SessionRecord {
    id: thread.id,
    title: thread.title.unwrap_or_default(),
    created_at: thread.created_at,
    updated_at: thread.updated_at,
  })
}

pub fn list_sessions(conn: &Connection) -> anyhow::Result<Vec<SessionRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, COALESCE(title, 'Untitled thread'), created_at, updated_at
     FROM threads
     ORDER BY COALESCE(last_event_at, updated_at) DESC",
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

pub fn list_projects(conn: &Connection) -> anyhow::Result<Vec<ProjectRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, name, root_path, git_root, git_remote, fingerprint, created_at, updated_at FROM projects ORDER BY updated_at DESC",
  )?;
  let rows = stmt.query_map([], map_project_row)?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
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

  // Ground truth: events. (messages/session_state are legacy tables and are no longer written.)
  let event_type = match role.trim().to_ascii_lowercase().as_str() {
    "user" => "user_message",
    "assistant" => "assistant_message",
    _ => "engine_io_chunk",
  };
  let text = extract_text_from_content_json(content_json);
  let payload = serde_json::json!({
    "role": role,
    "content": serde_json::from_str::<serde_json::Value>(content_json).unwrap_or(serde_json::Value::Null)
  });
  conn.execute(
    "INSERT INTO events (id, thread_id, type, created_at, text, payload_json, blob_ref)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
    params![
      id,
      session_id,
      event_type,
      ts,
      text.as_deref(),
      serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string())
    ],
  )?;
  conn.execute(
    "UPDATE threads SET updated_at = ?1, last_event_at = ?1 WHERE id = ?2",
    params![ts, session_id],
  )?;

  Ok(())
}

pub fn append_event(
  conn: &Connection,
  thread_id: &str,
  event_type: &str,
  text: Option<&str>,
  payload_json: Option<&str>,
  blob_ref: Option<&str>,
) -> anyhow::Result<EventRecord> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  conn.execute(
    "INSERT INTO events (id, thread_id, type, created_at, text, payload_json, blob_ref)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    params![id, thread_id, event_type, ts, text, payload_json, blob_ref],
  )?;
  conn.execute(
    "UPDATE threads SET updated_at = ?1, last_event_at = ?1 WHERE id = ?2",
    params![ts, thread_id],
  )?;

  Ok(EventRecord {
    id,
    thread_id: thread_id.to_string(),
    r#type: event_type.to_string(),
    created_at: ts,
    text: text.map(|v| v.to_string()),
    payload_json: payload_json.map(|v| v.to_string()),
    blob_ref: blob_ref.map(|v| v.to_string()),
  })
}

pub fn list_threads(conn: &Connection) -> anyhow::Result<Vec<ThreadRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at
     FROM threads ORDER BY COALESCE(last_event_at, updated_at) DESC",
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(ThreadRecord {
      id: row.get(0)?,
      title: row.get(1)?,
      engine_id: row.get(2)?,
      model_id: row.get(3)?,
      workspace_path: row.get(4)?,
      community_id: row.get(5)?,
      created_at: row.get(6)?,
      updated_at: row.get(7)?,
      last_event_at: row.get(8)?,
    })
  })?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn get_thread_by_id(conn: &Connection, thread_id: &str) -> anyhow::Result<Option<ThreadRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at
     FROM threads WHERE id = ?1",
  )?;
  let result = stmt.query_row(params![thread_id], |row| {
    Ok(ThreadRecord {
      id: row.get(0)?,
      title: row.get(1)?,
      engine_id: row.get(2)?,
      model_id: row.get(3)?,
      workspace_path: row.get(4)?,
      community_id: row.get(5)?,
      created_at: row.get(6)?,
      updated_at: row.get(7)?,
      last_event_at: row.get(8)?,
    })
  });
  match result {
    Ok(record) => Ok(Some(record)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn list_events(conn: &Connection, thread_id: &str, limit: usize) -> anyhow::Result<Vec<EventRecord>> {
  let clamped = std::cmp::min(std::cmp::max(limit, 1), 2000);
  let mut stmt = conn.prepare(
    "SELECT id, thread_id, type, created_at, text, payload_json, blob_ref
     FROM events WHERE thread_id = ?1 ORDER BY created_at ASC LIMIT ?2",
  )?;
  let rows = stmt.query_map(params![thread_id, clamped as i64], |row| {
    Ok(EventRecord {
      id: row.get(0)?,
      thread_id: row.get(1)?,
      r#type: row.get(2)?,
      created_at: row.get(3)?,
      text: row.get(4)?,
      payload_json: row.get(5)?,
      blob_ref: row.get(6)?,
    })
  })?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn delete_thread(conn: &Connection, thread_id: &str) -> anyhow::Result<()> {
  // Contract tables first (events cascades via FK).
  conn.execute("DELETE FROM threads WHERE id = ?1", params![thread_id])?;

  // Legacy tables (messages cascades via FK).
  let _ = conn.execute("DELETE FROM sessions WHERE id = ?1", params![thread_id]);
  let _ = conn.execute("DELETE FROM session_state WHERE session_id = ?1", params![thread_id]);
  let _ = conn.execute("DELETE FROM session_tags WHERE session_id = ?1", params![thread_id]);
  let _ = conn.execute("DELETE FROM messages WHERE session_id = ?1", params![thread_id]);

  // Harness-era tables (optional cleanup; safe no-ops if absent).
  // Internal tool/audit tables removed in MVP. Older DBs may still have them; leave untouched.
  let _ = conn.execute("DELETE FROM context_injections WHERE session_id = ?1", params![thread_id]);

  Ok(())
}

pub fn set_thread_workspace_path(
  conn: &Connection,
  thread_id: &str,
  workspace_path: Option<&str>,
) -> anyhow::Result<()> {
  let ts = now_ts();
  let cleaned = workspace_path.map(|p| p.trim()).filter(|p| !p.is_empty());
  conn.execute(
    "UPDATE threads
     SET workspace_path = ?1, updated_at = ?2
     WHERE id = ?3",
    params![cleaned, ts, thread_id],
  )?;
  Ok(())
}

pub fn get_session_resume(conn: &Connection, session_id: &str) -> anyhow::Result<SessionResume> {
  // Ground truth: events. session_state is legacy and is not updated in MVP.
  let (last_message_id, last_message_at) = conn
    .query_row(
      "SELECT id, created_at
       FROM events
       WHERE thread_id = ?1 AND type = 'user_message'
       ORDER BY created_at DESC
       LIMIT 1",
      params![session_id],
      |row| Ok((Some(row.get::<_, String>(0)?), Some(row.get::<_, i64>(1)?))),
    )
    .unwrap_or((None, None));

  let last_response_id = conn
    .query_row(
      "SELECT id
       FROM events
       WHERE thread_id = ?1 AND type = 'assistant_message'
       ORDER BY created_at DESC
       LIMIT 1",
      params![session_id],
      |row| Ok(Some(row.get::<_, String>(0)?)),
    )
    .unwrap_or(None);

  Ok(SessionResume {
    session_id: session_id.to_string(),
    last_message_id,
    last_message_at,
    last_response_id,
  })
}

pub fn list_messages(conn: &Connection, session_id: &str) -> anyhow::Result<Vec<MessageRecord>> {
  // Ground truth: events. Keep legacy command for UI compatibility.
  let mut stmt = conn.prepare(
    "SELECT id, thread_id, type, created_at, text, payload_json
     FROM events
     WHERE thread_id = ?1 AND (type = 'user_message' OR type = 'assistant_message')
     ORDER BY created_at ASC",
  )?;

  let rows = stmt.query_map(params![session_id], |row| {
    let event_id: String = row.get(0)?;
    let thread_id: String = row.get(1)?;
    let event_type: String = row.get(2)?;
    let created_at: i64 = row.get(3)?;
    let text: Option<String> = row.get(4)?;
    let payload_json: Option<String> = row.get(5)?;

    let role = if event_type == "user_message" {
      "user".to_string()
    } else {
      "assistant".to_string()
    };

    let content_value = payload_json
      .as_deref()
      .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
      .and_then(|v| v.get("content").cloned())
      .unwrap_or_else(|| serde_json::json!({ "text": text.unwrap_or_default() }));

    Ok(MessageRecord {
      id: event_id,
      session_id: thread_id,
      role,
      content_json: serde_json::to_string(&content_value)
        .unwrap_or_else(|_| "{\"text\":\"\"}".to_string()),
      created_at,
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
  conn.busy_timeout(Duration::from_secs(5))?;
  // Best-effort concurrency improvements; ignore failures (e.g., older SQLite builds).
  let _ = conn.pragma_update(None, "journal_mode", "WAL");
  let _ = conn.pragma_update(None, "synchronous", "NORMAL");
  Ok(conn)
}

// (tests removed) legacy internal harness validation no longer applies in MVP.
