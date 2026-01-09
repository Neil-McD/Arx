use crate::agent::types::{
    AnthropicContent, AnthropicMessage, AnthropicRequest, AnthropicResponse, AnthropicTool,
    OpenAiMessage,
};
use crate::tool_handlers::registry::build_default_registry;
use crate::tool_handlers::router::from_anthropic_content;

use keyring::Entry;
use tokio_util::sync::CancellationToken;
use crate::agent::providers::ToolMode;

fn get_provider_key(provider: &str) -> Result<Option<String>, String> {
    let entry = Entry::new("com.arx.app", provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn build_anthropic_tools() -> Vec<AnthropicTool> {
    let registry = build_default_registry();
    registry
        .specs()
        .into_iter()
        .map(|spec| AnthropicTool {
            name: spec.name.to_string(),
            description: spec.description.to_string(),
            input_schema: spec.parameters,
        })
        .collect()
}

fn split_system(messages: &[OpenAiMessage]) -> (Option<String>, Vec<OpenAiMessage>) {
    let mut system: Option<String> = None;
    let mut rest = Vec::new();
    for msg in messages {
        if msg.role == "system" && system.is_none() {
            system = Some(crate::agent::types::openai_content_to_text(&msg.content));
        } else {
            rest.push(msg.clone());
        }
    }
    (system, rest)
}

fn openai_messages_to_anthropic(messages: &[OpenAiMessage]) -> Vec<AnthropicMessage> {
    messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| AnthropicMessage {
            role: m.role.clone(),
            content: vec![AnthropicContent {
                kind: "text".to_string(),
                text: Some(crate::agent::types::openai_content_to_text(&m.content)),
            }],
        })
        .collect()
}

pub async fn call_anthropic(
    _app: &tauri::AppHandle,
    _session_id: &str,
    messages: &[OpenAiMessage],
    model: &str,
    cancel_token: CancellationToken,
    _tool_mode: ToolMode,
) -> Result<crate::agent::providers::ModelResponse, String> {
    let api_key = get_provider_key("anthropic")
        .ok()
        .flatten()
        .or_else(|| std::env::var("ARX_ANTHROPIC_API_KEY").ok())
        .ok_or_else(|| "Anthropic not configured".to_string())?;
    let base_url = std::env::var("ARX_ANTHROPIC_BASE_URL")
        .unwrap_or_else(|_| "https://api.anthropic.com/v1".to_string());

    let (system, rest) = split_system(messages);

    let payload = AnthropicRequest {
        model: model.to_string(),
        max_tokens: 2048,
        temperature: 0.2,
        messages: openai_messages_to_anthropic(&rest),
        system,
        tools: Some(build_anthropic_tools()),
    };

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/messages", base_url.trim_end_matches('/'));
    let send_fut = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&payload)
        .send();
    let response = tokio::select! {
        _ = cancel_token.cancelled() => return Err("operation cancelled".to_string()),
        res = send_fut => res.map_err(|e| e.to_string())?,
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic error {}: {}", status.as_u16(), body));
    }

    let parsed: AnthropicResponse = response.json().await.map_err(|e| e.to_string())?;
    let (assistant_text, tool_calls, tool_rejections) = from_anthropic_content(&parsed.content);

    Ok(crate::agent::providers::ModelResponse {
        assistant_text,
        tool_calls,
        tool_rejections,
    })
}
