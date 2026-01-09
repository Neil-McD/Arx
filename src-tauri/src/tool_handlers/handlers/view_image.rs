//! view_image handler - loads a local image and injects it into the next OpenAI request.
//!
//! The tool returns a small text acknowledgment; the actual base64 data is stored
//! in-process and attached as a multi-part user message on the next model call.

use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

use crate::attachments::{push_image, ImageAttachment};
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct ViewImageHandler;

const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024; // 2MB

#[derive(Deserialize)]
struct ViewImageArgs {
    #[serde(alias = "path")]
    file_path: String,
    #[serde(default)]
    label: Option<String>,
}

fn infer_mime(path: &str) -> Option<&'static str> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

#[async_trait]
impl ToolHandler for ViewImageHandler {
    fn name(&self) -> &'static str {
        "view_image"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "view_image",
            description: "Load a local image file (within workspace) so the model can inspect it in the next step (auto-exec).",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "Image path (relative to cwd unless absolute)." },
                    "path": { "type": "string", "description": "Alias for file_path (back-compat)." },
                    "label": { "type": "string", "description": "Optional label for the image (defaults to file name)." }
                },
                "required": ["file_path"],
                "additionalProperties": false
            }),
        }
    }

    fn requires_approval(&self) -> bool {
        false
    }

    fn is_parallel_safe(&self) -> bool {
        true
    }

    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: ViewImageArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;
        if args.file_path.trim().is_empty() {
            return Err(ToolError::InvalidArgs("file_path is empty".to_string()));
        }

        let mime = infer_mime(&args.file_path)
            .ok_or_else(|| ToolError::InvalidArgs("unsupported image type".to_string()))?;

        let root = ctx
            .workspace_root
            .as_deref()
            .unwrap_or_else(|| ctx.cwd.as_str());

        let root_canon = Path::new(root)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("invalid workspace root: {}", e)))?;
        let cwd_canon = Path::new(&ctx.cwd)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("invalid cwd: {}", e)))?;
        if !cwd_canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("cwd outside workspace root".to_string()));
        }

        let abs_path = if Path::new(&args.file_path).is_absolute() {
            args.file_path.clone()
        } else {
            Path::new(&ctx.cwd)
                .join(&args.file_path)
                .to_string_lossy()
                .to_string()
        };
        let canon = Path::new(&abs_path)
            .canonicalize()
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to resolve path: {}", e)))?;
        if !canon.starts_with(&root_canon) {
            return Err(ToolError::Rejected("path outside workspace root".to_string()));
        }

        let bytes = tokio::fs::read(&canon)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("failed to read image: {}", e)))?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(ToolError::Rejected(format!(
                "image too large ({} bytes, max {})",
                bytes.len(),
                MAX_IMAGE_BYTES
            )));
        }

        let b64 = STANDARD.encode(bytes);
        let data_url = format!("data:{};base64,{}", mime, b64);
        let label = args
            .label
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| {
                canon
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("image")
                    .to_string()
            });

        push_image(
            &ctx.session_id,
            ImageAttachment {
                label: label.clone(),
                data_url,
            },
        );

        Ok(ToolOutput::Success {
            content: format!("Queued image for inspection: {}", label),
        })
    }
}

