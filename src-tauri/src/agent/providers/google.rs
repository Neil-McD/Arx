use crate::agent::types::{
    GeminiContent, GeminiFunctionCallingConfig, GeminiFunctionDeclaration, GeminiPart, GeminiRequest,
    GeminiResponse, GeminiTool, GeminiToolConfig, OpenAiMessage,
};
use crate::tool_handlers::registry::build_default_registry;
use crate::tool_handlers::router::from_gemini_parts;

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

fn build_gemini_tools() -> Vec<GeminiTool> {
    let registry = build_default_registry();
    let decls = registry
        .specs()
        .into_iter()
        .map(|spec| GeminiFunctionDeclaration {
            name: spec.name.to_string(),
            description: spec.description.to_string(),
            parameters: spec.parameters,
        })
        .collect::<Vec<_>>();
    vec![GeminiTool {
        function_declarations: decls,
    }]
}

fn openai_messages_to_gemini(messages: &[OpenAiMessage]) -> Vec<GeminiContent> {
    messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| GeminiContent {
            role: if m.role == "assistant" {
                "model".to_string()
            } else {
                "user".to_string()
            },
            parts: vec![GeminiPart {
                text: Some(crate::agent::types::openai_content_to_text(&m.content)),
            }],
        })
        .collect()
}

pub async fn call_google(
    _app: &tauri::AppHandle,
    _session_id: &str,
    messages: &[OpenAiMessage],
    model: &str,
    cancel_token: CancellationToken,
    _tool_mode: ToolMode,
) -> Result<crate::agent::providers::ModelResponse, String> {
    let api_key = get_provider_key("google")
        .ok()
        .flatten()
        .or_else(|| std::env::var("ARX_GOOGLE_API_KEY").ok())
        .ok_or_else(|| "Google not configured".to_string())?;

    let base_url = std::env::var("ARX_GOOGLE_BASE_URL")
        .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

    let payload = GeminiRequest {
        contents: openai_messages_to_gemini(messages),
        tools: Some(build_gemini_tools()),
        tool_config: Some(GeminiToolConfig {
            function_calling_config: GeminiFunctionCallingConfig {
                mode: "AUTO".to_string(),
            },
        }),
    };

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "{}/models/{}:generateContent?key={}",
        base_url.trim_end_matches('/'),
        model,
        api_key
    );

    let send_fut = client.post(url).json(&payload).send();
    let response = tokio::select! {
        _ = cancel_token.cancelled() => return Err("operation cancelled".to_string()),
        res = send_fut => res.map_err(|e| e.to_string())?,
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Google error {}: {}", status.as_u16(), body));
    }

    let parsed: GeminiResponse = response.json().await.map_err(|e| e.to_string())?;
    let first = parsed
        .candidates
        .first()
        .ok_or_else(|| "No response".to_string())?;

    let (assistant_text, tool_calls, tool_rejections) =
        from_gemini_parts(&first.content.parts);

    Ok(crate::agent::providers::ModelResponse {
        assistant_text,
        tool_calls,
        tool_rejections,
    })
}
