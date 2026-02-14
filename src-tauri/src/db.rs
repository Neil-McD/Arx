use anyhow::Context as _;
use once_cell::sync::Lazy;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex as StdMutex;
use std::time::{Duration, UNIX_EPOCH};
use uuid::Uuid;

pub const SYSTEM_THREAD_ID: &str = "system";
pub const THREAD_LANE_CHAT: &str = "chat";
pub const THREAD_LANE_AGENT: &str = "agent";
pub const THREAD_STORAGE_MODE_CLOUD: &str = "cloud";
pub const THREAD_STORAGE_MODE_LOCAL: &str = "local";
const LEGACY_DEFAULT_THREAD_TITLE: &str = "untitled thread";

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
    pub thread_lane: String,
    pub storage_mode: String,
    pub project_id: Option<String>,
    pub workspace_path: Option<String>,
    pub workspace_fingerprint: Option<String>,
    pub community_id: Option<String>,
    pub context_version: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_event_at: Option<i64>,
    pub last_seq: i64,
}

pub struct ThreadContextSetResult {
    pub thread: ThreadRecord,
    pub changed_fields: Vec<String>,
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
    pub seq: i64,
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

pub struct SuccessfulToolCallReuse {
    pub tool_call_id: String,
    pub result_preview: Option<String>,
    pub tool_result: Option<String>,
    pub tool_result_blob_ref: Option<String>,
}

pub struct LatestFinishedToolCallByKey {
    pub tool_call_id: String,
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct BlobGcStats {
    pub deleted_tracked_blobs: usize,
    pub deleted_untracked_files: usize,
}

#[derive(Debug, Clone, Copy)]
pub enum BlobGcRunOutcome {
    SkippedNotDue,
    Ran(BlobGcStats),
}

pub const BLOB_GC_LAST_RUN_UI_KEY: &str = "blobs_gc_last_run_at";
static BLOB_GC_MUTEX: Lazy<StdMutex<()>> = Lazy::new(|| StdMutex::new(()));

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
    "INSERT INTO threads (id, title, engine_id, model_id, thread_lane, storage_mode, project_id, workspace_path, community_id, context_version, created_at, updated_at, last_event_at, last_seq)
     VALUES (?1, ?2, ?3, NULL, ?4, ?5, NULL, NULL, NULL, 0, ?6, ?6, NULL, 0)",
    params![
      SYSTEM_THREAD_ID,
      "__system__",
      "system",
      THREAD_LANE_AGENT,
      THREAD_STORAGE_MODE_LOCAL,
      ts
    ],
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
    let mut started_runs: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT thread_id, payload_json
       FROM events
       WHERE type = 'run_started' AND payload_json IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
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
        let _ = append_event(
            conn,
            db_path,
            &thread_id,
            "run_finished",
            None,
            Some(&payload.to_string()),
            None,
        );
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
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
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
        let _ = append_event(
            conn,
            db_path,
            &thread_id,
            "tool_call_finished",
            None,
            Some(&payload.to_string()),
            None,
        );
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
      thread_lane TEXT NOT NULL DEFAULT 'chat',
      storage_mode TEXT NOT NULL DEFAULT 'cloud',
      project_id TEXT,
      workspace_path TEXT,
      workspace_fingerprint TEXT,
      community_id TEXT,
      context_version INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
      updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
      last_event_at INTEGER,
      last_seq INTEGER NOT NULL DEFAULT 0,
      CHECK (
        (thread_lane = 'chat' AND storage_mode = 'cloud')
        OR (thread_lane = 'agent' AND storage_mode = 'local')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_threads_lane_updated_at
      ON threads(thread_lane, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_project_lane_updated_at
      ON threads(project_id, thread_lane, updated_at DESC);

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

    CREATE TABLE IF NOT EXISTS workspace_policies (
      workspace_scope_id TEXT PRIMARY KEY,
      policy_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS tool_calls (
      tool_call_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      run_id TEXT,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '{}',
      status TEXT,
      output_summary_json TEXT,
      stdout_excerpt TEXT,
      stderr_excerpt TEXT,
      exit_code INTEGER,
      first_seq INTEGER NOT NULL,
      last_seq INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tool_calls_thread_first_seq
      ON tool_calls(thread_id, first_seq);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id
      ON tool_calls(run_id);

    CREATE TABLE IF NOT EXISTS blobs (
      id TEXT PRIMARY KEY,
      rel_path TEXT NOT NULL,
      byte_len INTEGER NOT NULL,
      mime TEXT,
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
    if table_exists(conn, "threads")? && !column_exists(conn, "threads", "workspace_fingerprint")? {
        let _ = conn.execute(
            "ALTER TABLE threads ADD COLUMN workspace_fingerprint TEXT",
            [],
        );
    }
    if table_exists(conn, "threads")? && !column_exists(conn, "threads", "thread_lane")? {
        let _ = conn.execute(
            "ALTER TABLE threads ADD COLUMN thread_lane TEXT NOT NULL DEFAULT 'chat'",
            [],
        );
    }
    if table_exists(conn, "threads")? && !column_exists(conn, "threads", "project_id")? {
        let _ = conn.execute("ALTER TABLE threads ADD COLUMN project_id TEXT", []);
    }
    if table_exists(conn, "threads")? && !column_exists(conn, "threads", "context_version")? {
        let _ = conn.execute(
            "ALTER TABLE threads ADD COLUMN context_version INTEGER NOT NULL DEFAULT 0",
            [],
        );
    }
    if table_exists(conn, "threads")? && !column_exists(conn, "threads", "storage_mode")? {
        let _ = conn.execute(
            "ALTER TABLE threads ADD COLUMN storage_mode TEXT NOT NULL DEFAULT 'cloud'",
            [],
        );
    }
    if table_exists(conn, "messages_projection")? {
        if !column_exists(conn, "messages_projection", "engine_id")? {
            let _ = conn.execute(
                "ALTER TABLE messages_projection ADD COLUMN engine_id TEXT",
                [],
            );
        }
        if !column_exists(conn, "messages_projection", "model_id")? {
            let _ = conn.execute(
                "ALTER TABLE messages_projection ADD COLUMN model_id TEXT",
                [],
            );
        }
        if !column_exists(conn, "messages_projection", "run_id")? {
            let _ = conn.execute("ALTER TABLE messages_projection ADD COLUMN run_id TEXT", []);
        }
    }
    if table_exists(conn, "blobs")? && !column_exists(conn, "blobs", "mime")? {
        let _ = conn.execute("ALTER TABLE blobs ADD COLUMN mime TEXT", []);
    }

    assert_no_unmigrated_legacy_data(conn).context("migrations: legacy DB compatibility check")?;
    backfill_thread_lane(conn).context("migrations: backfill thread lanes")?;
    backfill_thread_storage_mode(conn).context("migrations: backfill thread storage modes")?;
    backfill_thread_project_ids(conn).context("migrations: backfill thread project assignments")?;
    migrate_events_seq(conn).context("migrations: add/backfill events.seq + threads.last_seq")?;
    rebuild_messages_projection(conn).context("migrations: rebuild messages projection")?;
    rebuild_turns_projection(conn).context("migrations: rebuild turns projection")?;
    rebuild_tool_calls_projection(conn).context("migrations: rebuild tool calls projection")?;
    rebuild_events_fts(conn).context("migrations: rebuild events FTS")?;

    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> anyhow::Result<bool> {
    let mut stmt =
        conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1")?;
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

fn count_rows_if_table_exists(conn: &Connection, table: &str) -> anyhow::Result<i64> {
    if !table_exists(conn, table)? {
        return Ok(0);
    }
    let sql = format!("SELECT COUNT(1) FROM {}", table);
    conn.query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map_err(Into::into)
}

fn assert_no_unmigrated_legacy_data(conn: &Connection) -> anyhow::Result<()> {
    let legacy_sessions = count_rows_if_table_exists(conn, "sessions")?;
    let legacy_messages = count_rows_if_table_exists(conn, "messages")?;
    if legacy_sessions == 0 && legacy_messages == 0 {
        return Ok(());
    }

    let contract_threads = count_rows_if_table_exists(conn, "threads")?;
    let contract_events = count_rows_if_table_exists(conn, "events")?;
    if contract_threads > 0 || contract_events > 0 {
        return Ok(());
    }

    anyhow::bail!(
        "legacy_local_db_detected: sessions/messages data exists but legacy backfill is removed; reset local DB to continue"
    );
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
        thread_lane TEXT NOT NULL DEFAULT 'chat',
        storage_mode TEXT NOT NULL DEFAULT 'cloud',
        project_id TEXT,
        workspace_path TEXT,
        workspace_fingerprint TEXT,
        community_id TEXT,
        context_version INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
        updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
        last_event_at INTEGER,
        last_seq INTEGER NOT NULL DEFAULT 0,
        CHECK (
          (thread_lane = 'chat' AND storage_mode = 'cloud')
          OR (thread_lane = 'agent' AND storage_mode = 'local')
        )
      );

      INSERT INTO threads_new (id, title, engine_id, model_id, thread_lane, storage_mode, project_id, workspace_path, workspace_fingerprint, community_id, context_version, created_at, updated_at, last_event_at, last_seq)
      SELECT
        id,
        title,
        CASE
          WHEN harness_id IS NOT NULL AND TRIM(harness_id) <> '' THEN harness_id
          WHEN model_id IS NOT NULL AND TRIM(model_id) <> '' THEN 'messages_agent'
          ELSE 'messages_agent'
        END,
        model_id,
        'agent',
        'local',
        NULL,
        workspace_path,
        NULL,
        community_id,
        0,
        created_at,
        updated_at,
        last_event_at,
        0
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
            let mut update_thread =
                conn.prepare("UPDATE threads SET last_seq = ?1 WHERE id = ?2")?;

            for thread_id in thread_ids {
                let rows =
                    ids_stmt.query_map(params![&thread_id], |row| row.get::<_, String>(0))?;
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
                row.get::<_, String>(0)?,         // id
                row.get::<_, String>(1)?,         // thread_id
                row.get::<_, i64>(2)?,            // seq
                row.get::<_, String>(3)?,         // type
                row.get::<_, i64>(4)?,            // created_at
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
            let content_json = content_json_from_payload(payload_json.as_deref(), text.as_deref());
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

fn apply_tool_calls_projection(
    conn: &Connection,
    thread_id: &str,
    event_type: &str,
    seq: i64,
    created_at: i64,
    payload_json: Option<&str>,
) -> anyhow::Result<()> {
    if !table_exists(conn, "tool_calls")? {
        return Ok(());
    }
    if !matches!(
        event_type,
        "tool_call_requested"
            | "tool_call_approved"
            | "tool_call_denied"
            | "tool_call_started"
            | "tool_call_finished"
    ) {
        return Ok(());
    }

    let Some(payload_json) = payload_json else {
        return Ok(());
    };
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(payload_json) else {
        return Ok(());
    };
    let Some(tool_call_id) = payload
        .get("tool_call_id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Ok(());
    };

    let run_id = payload
        .get("run_id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string());

    let mut tool_name = payload
        .get("tool_name")
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or("tool")
        .to_string();
    if tool_name.trim().is_empty() {
        tool_name = "tool".to_string();
    }

    let args_json = payload
        .get("args")
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|| "{}".to_string());

    let mut output_summary_json: Option<String> = None;
    let mut stdout_excerpt: Option<String> = None;
    let mut stderr_excerpt: Option<String> = None;
    let mut exit_code: Option<i64> = None;

    let status = match event_type {
        "tool_call_requested" => "requested",
        "tool_call_approved" => {
            let mut summary = serde_json::Map::new();
            if let Some(value) = payload.get("approved_by").and_then(|v| v.as_str()) {
                summary.insert(
                    "approved_by".to_string(),
                    serde_json::Value::String(value.to_string()),
                );
            }
            if let Some(value) = payload.get("note").and_then(|v| v.as_str()) {
                summary.insert(
                    "note".to_string(),
                    serde_json::Value::String(value.to_string()),
                );
            }
            if !summary.is_empty() {
                output_summary_json = Some(
                    serde_json::to_string(&serde_json::Value::Object(summary))
                        .unwrap_or_else(|_| "{}".to_string()),
                );
            }
            "approved"
        }
        "tool_call_denied" => {
            let mut summary = serde_json::Map::new();
            if let Some(value) = payload.get("approved_by").and_then(|v| v.as_str()) {
                summary.insert(
                    "approved_by".to_string(),
                    serde_json::Value::String(value.to_string()),
                );
            }
            if let Some(value) = payload.get("note").and_then(|v| v.as_str()) {
                summary.insert(
                    "note".to_string(),
                    serde_json::Value::String(value.to_string()),
                );
            }
            if !summary.is_empty() {
                output_summary_json = Some(
                    serde_json::to_string(&serde_json::Value::Object(summary))
                        .unwrap_or_else(|_| "{}".to_string()),
                );
            }
            "denied"
        }
        "tool_call_started" => "started",
        "tool_call_finished" => {
            let exec_status = payload
                .get("status")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let reason = payload
                .get("reason")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            exit_code = payload.get("exit_code").and_then(|v| v.as_i64());
            stdout_excerpt = payload
                .get("result_preview")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            stderr_excerpt = match exec_status.as_deref() {
                Some("error") => reason.clone(),
                _ => None,
            };

            let mut summary = serde_json::Map::new();
            if let Some(value) = exec_status {
                summary.insert("exec_status".to_string(), serde_json::Value::String(value));
            }
            if let Some(value) = reason {
                summary.insert("reason".to_string(), serde_json::Value::String(value));
            }
            if let Some(value) = payload.get("artifacts") {
                summary.insert("artifacts".to_string(), value.clone());
            }
            if !summary.is_empty() {
                output_summary_json = Some(
                    serde_json::to_string(&serde_json::Value::Object(summary))
                        .unwrap_or_else(|_| "{}".to_string()),
                );
            }
            "finished"
        }
        _ => return Ok(()),
    };

    conn.execute(
    "INSERT INTO tool_calls (
       tool_call_id, thread_id, run_id, tool_name, args_json, status,
       output_summary_json, stdout_excerpt, stderr_excerpt, exit_code,
       first_seq, last_seq, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?12)
     ON CONFLICT(tool_call_id) DO UPDATE SET
       thread_id = excluded.thread_id,
       run_id = COALESCE(excluded.run_id, tool_calls.run_id),
       tool_name = CASE
         WHEN (tool_calls.tool_name IS NULL OR tool_calls.tool_name = '' OR tool_calls.tool_name = 'tool')
           AND excluded.tool_name IS NOT NULL AND excluded.tool_name <> ''
           THEN excluded.tool_name
         ELSE tool_calls.tool_name
       END,
       args_json = CASE
         WHEN excluded.args_json IS NOT NULL AND excluded.args_json <> '{}' THEN excluded.args_json
         ELSE tool_calls.args_json
       END,
       status = excluded.status,
       output_summary_json = COALESCE(excluded.output_summary_json, tool_calls.output_summary_json),
       stdout_excerpt = COALESCE(excluded.stdout_excerpt, tool_calls.stdout_excerpt),
       stderr_excerpt = COALESCE(excluded.stderr_excerpt, tool_calls.stderr_excerpt),
       exit_code = COALESCE(excluded.exit_code, tool_calls.exit_code),
       first_seq = MIN(tool_calls.first_seq, excluded.first_seq),
       last_seq = COALESCE(excluded.last_seq, tool_calls.last_seq),
       created_at = MIN(tool_calls.created_at, excluded.created_at),
       updated_at = MAX(tool_calls.updated_at, excluded.updated_at)",
    params![
      tool_call_id,
      thread_id,
      run_id,
      tool_name,
      args_json,
      status,
      output_summary_json,
      stdout_excerpt,
      stderr_excerpt,
      exit_code,
      seq,
      created_at
    ],
  )?;

    Ok(())
}

fn rebuild_tool_calls_projection(conn: &Connection) -> anyhow::Result<()> {
    if !table_exists(conn, "tool_calls")? || !table_exists(conn, "events")? {
        return Ok(());
    }

    conn.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| -> anyhow::Result<()> {
        conn.execute("DELETE FROM tool_calls", [])?;

        let mut stmt = conn.prepare(
            "SELECT thread_id, seq, type, created_at, payload_json
       FROM events
       WHERE type IN (
         'tool_call_requested',
         'tool_call_approved',
         'tool_call_denied',
         'tool_call_started',
         'tool_call_finished'
       )
       ORDER BY thread_id, seq ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?;

        for row in rows {
            let (thread_id, seq, event_type, created_at, payload_json) = row?;
            apply_tool_calls_projection(
                conn,
                &thread_id,
                &event_type,
                seq,
                created_at,
                payload_json.as_deref(),
            )?;
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
    let clear = conn.execute(
        "INSERT INTO events_fts(events_fts) VALUES('delete-all')",
        [],
    );
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

fn normalize_thread_lane(value: Option<&str>) -> &'static str {
    match value.map(|raw| raw.trim().to_ascii_lowercase()).as_deref() {
        Some("agent") => THREAD_LANE_AGENT,
        Some("chat") => THREAD_LANE_CHAT,
        _ => THREAD_LANE_CHAT,
    }
}

fn storage_mode_for_lane(thread_lane: &str) -> &'static str {
    if thread_lane.eq_ignore_ascii_case(THREAD_LANE_AGENT) {
        THREAD_STORAGE_MODE_LOCAL
    } else {
        THREAD_STORAGE_MODE_CLOUD
    }
}

fn backfill_thread_lane(conn: &Connection) -> anyhow::Result<()> {
    if !table_exists(conn, "threads")? || !column_exists(conn, "threads", "thread_lane")? {
        return Ok(());
    }

    let unknown_lane_predicate =
        "(thread_lane IS NULL OR TRIM(thread_lane) = '' OR LOWER(thread_lane) NOT IN ('chat', 'agent'))";

    if table_exists(conn, "tool_calls")? {
        conn.execute(
            "UPDATE threads
       SET thread_lane = 'agent'
       WHERE (thread_lane IS NULL OR TRIM(thread_lane) = '' OR LOWER(thread_lane) NOT IN ('chat', 'agent'))
         AND id IN (SELECT DISTINCT thread_id FROM tool_calls)",
            [],
        )?;
    }

    if table_exists(conn, "events")? {
        conn.execute(
            "UPDATE threads
       SET thread_lane = 'agent'
       WHERE (thread_lane IS NULL OR TRIM(thread_lane) = '' OR LOWER(thread_lane) NOT IN ('chat', 'agent'))
         AND id IN (
         SELECT DISTINCT thread_id
         FROM events
         WHERE type IN ('tool_call_requested','tool_call_started','tool_call_finished')
       )",
            [],
        )?;
    }

    let chat_backfill_sql = format!(
        "UPDATE threads
     SET thread_lane = 'chat'
     WHERE {}",
        unknown_lane_predicate
    );
    conn.execute(&chat_backfill_sql, [])?;

    Ok(())
}

fn backfill_thread_storage_mode(conn: &Connection) -> anyhow::Result<()> {
    if !table_exists(conn, "threads")?
        || !column_exists(conn, "threads", "thread_lane")?
        || !column_exists(conn, "threads", "storage_mode")?
    {
        return Ok(());
    }

    conn.execute(
        "UPDATE threads
       SET storage_mode = CASE
         WHEN LOWER(TRIM(COALESCE(thread_lane, ''))) = 'agent' THEN 'local'
         ELSE 'cloud'
       END
       WHERE storage_mode IS NULL
          OR TRIM(storage_mode) = ''
          OR LOWER(TRIM(storage_mode)) NOT IN ('cloud', 'local')
          OR (LOWER(TRIM(COALESCE(thread_lane, ''))) = 'agent' AND LOWER(TRIM(storage_mode)) <> 'local')
          OR (LOWER(TRIM(COALESCE(thread_lane, ''))) <> 'agent' AND LOWER(TRIM(storage_mode)) <> 'cloud')",
        [],
    )?;

    Ok(())
}

fn backfill_thread_project_ids(conn: &Connection) -> anyhow::Result<()> {
    if !table_exists(conn, "threads")?
        || !column_exists(conn, "threads", "project_id")?
        || !table_exists(conn, "projects")?
    {
        return Ok(());
    }

    let mut project_stmt =
        conn.prepare("SELECT id, root_path FROM projects WHERE TRIM(root_path) <> ''")?;
    let mut projects = project_stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    projects.sort_by(|a, b| b.1.len().cmp(&a.1.len()));

    if projects.is_empty() {
        return Ok(());
    }

    let mut thread_stmt = conn.prepare(
        "SELECT id, workspace_path
     FROM threads
     WHERE (project_id IS NULL OR TRIM(project_id) = '')
       AND workspace_path IS NOT NULL
       AND TRIM(workspace_path) <> ''",
    )?;
    let thread_rows = thread_stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for (thread_id, workspace_path_raw) in thread_rows {
        let workspace_path = workspace_path_raw.trim();
        if workspace_path.is_empty() {
            continue;
        }
        let workspace = Path::new(workspace_path);
        let matched_project = projects.iter().find_map(|(project_id, root_path)| {
            let root = Path::new(root_path.trim());
            if workspace.starts_with(root) {
                Some(project_id.as_str())
            } else {
                None
            }
        });
        if let Some(project_id) = matched_project {
            conn.execute(
                "UPDATE threads SET project_id = ?1 WHERE id = ?2",
                params![project_id, thread_id],
            )?;
        }
    }

    Ok(())
}

fn extract_text_from_payload_json(payload_json: Option<&str>) -> Option<String> {
    let raw = payload_json?.trim();
    if raw.is_empty() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    value
        .get("content")
        .and_then(|content| content.get("text"))
        .and_then(|v| v.as_str())
        .or_else(|| value.get("text").and_then(|v| v.as_str()))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn normalize_thread_title_for_storage(title: Option<&str>) -> Option<String> {
    let trimmed = title
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())?;
    if trimmed.eq_ignore_ascii_case(LEGACY_DEFAULT_THREAD_TITLE) {
        return None;
    }
    Some(trimmed.to_string())
}

fn derive_thread_title_from_user_text(text: &str) -> Option<String> {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }
    let mut chars = collapsed.chars();
    let truncated: String = chars.by_ref().take(64).collect();
    if chars.next().is_none() {
        return Some(collapsed);
    }
    Some(format!("{}...", truncated.trim_end()))
}

fn maybe_set_derived_thread_title(
    conn: &Connection,
    thread_id: &str,
    user_text: &str,
) -> anyhow::Result<()> {
    let Some(next_title) = derive_thread_title_from_user_text(user_text) else {
        return Ok(());
    };
    conn.execute(
        "UPDATE threads
     SET title = ?1
     WHERE id = ?2
       AND (
         title IS NULL
         OR TRIM(title) = ''
         OR LOWER(TRIM(title)) = ?3
       )",
        params![next_title, thread_id, LEGACY_DEFAULT_THREAD_TITLE],
    )?;
    Ok(())
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
    thread_lane: Option<&str>,
    project_id: Option<&str>,
) -> anyhow::Result<ThreadRecord> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    let normalized_lane = normalize_thread_lane(thread_lane);
    let storage_mode = storage_mode_for_lane(normalized_lane);
    let cleaned_project_id = project_id
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let cleaned_title = normalize_thread_title_for_storage(Some(title));

    conn.execute(
    "INSERT INTO threads (id, title, engine_id, model_id, thread_lane, storage_mode, project_id, workspace_path, community_id, created_at, updated_at, last_event_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?9, NULL)",
    params![
      id,
      cleaned_title.as_deref(),
      engine_id,
      model_id,
      normalized_lane,
      storage_mode,
      cleaned_project_id,
      ts,
      ts
    ],
  )?;

    Ok(ThreadRecord {
        id,
        title: cleaned_title,
        engine_id: engine_id.to_string(),
        model_id: model_id.map(|s| s.to_string()),
        thread_lane: normalized_lane.to_string(),
        storage_mode: storage_mode.to_string(),
        project_id: cleaned_project_id.map(|value| value.to_string()),
        workspace_path: None,
        workspace_fingerprint: None,
        community_id: None,
        context_version: 0,
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
    thread_lane: Option<&str>,
    project_id: Option<&str>,
    community_id: Option<&str>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
) -> anyhow::Result<ThreadRecord> {
    let ts = now_ts();
    let created = created_at.unwrap_or(ts);
    let updated = updated_at.unwrap_or(ts);
    let normalized_lane = normalize_thread_lane(thread_lane);
    let storage_mode = storage_mode_for_lane(normalized_lane);
    let cleaned_project_id = project_id
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let cleaned_title = normalize_thread_title_for_storage(title);

    conn.execute(
    "INSERT INTO threads (id, title, engine_id, model_id, thread_lane, storage_mode, project_id, workspace_path, community_id, created_at, updated_at, last_event_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = COALESCE(excluded.title, threads.title),
       engine_id = COALESCE(NULLIF(excluded.engine_id, ''), threads.engine_id),
       model_id = COALESCE(excluded.model_id, threads.model_id),
       thread_lane = COALESCE(NULLIF(excluded.thread_lane, ''), threads.thread_lane),
       storage_mode = COALESCE(NULLIF(excluded.storage_mode, ''), threads.storage_mode),
       project_id = COALESCE(excluded.project_id, threads.project_id),
       community_id = COALESCE(excluded.community_id, threads.community_id),
       updated_at = MAX(threads.updated_at, excluded.updated_at)",
    params![
      thread_id,
      cleaned_title.as_deref(),
      engine_id,
      model_id,
      normalized_lane,
      storage_mode,
      cleaned_project_id,
      community_id,
      created,
      updated
    ],
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

pub fn update_project_name(
    conn: &Connection,
    project_id: &str,
    name: Option<&str>,
) -> anyhow::Result<ProjectRecord> {
    let ts = now_ts();
    let cleaned_name = name
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    conn.execute(
        "UPDATE projects
     SET name = ?1, updated_at = ?2
     WHERE id = ?3",
        params![cleaned_name, ts, project_id],
    )?;
    get_project_by_id(conn, project_id)?.ok_or_else(|| anyhow::anyhow!("project not found"))
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
        validate_event_contract(event_type, payload_json)?;

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

        if event_type == "user_message" {
            let user_title_candidate = text
                .map(|value| value.to_string())
                .or_else(|| extract_text_from_payload_json(payload_json));
            if let Some(user_text) = user_title_candidate.as_deref() {
                maybe_set_derived_thread_title(conn, thread_id, user_text)?;
            }
        }

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
            let role = if event_type == "user_message" {
                "user"
            } else {
                "assistant"
            };
            let content_json = content_json_from_payload(payload_json, text);
            let (engine_id, model_id, run_id) = meta_fields_from_payload(payload_json);
            conn.execute(
        "INSERT OR REPLACE INTO messages_projection (id, thread_id, role, content_json, engine_id, model_id, run_id, created_at, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, thread_id, role, content_json, engine_id, model_id, run_id, ts, next_seq],
      )?;
        }

        apply_turns_projection(conn, thread_id, event_type, &id, next_seq, ts)?;
        apply_tool_calls_projection(conn, thread_id, event_type, next_seq, ts, payload_json)?;

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

fn event_requires_payload(event_type: &str) -> bool {
    matches!(
        event_type,
        "memory_retrieval"
            | "engine_input"
            | "engine_io_chunk"
            | "assistant_message"
            | "handoff_summary"
            | "run_started"
            | "run_finished"
            | "tool_call_requested"
            | "tool_call_approved"
            | "tool_call_denied"
            | "tool_call_started"
            | "tool_call_finished"
            | "workspace_policy_changed"
            | "memory_write"
            | "artifact_published"
            | "artifact_viewed"
            | "artifact_feedback"
    )
}

fn event_requires_run_id(event_type: &str) -> bool {
    matches!(
        event_type,
        "assistant_message"
            | "handoff_summary"
            | "engine_input"
            | "engine_io_chunk"
            | "run_started"
            | "run_finished"
            | "tool_call_requested"
            | "tool_call_approved"
            | "tool_call_denied"
            | "tool_call_started"
            | "tool_call_finished"
    )
}

fn event_requires_tool_call_id(event_type: &str) -> bool {
    matches!(
        event_type,
        "tool_call_requested"
            | "tool_call_approved"
            | "tool_call_denied"
            | "tool_call_started"
            | "tool_call_finished"
    )
}

fn payload_run_id(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("run_id")
        .and_then(|v| v.as_str())
        .or_else(|| {
            payload
                .get("meta")
                .and_then(|v| v.get("run_id"))
                .and_then(|v| v.as_str())
        })
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn payload_string_field(payload: &serde_json::Value, field: &str) -> Option<String> {
    payload
        .get(field)
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn validate_event_contract(event_type: &str, payload_json: Option<&str>) -> anyhow::Result<()> {
    let parsed_payload = match payload_json {
        Some(raw) if !raw.trim().is_empty() => Some(
            serde_json::from_str::<serde_json::Value>(raw)
                .with_context(|| format!("{} payload_json must be valid JSON", event_type))?,
        ),
        _ => None,
    };

    if event_requires_payload(event_type) && parsed_payload.is_none() {
        return Err(anyhow::anyhow!(
            "{} requires payload_json with contract fields",
            event_type
        ));
    }

    let Some(payload) = parsed_payload else {
        return Ok(());
    };
    if !payload.is_object() {
        return Err(anyhow::anyhow!(
            "{} payload_json must be a JSON object",
            event_type
        ));
    }

    let Some(version) = payload.get("v").and_then(|v| v.as_i64()) else {
        return Err(anyhow::anyhow!(
            "{} payload_json must include integer version field `v`",
            event_type
        ));
    };
    if version != 1 {
        return Err(anyhow::anyhow!(
            "{} payload_json has unsupported version {}, expected 1",
            event_type,
            version
        ));
    }

    if event_requires_run_id(event_type) && payload_run_id(&payload).is_none() {
        return Err(anyhow::anyhow!(
            "{} payload_json must include non-empty run_id (top-level or meta.run_id)",
            event_type
        ));
    }

    if event_requires_tool_call_id(event_type)
        && payload_string_field(&payload, "tool_call_id").is_none()
    {
        return Err(anyhow::anyhow!(
            "{} payload_json must include non-empty tool_call_id",
            event_type
        ));
    }

    if event_type == "tool_call_requested" {
        if payload_string_field(&payload, "tool_call_key").is_none() {
            return Err(anyhow::anyhow!(
                "tool_call_requested payload_json must include non-empty tool_call_key"
            ));
        }
        if payload_string_field(&payload, "tool_name").is_none() {
            return Err(anyhow::anyhow!(
                "tool_call_requested payload_json must include non-empty tool_name"
            ));
        }
        if !payload.get("args").map(|v| v.is_object()).unwrap_or(false) {
            return Err(anyhow::anyhow!(
                "tool_call_requested payload_json.args must be a JSON object"
            ));
        }
    }

    if event_type == "run_finished" && payload_string_field(&payload, "status").is_none() {
        return Err(anyhow::anyhow!(
            "run_finished payload_json must include non-empty status"
        ));
    }

    if event_type == "assistant_message"
        && !payload
            .get("source_event_ids")
            .map(|v| v.is_array())
            .unwrap_or(false)
    {
        return Err(anyhow::anyhow!(
            "assistant_message payload_json must include source_event_ids array (can be empty)"
        ));
    }

    Ok(())
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
            return Err(anyhow::anyhow!(
                "assistant_message.source_event_ids must be strings"
            ));
        };
        let (src_thread_id, src_type, src_seq) = conn
            .query_row(
                "SELECT thread_id, type, seq FROM events WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
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
        "INSERT OR IGNORE INTO blobs (id, rel_path, byte_len, mime, created_at)
     VALUES (?1, ?2, ?3, NULL, ?4)",
        params![blob_id, rel_path, byte_len, ts],
    )?;
    Ok(())
}

fn collect_blob_bin_files(dir: &Path, out: &mut Vec<PathBuf>) -> anyhow::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_blob_bin_files(&path, out)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if path
            .extension()
            .and_then(|v| v.to_str())
            .map(|v| v.eq_ignore_ascii_case("bin"))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
    Ok(())
}

fn file_modified_ts(path: &Path) -> Option<i64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_secs() as i64)
}

pub fn sweep_orphan_blobs(
    conn: &Connection,
    db_path: &Path,
    min_age_secs: i64,
    max_deletes: usize,
) -> anyhow::Result<BlobGcStats> {
    if !table_exists(conn, "events")? || !table_exists(conn, "blobs")? {
        return Ok(BlobGcStats::default());
    }

    let min_age_secs = min_age_secs.max(0);
    let max_deletes = if max_deletes == 0 {
        usize::MAX
    } else {
        max_deletes
    };
    let now = now_ts();
    let cutoff_ts = now.saturating_sub(min_age_secs);

    let mut live_refs: HashSet<String> = HashSet::new();
    {
        let mut stmt = conn.prepare("SELECT blob_ref, payload_json FROM events")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })?;
        for row in rows {
            let (blob_ref, payload_json) = row?;
            if let Some(blob_ref) = blob_ref {
                let cleaned = blob_ref.trim();
                if !cleaned.is_empty() {
                    live_refs.insert(cleaned.to_string());
                }
            }
            if let Some(payload_json) = payload_json {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload_json) {
                    let mut refs = Vec::new();
                    collect_blob_refs_from_json(&value, &mut refs);
                    for rel in refs {
                        let cleaned = rel.trim();
                        if !cleaned.is_empty() {
                            live_refs.insert(cleaned.to_string());
                        }
                    }
                }
            }
        }
    }

    let mut tracked_rows: Vec<(String, String, i64)> = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id, rel_path, created_at FROM blobs")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            tracked_rows.push(row?);
        }
    }

    let mut tracked_refs: HashSet<String> = HashSet::new();
    let mut stale_tracked_rows: Vec<(String, String)> = Vec::new();
    for (blob_id, rel_path, created_at) in tracked_rows {
        tracked_refs.insert(rel_path.clone());
        if live_refs.contains(&rel_path) {
            continue;
        }
        if created_at > cutoff_ts {
            continue;
        }
        stale_tracked_rows.push((blob_id, rel_path));
    }

    let mut stats = BlobGcStats::default();
    for (blob_id, rel_path) in stale_tracked_rows {
        if stats.deleted_tracked_blobs + stats.deleted_untracked_files >= max_deletes {
            break;
        }
        if let Ok(abs_path) = crate::blob_store::blob_abs_path(db_path, &rel_path) {
            let _ = fs::remove_file(abs_path);
        }
        conn.execute("DELETE FROM blobs WHERE id = ?1", params![blob_id])?;
        tracked_refs.remove(&rel_path);
        stats.deleted_tracked_blobs += 1;
    }

    let blob_root = crate::blob_store::blob_root(db_path);
    let db_root = db_path.parent().unwrap_or_else(|| Path::new("."));
    let mut disk_blob_paths = Vec::new();
    collect_blob_bin_files(&blob_root, &mut disk_blob_paths)?;
    for abs_path in disk_blob_paths {
        if stats.deleted_tracked_blobs + stats.deleted_untracked_files >= max_deletes {
            break;
        }
        let Ok(rel_path) = abs_path.strip_prefix(db_root) else {
            continue;
        };
        let rel_str = rel_path.to_string_lossy().replace('\\', "/");
        if crate::blob_store::blob_id_from_rel_path(&rel_str).is_err() {
            continue;
        }
        if tracked_refs.contains(&rel_str) || live_refs.contains(&rel_str) {
            continue;
        }
        if min_age_secs > 0 {
            let Some(modified_ts) = file_modified_ts(&abs_path) else {
                continue;
            };
            if modified_ts > cutoff_ts {
                continue;
            }
        }

        match fs::remove_file(&abs_path) {
            Ok(()) => {
                stats.deleted_untracked_files += 1;
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {}
        }
    }

    Ok(stats)
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

fn meta_fields_from_payload(
    payload_json: Option<&str>,
) -> (Option<String>, Option<String>, Option<String>) {
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

pub fn list_threads(conn: &Connection) -> anyhow::Result<Vec<ThreadRecord>> {
    let mut stmt = conn.prepare(
    "SELECT id, title, engine_id, model_id, thread_lane, storage_mode, project_id, workspace_path, workspace_fingerprint, community_id, COALESCE(context_version, 0), created_at, updated_at, last_event_at, COALESCE(last_seq, 0)
     FROM threads ORDER BY COALESCE(last_event_at, updated_at) DESC",
  )?;
    let rows = stmt.query_map([], |row| {
        Ok(ThreadRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            engine_id: row.get(2)?,
            model_id: row.get(3)?,
            thread_lane: row.get(4)?,
            storage_mode: row.get(5)?,
            project_id: row.get(6)?,
            workspace_path: row.get(7)?,
            workspace_fingerprint: row.get(8)?,
            community_id: row.get(9)?,
            context_version: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            last_event_at: row.get(13)?,
            last_seq: row.get(14)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_thread_by_id(
    conn: &Connection,
    thread_id: &str,
) -> anyhow::Result<Option<ThreadRecord>> {
    let mut stmt = conn.prepare(
    "SELECT id, title, engine_id, model_id, thread_lane, storage_mode, project_id, workspace_path, workspace_fingerprint, community_id, COALESCE(context_version, 0), created_at, updated_at, last_event_at, COALESCE(last_seq, 0)
     FROM threads WHERE id = ?1",
  )?;
    let result = stmt.query_row(params![thread_id], |row| {
        Ok(ThreadRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            engine_id: row.get(2)?,
            model_id: row.get(3)?,
            thread_lane: row.get(4)?,
            storage_mode: row.get(5)?,
            project_id: row.get(6)?,
            workspace_path: row.get(7)?,
            workspace_fingerprint: row.get(8)?,
            community_id: row.get(9)?,
            context_version: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            last_event_at: row.get(13)?,
            last_seq: row.get(14)?,
        })
    });
    match result {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.into()),
    }
}

pub fn list_events(
    conn: &Connection,
    thread_id: &str,
    limit: usize,
) -> anyhow::Result<Vec<EventRecord>> {
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
    let include = if include_engine_io_chunk {
        1_i64
    } else {
        0_i64
    };
    let rows = stmt.query_map(
        params![thread_id, after_seq, include, clamped as i64],
        |row| {
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
        },
    )?;
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

pub fn list_turns(
    conn: &Connection,
    thread_id: &str,
    limit: usize,
) -> anyhow::Result<Vec<TurnRecord>> {
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
    let _ = conn.execute(
        "DELETE FROM session_state WHERE session_id = ?1",
        params![thread_id],
    );
    let _ = conn.execute(
        "DELETE FROM session_tags WHERE session_id = ?1",
        params![thread_id],
    );
    let _ = conn.execute(
        "DELETE FROM messages WHERE session_id = ?1",
        params![thread_id],
    );

    // Harness-era tables (optional cleanup; safe no-ops if absent).
    // Internal tool/audit tables removed in MVP. Older DBs may still have them; leave untouched.
    let _ = conn.execute(
        "DELETE FROM context_injections WHERE session_id = ?1",
        params![thread_id],
    );

    Ok(())
}

pub fn set_thread_workspace_path(
    conn: &Connection,
    thread_id: &str,
    workspace_path: Option<&str>,
    workspace_fingerprint: Option<&str>,
) -> anyhow::Result<()> {
    let ts = now_ts();
    let cleaned = workspace_path.map(|p| p.trim()).filter(|p| !p.is_empty());
    let cleaned_fingerprint = workspace_fingerprint
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    conn.execute(
        "UPDATE threads
     SET workspace_path = ?1, workspace_fingerprint = ?2, updated_at = ?3
     WHERE id = ?4",
        params![cleaned, cleaned_fingerprint, ts, thread_id],
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
    let cleaned_scope = workspace_scope_id
        .map(|p| p.trim())
        .filter(|p| !p.is_empty());

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

pub fn set_thread_title(
    conn: &Connection,
    thread_id: &str,
    title: Option<&str>,
) -> anyhow::Result<()> {
    let ts = now_ts();
    let cleaned_title = normalize_thread_title_for_storage(title);
    conn.execute(
        "UPDATE threads
     SET title = ?1, updated_at = ?2
     WHERE id = ?3",
        params![cleaned_title.as_deref(), ts, thread_id],
    )?;
    Ok(())
}

pub fn set_thread_context(
    conn: &Connection,
    thread_id: &str,
    thread_lane: Option<&str>,
    project_id: Option<Option<&str>>,
    community_id: Option<Option<&str>>,
    expected_context_version: Option<i64>,
) -> anyhow::Result<ThreadContextSetResult> {
    let current =
        get_thread_by_id(conn, thread_id)?.ok_or_else(|| anyhow::anyhow!("thread not found"))?;

    if let Some(expected) = expected_context_version {
        if current.context_version != expected {
            return Err(anyhow::anyhow!(
                "thread context version conflict: expected {}, found {}",
                expected,
                current.context_version
            ));
        }
    }

    let next_lane = match thread_lane {
        Some(value) => normalize_thread_lane(Some(value)).to_string(),
        None => current.thread_lane.clone(),
    };
    let next_storage_mode = storage_mode_for_lane(next_lane.as_str()).to_string();

    let next_project = match project_id {
        Some(value) => value
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string()),
        None => current.project_id.clone(),
    };

    if let Some(ref project_id) = next_project {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM projects WHERE id = ?1 LIMIT 1",
                params![project_id],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_none() {
            return Err(anyhow::anyhow!("project not found"));
        }
    }

    let next_community = match community_id {
        Some(value) => value
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string()),
        None => current.community_id.clone(),
    };

    let mut changed_fields: Vec<String> = Vec::new();
    if current.thread_lane != next_lane {
        changed_fields.push("thread_lane".to_string());
    }
    if current.storage_mode != next_storage_mode {
        changed_fields.push("storage_mode".to_string());
    }
    if current.project_id != next_project {
        changed_fields.push("project_id".to_string());
    }
    if current.community_id != next_community {
        changed_fields.push("community_id".to_string());
    }

    if changed_fields.is_empty() {
        return Ok(ThreadContextSetResult {
            thread: current,
            changed_fields,
        });
    }

    let ts = now_ts();
    let rows = if let Some(expected) = expected_context_version {
        conn.execute(
            "UPDATE threads
       SET thread_lane = ?1, storage_mode = ?2, project_id = ?3, community_id = ?4, context_version = context_version + 1, updated_at = ?5
       WHERE id = ?6 AND context_version = ?7",
            params![
                next_lane,
                next_storage_mode,
                next_project,
                next_community,
                ts,
                thread_id,
                expected
            ],
        )?
    } else {
        conn.execute(
            "UPDATE threads
       SET thread_lane = ?1, storage_mode = ?2, project_id = ?3, community_id = ?4, context_version = context_version + 1, updated_at = ?5
       WHERE id = ?6",
            params![
                next_lane,
                next_storage_mode,
                next_project,
                next_community,
                ts,
                thread_id
            ],
        )?
    };
    if rows == 0 {
        let latest = get_thread_by_id(conn, thread_id)?
            .ok_or_else(|| anyhow::anyhow!("thread not found"))?;
        if let Some(expected) = expected_context_version {
            return Err(anyhow::anyhow!(
                "thread context version conflict: expected {}, found {}",
                expected,
                latest.context_version
            ));
        }
        return Err(anyhow::anyhow!("thread not found"));
    }

    let updated =
        get_thread_by_id(conn, thread_id)?.ok_or_else(|| anyhow::anyhow!("thread not found"))?;

    Ok(ThreadContextSetResult {
        thread: updated,
        changed_fields,
    })
}

pub fn delete_project(conn: &Connection, project_id: &str) -> anyhow::Result<()> {
    let ts = now_ts();
    conn.execute(
        "UPDATE threads
     SET project_id = NULL,
         context_version = context_version + 1,
         updated_at = ?2
     WHERE project_id = ?1",
        params![project_id, ts],
    )?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
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
        "SELECT id, thread_id, seq, role, content_json, created_at, engine_id, model_id, run_id
     FROM messages_projection
     WHERE thread_id = ?1
     ORDER BY seq ASC",
    )?;

    let rows = stmt.query_map(params![session_id], |row| {
        Ok(MessageRecord {
            id: row.get(0)?,
            session_id: row.get(1)?,
            seq: row.get(2)?,
            role: row.get(3)?,
            content_json: row.get(4)?,
            created_at: row.get(5)?,
            engine_id: row.get(6)?,
            model_id: row.get(7)?,
            run_id: row.get(8)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }

    Ok(out)
}

pub fn list_messages_tail(
    conn: &Connection,
    session_id: &str,
    limit: usize,
) -> anyhow::Result<Vec<MessageRecord>> {
    let clamped = std::cmp::min(std::cmp::max(limit, 1), 2000);
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, seq, role, content_json, created_at, engine_id, model_id, run_id
     FROM messages_projection
     WHERE thread_id = ?1
     ORDER BY seq DESC
     LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![session_id, clamped as i64], |row| {
        Ok(MessageRecord {
            id: row.get(0)?,
            session_id: row.get(1)?,
            seq: row.get(2)?,
            role: row.get(3)?,
            content_json: row.get(4)?,
            created_at: row.get(5)?,
            engine_id: row.get(6)?,
            model_id: row.get(7)?,
            run_id: row.get(8)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    out.reverse();

    Ok(out)
}

pub fn list_messages_before_seq(
    conn: &Connection,
    session_id: &str,
    before_seq: i64,
    limit: usize,
) -> anyhow::Result<Vec<MessageRecord>> {
    if before_seq <= 1 {
        return Ok(Vec::new());
    }
    let clamped = std::cmp::min(std::cmp::max(limit, 1), 2000);
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, seq, role, content_json, created_at, engine_id, model_id, run_id
     FROM messages_projection
     WHERE thread_id = ?1
       AND seq < ?2
     ORDER BY seq DESC
     LIMIT ?3",
    )?;

    let rows = stmt.query_map(params![session_id, before_seq, clamped as i64], |row| {
        Ok(MessageRecord {
            id: row.get(0)?,
            session_id: row.get(1)?,
            seq: row.get(2)?,
            role: row.get(3)?,
            content_json: row.get(4)?,
            created_at: row.get(5)?,
            engine_id: row.get(6)?,
            model_id: row.get(7)?,
            run_id: row.get(8)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    out.reverse();

    Ok(out)
}

pub fn list_tool_calls(
    conn: &Connection,
    thread_id: &str,
    limit: usize,
) -> anyhow::Result<Vec<ToolCallRecord>> {
    let clamped = std::cmp::min(std::cmp::max(limit, 1), 2000);
    if table_exists(conn, "tool_calls")? {
        let mut stmt = conn.prepare(
            "SELECT tool_call_id, thread_id, run_id, tool_name, args_json, status,
              output_summary_json, stdout_excerpt, stderr_excerpt, exit_code, created_at, updated_at
       FROM tool_calls
       WHERE thread_id = ?1
       ORDER BY first_seq DESC, updated_at DESC, tool_call_id DESC
       LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![thread_id, clamped as i64], |row| {
            Ok(ToolCallRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                run_id: row.get(2)?,
                tool_name: row.get(3)?,
                args_json: row.get(4)?,
                status: row.get(5)?,
                output_summary_json: row.get(6)?,
                stdout_excerpt: row.get(7)?,
                stderr_excerpt: row.get(8)?,
                exit_code: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        out.reverse();
        return Ok(out);
    }

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

        let state = states
            .entry(tool_call_id.to_string())
            .or_insert_with(|| ToolCallState {
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
                    state.args_json =
                        serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string());
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
            summary.insert(
                "approved_by".to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
        if let Some(value) = state.note.as_deref() {
            summary.insert(
                "note".to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
        if let Some(value) = state.exec_status.as_deref() {
            summary.insert(
                "exec_status".to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
        if let Some(value) = state.reason.as_deref() {
            summary.insert(
                "reason".to_string(),
                serde_json::Value::String(value.to_string()),
            );
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
                Some(
                    serde_json::to_string(&serde_json::Value::Object(summary))
                        .unwrap_or_else(|_| "{}".to_string()),
                )
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

pub fn find_latest_successful_tool_call_by_key(
    conn: &Connection,
    thread_id: &str,
    tool_call_key: &str,
) -> anyhow::Result<Option<SuccessfulToolCallReuse>> {
    let key = tool_call_key.trim();
    if key.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT fin.payload_json
     FROM events req
     JOIN events fin
       ON fin.thread_id = req.thread_id
      AND fin.type = 'tool_call_finished'
      AND json_extract(fin.payload_json, '$.tool_call_id')
          = json_extract(req.payload_json, '$.tool_call_id')
     WHERE req.thread_id = ?1
       AND req.type = 'tool_call_requested'
       AND req.payload_json IS NOT NULL
       AND fin.payload_json IS NOT NULL
       AND json_extract(req.payload_json, '$.tool_call_key') = ?2
       AND json_extract(fin.payload_json, '$.status') = 'ok'
     ORDER BY fin.seq DESC
     LIMIT 1",
    )?;

    let payload_json: Option<String> = stmt
        .query_row(params![thread_id, key], |row| row.get(0))
        .optional()?;
    let Some(payload_json) = payload_json else {
        return Ok(None);
    };

    let payload: serde_json::Value = match serde_json::from_str(&payload_json) {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    let Some(tool_call_id) = payload
        .get("tool_call_id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };

    Ok(Some(SuccessfulToolCallReuse {
        tool_call_id: tool_call_id.to_string(),
        result_preview: payload
            .get("result_preview")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string()),
        tool_result: payload
            .get("tool_result")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string()),
        tool_result_blob_ref: payload
            .get("tool_result_blob_ref")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string()),
    }))
}

pub fn find_latest_finished_tool_call_by_key(
    conn: &Connection,
    thread_id: &str,
    tool_call_key: &str,
) -> anyhow::Result<Option<LatestFinishedToolCallByKey>> {
    let key = tool_call_key.trim();
    if key.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT fin.payload_json
     FROM events req
     JOIN events fin
       ON fin.thread_id = req.thread_id
      AND fin.type = 'tool_call_finished'
      AND json_extract(fin.payload_json, '$.tool_call_id')
          = json_extract(req.payload_json, '$.tool_call_id')
     WHERE req.thread_id = ?1
       AND req.type = 'tool_call_requested'
       AND req.payload_json IS NOT NULL
       AND fin.payload_json IS NOT NULL
       AND json_extract(req.payload_json, '$.tool_call_key') = ?2
     ORDER BY fin.seq DESC
     LIMIT 1",
    )?;

    let payload_json: Option<String> = stmt
        .query_row(params![thread_id, key], |row| row.get(0))
        .optional()?;
    let Some(payload_json) = payload_json else {
        return Ok(None);
    };

    let payload: serde_json::Value = match serde_json::from_str(&payload_json) {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };
    let Some(tool_call_id) = payload
        .get("tool_call_id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };
    let status = payload
        .get("status")
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or("unknown")
        .to_string();
    let reason = payload
        .get("reason")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    Ok(Some(LatestFinishedToolCallByKey {
        tool_call_id: tool_call_id.to_string(),
        status,
        reason,
    }))
}

pub fn db_path(base_dir: &Path) -> PathBuf {
    base_dir.join("arx")
}

pub fn resolve_db_key_for_mode(
    is_debug_build: bool,
    configured_key: Option<&str>,
) -> anyhow::Result<String> {
    configured_key
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
        .or_else(|| is_debug_build.then(|| "dev-only-key".to_string()))
        .ok_or_else(|| {
            anyhow::anyhow!(
                "ARX_DB_KEY is required for non-debug runtime. Set ARX_DB_KEY to a non-empty value."
            )
        })
}

pub fn resolve_db_key() -> anyhow::Result<String> {
    let configured = std::env::var("ARX_DB_KEY").ok();
    resolve_db_key_for_mode(cfg!(debug_assertions), configured.as_deref())
}

pub fn run_blob_gc_if_due(
    db_path: &Path,
    key: &str,
    min_age_secs: i64,
    min_interval_secs: i64,
    max_deletes: usize,
) -> anyhow::Result<BlobGcRunOutcome> {
    let _guard = match BLOB_GC_MUTEX.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    let conn = open_conn(db_path, key)?;
    let now = now_ts();
    let min_interval_secs = min_interval_secs.max(0);
    let last_run_at = get_ui_state(&conn, BLOB_GC_LAST_RUN_UI_KEY)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    if last_run_at > 0 && now.saturating_sub(last_run_at) < min_interval_secs {
        return Ok(BlobGcRunOutcome::SkippedNotDue);
    }

    let stats = sweep_orphan_blobs(&conn, db_path, min_age_secs, max_deletes)?;
    set_ui_state(&conn, BLOB_GC_LAST_RUN_UI_KEY, &now.to_string())?;
    Ok(BlobGcRunOutcome::Ran(stats))
}

pub fn spawn_blob_gc_if_due(
    db_path: PathBuf,
    key: String,
    min_age_secs: i64,
    min_interval_secs: i64,
    max_deletes: usize,
) {
    std::thread::spawn(move || {
        match run_blob_gc_if_due(&db_path, &key, min_age_secs, min_interval_secs, max_deletes) {
            Ok(BlobGcRunOutcome::SkippedNotDue) => {}
            Ok(BlobGcRunOutcome::Ran(stats)) => {
                if stats.deleted_tracked_blobs > 0 || stats.deleted_untracked_files > 0 {
                    eprintln!(
                        "[blob-gc] cleaned tracked={} untracked={}",
                        stats.deleted_tracked_blobs, stats.deleted_untracked_files
                    );
                }
            }
            Err(err) => {
                eprintln!("[blob-gc] failed: {err:#}");
            }
        }
    });
}

pub fn spawn_default_blob_gc(db_path: PathBuf, key: String) {
    spawn_blob_gc_if_due(db_path, key, 24 * 60 * 60, 24 * 60 * 60, 256);
}

pub fn is_db_key_mismatch_error(err: &anyhow::Error) -> bool {
    let lower = format!("{err:#}").to_ascii_lowercase();
    lower.contains("file is encrypted or is not a database")
        || lower.contains("wrong key")
        || lower.contains("file is not a database")
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
    use tempfile::tempdir;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn run_migrations_creates_contract_alignment_columns() {
        let conn = setup_conn();
        assert!(table_exists(&conn, "workspace_policies").expect("workspace_policies table exists"));
        assert!(column_exists(&conn, "threads", "workspace_fingerprint")
            .expect("threads.workspace_fingerprint exists"));
        assert!(column_exists(&conn, "threads", "context_version")
            .expect("threads.context_version exists"));
        assert!(column_exists(&conn, "blobs", "mime").expect("blobs.mime exists"));
    }

    #[test]
    fn resolve_db_key_for_release_requires_non_empty_env_value() {
        let missing = resolve_db_key_for_mode(false, None);
        assert!(missing.is_err(), "release mode should reject missing key");

        let blank = resolve_db_key_for_mode(false, Some("   "));
        assert!(blank.is_err(), "release mode should reject blank key");
    }

    #[test]
    fn resolve_db_key_for_release_accepts_configured_env_value() {
        let key = resolve_db_key_for_mode(false, Some("release-key"));
        assert_eq!(key.expect("release key resolves"), "release-key");
    }

    #[test]
    fn resolve_db_key_for_debug_uses_dev_fallback_when_missing() {
        let key = resolve_db_key_for_mode(true, None);
        assert_eq!(key.expect("debug key resolves"), "dev-only-key");
    }

    #[test]
    fn release_startup_bootstrap_rejects_missing_db_key() {
        let err = resolve_db_key_for_mode(false, None).expect_err("missing key should fail");
        assert!(
            err.to_string()
                .contains("ARX_DB_KEY is required for non-debug runtime"),
            "error should explain non-debug key requirement"
        );
    }

    #[test]
    fn release_startup_bootstrap_succeeds_with_explicit_db_key() {
        let tmp = tempdir().expect("create temp dir");
        let db_dir = db_path(tmp.path());
        let key = resolve_db_key_for_mode(false, Some("release-startup-key"))
            .expect("release mode should accept explicit key");

        let state = init_db(&db_dir, &key).expect("initialize database");
        let conn = open_conn(&state.db_path, &state.key).expect("open db connection");
        crash_recovery(&conn, &state.db_path).expect("crash recovery");

        if get_ui_state(&conn, "workspace_root")
            .expect("workspace_root lookup")
            .is_none()
        {
            set_ui_state(
                &conn,
                "workspace_root",
                tmp.path().to_string_lossy().as_ref(),
            )
            .expect("set workspace_root");
        }

        let workspace_root = get_ui_state(&conn, "workspace_root")
            .expect("workspace_root read")
            .unwrap_or_default();
        assert!(
            !workspace_root.trim().is_empty(),
            "workspace_root should be configured during bootstrap"
        );

        let outcome = run_blob_gc_if_due(&state.db_path, &state.key, 0, 0, 16)
            .expect("background gc runnable during startup");
        assert!(
            matches!(outcome, BlobGcRunOutcome::Ran(_)),
            "startup gc call should run when interval is zero"
        );
    }

    #[test]
    fn sweep_orphan_blobs_removes_unreferenced_blobs_and_keeps_referenced_evidence() {
        let tmp = tempdir().expect("create temp dir");
        let db_path = tmp.path().join("arx.db");
        let state = init_db_at(&db_path, "test-key").expect("init db at path");
        let conn = open_conn(&state.db_path, &state.key).expect("open conn");

        let thread = create_thread(
            &conn,
            "blob-gc",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("agent"),
            None,
        )
        .expect("create thread");

        let referenced_blob =
            crate::blob_store::write_blob(&state.db_path, b"referenced evidence blob")
                .expect("write referenced blob");
        append_event(
            &conn,
            &state.db_path,
            &thread.id,
            "engine_io_chunk",
            None,
            Some(
                &serde_json::json!({
                  "v": 1,
                  "run_id": "run-blob-gc",
                  "engine_id": "messages_agent",
                  "stream": "assistant",
                  "chunk_blob_ref": referenced_blob.rel_path
                })
                .to_string(),
            ),
            None,
        )
        .expect("append referenced engine chunk");

        let orphan_tracked_blob =
            crate::blob_store::write_blob(&state.db_path, b"orphan tracked blob")
                .expect("write tracked orphan blob");
        record_blob(
            &conn,
            &orphan_tracked_blob.id,
            &orphan_tracked_blob.rel_path,
            orphan_tracked_blob.byte_len,
        )
        .expect("record tracked orphan blob");

        let orphan_untracked_blob =
            crate::blob_store::write_blob(&state.db_path, b"orphan untracked blob")
                .expect("write untracked orphan blob");

        let referenced_abs =
            crate::blob_store::blob_abs_path(&state.db_path, &referenced_blob.rel_path)
                .expect("referenced abs path");
        let tracked_orphan_abs =
            crate::blob_store::blob_abs_path(&state.db_path, &orphan_tracked_blob.rel_path)
                .expect("tracked orphan abs path");
        let untracked_orphan_abs =
            crate::blob_store::blob_abs_path(&state.db_path, &orphan_untracked_blob.rel_path)
                .expect("untracked orphan abs path");
        assert!(
            referenced_abs.exists(),
            "referenced blob should exist before sweep"
        );
        assert!(
            tracked_orphan_abs.exists(),
            "tracked orphan should exist before sweep"
        );
        assert!(
            untracked_orphan_abs.exists(),
            "untracked orphan should exist before sweep"
        );

        let stats = sweep_orphan_blobs(&conn, &state.db_path, 0, 128).expect("sweep blobs");
        assert_eq!(stats.deleted_tracked_blobs, 1);
        assert_eq!(stats.deleted_untracked_files, 1);

        assert!(
            referenced_abs.exists(),
            "referenced blob should be retained"
        );
        assert!(
            !tracked_orphan_abs.exists(),
            "tracked orphan blob should be removed"
        );
        assert!(
            !untracked_orphan_abs.exists(),
            "untracked orphan blob should be removed"
        );

        let referenced_rows: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM blobs WHERE id = ?1",
                params![referenced_blob.id],
                |row| row.get(0),
            )
            .expect("count referenced rows");
        let tracked_orphan_rows: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM blobs WHERE id = ?1",
                params![orphan_tracked_blob.id],
                |row| row.get(0),
            )
            .expect("count tracked orphan rows");
        assert_eq!(referenced_rows, 1, "referenced blob row should stay");
        assert_eq!(
            tracked_orphan_rows, 0,
            "tracked orphan blob row should be removed"
        );
    }

    #[test]
    fn sweep_orphan_blobs_respects_max_deletes_per_run() {
        let tmp = tempdir().expect("create temp dir");
        let db_path = tmp.path().join("arx.db");
        let state = init_db_at(&db_path, "test-key").expect("init db at path");
        let conn = open_conn(&state.db_path, &state.key).expect("open conn");

        let orphan_a =
            crate::blob_store::write_blob(&state.db_path, b"orphan-a").expect("write orphan a");
        let orphan_b =
            crate::blob_store::write_blob(&state.db_path, b"orphan-b").expect("write orphan b");
        record_blob(&conn, &orphan_a.id, &orphan_a.rel_path, orphan_a.byte_len)
            .expect("record orphan a");
        record_blob(&conn, &orphan_b.id, &orphan_b.rel_path, orphan_b.byte_len)
            .expect("record orphan b");

        let stats = sweep_orphan_blobs(&conn, &state.db_path, 0, 1).expect("sweep with cap");
        assert_eq!(
            stats.deleted_tracked_blobs + stats.deleted_untracked_files,
            1,
            "exactly one blob should be removed under max_deletes=1"
        );

        let remaining_rows: i64 = conn
            .query_row("SELECT COUNT(1) FROM blobs", [], |row| row.get(0))
            .expect("count remaining blobs");
        assert_eq!(remaining_rows, 1, "one tracked orphan should remain");
    }

    #[test]
    fn run_blob_gc_if_due_skips_when_recently_run() {
        let tmp = tempdir().expect("create temp dir");
        let db_path = tmp.path().join("arx.db");
        let state = init_db_at(&db_path, "test-key").expect("init db at path");

        let first =
            run_blob_gc_if_due(&state.db_path, &state.key, 0, 60, 128).expect("first gc outcome");
        assert!(
            matches!(first, BlobGcRunOutcome::Ran(_)),
            "first run should execute"
        );

        let second =
            run_blob_gc_if_due(&state.db_path, &state.key, 0, 60, 128).expect("second gc outcome");
        assert!(
            matches!(second, BlobGcRunOutcome::SkippedNotDue),
            "second run should skip due to interval"
        );
    }

    #[test]
    fn set_thread_context_updates_multiple_fields_atomically() {
        let conn = setup_conn();
        let project = upsert_project(
            &conn,
            Some("Project A"),
            "/tmp/arx/project-a",
            None,
            None,
            "fingerprint::project-a",
        )
        .expect("create project");
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let result = set_thread_context(
            &conn,
            &thread.id,
            Some("agent"),
            Some(Some(project.id.as_str())),
            Some(Some("community-a")),
            None,
        )
        .expect("set thread context");

        assert_eq!(
            result.changed_fields,
            vec![
                "thread_lane".to_string(),
                "storage_mode".to_string(),
                "project_id".to_string(),
                "community_id".to_string()
            ]
        );
        assert_eq!(result.thread.thread_lane, THREAD_LANE_AGENT);
        assert_eq!(result.thread.storage_mode, THREAD_STORAGE_MODE_LOCAL);
        assert_eq!(
            result.thread.project_id.as_deref(),
            Some(project.id.as_str())
        );
        assert_eq!(result.thread.community_id.as_deref(), Some("community-a"));
        assert_eq!(result.thread.context_version, 1);
    }

    #[test]
    fn set_thread_context_can_clear_community_without_touching_other_fields() {
        let conn = setup_conn();
        let project = upsert_project(
            &conn,
            Some("Project B"),
            "/tmp/arx/project-b",
            None,
            None,
            "fingerprint::project-b",
        )
        .expect("create project");
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let _ = set_thread_context(
            &conn,
            &thread.id,
            Some("agent"),
            Some(Some(project.id.as_str())),
            Some(Some("community-a")),
            None,
        )
        .expect("prime thread context");

        let cleared = set_thread_context(&conn, &thread.id, None, None, Some(None), None)
            .expect("clear community context");
        assert_eq!(cleared.changed_fields, vec!["community_id".to_string()]);
        assert_eq!(cleared.thread.thread_lane, THREAD_LANE_AGENT);
        assert_eq!(cleared.thread.storage_mode, THREAD_STORAGE_MODE_LOCAL);
        assert_eq!(
            cleared.thread.project_id.as_deref(),
            Some(project.id.as_str())
        );
        assert_eq!(cleared.thread.community_id, None);
        assert_eq!(cleared.thread.context_version, 2);
    }

    #[test]
    fn set_thread_context_rejects_unknown_project() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let result = set_thread_context(
            &conn,
            &thread.id,
            None,
            Some(Some("missing-project")),
            None,
            None,
        );
        assert!(result.is_err(), "missing project should fail");
        let err = result.err().expect("error");
        assert!(err.to_string().contains("project not found"));
    }

    #[test]
    fn set_thread_context_lane_switches_preserve_project_and_community() {
        let conn = setup_conn();
        let project = upsert_project(
            &conn,
            Some("Project C"),
            "/tmp/arx/project-c",
            None,
            None,
            "fingerprint::project-c",
        )
        .expect("create project");
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let primed = set_thread_context(
            &conn,
            &thread.id,
            Some("agent"),
            Some(Some(project.id.as_str())),
            Some(Some("community-a")),
            Some(0),
        )
        .expect("prime thread context");
        assert_eq!(primed.thread.context_version, 1);
        assert_eq!(primed.thread.thread_lane, THREAD_LANE_AGENT);
        assert_eq!(
            primed.thread.project_id.as_deref(),
            Some(project.id.as_str())
        );
        assert_eq!(primed.thread.community_id.as_deref(), Some("community-a"));

        let to_chat = set_thread_context(&conn, &thread.id, Some("chat"), None, None, Some(1))
            .expect("switch lane to chat");
        assert_eq!(
            to_chat.changed_fields,
            vec!["thread_lane".to_string(), "storage_mode".to_string()]
        );
        assert_eq!(to_chat.thread.context_version, 2);
        assert_eq!(to_chat.thread.thread_lane, THREAD_LANE_CHAT);
        assert_eq!(to_chat.thread.storage_mode, THREAD_STORAGE_MODE_CLOUD);
        assert_eq!(
            to_chat.thread.project_id.as_deref(),
            Some(project.id.as_str())
        );
        assert_eq!(to_chat.thread.community_id.as_deref(), Some("community-a"));

        let back_to_agent =
            set_thread_context(&conn, &thread.id, Some("agent"), None, None, Some(2))
                .expect("switch lane back to agent");
        assert_eq!(
            back_to_agent.changed_fields,
            vec!["thread_lane".to_string(), "storage_mode".to_string()]
        );
        assert_eq!(back_to_agent.thread.context_version, 3);
        assert_eq!(back_to_agent.thread.thread_lane, THREAD_LANE_AGENT);
        assert_eq!(back_to_agent.thread.storage_mode, THREAD_STORAGE_MODE_LOCAL);
        assert_eq!(
            back_to_agent.thread.project_id.as_deref(),
            Some(project.id.as_str())
        );
        assert_eq!(
            back_to_agent.thread.community_id.as_deref(),
            Some("community-a")
        );
    }

    #[test]
    fn set_thread_context_allows_repeated_community_switches_with_monotonic_version() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("agent"),
            None,
        )
        .expect("create thread");

        let mut expected_version = thread.context_version;
        let sequence: Vec<Option<&str>> = vec![
            Some("community-a"),
            Some("community-b"),
            Some("community-a"),
            None,
            Some("community-c"),
        ];

        for expected_community in sequence {
            let updated = set_thread_context(
                &conn,
                &thread.id,
                None,
                None,
                Some(expected_community),
                Some(expected_version),
            )
            .expect("apply community lens patch");
            expected_version += 1;
            assert_eq!(updated.thread.context_version, expected_version);
            assert_eq!(updated.thread.community_id.as_deref(), expected_community);
        }
    }

    #[test]
    fn set_thread_context_updates_do_not_bleed_across_threads() {
        let conn = setup_conn();
        let thread_a = create_thread(
            &conn,
            "thread_a",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("agent"),
            None,
        )
        .expect("create thread a");
        let thread_b = create_thread(
            &conn,
            "thread_b",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("chat"),
            None,
        )
        .expect("create thread b");

        let _ = set_thread_context(
            &conn,
            &thread_a.id,
            None,
            None,
            Some(Some("community-a")),
            Some(0),
        )
        .expect("set community on thread a");
        let _ = set_thread_context(
            &conn,
            &thread_a.id,
            None,
            None,
            Some(Some("community-b")),
            Some(1),
        )
        .expect("switch community on thread a");

        let updated_a = get_thread_by_id(&conn, &thread_a.id)
            .expect("lookup thread a")
            .expect("thread a exists");
        let updated_b = get_thread_by_id(&conn, &thread_b.id)
            .expect("lookup thread b")
            .expect("thread b exists");

        assert_eq!(updated_a.community_id.as_deref(), Some("community-b"));
        assert_eq!(updated_a.context_version, 2);
        assert_eq!(updated_b.community_id, None);
        assert_eq!(updated_b.context_version, 0);
        assert_eq!(updated_b.thread_lane, THREAD_LANE_CHAT);
    }

    #[test]
    fn set_thread_context_project_patch_preserves_community_lens() {
        let conn = setup_conn();
        let project_a = upsert_project(
            &conn,
            Some("Project A"),
            "/tmp/arx/project-a",
            None,
            None,
            "fingerprint::project-a",
        )
        .expect("create project a");
        let project_b = upsert_project(
            &conn,
            Some("Project B"),
            "/tmp/arx/project-b",
            None,
            None,
            "fingerprint::project-b",
        )
        .expect("create project b");
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("agent"),
            None,
        )
        .expect("create thread");

        let primed = set_thread_context(
            &conn,
            &thread.id,
            None,
            Some(Some(project_a.id.as_str())),
            Some(Some("community-a")),
            Some(0),
        )
        .expect("prime thread context");
        assert_eq!(primed.thread.context_version, 1);
        assert_eq!(
            primed.thread.project_id.as_deref(),
            Some(project_a.id.as_str())
        );
        assert_eq!(primed.thread.community_id.as_deref(), Some("community-a"));

        let moved = set_thread_context(
            &conn,
            &thread.id,
            None,
            Some(Some(project_b.id.as_str())),
            None,
            Some(1),
        )
        .expect("switch project");
        assert_eq!(moved.thread.context_version, 2);
        assert_eq!(
            moved.thread.project_id.as_deref(),
            Some(project_b.id.as_str())
        );
        assert_eq!(moved.thread.community_id.as_deref(), Some("community-a"));
        assert_eq!(moved.thread.thread_lane, THREAD_LANE_AGENT);
    }

    #[test]
    fn set_thread_context_increments_context_version() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");
        assert_eq!(thread.context_version, 0);

        let updated = set_thread_context(
            &conn,
            &thread.id,
            Some("agent"),
            None,
            Some(Some("community-a")),
            Some(0),
        )
        .expect("set context with expected version");
        assert_eq!(updated.thread.context_version, 1);
        assert_eq!(updated.thread.thread_lane, THREAD_LANE_AGENT);
        assert_eq!(updated.thread.community_id.as_deref(), Some("community-a"));
    }

    #[test]
    fn set_thread_context_rejects_stale_expected_version() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let _ = set_thread_context(
            &conn,
            &thread.id,
            Some("agent"),
            None,
            Some(Some("community-a")),
            Some(0),
        )
        .expect("prime context with expected version");

        let stale = set_thread_context(
            &conn,
            &thread.id,
            None,
            None,
            Some(Some("community-b")),
            Some(0),
        );
        assert!(stale.is_err(), "stale context version should fail");
        let err = stale.err().expect("stale version error");
        assert!(err.to_string().contains("thread context version conflict"));

        let fresh = set_thread_context(
            &conn,
            &thread.id,
            None,
            None,
            Some(Some("community-b")),
            Some(1),
        )
        .expect("fresh context version should apply");
        assert_eq!(fresh.thread.context_version, 2);
        assert_eq!(fresh.thread.community_id.as_deref(), Some("community-b"));
    }

    #[test]
    fn set_thread_context_rejects_stale_expected_version_for_project_patch() {
        let conn = setup_conn();
        let project_a = upsert_project(
            &conn,
            Some("Project A"),
            "/tmp/arx/project-a",
            None,
            None,
            "fingerprint::project-a",
        )
        .expect("create project a");
        let project_b = upsert_project(
            &conn,
            Some("Project B"),
            "/tmp/arx/project-b",
            None,
            None,
            "fingerprint::project-b",
        )
        .expect("create project b");
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let _ = set_thread_context(
            &conn,
            &thread.id,
            None,
            Some(Some(project_a.id.as_str())),
            None,
            Some(0),
        )
        .expect("prime context with project a");

        let stale = set_thread_context(
            &conn,
            &thread.id,
            None,
            Some(Some(project_b.id.as_str())),
            None,
            Some(0),
        );
        assert!(stale.is_err(), "stale project context version should fail");
        let err = stale.err().expect("stale project version error");
        assert!(err.to_string().contains("thread context version conflict"));

        let fresh = set_thread_context(
            &conn,
            &thread.id,
            None,
            Some(Some(project_b.id.as_str())),
            None,
            Some(1),
        )
        .expect("fresh project context version should apply");
        assert_eq!(
            fresh.thread.project_id.as_deref(),
            Some(project_b.id.as_str())
        );
        assert_eq!(fresh.thread.context_version, 2);
    }

    #[test]
    fn delete_project_clears_thread_project_and_bumps_context_version() {
        let conn = setup_conn();
        let project = upsert_project(
            &conn,
            Some("Project A"),
            "/tmp/arx/project-a",
            None,
            None,
            "fingerprint::project-a",
        )
        .expect("create project");
        let thread_in_project = create_thread(
            &conn,
            "in_project",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("agent"),
            Some(project.id.as_str()),
        )
        .expect("create thread in project");
        let thread_other = create_thread(
            &conn,
            "other",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("chat"),
            None,
        )
        .expect("create thread outside project");

        delete_project(&conn, &project.id).expect("delete project");

        let updated_in_project = get_thread_by_id(&conn, &thread_in_project.id)
            .expect("lookup in-project thread")
            .expect("in-project thread exists");
        let updated_other = get_thread_by_id(&conn, &thread_other.id)
            .expect("lookup other thread")
            .expect("other thread exists");

        assert_eq!(updated_in_project.project_id, None);
        assert_eq!(
            updated_in_project.context_version,
            thread_in_project.context_version + 1
        );
        assert_eq!(updated_other.context_version, thread_other.context_version);
    }

    #[test]
    fn list_events_since_respects_engine_chunk_filter() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
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
        let engine_chunk = append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread.id,
            "engine_io_chunk",
            Some("chunk"),
            Some(r#"{"v":1,"run_id":"run-1","engine_id":"messages_agent"}"#),
            None,
        )
        .expect("append chunk");
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread.id,
            "assistant_message",
            Some("a"),
            Some(
                &serde_json::json!({
                  "v": 1,
                  "source_event_ids": [engine_chunk.id],
                  "meta": { "run_id": "run-1" }
                })
                .to_string(),
            ),
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
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");
        let thread_id = thread.id.clone();

        let requested = serde_json::json!({
          "v": 1,
          "run_id": "run-1",
          "tool_call_id": "call-1",
          "tool_call_key": "key-call-1",
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

    #[test]
    fn append_event_contract_rejects_missing_contract_version() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let payload_without_v = serde_json::json!({
          "run_id": "run-1",
          "status": "ok"
        });
        let result = append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread.id,
            "run_finished",
            None,
            Some(&payload_without_v.to_string()),
            None,
        );
        assert!(result.is_err(), "missing v should fail");
        let err = result.err().expect("error is present");
        assert!(err.to_string().contains("version"));
    }

    #[test]
    fn append_event_contract_rejects_missing_run_id_for_engine_chunk() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let payload = serde_json::json!({
          "v": 1,
          "engine_id": "messages_agent",
          "chunk_text_preview": "partial"
        });
        let result = append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread.id,
            "engine_io_chunk",
            None,
            Some(&payload.to_string()),
            None,
        );
        assert!(result.is_err(), "missing run_id should fail");
        let err = result.err().expect("error is present");
        assert!(err.to_string().contains("run_id"));
    }

    #[test]
    fn append_event_contract_accepts_assistant_run_id_in_meta() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");

        let chunk = append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread.id,
            "engine_io_chunk",
            Some("chunk"),
            Some(r#"{"v":1,"run_id":"run-2","engine_id":"messages_agent"}"#),
            None,
        )
        .expect("append chunk");

        let assistant_payload = serde_json::json!({
          "v": 1,
          "meta": { "run_id": "run-2" },
          "source_event_ids": [chunk.id],
          "content": { "text": "done" }
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread.id,
            "assistant_message",
            Some("done"),
            Some(&assistant_payload.to_string()),
            None,
        )
        .expect("assistant event with meta.run_id should pass");
    }

    #[test]
    fn find_latest_successful_tool_call_by_key_prefers_latest_ok() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");
        let thread_id = thread.id.clone();
        let key = "same-logical-call";

        let requested_1 = serde_json::json!({
          "v": 1,
          "run_id": "run-1",
          "tool_call_id": "call-1",
          "tool_call_key": key,
          "tool_name": "read",
          "args": { "path": "README.md" }
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_requested",
            None,
            Some(&requested_1.to_string()),
            None,
        )
        .expect("append requested_1");

        let finished_1 = serde_json::json!({
          "v": 1,
          "run_id": "run-1",
          "tool_call_id": "call-1",
          "status": "ok",
          "result_preview": "first",
          "tool_result": "first result"
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_finished",
            None,
            Some(&finished_1.to_string()),
            None,
        )
        .expect("append finished_1");

        let requested_2 = serde_json::json!({
          "v": 1,
          "run_id": "run-1",
          "tool_call_id": "call-2",
          "tool_call_key": key,
          "tool_name": "read",
          "args": { "path": "README.md" }
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_requested",
            None,
            Some(&requested_2.to_string()),
            None,
        )
        .expect("append requested_2");

        let finished_2 = serde_json::json!({
          "v": 1,
          "run_id": "run-1",
          "tool_call_id": "call-2",
          "status": "error",
          "reason": "boom"
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_finished",
            None,
            Some(&finished_2.to_string()),
            None,
        )
        .expect("append finished_2");

        let requested_3 = serde_json::json!({
          "v": 1,
          "run_id": "run-2",
          "tool_call_id": "call-3",
          "tool_call_key": key,
          "tool_name": "read",
          "args": { "path": "README.md" }
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_requested",
            None,
            Some(&requested_3.to_string()),
            None,
        )
        .expect("append requested_3");

        let finished_3 = serde_json::json!({
          "v": 1,
          "run_id": "run-2",
          "tool_call_id": "call-3",
          "status": "ok",
          "result_preview": "third",
          "tool_result": "third result"
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_finished",
            None,
            Some(&finished_3.to_string()),
            None,
        )
        .expect("append finished_3");

        let hit = find_latest_successful_tool_call_by_key(&conn, &thread_id, key)
            .expect("lookup succeeds")
            .expect("reuse hit");
        assert_eq!(hit.tool_call_id, "call-3");
        assert_eq!(hit.result_preview.as_deref(), Some("third"));
        assert_eq!(hit.tool_result.as_deref(), Some("third result"));

        let missing = find_latest_successful_tool_call_by_key(&conn, &thread_id, "missing-key")
            .expect("lookup missing succeeds");
        assert!(missing.is_none());

        let latest_finished = find_latest_finished_tool_call_by_key(&conn, &thread_id, key)
            .expect("lookup finished succeeds")
            .expect("latest finished exists");
        assert_eq!(latest_finished.tool_call_id, "call-3");
        assert_eq!(latest_finished.status, "ok");

        let requested_4 = serde_json::json!({
          "v": 1,
          "run_id": "run-3",
          "tool_call_id": "call-4",
          "tool_call_key": "error-key",
          "tool_name": "bash",
          "args": { "cmd": "exit 1" }
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_requested",
            None,
            Some(&requested_4.to_string()),
            None,
        )
        .expect("append requested_4");

        let finished_4 = serde_json::json!({
          "v": 1,
          "run_id": "run-3",
          "tool_call_id": "call-4",
          "status": "error",
          "reason": "exit_code_nonzero"
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_finished",
            None,
            Some(&finished_4.to_string()),
            None,
        )
        .expect("append finished_4");

        let latest_error = find_latest_finished_tool_call_by_key(&conn, &thread_id, "error-key")
            .expect("lookup error-key succeeds")
            .expect("latest error exists");
        assert_eq!(latest_error.tool_call_id, "call-4");
        assert_eq!(latest_error.status, "error");
        assert_eq!(latest_error.reason.as_deref(), Some("exit_code_nonzero"));
    }

    #[test]
    fn rebuild_tool_calls_projection_matches_incremental_state() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "t",
            "messages_agent",
            Some("openai/gpt-5"),
            None,
            None,
        )
        .expect("create thread");
        let thread_id = thread.id.clone();

        let requested = serde_json::json!({
          "v": 1,
          "run_id": "run-2",
          "tool_call_id": "call-a",
          "tool_call_key": "key-call-a",
          "tool_name": "grep",
          "args": { "path": "src", "pat": "tool_call" }
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

        let finished = serde_json::json!({
          "v": 1,
          "run_id": "run-2",
          "tool_call_id": "call-a",
          "attempt": 1,
          "status": "ok",
          "result_preview": "found"
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

        let orphan_finished = serde_json::json!({
          "v": 1,
          "run_id": "run-2",
          "tool_call_id": "call-b",
          "attempt": 1,
          "status": "error",
          "reason": "missing file",
          "exit_code": 2
        });
        append_event(
            &conn,
            Path::new("/tmp/arx-tests"),
            &thread_id,
            "tool_call_finished",
            None,
            Some(&orphan_finished.to_string()),
            None,
        )
        .expect("append orphan finished");

        let incremental = list_tool_calls(&conn, &thread_id, 20).expect("incremental list");
        assert_eq!(incremental.len(), 2);

        conn.execute("DELETE FROM tool_calls", [])
            .expect("clear tool_calls projection");
        rebuild_tool_calls_projection(&conn).expect("rebuild tool_calls projection");

        let rebuilt = list_tool_calls(&conn, &thread_id, 20).expect("rebuilt list");
        assert_eq!(rebuilt.len(), incremental.len());
        for (a, b) in incremental.iter().zip(rebuilt.iter()) {
            assert_eq!(a.id, b.id);
            assert_eq!(a.status, b.status);
            assert_eq!(a.tool_name, b.tool_name);
            assert_eq!(a.args_json, b.args_json);
            assert_eq!(a.exit_code, b.exit_code);
            assert_eq!(a.stdout_excerpt, b.stdout_excerpt);
            assert_eq!(a.stderr_excerpt, b.stderr_excerpt);
            assert_eq!(a.output_summary_json, b.output_summary_json);
        }
    }

    #[test]
    fn append_event_derives_thread_title_once_from_first_user_message() {
        let conn = setup_conn();
        let thread = create_thread(
            &conn,
            "",
            "messages_agent",
            Some("openai/gpt-5"),
            Some("agent"),
            None,
        )
        .expect("create thread");
        assert!(thread.title.is_none(), "thread should start untitled");

        let first_payload = serde_json::json!({
          "v": 1,
          "role": "user",
          "content": { "text": "Build a local-first desktop runbook" }
        })
        .to_string();

        append_event(
            &conn,
            std::path::Path::new("."),
            &thread.id,
            "user_message",
            Some("Build a local-first desktop runbook"),
            Some(&first_payload),
            None,
        )
        .expect("append first user message");
        let after_first = get_thread_by_id(&conn, &thread.id)
            .expect("get thread")
            .expect("thread exists");
        assert_eq!(
            after_first.title.as_deref(),
            Some("Build a local-first desktop runbook")
        );

        set_thread_title(&conn, &thread.id, Some("Pinned manual title")).expect("set manual title");
        let second_payload = serde_json::json!({
          "v": 1,
          "role": "user",
          "content": { "text": "A later message should not overwrite manual title" }
        })
        .to_string();

        append_event(
            &conn,
            std::path::Path::new("."),
            &thread.id,
            "user_message",
            Some("A later message should not overwrite manual title"),
            Some(&second_payload),
            None,
        )
        .expect("append second user message");
        let after_second = get_thread_by_id(&conn, &thread.id)
            .expect("get thread")
            .expect("thread exists");
        assert_eq!(
            after_second.title.as_deref(),
            Some("Pinned manual title"),
            "manual title must remain authoritative"
        );
    }
}
