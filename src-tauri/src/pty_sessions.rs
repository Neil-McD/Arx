use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const MAX_BUFFER_BYTES: usize = 2 * 1024 * 1024; // 2MB per session
const DEFAULT_YIELD_TIME_MS: u64 = 250;
const DEFAULT_MAX_OUTPUT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub struct PtyExecOutput {
    pub session_id: u64,
    pub output: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct PtyWriteOutput {
    pub output: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Copy)]
pub enum ShellKind {
    Bash,
    Zsh,
    Fish,
    PowerShell,
    Cmd,
}

impl ShellKind {
    pub fn from_str(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "bash" => Some(Self::Bash),
            "zsh" => Some(Self::Zsh),
            "fish" => Some(Self::Fish),
            "powershell" => Some(Self::PowerShell),
            "cmd" => Some(Self::Cmd),
            _ => None,
        }
    }
}

struct SessionState {
    writer: Mutex<Box<dyn Write + Send>>,
    output: Mutex<VecDeque<u8>>,
    exit_code: Mutex<Option<i32>>,
}

pub struct PtySessionManager {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<u64, Arc<SessionState>>>,
}

impl PtySessionManager {
    pub fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn exec_command(
        &self,
        cmd: &str,
        shell: ShellKind,
        cwd: &str,
        yield_time_ms: Option<u64>,
        max_output_bytes: Option<usize>,
    ) -> Result<PtyExecOutput, String> {
        let cmd = cmd.trim();
        if cmd.is_empty() {
            return Err("cmd is empty".to_string());
        }

        let session_id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY error: {e}"))?;

        let mut command = build_shell_command(shell, cmd);
        command.cwd(cwd);

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("failed to spawn command: {e}"))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("failed to clone PTY reader: {e}"))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("failed to open PTY writer: {e}"))?;

        let state = Arc::new(SessionState {
            writer: Mutex::new(writer),
            output: Mutex::new(VecDeque::new()),
            exit_code: Mutex::new(None),
        });

        {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| "PTY session store lock poisoned".to_string())?;
            sessions.insert(session_id, state.clone());
        }

        std::thread::spawn(move || {
            read_loop(reader, child, state);
        });

        let yield_ms = yield_time_ms.unwrap_or(DEFAULT_YIELD_TIME_MS).min(10_000);
        tokio::time::sleep(Duration::from_millis(yield_ms)).await;
        let output = self
            .drain_output(session_id, max_output_bytes.unwrap_or(DEFAULT_MAX_OUTPUT_BYTES))
            .unwrap_or_default();
        let exit_code = self.get_exit_code(session_id);
        Ok(PtyExecOutput {
            session_id,
            output,
            exit_code,
        })
    }

    pub async fn write_stdin(
        &self,
        session_id: u64,
        chars: &str,
        yield_time_ms: Option<u64>,
        max_output_bytes: Option<usize>,
    ) -> Result<PtyWriteOutput, String> {
        let state = self
            .get_session(session_id)
            .ok_or_else(|| format!("unknown session_id: {}", session_id))?;

        if !chars.is_empty() {
            let mut writer = state
                .writer
                .lock()
                .map_err(|_| "PTY writer lock poisoned".to_string())?;
            writer
                .write_all(chars.as_bytes())
                .map_err(|e| format!("write failed: {e}"))?;
            writer.flush().ok();
        }

        let yield_ms = yield_time_ms.unwrap_or(DEFAULT_YIELD_TIME_MS).min(10_000);
        tokio::time::sleep(Duration::from_millis(yield_ms)).await;
        let output = self
            .drain_output(session_id, max_output_bytes.unwrap_or(DEFAULT_MAX_OUTPUT_BYTES))
            .unwrap_or_default();
        let exit_code = self.get_exit_code(session_id);

        // Best-effort cleanup for finished sessions once their output is drained.
        if exit_code.is_some() && output.is_empty() {
            self.drop_session_if_empty(session_id);
        }

        Ok(PtyWriteOutput { output, exit_code })
    }

    fn get_session(&self, session_id: u64) -> Option<Arc<SessionState>> {
        self.sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(&session_id).cloned())
    }

    fn get_exit_code(&self, session_id: u64) -> Option<i32> {
        let state = self.get_session(session_id)?;
        state.exit_code.lock().ok().and_then(|v| *v)
    }

    fn drain_output(&self, session_id: u64, max_bytes: usize) -> Option<String> {
        let state = self.get_session(session_id)?;
        let mut buf = state.output.lock().ok()?;

        let take = max_bytes.min(buf.len());
        let mut bytes = Vec::with_capacity(take);
        for _ in 0..take {
            if let Some(b) = buf.pop_front() {
                bytes.push(b);
            }
        }
        drop(buf);

        Some(String::from_utf8_lossy(&bytes).to_string())
    }

    fn drop_session_if_empty(&self, session_id: u64) {
        let state = {
            let Ok(sessions) = self.sessions.lock() else {
                return;
            };
            sessions.get(&session_id).cloned()
        };
        let Some(state) = state else {
            return;
        };
        let Ok(buf) = state.output.lock() else {
            return;
        };
        if !buf.is_empty() {
            return;
        }
        drop(buf);

        let Ok(mut sessions) = self.sessions.lock() else {
            return;
        };
        sessions.remove(&session_id);
    }
}

fn build_shell_command(shell: ShellKind, cmd: &str) -> CommandBuilder {
    match shell {
        ShellKind::Bash => {
            let mut cb = CommandBuilder::new("bash");
            cb.arg("-lc");
            cb.arg(cmd);
            cb
        }
        ShellKind::Zsh => {
            let mut cb = CommandBuilder::new("zsh");
            cb.arg("-lc");
            cb.arg(cmd);
            cb
        }
        ShellKind::Fish => {
            let mut cb = CommandBuilder::new("fish");
            cb.arg("-lc");
            cb.arg(cmd);
            cb
        }
        ShellKind::PowerShell => {
            let mut cb = CommandBuilder::new("powershell");
            cb.arg("-NoLogo");
            cb.arg("-NoProfile");
            cb.arg("-Command");
            cb.arg(cmd);
            cb
        }
        ShellKind::Cmd => {
            let mut cb = CommandBuilder::new("cmd");
            cb.arg("/C");
            cb.arg(cmd);
            cb
        }
    }
}

fn read_loop(
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn portable_pty::Child + Send>,
    state: Arc<SessionState>,
) {
    let mut chunk = [0u8; 4096];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                if let Ok(mut out) = state.output.lock() {
                    for b in &chunk[..n] {
                        out.push_back(*b);
                    }
                    while out.len() > MAX_BUFFER_BYTES {
                        out.pop_front();
                    }
                }
            }
            Err(_) => break,
        }
    }

    let exit_code = child
        .wait()
        .ok()
        .map(|status| status.exit_code() as i32);
    if let Ok(mut guard) = state.exit_code.lock() {
        *guard = exit_code;
    }
}

static PTY_SESSIONS: Lazy<PtySessionManager> = Lazy::new(PtySessionManager::new);

pub fn pty_sessions() -> &'static PtySessionManager {
    &PTY_SESSIONS
}
