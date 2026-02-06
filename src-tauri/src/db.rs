use rusqlite::{params, Connection};
use anyhow::Context as _;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use uuid::Uuid;

pub const SYSTEM_THREAD_ID: &str = "system";

#[derive(Clone)]
pub struct DbState {
  pub db_path: PathBuf,
  pub key: String,
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
  pub last_seq: i64,
}

#[derive(serde::Serialize)]
pub struct EventRecord {
  pub id: String,
  pub thread_id: String,
  pub seq: i64,
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
pub struct MessageRecord {
  pub id: String,
  pub session_id: String,
  pub role: String,
  pub content_json: String,
  pub created_at: i64,
  pub engine_id: Option<String>,
  pub model_id: Option<String>,
  pub run_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ToolCallRecord {
  pub id: String,
  pub session_id: String,
  pub run_id: Option<String>,
  pub tool_name: String,
  pub args_json: String,
  pub status: String,
  pub output_summary_json: Option<String>,
  pub stdout_excerpt: Option<String>,
  pub stderr_excerpt: Option<String>,
  pub exit_code: Option<i64>,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(serde::Serialize)]
pub struct TurnRecord {
  pub id: String,
  pub thread_id: String,
  pub user_event_id: String,
  pub memory_retrieval_event_id: Option<String>,
  pub engine_input_event_id: Option<String>,
  pub assistant_event_id: Option<String>,
  pub seq_start: i64,
  pub seq_end: Option<i64>,
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

#[derive(serde::Serialize)]
pub struct BlobGcReport {
  pub deleted_temp_files: i64,
  pub deleted_orphan_files: i64,
  pub deleted_orphan_rows: i64,
  pub missing_files: i64,
}

pub fn init_db(db_dir: &Path, key: &str) -> anyhow::Result<DbState> {
  fs::create_dir_all(db_dir)?;
  let db_path = db_dir.join("arx.db");
  init_db_at(&db_path, key)
}

pub fn init_db_at(db_path: &Path, key: &str) -> anyhow::Result<DbState> {
  fs::create_dir_all(crate::blob_store::blob_root(db_path))?;
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

pub fn ensure_system_thread(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "threads")? {
    return Ok(());
  }

  let exists = conn.query_row(
    "SELECT 1 FROM threads WHERE id = ?1 LIMIT 1",
    params![SYSTEM_THREAD_ID],
    |_row| Ok(true),
  );
  let exists = match exists {
    Ok(true) => true,
    Err(rusqlite::Error::QueryReturnedNoRows) => false,
    Err(err) => return Err(err.into()),
    _ => false,
  };

  if exists {
    return Ok(());
  }

  let ts = now_ts();
  conn.execute(
    "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at, last_seq)
     VALUES (?1, ?2, ?3, NULL, NULL, NULL, ?4, ?4, NULL, 0)",
    params![SYSTEM_THREAD_ID, "__system__", "system", ts],
  )?;
  Ok(())
}

fn json_get_string(payload_json: &str, key: &str) -> Option<String> {
  let value: serde_json::Value = serde_json::from_str(payload_json).ok()?;
  value.get(key)?.as_str().map(|s| s.to_string())
}

pub fn crash_recovery(conn: &Connection, db_path: &Path) -> anyhow::Result<()> {
  ensure_system_thread(conn)?;
  if !table_exists(conn, "events")? {
    return Ok(());
  }

  // 1) Runs: run_started without run_finished.
  let mut started_runs: std::collections::HashMap<String, String> = std::collections::HashMap::new();
  {
    let mut stmt = conn.prepare(
      "SELECT thread_id, payload_json
       FROM events
       WHERE type = 'run_started' AND payload_json IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    for row in rows {
      let (thread_id, payload_json) = row?;
      if let Some(run_id) = json_get_string(&payload_json, "run_id") {
        started_runs.insert(run_id, thread_id);
      }
    }
  }

  let mut finished_runs: HashSet<String> = HashSet::new();
  {
    let mut stmt = conn.prepare(
      "SELECT payload_json
       FROM events
       WHERE type = 'run_finished' AND payload_json IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in rows {
      let payload_json = row?;
      if let Some(run_id) = json_get_string(&payload_json, "run_id") {
        finished_runs.insert(run_id);
      }
    }
  }

  for (run_id, thread_id) in started_runs {
    if finished_runs.contains(&run_id) {
      continue;
    }
    let payload = serde_json::json!({
      "v": 1,
      "run_id": run_id,
      "status": "error",
      "reason": "crash_recovery"
    });
    let _ = append_event(conn, db_path, &thread_id, "run_finished", None, Some(&payload.to_string()), None);
  }

  // 2) Tools: tool_call_started without tool_call_finished.
  let mut started_tools: std::collections::HashMap<String, (String, Option<String>)> =
    std::collections::HashMap::new();
  {
    let mut stmt = conn.prepare(
      "SELECT thread_id, payload_json
       FROM events
       WHERE type = 'tool_call_started' AND payload_json IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    for row in rows {
      let (thread_id, payload_json) = row?;
      let run_id = json_get_string(&payload_json, "run_id");
      if let Some(tool_call_id) = json_get_string(&payload_json, "tool_call_id") {
        started_tools.insert(tool_call_id, (thread_id, run_id));
      }
    }
  }

  let mut finished_tools: HashSet<String> = HashSet::new();
  {
    let mut stmt = conn.prepare(
      "SELECT payload_json
       FROM events
       WHERE type = 'tool_call_finished' AND payload_json IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in rows {
      let payload_json = row?;
      if let Some(tool_call_id) = json_get_string(&payload_json, "tool_call_id") {
        finished_tools.insert(tool_call_id);
      }
    }
  }

  for (tool_call_id, (thread_id, run_id)) in started_tools {
    if finished_tools.contains(&tool_call_id) {
      continue;
    }
    let payload = serde_json::json!({
      "v": 1,
      "run_id": run_id,
      "tool_call_id": tool_call_id,
      "attempt": 0,
      "status": "unknown",
      "reason": "crash_recovery"
    });
    let _ = append_event(conn, db_path, &thread_id, "tool_call_finished", None, Some(&payload.to_string()), None);
  }

  Ok(())
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

    -- ============================================================
    -- Contract-aligned schema (device-local evidence store)
    --
    -- Cloud is canonical for cognition (threads/messages) when signed in.
    -- This DB exists for device-local bindings, runtime evidence, and
    -- projections that support safe local execution + crash recovery.
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
      last_event_at INTEGER,
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    -- Device-local workspace binding (contract primitive in v2.0).
    -- This is intentionally separate from cloud-canonical threads/messages.
    CREATE TABLE IF NOT EXISTS workspace_bindings (
      thread_id TEXT PRIMARY KEY,
      workspace_path TEXT,
      workspace_scope_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_bindings_scope_id
      ON workspace_bindings(workspace_scope_id);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      text TEXT,
      payload_json TEXT,
      blob_ref TEXT,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages_projection (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_json TEXT NOT NULL,
      engine_id TEXT,
      model_id TEXT,
      run_id TEXT,
      created_at INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_projection_thread_seq
      ON messages_projection(thread_id, seq);

    CREATE TABLE IF NOT EXISTS turns_projection (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      user_event_id TEXT NOT NULL,
      memory_retrieval_event_id TEXT,
      engine_input_event_id TEXT,
      assistant_event_id TEXT,
      seq_start INTEGER NOT NULL,
      seq_end INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_turns_projection_thread_seq_start
      ON turns_projection(thread_id, seq_start);
    CREATE INDEX IF NOT EXISTS idx_turns_projection_open
      ON turns_projection(thread_id, seq_end, seq_start);

    CREATE TABLE IF NOT EXISTS blobs (
      id TEXT PRIMARY KEY,
      rel_path TEXT NOT NULL,
      byte_len INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_thread_created_at
      ON events(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_thread_type_created_at
      ON events(thread_id, type, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_thread_seq
      ON events(thread_id, seq);
    CREATE INDEX IF NOT EXISTS idx_events_thread_type_seq
      ON events(thread_id, type, seq);

    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts
    USING fts5(
      text,
      thread_id UNINDEXED,
      content='events',
      content_rowid='rowid'
    );

    -- FTS discipline: only index high-signal, user-visible text (never raw engine IO).
    DROP TRIGGER IF EXISTS events_ai;
    DROP TRIGGER IF EXISTS events_ad;
    DROP TRIGGER IF EXISTS events_au;
    DROP TRIGGER IF EXISTS events_au_del;
    DROP TRIGGER IF EXISTS events_au_ins;

    CREATE TRIGGER events_ai AFTER INSERT ON events
    WHEN new.type IN ('user_message','assistant_message','handoff_summary','thread_metadata_changed')
    BEGIN
      INSERT INTO events_fts(rowid, text, thread_id)
      VALUES (new.rowid, new.text, new.thread_id);
    END;

    CREATE TRIGGER events_ad AFTER DELETE ON events
    WHEN old.type IN ('user_message','assistant_message','handoff_summary','thread_metadata_changed')
    BEGIN
      INSERT INTO events_fts(events_fts, rowid, text, thread_id)
      VALUES('delete', old.rowid, old.text, old.thread_id);
    END;

    CREATE TRIGGER events_au_del AFTER UPDATE ON events
    WHEN old.type IN ('user_message','assistant_message','handoff_summary','thread_metadata_changed')
    BEGIN
      INSERT INTO events_fts(events_fts, rowid, text, thread_id)
      VALUES('delete', old.rowid, old.text, old.thread_id);
    END;

    CREATE TRIGGER events_au_ins AFTER UPDATE ON events
    WHEN new.type IN ('user_message','assistant_message','handoff_summary','thread_metadata_changed')
    BEGIN
      INSERT INTO events_fts(rowid, text, thread_id)
      VALUES (new.rowid, new.text, new.thread_id);
    END;

      ",
    )
    .context("migrations: create/update tables + FTS triggers")?;

  // Old ALTERs left intentionally removed; legacy tables may still exist in older DBs.

  // Projection drift hardening: add new columns if upgrading an existing DB.
  if table_exists(conn, "messages_projection")? {
    if !column_exists(conn, "messages_projection", "engine_id")? {
      let _ = conn.execute("ALTER TABLE messages_projection ADD COLUMN engine_id TEXT", []);
    }
    if !column_exists(conn, "messages_projection", "model_id")? {
      let _ = conn.execute("ALTER TABLE messages_projection ADD COLUMN model_id TEXT", []);
    }
    if !column_exists(conn, "messages_projection", "run_id")? {
      let _ = conn.execute("ALTER TABLE messages_projection ADD COLUMN run_id TEXT", []);
    }
  }

  backfill_contract_tables(conn).context("migrations: backfill threads/events from legacy tables")?;
  migrate_events_seq(conn).context("migrations: add/backfill events.seq + threads.last_seq")?;
  rebuild_messages_projection(conn).context("migrations: rebuild messages projection")?;
  rebuild_turns_projection(conn).context("migrations: rebuild turns projection")?;
  rebuild_events_fts(conn).context("migrations: rebuild events FTS")?;

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
          WHEN model_id IS NOT NULL AND TRIM(model_id) <> '' THEN 'messages_agent'
          ELSE 'messages_agent'
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

fn migrate_events_seq(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "events")? {
    return Ok(());
  }

  // Ensure columns exist for older DBs (contract upgrades).
  if table_exists(conn, "threads")? && !column_exists(conn, "threads", "last_seq")? {
    let _ = conn.execute(
      "ALTER TABLE threads ADD COLUMN last_seq INTEGER NOT NULL DEFAULT 0",
      [],
    );
  }
  if !column_exists(conn, "events", "seq")? {
    let _ = conn.execute(
      "ALTER TABLE events ADD COLUMN seq INTEGER NOT NULL DEFAULT 0",
      [],
    );
  }

  // Backfill deterministic per-thread ordering if seq is missing/zero.
  let needs_backfill = conn
    .query_row(
      "SELECT COUNT(1) FROM events WHERE seq IS NULL OR seq = 0",
      [],
      |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0);

  if needs_backfill > 0 {
    conn.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| -> anyhow::Result<()> {
      let mut thread_stmt = conn.prepare("SELECT DISTINCT thread_id FROM events")?;
      let thread_ids = thread_stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

      let mut ids_stmt = conn.prepare(
        "SELECT id FROM events WHERE thread_id = ?1 ORDER BY created_at ASC, id ASC",
      )?;
      let mut update_evt = conn.prepare("UPDATE events SET seq = ?1 WHERE id = ?2")?;
      let mut update_thread = conn.prepare("UPDATE threads SET last_seq = ?1 WHERE id = ?2")?;

      for thread_id in thread_ids {
        let rows = ids_stmt.query_map(params![&thread_id], |row| row.get::<_, String>(0))?;
        let mut seq: i64 = 0;
        for row in rows {
          let event_id = row?;
          seq += 1;
          update_evt.execute(params![seq, event_id])?;
        }
        // Threads table may not contain the row for rare corrupted DBs; ignore.
        let _ = update_thread.execute(params![seq, thread_id]);
      }

      Ok(())
    })();

    match result {
      Ok(()) => conn.execute_batch("COMMIT")?,
      Err(err) => {
        let _ = conn.execute_batch("ROLLBACK");
        return Err(err);
      }
    }
  }

  // Heal threads.last_seq for all rows (including threads with no events).
  if table_exists(conn, "threads")? && column_exists(conn, "threads", "last_seq")? {
    conn.execute(
      "UPDATE threads
       SET last_seq = COALESCE((
         SELECT MAX(seq) FROM events e WHERE e.thread_id = threads.id
       ), 0)",
      [],
    )?;
  }

  // Optional guardrail: unique seq per thread.
  // Only create after backfill to avoid collisions on older DBs.
  let _ = conn.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_events_thread_seq_unique ON events(thread_id, seq)",
    [],
  );

  Ok(())
}

fn rebuild_messages_projection(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "messages_projection")? || !table_exists(conn, "events")? {
    return Ok(());
  }

  conn.execute_batch("BEGIN IMMEDIATE")?;
  let result = (|| -> anyhow::Result<()> {
    conn.execute("DELETE FROM messages_projection", [])?;

    let mut stmt = conn.prepare(
      "SELECT id, thread_id, seq, type, created_at, text, payload_json
       FROM events
       WHERE type = 'user_message' OR type = 'assistant_message'
       ORDER BY thread_id, seq ASC",
    )?;
    let mut insert = conn.prepare(
      "INSERT INTO messages_projection (id, thread_id, role, content_json, engine_id, model_id, run_id, created_at, seq)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;

    let rows = stmt.query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?, // id
        row.get::<_, String>(1)?, // thread_id
        row.get::<_, i64>(2)?,    // seq
        row.get::<_, String>(3)?, // type
        row.get::<_, i64>(4)?,    // created_at
        row.get::<_, Option<String>>(5)?, // text
        row.get::<_, Option<String>>(6)?, // payload_json
      ))
    })?;

    for row in rows {
      let (id, thread_id, seq, event_type, created_at, text, payload_json) = row?;
      let role = if event_type == "user_message" {
        "user"
      } else {
        "assistant"
      };
      let content_json =
        content_json_from_payload(payload_json.as_deref(), text.as_deref());
      let (engine_id, model_id, run_id) = meta_fields_from_payload(payload_json.as_deref());
      insert.execute(params![
        id,
        thread_id,
        role,
        content_json,
        engine_id,
        model_id,
        run_id,
        created_at,
        seq
      ])?;
    }

    Ok(())
  })();

  match result {
    Ok(()) => conn.execute_batch("COMMIT")?,
    Err(err) => {
      let _ = conn.execute_batch("ROLLBACK");
      return Err(err);
    }
  }

  Ok(())
}

fn rebuild_turns_projection(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "turns_projection")? || !table_exists(conn, "events")? {
    return Ok(());
  }

  conn.execute_batch("BEGIN IMMEDIATE")?;
  let result = (|| -> anyhow::Result<()> {
    conn.execute("DELETE FROM turns_projection", [])?;

    let mut stmt = conn.prepare(
      "SELECT id, thread_id, seq, type, created_at
       FROM events
       ORDER BY thread_id, seq ASC",
    )?;
    let mut insert = conn.prepare(
      "INSERT INTO turns_projection
        (id, thread_id, user_event_id, seq_start, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;
    let mut update_open = conn.prepare(
      "UPDATE turns_projection
         SET memory_retrieval_event_id = COALESCE(memory_retrieval_event_id, ?1),
             engine_input_event_id = COALESCE(engine_input_event_id, ?2),
             assistant_event_id = COALESCE(assistant_event_id, ?3),
             seq_end = COALESCE(seq_end, ?4)
       WHERE id = (
         SELECT id
         FROM turns_projection
         WHERE thread_id = ?5 AND seq_end IS NULL
         ORDER BY seq_start DESC
         LIMIT 1
       )",
    )?;

    let rows = stmt.query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?, // id
        row.get::<_, String>(1)?, // thread_id
        row.get::<_, i64>(2)?,    // seq
        row.get::<_, String>(3)?, // type
        row.get::<_, i64>(4)?,    // created_at
      ))
    })?;

    for row in rows {
      let (id, thread_id, seq, event_type, created_at) = row?;
      match event_type.as_str() {
        "user_message" => {
          insert.execute(params![&id, &thread_id, &id, seq, created_at])?;
        }
        "memory_retrieval" => {
          let _ = update_open.execute(params![
            &id,
            Option::<&str>::None,
            Option::<&str>::None,
            Option::<i64>::None,
            &thread_id
          ])?;
        }
        "engine_input" => {
          let _ = update_open.execute(params![
            Option::<&str>::None,
            &id,
            Option::<&str>::None,
            Option::<i64>::None,
            &thread_id
          ])?;
        }
        "assistant_message" => {
          let _ = update_open.execute(params![
            Option::<&str>::None,
            Option::<&str>::None,
            &id,
            seq,
            &thread_id
          ])?;
        }
        _ => {}
      }
    }

    Ok(())
  })();

  match result {
    Ok(()) => conn.execute_batch("COMMIT")?,
    Err(err) => {
      let _ = conn.execute_batch("ROLLBACK");
      return Err(err);
    }
  }

  Ok(())
}

fn rebuild_events_fts(conn: &Connection) -> anyhow::Result<()> {
  if !table_exists(conn, "events")? {
    return Ok(());
  }

  // events_fts is virtual; existence checks via sqlite_master are unreliable for some SQLite builds.
  // Best effort: attempt operations and ignore "no such table" errors.
  let clear = conn.execute("INSERT INTO events_fts(events_fts) VALUES('delete-all')", []);
  if clear.is_err() {
    return Ok(());
  }

  conn.execute(
    "INSERT INTO events_fts(rowid, text, thread_id)
     SELECT rowid, text, thread_id
     FROM events
     WHERE type IN ('user_message','assistant_message','handoff_summary','thread_metadata_changed')
       AND text IS NOT NULL",
    [],
  )?;

  Ok(())
}

pub fn rebuild_projections(conn: &Connection) -> anyhow::Result<()> {
  rebuild_messages_projection(conn)?;
  rebuild_turns_projection(conn)?;
  rebuild_events_fts(conn)?;
  Ok(())
}

fn backfill_contract_tables(conn: &Connection) -> anyhow::Result<()> {
  let has_sessions = table_exists(conn, "sessions")?;
  let has_messages = table_exists(conn, "messages")?;

  // Threads: 1:1 with legacy sessions (same id), best-effort defaults.
  if has_sessions {
    if table_exists(conn, "session_state")? {
      conn
        .execute(
          "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
           SELECT
             s.id,
             s.title,
             'messages_agent',
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
      conn
        .execute(
          "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
           SELECT
             s.id,
             s.title,
             'messages_agent',
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
        "v": 1,
        "role": role,
        "content": serde_json::from_str::<serde_json::Value>(&content_json).unwrap_or(serde_json::Value::Null)
      });
      let payload_json = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());

      conn.execute(
        "INSERT INTO events (id, thread_id, seq, type, created_at, text, payload_json, blob_ref)
         VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6, NULL)",
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

fn content_json_from_payload(payload_json: Option<&str>, text: Option<&str>) -> String {
  let payload = payload_json.and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok());

  let mut content_value = payload
    .as_ref()
    .and_then(|v| v.get("content").cloned())
    .unwrap_or_else(|| serde_json::json!({ "text": text.unwrap_or_default() }));

  // Preserve provenance when present. Cloud messages store these under content_json.meta.
  if let Some(meta) = payload.as_ref().and_then(|v| v.get("meta")) {
    if let serde_json::Value::Object(map) = &mut content_value {
      map.insert("meta".to_string(), meta.clone());
    }
  }

  serde_json::to_string(&content_value).unwrap_or_else(|_| "{\"text\":\"\"}".to_string())
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

pub fn get_personal_memory_item_by_id(
  conn: &Connection,
  id: &str,
) -> anyhow::Result<Option<PersonalMemoryItemRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, content, scope, scope_id, pinned, provenance_event_id, created_at, updated_at
     FROM personal_memory_items
     WHERE id = ?1",
  )?;
  let result = stmt.query_row(params![id], |row| {
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
  });
  match result {
    Ok(value) => Ok(Some(value)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
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
    last_seq: 0,
  })
}

pub fn upsert_thread_from_cloud(
  conn: &Connection,
  thread_id: &str,
  title: Option<&str>,
  engine_id: &str,
  model_id: Option<&str>,
  community_id: Option<&str>,
  created_at: Option<i64>,
  updated_at: Option<i64>,
) -> anyhow::Result<ThreadRecord> {
  let ts = now_ts();
  let created = created_at.unwrap_or(ts);
  let updated = updated_at.unwrap_or(ts);

  conn.execute(
    "INSERT INTO threads (id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at)
     VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = COALESCE(excluded.title, threads.title),
       engine_id = COALESCE(NULLIF(excluded.engine_id, ''), threads.engine_id),
       model_id = COALESCE(excluded.model_id, threads.model_id),
       community_id = COALESCE(excluded.community_id, threads.community_id),
       updated_at = MAX(threads.updated_at, excluded.updated_at)",
    params![thread_id, title, engine_id, model_id, community_id, created, updated],
  )?;

  get_thread_by_id(conn, thread_id)?
    .ok_or_else(|| anyhow::anyhow!("upsert_thread_from_cloud: thread not found after upsert"))
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

pub fn add_message(
  conn: &Connection,
  session_id: &str,
  role: &str,
  content_json: &str,
) -> anyhow::Result<()> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  // Projection source: device-local events. Update projections transactionally.
  let event_type = match role.trim().to_ascii_lowercase().as_str() {
    "user" => "user_message",
    "assistant" => "assistant_message",
    _ => "engine_io_chunk",
  };
  let text = extract_text_from_content_json(content_json);
  let payload = serde_json::json!({
    "v": 1,
    "role": role,
    "content": serde_json::from_str::<serde_json::Value>(content_json).unwrap_or(serde_json::Value::Null)
  });
  let payload_json = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());

  // Deterministic order: allocate seq transactionally.
  conn.execute_batch("BEGIN IMMEDIATE")?;
  let result = (|| -> anyhow::Result<()> {
    let next_seq: i64 = conn.query_row(
      "SELECT COALESCE(last_seq, 0) + 1 FROM threads WHERE id = ?1",
      params![session_id],
      |row| row.get(0),
    )?;

    conn.execute(
      "UPDATE threads
       SET last_seq = ?1, updated_at = ?2, last_event_at = ?2
       WHERE id = ?3",
      params![next_seq, ts, session_id],
    )?;

    conn.execute(
      "INSERT INTO events (id, thread_id, seq, type, created_at, text, payload_json, blob_ref)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
      params![id, session_id, next_seq, event_type, ts, text.as_deref(), payload_json],
    )?;

    if event_type == "user_message" || event_type == "assistant_message" {
      let role = if event_type == "user_message" { "user" } else { "assistant" };
      let content_json =
        content_json_from_payload(Some(&payload_json), text.as_deref());
      let (engine_id, model_id, run_id) = meta_fields_from_payload(Some(&payload_json));
      conn.execute(
        "INSERT OR REPLACE INTO messages_projection (id, thread_id, role, content_json, engine_id, model_id, run_id, created_at, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, session_id, role, content_json, engine_id, model_id, run_id, ts, next_seq],
      )?;
    }

    apply_turns_projection(conn, session_id, event_type, &id, next_seq, ts)?;

    Ok(())
  })();

  match result {
    Ok(()) => conn.execute_batch("COMMIT")?,
    Err(err) => {
      let _ = conn.execute_batch("ROLLBACK");
      return Err(err);
    }
  }

  Ok(())
}

pub fn append_event(
  conn: &Connection,
  db_path: &Path,
  thread_id: &str,
  event_type: &str,
  text: Option<&str>,
  payload_json: Option<&str>,
  blob_ref: Option<&str>,
) -> anyhow::Result<EventRecord> {
  let id = Uuid::new_v4().to_string();
  let ts = now_ts();

  conn.execute_batch("BEGIN IMMEDIATE")?;
  let result = (|| -> anyhow::Result<i64> {
    let next_seq: i64 = conn.query_row(
      "SELECT COALESCE(last_seq, 0) + 1 FROM threads WHERE id = ?1",
      params![thread_id],
      |row| row.get(0),
    )?;

    conn.execute(
      "UPDATE threads
       SET last_seq = ?1, updated_at = ?2, last_event_at = ?2
       WHERE id = ?3",
      params![next_seq, ts, thread_id],
    )?;

    if event_type == "assistant_message" {
      validate_assistant_message_provenance(conn, thread_id, next_seq, payload_json)?;
    }

    validate_and_record_blob_refs(conn, db_path, blob_ref, payload_json)?;

    conn.execute(
      "INSERT INTO events (id, thread_id, seq, type, created_at, text, payload_json, blob_ref)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      params![id, thread_id, next_seq, event_type, ts, text, payload_json, blob_ref],
    )?;

    if event_type == "user_message" || event_type == "assistant_message" {
      let role = if event_type == "user_message" { "user" } else { "assistant" };
      let content_json = content_json_from_payload(payload_json, text);
      let (engine_id, model_id, run_id) = meta_fields_from_payload(payload_json);
      conn.execute(
        "INSERT OR REPLACE INTO messages_projection (id, thread_id, role, content_json, engine_id, model_id, run_id, created_at, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, thread_id, role, content_json, engine_id, model_id, run_id, ts, next_seq],
      )?;
    }

    apply_turns_projection(conn, thread_id, event_type, &id, next_seq, ts)?;

    Ok(next_seq)
  })();

  let seq = match result {
    Ok(value) => {
      conn.execute_batch("COMMIT")?;
      value
    }
    Err(err) => {
      let _ = conn.execute_batch("ROLLBACK");
      return Err(err);
    }
  };

  Ok(EventRecord {
    id,
    thread_id: thread_id.to_string(),
    seq,
    r#type: event_type.to_string(),
    created_at: ts,
    text: text.map(|v| v.to_string()),
    payload_json: payload_json.map(|v| v.to_string()),
    blob_ref: blob_ref.map(|v| v.to_string()),
  })
}

fn validate_and_record_blob_refs(
  conn: &Connection,
  db_path: &Path,
  primary_blob_ref: Option<&str>,
  payload_json: Option<&str>,
) -> anyhow::Result<()> {
  let mut refs: Vec<String> = Vec::new();
  if let Some(r) = primary_blob_ref {
    if !r.trim().is_empty() {
      refs.push(r.to_string());
    }
  }

  if let Some(payload_json) = payload_json {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload_json) {
      collect_blob_refs_from_json(&value, &mut refs);
    }
  }

  if refs.is_empty() {
    return Ok(());
  }

  refs.sort();
  refs.dedup();

  for rel in refs {
    let abs = crate::blob_store::blob_abs_path(db_path, &rel)?;
    let meta = fs::metadata(&abs)
      .with_context(|| format!("blob referenced by event is missing: {}", abs.display()))?;
    let byte_len = meta.len() as i64;
    let blob_id = crate::blob_store::blob_id_from_rel_path(&rel)?;
    record_blob(conn, &blob_id, &rel, byte_len)?;
  }

  Ok(())
}

fn collect_blob_refs_from_json(value: &serde_json::Value, out: &mut Vec<String>) {
  match value {
    serde_json::Value::Object(map) => {
      for (k, v) in map {
        if (k == "blob_ref" || k.ends_with("_blob_ref")) && v.is_string() {
          if let Some(s) = v.as_str() {
            if !s.trim().is_empty() {
              out.push(s.to_string());
            }
          }
        }
        collect_blob_refs_from_json(v, out);
      }
    }
    serde_json::Value::Array(arr) => {
      for v in arr {
        collect_blob_refs_from_json(v, out);
      }
    }
    _ => {}
  }
}

fn validate_assistant_message_provenance(
  conn: &Connection,
  thread_id: &str,
  assistant_seq: i64,
  payload_json: Option<&str>,
) -> anyhow::Result<()> {
  let Some(payload_json) = payload_json else {
    return Ok(());
  };
  let value: serde_json::Value = match serde_json::from_str(payload_json) {
    Ok(v) => v,
    Err(_) => return Ok(()),
  };
  let Some(source_ids) = value.get("source_event_ids").and_then(|v| v.as_array()) else {
    return Ok(());
  };
  if source_ids.is_empty() {
    return Ok(());
  }

  for id in source_ids {
    let Some(id) = id.as_str() else {
      return Err(anyhow::anyhow!("assistant_message.source_event_ids must be strings"));
    };
    let (src_thread_id, src_type, src_seq) = conn
      .query_row(
        "SELECT thread_id, type, seq FROM events WHERE id = ?1",
        params![id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
      )
      .map_err(|_| anyhow::anyhow!("assistant_message references missing event: {}", id))?;

    if src_thread_id != thread_id {
      return Err(anyhow::anyhow!(
        "assistant_message references event from different thread: {}",
        id
      ));
    }
    if src_type != "engine_io_chunk" {
      return Err(anyhow::anyhow!(
        "assistant_message provenance must reference engine_io_chunk events (got {})",
        src_type
      ));
    }
    if src_seq > assistant_seq {
      return Err(anyhow::anyhow!(
        "assistant_message references future evidence event {} (seq {} > {})",
        id,
        src_seq,
        assistant_seq
      ));
    }
  }

  Ok(())
}

pub fn record_blob(
  conn: &Connection,
  blob_id: &str,
  rel_path: &str,
  byte_len: i64,
) -> anyhow::Result<()> {
  let ts = now_ts();
  conn.execute(
    "INSERT OR IGNORE INTO blobs (id, rel_path, byte_len, created_at)
     VALUES (?1, ?2, ?3, ?4)",
    params![blob_id, rel_path, byte_len, ts],
  )?;
  Ok(())
}

fn apply_turns_projection(
  conn: &Connection,
  thread_id: &str,
  event_type: &str,
  event_id: &str,
  seq: i64,
  created_at: i64,
) -> anyhow::Result<()> {
  if !table_exists(conn, "turns_projection")? {
    return Ok(());
  }

  match event_type {
    "user_message" => {
      conn.execute(
        "INSERT OR REPLACE INTO turns_projection
          (id, thread_id, user_event_id, seq_start, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![event_id, thread_id, event_id, seq, created_at],
      )?;
    }
    "memory_retrieval" => {
      let _ = conn.execute(
        "UPDATE turns_projection
           SET memory_retrieval_event_id = COALESCE(memory_retrieval_event_id, ?1)
         WHERE id = (
           SELECT id
           FROM turns_projection
           WHERE thread_id = ?2 AND seq_end IS NULL
           ORDER BY seq_start DESC
           LIMIT 1
         )",
        params![event_id, thread_id],
      )?;
    }
    "engine_input" => {
      let _ = conn.execute(
        "UPDATE turns_projection
           SET engine_input_event_id = COALESCE(engine_input_event_id, ?1)
         WHERE id = (
           SELECT id
           FROM turns_projection
           WHERE thread_id = ?2 AND seq_end IS NULL
           ORDER BY seq_start DESC
           LIMIT 1
         )",
        params![event_id, thread_id],
      )?;
    }
    "assistant_message" => {
      let _ = conn.execute(
        "UPDATE turns_projection
           SET assistant_event_id = COALESCE(assistant_event_id, ?1),
               seq_end = COALESCE(seq_end, ?2)
         WHERE id = (
           SELECT id
           FROM turns_projection
           WHERE thread_id = ?3 AND seq_end IS NULL
           ORDER BY seq_start DESC
           LIMIT 1
         )",
        params![event_id, seq, thread_id],
      )?;
    }
    _ => {}
  }

  Ok(())
}

fn meta_fields_from_payload(payload_json: Option<&str>) -> (Option<String>, Option<String>, Option<String>) {
  let Some(payload_json) = payload_json else {
    return (None, None, None);
  };
  let value: serde_json::Value = match serde_json::from_str(payload_json) {
    Ok(v) => v,
    Err(_) => return (None, None, None),
  };
  let meta = value.get("meta").and_then(|v| v.as_object());
  let engine_id = meta
    .and_then(|m| m.get("engine_id"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
  let model_id = meta
    .and_then(|m| m.get("model_id"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
  let run_id = meta
    .and_then(|m| m.get("run_id"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
  (engine_id, model_id, run_id)
}

fn collect_files_recursive(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let path = entry.path();
    if file_type.is_dir() {
      collect_files_recursive(&path, out)?;
    } else if file_type.is_file() {
      out.push(path);
    }
  }
  Ok(())
}

fn file_age_secs(path: &Path, now_ts: i64) -> Option<i64> {
  let meta = fs::metadata(path).ok()?;
  let modified = meta.modified().ok()?;
  let modified_secs = modified
    .duration_since(SystemTime::UNIX_EPOCH)
    .ok()?
    .as_secs() as i64;
  Some(std::cmp::max(0, now_ts - modified_secs))
}

pub fn gc_blobs(conn: &Connection, db_path: &Path) -> anyhow::Result<BlobGcReport> {
  let db_dir = db_path.parent().unwrap_or_else(|| Path::new("."));
  let blob_root = crate::blob_store::blob_root(db_path);
  if !blob_root.exists() {
    return Ok(BlobGcReport {
      deleted_temp_files: 0,
      deleted_orphan_files: 0,
      deleted_orphan_rows: 0,
      missing_files: 0,
    });
  }

  let mut referenced: HashSet<String> = HashSet::new();
  if table_exists(conn, "events")? {
    let mut stmt = conn.prepare(
      "SELECT DISTINCT blob_ref
       FROM events
       WHERE blob_ref IS NOT NULL AND TRIM(blob_ref) <> ''",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in rows {
      referenced.insert(row?);
    }
  }

  let mut deleted_temp_files: i64 = 0;
  let mut deleted_orphan_files: i64 = 0;

  // Avoid racing with in-flight blob writes by only deleting older files.
  let now_ts = now_ts();
  const TEMP_DELETE_AFTER_SECS: i64 = 60 * 5;
  const ORPHAN_DELETE_AFTER_SECS: i64 = 60 * 60;

  let mut files: Vec<PathBuf> = Vec::new();
  collect_files_recursive(&blob_root, &mut files)
    .with_context(|| format!("scan blobs dir: {}", blob_root.display()))?;
  for abs_path in files {
    let file_name = abs_path
      .file_name()
      .and_then(|s| s.to_str())
      .unwrap_or("");
    let age_secs = file_age_secs(&abs_path, now_ts).unwrap_or(i64::MAX);

    // Safe to delete: temp files are never referenced by events.
    if file_name.contains(".tmp.") {
      if age_secs >= TEMP_DELETE_AFTER_SECS && fs::remove_file(&abs_path).is_ok() {
        deleted_temp_files += 1;
      }
      continue;
    }

    // Orphan cleanup: any blob file not referenced by events can be removed.
    let rel = abs_path
      .strip_prefix(db_dir)
      .unwrap_or(&abs_path)
      .to_string_lossy()
      .replace('\\', "/");
    if !referenced.contains(&rel) {
      if age_secs >= ORPHAN_DELETE_AFTER_SECS && fs::remove_file(&abs_path).is_ok() {
        deleted_orphan_files += 1;
      }
    }
  }

  let mut missing_files: i64 = 0;
  for rel in referenced.iter() {
    let abs = db_dir.join(rel);
    if !abs.exists() {
      missing_files += 1;
    }
  }

  let deleted_orphan_rows = if table_exists(conn, "blobs")? {
    conn.execute(
      "DELETE FROM blobs
       WHERE rel_path NOT IN (
         SELECT blob_ref FROM events WHERE blob_ref IS NOT NULL AND TRIM(blob_ref) <> ''
       )",
      [],
    )? as i64
  } else {
    0
  };

  Ok(BlobGcReport {
    deleted_temp_files,
    deleted_orphan_files,
    deleted_orphan_rows,
    missing_files,
  })
}

pub fn list_threads(conn: &Connection) -> anyhow::Result<Vec<ThreadRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at, COALESCE(last_seq, 0)
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
      last_seq: row.get(9)?,
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
    "SELECT id, title, engine_id, model_id, workspace_path, community_id, created_at, updated_at, last_event_at, COALESCE(last_seq, 0)
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
      last_seq: row.get(9)?,
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
    "SELECT id, thread_id, seq, type, created_at, text, payload_json, blob_ref
     FROM events
     WHERE thread_id = ?1
       AND type != 'engine_io_chunk'
     ORDER BY seq DESC
     LIMIT ?2",
  )?;
  let rows = stmt.query_map(params![thread_id, clamped as i64], |row| {
    Ok(EventRecord {
      id: row.get(0)?,
      thread_id: row.get(1)?,
      seq: row.get(2)?,
      r#type: row.get(3)?,
      created_at: row.get(4)?,
      text: row.get(5)?,
      payload_json: row.get(6)?,
      blob_ref: row.get(7)?,
    })
  })?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  out.reverse();
  Ok(out)
}

pub fn list_events_since(
  conn: &Connection,
  thread_id: &str,
  after_seq: i64,
  limit: usize,
  include_engine_io_chunk: bool,
) -> anyhow::Result<Vec<EventRecord>> {
  let clamped = std::cmp::min(std::cmp::max(limit, 1), 2000);
  let mut stmt = conn.prepare(
    "SELECT id, thread_id, seq, type, created_at, text, payload_json, blob_ref
     FROM events
     WHERE thread_id = ?1
       AND seq > ?2
       AND (?3 = 1 OR type != 'engine_io_chunk')
     ORDER BY seq ASC
     LIMIT ?4",
  )?;
  let include = if include_engine_io_chunk { 1_i64 } else { 0_i64 };
  let rows = stmt.query_map(params![thread_id, after_seq, include, clamped as i64], |row| {
    Ok(EventRecord {
      id: row.get(0)?,
      thread_id: row.get(1)?,
      seq: row.get(2)?,
      r#type: row.get(3)?,
      created_at: row.get(4)?,
      text: row.get(5)?,
      payload_json: row.get(6)?,
      blob_ref: row.get(7)?,
    })
  })?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }
  Ok(out)
}

pub fn get_event_by_id(
  conn: &Connection,
  thread_id: &str,
  event_id: &str,
) -> anyhow::Result<Option<EventRecord>> {
  let mut stmt = conn.prepare(
    "SELECT id, thread_id, seq, type, created_at, text, payload_json, blob_ref
     FROM events WHERE id = ?1 AND thread_id = ?2",
  )?;
  let result = stmt.query_row(params![event_id, thread_id], |row| {
    Ok(EventRecord {
      id: row.get(0)?,
      thread_id: row.get(1)?,
      seq: row.get(2)?,
      r#type: row.get(3)?,
      created_at: row.get(4)?,
      text: row.get(5)?,
      payload_json: row.get(6)?,
      blob_ref: row.get(7)?,
    })
  });
  match result {
    Ok(record) => Ok(Some(record)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(err) => Err(err.into()),
  }
}

pub fn list_turns(conn: &Connection, thread_id: &str, limit: usize) -> anyhow::Result<Vec<TurnRecord>> {
  if !table_exists(conn, "turns_projection")? {
    return Ok(Vec::new());
  }
  let clamped = std::cmp::min(std::cmp::max(limit, 1), 500);
  let mut stmt = conn.prepare(
    "SELECT id, thread_id, user_event_id, memory_retrieval_event_id, engine_input_event_id, assistant_event_id,
            seq_start, seq_end, created_at
     FROM turns_projection
     WHERE thread_id = ?1
     ORDER BY seq_start ASC
     LIMIT ?2",
  )?;
  let rows = stmt.query_map(params![thread_id, clamped as i64], |row| {
    Ok(TurnRecord {
      id: row.get(0)?,
      thread_id: row.get(1)?,
      user_event_id: row.get(2)?,
      memory_retrieval_event_id: row.get(3)?,
      engine_input_event_id: row.get(4)?,
      assistant_event_id: row.get(5)?,
      seq_start: row.get(6)?,
      seq_end: row.get(7)?,
      created_at: row.get(8)?,
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

pub fn upsert_workspace_binding(
  conn: &Connection,
  thread_id: &str,
  workspace_path: Option<&str>,
  workspace_scope_id: Option<&str>,
) -> anyhow::Result<()> {
  let ts = now_ts();
  let cleaned_path = workspace_path.map(|p| p.trim()).filter(|p| !p.is_empty());
  let cleaned_scope = workspace_scope_id.map(|p| p.trim()).filter(|p| !p.is_empty());

  conn.execute(
    "INSERT INTO workspace_bindings (thread_id, workspace_path, workspace_scope_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(thread_id) DO UPDATE SET
       workspace_path = excluded.workspace_path,
       workspace_scope_id = excluded.workspace_scope_id,
       updated_at = excluded.updated_at",
    params![thread_id, cleaned_path, cleaned_scope, ts, ts],
  )?;
  Ok(())
}

pub fn set_thread_engine_model(
  conn: &Connection,
  thread_id: &str,
  engine_id: &str,
  model_id: Option<&str>,
) -> anyhow::Result<()> {
  let ts = now_ts();
  let cleaned_model = model_id.map(|v| v.trim()).filter(|v| !v.is_empty());
  conn.execute(
    "UPDATE threads
     SET engine_id = ?1, model_id = ?2, updated_at = ?3
     WHERE id = ?4",
    params![engine_id, cleaned_model, ts, thread_id],
  )?;
  Ok(())
}

pub fn set_thread_community_id(
  conn: &Connection,
  thread_id: &str,
  community_id: Option<&str>,
) -> anyhow::Result<()> {
  let ts = now_ts();
  let cleaned = community_id.map(|v| v.trim()).filter(|v| !v.is_empty());
  conn.execute(
    "UPDATE threads
     SET community_id = ?1, updated_at = ?2
     WHERE id = ?3",
    params![cleaned, ts, thread_id],
  )?;
  Ok(())
}

pub fn get_session_resume(conn: &Connection, session_id: &str) -> anyhow::Result<SessionResume> {
  // Projection source: device-local events. session_state is legacy and is not updated in MVP.
  let (last_message_id, last_message_at) = conn
    .query_row(
      "SELECT id, created_at
       FROM events
       WHERE thread_id = ?1 AND type = 'user_message'
       ORDER BY seq DESC
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
       ORDER BY seq DESC
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
  let mut stmt = conn.prepare(
    "SELECT id, thread_id, role, content_json, created_at, engine_id, model_id, run_id
     FROM messages_projection
     WHERE thread_id = ?1
     ORDER BY seq ASC",
  )?;

  let rows = stmt.query_map(params![session_id], |row| {
    Ok(MessageRecord {
      id: row.get(0)?,
      session_id: row.get(1)?,
      role: row.get(2)?,
      content_json: row.get(3)?,
      created_at: row.get(4)?,
      engine_id: row.get(5)?,
      model_id: row.get(6)?,
      run_id: row.get(7)?,
    })
  })?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row?);
  }

  Ok(out)
}

pub fn list_tool_calls(
  conn: &Connection,
  thread_id: &str,
  limit: usize,
) -> anyhow::Result<Vec<ToolCallRecord>> {
  let clamped = std::cmp::min(std::cmp::max(limit, 1), 2000);

  struct ToolCallState {
    id: String,
    session_id: String,
    run_id: Option<String>,
    tool_name: String,
    args_json: String,
    status: String,
    approved_by: Option<String>,
    note: Option<String>,
    exec_status: Option<String>,
    reason: Option<String>,
    artifacts: Option<serde_json::Value>,
    stdout_excerpt: Option<String>,
    stderr_excerpt: Option<String>,
    exit_code: Option<i64>,
    created_at: i64,
    updated_at: i64,
  }

  let mut stmt = conn.prepare(
    "SELECT type, created_at, payload_json
     FROM events
     WHERE thread_id = ?1
       AND type IN (
         'tool_call_requested',
         'tool_call_approved',
         'tool_call_denied',
         'tool_call_started',
         'tool_call_finished'
       )
       AND payload_json IS NOT NULL
     ORDER BY seq ASC",
  )?;
  let rows = stmt.query_map(params![thread_id], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, i64>(1)?,
      row.get::<_, String>(2)?,
    ))
  })?;

  let mut states: HashMap<String, ToolCallState> = HashMap::new();

  for row in rows {
    let (event_type, created_at, payload_json) = row?;
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&payload_json) else {
      continue;
    };
    let Some(tool_call_id) = payload.get("tool_call_id").and_then(|v| v.as_str()) else {
      continue;
    };
    if tool_call_id.trim().is_empty() {
      continue;
    }
    let run_id = payload
      .get("run_id")
      .and_then(|v| v.as_str())
      .map(|v| v.to_string());

    let state = states.entry(tool_call_id.to_string()).or_insert_with(|| ToolCallState {
      id: tool_call_id.to_string(),
      session_id: thread_id.to_string(),
      run_id: run_id.clone(),
      tool_name: "tool".to_string(),
      args_json: "{}".to_string(),
      status: "requested".to_string(),
      approved_by: None,
      note: None,
      exec_status: None,
      reason: None,
      artifacts: None,
      stdout_excerpt: None,
      stderr_excerpt: None,
      exit_code: None,
      created_at,
      updated_at: created_at,
    });

    state.updated_at = created_at;
    if state.run_id.is_none() && run_id.is_some() {
      state.run_id = run_id;
    }

    match event_type.as_str() {
      "tool_call_requested" => {
        state.status = "requested".to_string();
        if let Some(name) = payload.get("tool_name").and_then(|v| v.as_str()) {
          let cleaned = name.trim();
          if !cleaned.is_empty() {
            state.tool_name = cleaned.to_string();
          }
        }
        if let Some(args) = payload.get("args") {
          state.args_json = serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string());
        }
      }
      "tool_call_approved" => {
        state.status = "approved".to_string();
        state.approved_by = payload
          .get("approved_by")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
        state.note = payload
          .get("note")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
      }
      "tool_call_denied" => {
        state.status = "denied".to_string();
        state.approved_by = payload
          .get("approved_by")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
        state.note = payload
          .get("note")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
      }
      "tool_call_started" => {
        state.status = "started".to_string();
      }
      "tool_call_finished" => {
        state.status = "finished".to_string();
        state.exec_status = payload
          .get("status")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
        state.reason = payload
          .get("reason")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
        state.exit_code = payload.get("exit_code").and_then(|v| v.as_i64());
        state.stdout_excerpt = payload
          .get("result_preview")
          .and_then(|v| v.as_str())
          .map(|v| v.to_string());
        state.stderr_excerpt = match state.exec_status.as_deref() {
          Some("error") => state.reason.clone(),
          _ => None,
        };
        state.artifacts = payload.get("artifacts").cloned();
      }
      _ => {}
    }
  }

  let mut out = Vec::with_capacity(states.len());
  for state in states.into_values() {
    let mut summary = serde_json::Map::new();
    if let Some(value) = state.approved_by.as_deref() {
      summary.insert("approved_by".to_string(), serde_json::Value::String(value.to_string()));
    }
    if let Some(value) = state.note.as_deref() {
      summary.insert("note".to_string(), serde_json::Value::String(value.to_string()));
    }
    if let Some(value) = state.exec_status.as_deref() {
      summary.insert("exec_status".to_string(), serde_json::Value::String(value.to_string()));
    }
    if let Some(value) = state.reason.as_deref() {
      summary.insert("reason".to_string(), serde_json::Value::String(value.to_string()));
    }
    if let Some(value) = state.artifacts {
      summary.insert("artifacts".to_string(), value);
    }

    out.push(ToolCallRecord {
      id: state.id,
      session_id: state.session_id,
      run_id: state.run_id,
      tool_name: state.tool_name,
      args_json: state.args_json,
      status: state.status,
      output_summary_json: if summary.is_empty() {
        None
      } else {
        Some(serde_json::to_string(&serde_json::Value::Object(summary)).unwrap_or_else(|_| "{}".to_string()))
      },
      stdout_excerpt: state.stdout_excerpt,
      stderr_excerpt: state.stderr_excerpt,
      exit_code: state.exit_code,
      created_at: state.created_at,
      updated_at: state.updated_at,
    });
  }

  out.sort_by(|a, b| {
    a.created_at
      .cmp(&b.created_at)
      .then_with(|| a.updated_at.cmp(&b.updated_at))
      .then_with(|| a.id.cmp(&b.id))
  });
  if out.len() > clamped {
    out.drain(0..(out.len() - clamped));
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

#[cfg(test)]
mod tests {
  use super::*;

  fn setup_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory sqlite");
    run_migrations(&conn).expect("run migrations");
    conn
  }

  #[test]
  fn list_events_since_respects_engine_chunk_filter() {
    let conn = setup_conn();
    let thread = create_thread(&conn, "t", "messages_agent", Some("openai/gpt-5"))
      .expect("create thread");

    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread.id,
      "user_message",
      Some("u"),
      Some(r#"{"v":1}"#),
      None,
    )
    .expect("append user");
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread.id,
      "engine_io_chunk",
      Some("chunk"),
      Some(r#"{"v":1}"#),
      None,
    )
    .expect("append chunk");
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread.id,
      "assistant_message",
      Some("a"),
      Some(r#"{"v":1}"#),
      None,
    )
    .expect("append assistant");

    let without_chunks =
      list_events_since(&conn, &thread.id, 0, 20, false).expect("list events (filtered)");
    assert_eq!(without_chunks.len(), 2);
    assert_eq!(without_chunks[0].r#type, "user_message");
    assert_eq!(without_chunks[1].r#type, "assistant_message");

    let with_chunks =
      list_events_since(&conn, &thread.id, 0, 20, true).expect("list events (with chunks)");
    assert_eq!(with_chunks.len(), 3);
    assert_eq!(with_chunks[1].r#type, "engine_io_chunk");
  }

  #[test]
  fn list_tool_calls_reconstructs_lifecycle_from_events() {
    let conn = setup_conn();
    let thread = create_thread(&conn, "t", "messages_agent", Some("openai/gpt-5"))
      .expect("create thread");
    let thread_id = thread.id.clone();

    let requested = serde_json::json!({
      "v": 1,
      "run_id": "run-1",
      "tool_call_id": "call-1",
      "tool_name": "read",
      "args": { "path": "README.md" }
    });
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread_id,
      "tool_call_requested",
      None,
      Some(&requested.to_string()),
      None,
    )
    .expect("append requested");

    let approved = serde_json::json!({
      "v": 1,
      "run_id": "run-1",
      "tool_call_id": "call-1",
      "approved": true,
      "approved_by": "user"
    });
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread_id,
      "tool_call_approved",
      None,
      Some(&approved.to_string()),
      None,
    )
    .expect("append approved");

    let started = serde_json::json!({
      "v": 1,
      "run_id": "run-1",
      "tool_call_id": "call-1",
      "attempt": 1
    });
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread_id,
      "tool_call_started",
      None,
      Some(&started.to_string()),
      None,
    )
    .expect("append started");

    let finished = serde_json::json!({
      "v": 1,
      "run_id": "run-1",
      "tool_call_id": "call-1",
      "attempt": 1,
      "status": "ok",
      "result_preview": "done"
    });
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread_id,
      "tool_call_finished",
      None,
      Some(&finished.to_string()),
      None,
    )
    .expect("append finished");

    // No requested event for call-2: projection should still surface this call.
    let finished_orphan = serde_json::json!({
      "v": 1,
      "run_id": "run-1",
      "tool_call_id": "call-2",
      "attempt": 1,
      "status": "error",
      "reason": "boom",
      "exit_code": 1
    });
    append_event(
      &conn,
      Path::new("/tmp/arx-tests"),
      &thread_id,
      "tool_call_finished",
      None,
      Some(&finished_orphan.to_string()),
      None,
    )
    .expect("append orphan finished");

    let tool_calls = list_tool_calls(&conn, &thread_id, 20).expect("list tool calls");
    assert_eq!(tool_calls.len(), 2);

    let call_1 = tool_calls
      .iter()
      .find(|tc| tc.id == "call-1")
      .expect("call-1 exists");
    assert_eq!(call_1.status, "finished");
    assert_eq!(call_1.tool_name, "read");
    assert!(call_1.args_json.contains("README.md"));
    assert_eq!(call_1.stdout_excerpt.as_deref(), Some("done"));

    let call_2 = tool_calls
      .iter()
      .find(|tc| tc.id == "call-2")
      .expect("call-2 exists");
    assert_eq!(call_2.status, "finished");
    assert_eq!(call_2.tool_name, "tool");
    assert_eq!(call_2.exit_code, Some(1));
    assert_eq!(call_2.stderr_excerpt.as_deref(), Some("boom"));
  }
}
