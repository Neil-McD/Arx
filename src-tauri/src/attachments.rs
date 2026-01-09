use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone)]
pub struct ImageAttachment {
    pub label: String,
    pub data_url: String,
}

static IMAGE_ATTACHMENTS: Lazy<Mutex<HashMap<String, Vec<ImageAttachment>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn push_image(session_id: &str, attachment: ImageAttachment) {
    let Ok(mut map) = IMAGE_ATTACHMENTS.lock() else {
        return;
    };
    map.entry(session_id.to_string()).or_default().push(attachment);
}

/// Returns a clone of queued images without clearing them.
pub fn peek_images(session_id: &str) -> Vec<ImageAttachment> {
    let Ok(map) = IMAGE_ATTACHMENTS.lock() else {
        return Vec::new();
    };
    map.get(session_id).cloned().unwrap_or_default()
}

/// Clears queued images for the session.
pub fn clear_images(session_id: &str) {
    let Ok(mut map) = IMAGE_ATTACHMENTS.lock() else {
        return;
    };
    map.remove(session_id);
}
