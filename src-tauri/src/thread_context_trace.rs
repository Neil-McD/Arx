use once_cell::sync::Lazy;
use std::time::{SystemTime, UNIX_EPOCH};

fn thread_context_trace_enabled() -> bool {
    static ENABLED: Lazy<bool> = Lazy::new(|| {
        matches!(
            std::env::var("ARX_TRACE_THREAD_CONTEXT")
                .ok()
                .map(|value| value.trim().to_ascii_lowercase())
                .as_deref(),
            Some("1") | Some("true") | Some("yes") | Some("on")
        )
    });
    *ENABLED
}

pub(crate) fn emit_thread_context_trace(event: &str, payload: serde_json::Value) {
    if !thread_context_trace_enabled() {
        return;
    }
    let ts_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let line = serde_json::json!({
      "event": event,
      "ts_ms": ts_ms,
      "payload": payload
    });
    eprintln!("[thread-context-trace] {}", line);
}
