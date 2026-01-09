use crate::agent::types::{
    openai_content_to_text, OpenAiMessage, OpenAiMessageContent, OpenAiRequest, OpenAiResponse,
    OpenAiTool, OpenAiToolFunction,
};
use crate::attachments;
use crate::tool_handlers::registry::build_default_registry;
use crate::tool_handlers::router::from_openai_tool_calls;
use crate::tool_handlers::context::ToolCall;
use crate::agent::ToolRejection;
use crate::agent::providers::ToolMode;

use keyring::Entry;
use tokio_util::sync::CancellationToken;

fn get_provider_key(provider: &str) -> Result<Option<String>, String> {
    let entry = Entry::new("com.arx.app", provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn build_openai_tools() -> Vec<OpenAiTool> {
    let registry = build_default_registry();
    let mut out = Vec::new();
    for spec in registry.specs() {
        let name = spec.name.to_string();
        out.push(OpenAiTool {
            kind: "function".to_string(),
            function: OpenAiToolFunction {
                name,
                description: spec.description.to_string(),
                parameters: spec.parameters,
            },
        });
    }
    out
}

fn build_openai_tools_for_mode(tool_mode: ToolMode) -> Vec<OpenAiTool> {
    let registry = build_default_registry();
    match tool_mode {
        ToolMode::All => build_openai_tools(),
        ToolMode::ReadOnly => registry
            .specs()
            .into_iter()
            .filter(|spec| {
                let name = spec.name.to_string();
                !registry.requires_approval(&name) && !registry.auto_apply(&name)
            })
            .map(|spec| OpenAiTool {
                kind: "function".to_string(),
                function: OpenAiToolFunction {
                    name: spec.name.to_string(),
                    description: spec.description.to_string(),
                    parameters: spec.parameters,
                },
            })
            .collect(),
    }
}

fn inject_queued_images(session_id: &str, messages: &mut Vec<OpenAiMessage>) {
    // Important: do not drain the queue here. The agent may retry the model call
    // (e.g., if the model "plans" a tool call in text but doesn't emit one).
    // The step loop clears images once it accepts a model response.
    let queued = attachments::peek_images(session_id);
    if queued.is_empty() {
        return;
    }

    let mut parts = Vec::new();
    for img in queued {
        if !img.label.trim().is_empty() {
            parts.push(crate::agent::types::OpenAiContentPart::Text {
                text: img.label,
            });
        }
        parts.push(crate::agent::types::OpenAiContentPart::ImageUrl {
            image_url: crate::agent::types::OpenAiImageUrl { url: img.data_url },
        });
    }

    messages.push(OpenAiMessage {
        role: "user".to_string(),
        content: OpenAiMessageContent::Parts(parts),
        tool_call_id: None,
        tool_calls: None,
    });
}

pub async fn call_openai(
    _app: &tauri::AppHandle,
    session_id: &str,
    messages: &[OpenAiMessage],
    model: &str,
    cancel_token: CancellationToken,
    tool_mode: ToolMode,
) -> Result<crate::agent::providers::ModelResponse, String> {
    let api_key = get_provider_key("openai")
        .ok()
        .flatten()
        .or_else(|| std::env::var("ARX_OPENAI_API_KEY").ok())
        .ok_or_else(|| "OpenAI not configured".to_string())?;
    let base_url = std::env::var("ARX_OPENAI_BASE_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

    let mut msgs = messages.to_vec();
    inject_queued_images(session_id, &mut msgs);

    let payload = OpenAiRequest {
        model: model.to_string(),
        messages: msgs,
        temperature: 0.2,
        tools: Some(build_openai_tools_for_mode(tool_mode)),
        tool_choice: None,
    };

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let send_fut = client.post(url).bearer_auth(api_key).json(&payload).send();
    let response = tokio::select! {
        _ = cancel_token.cancelled() => return Err("operation cancelled".to_string()),
        res = send_fut => res.map_err(|e| e.to_string())?,
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI error {}: {}", status.as_u16(), body));
    }

    let parsed: OpenAiResponse = response.json().await.map_err(|e| e.to_string())?;
    let choice = parsed.choices.first().ok_or_else(|| "No response".to_string())?;
    let assistant_text = openai_content_to_text(&choice.message.content);

    let (tool_calls, tool_rejections) = from_openai_tool_calls(&choice.message.tool_calls);

    Ok(crate::agent::providers::ModelResponse {
        assistant_text,
        tool_calls,
        tool_rejections,
    })
}

// Small helper to keep conversions local.
fn _to_tool_call_text(_calls: &[ToolCall], _rejections: &[ToolRejection]) {}
