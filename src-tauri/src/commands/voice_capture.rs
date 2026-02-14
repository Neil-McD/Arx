#[tauri::command]
pub(crate) fn start_native_voice_capture_cmd(
    native_voice: tauri::State<crate::NativeVoiceCaptureManager>,
) -> Result<crate::NativeVoiceCaptureStarted, String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    native_voice
        .sender
        .send(crate::NativeVoiceWorkerCommand::Start { reply: reply_tx })
        .map_err(|_| "Native voice worker is unavailable.".to_string())?;
    reply_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Native voice worker timed out while starting capture.".to_string())?
}

#[tauri::command]
pub(crate) fn stop_native_voice_capture_cmd(
    native_voice: tauri::State<crate::NativeVoiceCaptureManager>,
) -> Result<crate::NativeVoiceCaptureStopped, String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    native_voice
        .sender
        .send(crate::NativeVoiceWorkerCommand::Stop { reply: reply_tx })
        .map_err(|_| "Native voice worker is unavailable.".to_string())?;
    reply_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "Native voice worker timed out while stopping capture.".to_string())?
}

#[tauri::command]
pub(crate) fn cancel_native_voice_capture_cmd(
    native_voice: tauri::State<crate::NativeVoiceCaptureManager>,
) -> Result<bool, String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    native_voice
        .sender
        .send(crate::NativeVoiceWorkerCommand::Cancel { reply: reply_tx })
        .map_err(|_| "Native voice worker is unavailable.".to_string())?;
    reply_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Native voice worker timed out while cancelling capture.".to_string())?
}
