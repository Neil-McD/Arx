mod anthropic;
mod google;
mod openai;
mod xai;

use crate::agent::types::OpenAiMessage;
use crate::agent::ToolRejection;
use crate::tool_handlers::context::ToolCall;
use tokio_util::sync::CancellationToken;

pub use anthropic::call_anthropic;
pub use google::call_google;
pub use openai::call_openai;
pub use xai::call_xai;

pub struct ModelResponse {
    pub assistant_text: String,
    pub tool_calls: Vec<ToolCall>,
    pub tool_rejections: Vec<ToolRejection>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolMode {
    All,
    ReadOnly,
}

pub fn resolve_model(model_id: &str) -> Result<(String, String), String> {
    match model_id {
        "gpt-5.1" => Ok(("openai".to_string(), "gpt-5.1-2025-11-13".to_string())),
        "gpt-5.2" => Ok(("openai".to_string(), "gpt-5.2".to_string())),
        "sonnet-4.5" => Ok(("anthropic".to_string(), "claude-3-5-sonnet-20240620".to_string())),
        "opus-4.5" => Ok(("anthropic".to_string(), "claude-3-opus-20240229".to_string())),
        "gemini-3-flash" => Ok(("google".to_string(), "gemini-1.5-flash".to_string())),
        "gemini-3-pro" => Ok(("google".to_string(), "gemini-1.5-pro".to_string())),
        "grok-4.1" => Ok(("xai".to_string(), "grok-beta".to_string())),
        _ => Err("Unknown model selection".to_string()),
    }
}

pub async fn call_model_once(
    app: &tauri::AppHandle,
    session_id: &str,
    model_id: &str,
    messages: &[OpenAiMessage],
    cancel_token: CancellationToken,
    tool_mode: ToolMode,
) -> Result<(String, ModelResponse), String> {
    let (provider, model) = resolve_model(model_id)?;
    let response = match provider.as_str() {
        "openai" => call_openai(app, session_id, messages, &model, cancel_token, tool_mode).await,
        "xai" => call_xai(app, session_id, messages, &model, cancel_token, tool_mode).await,
        "anthropic" => call_anthropic(app, session_id, messages, &model, cancel_token, tool_mode).await,
        "google" => call_google(app, session_id, messages, &model, cancel_token, tool_mode).await,
        _ => Err("Unknown provider".to_string()),
    }?;
    Ok((provider, response))
}
