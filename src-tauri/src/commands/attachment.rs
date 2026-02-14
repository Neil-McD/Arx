use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub(crate) struct AttachmentResult {
    id: String,
    path: String,
    name: String,
    file_type: String, // "image" or "file"
    size: u64,
    preview_data_url: Option<String>,
}

#[tauri::command]
pub(crate) fn ingest_attachment_cmd(path: String) -> Result<AttachmentResult, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::fs;

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata = fs::metadata(&file_path).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    let size = metadata.len();
    let name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Determine file type based on extension.
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let image_extensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];
    let is_image = image_extensions.contains(&extension.as_str());
    let file_type = if is_image { "image" } else { "file" };

    // Generate preview for images (max 256KB for thumbnail).
    let preview_data_url = if is_image && size <= 5 * 1024 * 1024 {
        let bytes = fs::read(&file_path).ok();
        bytes.and_then(|data| {
            let preview_bytes = if data.len() > 256 * 1024 {
                &data[..256 * 1024]
            } else {
                &data[..]
            };
            let mime = match extension.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "svg" => "image/svg+xml",
                "bmp" => "image/bmp",
                "ico" => "image/x-icon",
                _ => "application/octet-stream",
            };
            if data.len() <= 256 * 1024 {
                Some(format!(
                    "data:{};base64,{}",
                    mime,
                    STANDARD.encode(preview_bytes)
                ))
            } else {
                None
            }
        })
    } else {
        None
    };

    let id = format!(
        "att_{}",
        uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string()
    );

    Ok(AttachmentResult {
        id,
        path: path.clone(),
        name,
        file_type: file_type.to_string(),
        size,
        preview_data_url,
    })
}
