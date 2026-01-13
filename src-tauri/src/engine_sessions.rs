use crate::db;
use crate::db::DbState;
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;
use tauri::Window;

#[derive(Serialize, Clone)]
pub struct PtyOutputPayload {
  pub tool_call_id: String,
  pub chunk: String,
  pub seq: u64,
}

#[derive(Serialize, Clone)]
pub struct PtyExitPayload {
  pub tool_call_id: String,
  pub exit_code: i32,
  pub seq: u64,
}

struct EngineSession {
  thread_id: String,
  engine_id: String,
  cwd: String,
  writer: Mutex<Box<dyn Write + Send>>,
  killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
  seq: AtomicU64,
}

static SESSIONS: Lazy<Mutex<HashMap<String, Arc<EngineSession>>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));

fn engine_command(engine_id: &str) -> Result<(String, Vec<String>), String> {
  match engine_id {
    "codex_cli" => Ok(("codex".to_string(), Vec::new())),
    other => Err(format!("unknown harness engine_id: {}", other)),
  }
}

pub fn ensure_engine_session(
  window: &Window,
  state: &DbState,
  thread_id: &str,
  engine_id: &str,
  cwd: &str,
) -> Result<(), String> {
  {
    let map = SESSIONS.lock().unwrap();
    if map.contains_key(thread_id) {
      return Ok(());
    }
  }

  let (cmd, args) = engine_command(engine_id)?;
  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize {
      rows: 24,
      cols: 80,
      pixel_width: 0,
      pixel_height: 0,
    })
    .map_err(|e| e.to_string())?;

  let mut builder = CommandBuilder::new(cmd);
  for arg in args {
    builder.arg(arg);
  }
  builder.cwd(cwd);

  let mut child = pair.slave.spawn_command(builder).map_err(|e| e.to_string())?;
  let killer = child.clone_killer();
  let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
  let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

  let session = Arc::new(EngineSession {
    thread_id: thread_id.to_string(),
    engine_id: engine_id.to_string(),
    cwd: cwd.to_string(),
    writer: Mutex::new(writer),
    killer: Mutex::new(killer),
    seq: AtomicU64::new(0),
  });

  {
    let mut map = SESSIONS.lock().unwrap();
    map.insert(thread_id.to_string(), session.clone());
  }

  // Reader thread: stream engine output to UI and persist to events.
  let db_path = state.db_path.clone();
  let db_key = state.key.clone();
  let window = window.clone();
  let thread_id_owned = thread_id.to_string();
  let session_for_reader = session.clone();
  thread::spawn(move || {
    let conn = db::open_conn(&db_path, &db_key).ok();
    let mut buf = [0u8; 4096];
    loop {
      let read = match reader.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => n,
        Err(_) => break,
      };
      let chunk = String::from_utf8_lossy(&buf[..read]).to_string();
      let seq = session_for_reader.seq.fetch_add(1, Ordering::SeqCst);
      let _ = window.emit(
        "pty-output",
        PtyOutputPayload {
          tool_call_id: thread_id_owned.clone(),
          chunk: chunk.clone(),
          seq,
        },
      );
      if let Some(conn) = conn.as_ref() {
        let _ = db::append_event(conn, &thread_id_owned, "engine_io_chunk", Some(&chunk), None, None);
      }
    }

    // Wait for process exit and emit exit event.
    let exit_code = child
      .wait()
      .ok()
      .map(|status| status.exit_code() as i32)
      .unwrap_or(-1);
    let seq = session_for_reader.seq.fetch_add(1, Ordering::SeqCst);
    let _ = window.emit(
      "pty-exit",
      PtyExitPayload {
        tool_call_id: thread_id_owned.clone(),
        exit_code,
        seq,
      },
    );
    if let Some(conn) = conn.as_ref() {
      let exit_text = format!("\n[engine exited with code {}]\n", exit_code);
      let _ = db::append_event(conn, &thread_id_owned, "engine_io_chunk", Some(&exit_text), None, None);
    }

    let mut map = SESSIONS.lock().unwrap();
    map.remove(&thread_id_owned);
  });

  Ok(())
}

pub fn write_to_engine(thread_id: &str, input: &str) -> Result<(), String> {
  let session = {
    let map = SESSIONS.lock().unwrap();
    map.get(thread_id).cloned()
  }
  .ok_or_else(|| "engine session not running".to_string())?;

  let mut writer = session.writer.lock().unwrap();
  writer.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
  writer.flush().map_err(|e| e.to_string())?;
  Ok(())
}

pub fn stop_engine(thread_id: &str) -> Result<(), String> {
  let session = {
    let map = SESSIONS.lock().unwrap();
    map.get(thread_id).cloned()
  }
  .ok_or_else(|| "engine session not running".to_string())?;

  let mut killer = session.killer.lock().unwrap();
  killer.kill().map_err(|e| e.to_string())
}

pub fn get_session_info(thread_id: &str) -> Option<(String, String)> {
  let map = SESSIONS.lock().unwrap();
  map.get(thread_id)
    .map(|s| (s.engine_id.clone(), s.cwd.clone()))
}
