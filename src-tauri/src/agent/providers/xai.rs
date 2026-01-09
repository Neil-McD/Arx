use crate::agent::types::{
    openai_content_to_text, OpenAiMessage, OpenAiRequest, OpenAiResponse, OpenAiTool,
    OpenAiToolFunction,
};
use crate::tool_handlers::registry::build_default_registry;
use crate::tool_handlers::router::from_openai_tool_calls;
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
    registry
        .specs()
        .into_iter()
        .map(|spec| OpenAiTool {
            kind: "function".to_string(),
            function: OpenAiToolFunction {
                name: spec.name.to_string(),
                description: spec.description.to_string(),
                parameters: spec.parameters,
            },
        })
        .collect()
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

pub async fn call_xai(
    _app: &tauri::AppHandle,
    _session_id: &str,
    messages: &[OpenAiMessage],
    model: &str,
    cancel_token: CancellationToken,
    tool_mode: ToolMode,
) -> Result<crate::agent::providers::ModelResponse, String> {
    let api_key = get_provider_key("xai")
        .ok()
        .flatten()
        .or_else(|| std::env::var("ARX_XAI_API_KEY").ok())
        .ok_or_else(|| "xAI not configured".to_string())?;
    let base_url = std::env::var("ARX_XAI_BASE_URL")
        .unwrap_or_else(|_| "https://api.x.ai/v1".to_string());

    let payload = OpenAiRequest {
        model: model.to_string(),
        messages: messages.to_vec(),
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
        return Err(format!("xAI error {}: {}", status.as_u16(), body));
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
