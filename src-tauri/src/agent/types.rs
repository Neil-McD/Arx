use serde::{Deserialize, Serialize};
use serde_json::Value;

// =============================================================================
// Shared parsing/validation structs
// =============================================================================

/// Tracks tool calls that were rejected during parsing/validation (for logging/debugging).
#[derive(Debug, Clone)]
pub struct ToolRejection {
    pub reason: String,
    pub raw_json: String,
}

// =============================================================================
// OpenAI / xAI (OpenAI-compatible) types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OpenAiMessageContent {
    Text(String),
    Parts(Vec<OpenAiContentPart>),
}

impl Default for OpenAiMessageContent {
    fn default() -> Self {
        OpenAiMessageContent::Text(String::new())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OpenAiContentPart {
    Text { text: String },
    ImageUrl { image_url: OpenAiImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiImageUrl {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiMessage {
    pub role: String,
    pub content: OpenAiMessageContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAiToolCall>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenAiTool {
    #[serde(rename = "type")]
    pub kind: String,
    pub function: OpenAiToolFunction,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenAiToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenAiRequest {
    pub model: String,
    pub messages: Vec<OpenAiMessage>,
    pub temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OpenAiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenAiResponse {
    pub choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenAiChoice {
    pub message: OpenAiChoiceMessage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenAiChoiceMessage {
    #[serde(default)]
    pub content: OpenAiMessageContent,
    #[serde(default)]
    pub tool_calls: Vec<OpenAiToolCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: OpenAiToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiToolCallFunction {
    pub name: String,
    pub arguments: String,
}

// =============================================================================
// Anthropic types (only what we need for parsing tool_use blocks)
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct AnthropicRequest {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AnthropicTool>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnthropicMessage {
    pub role: String,
    pub content: Vec<AnthropicContent>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnthropicContent {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnthropicTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnthropicResponse {
    pub content: Vec<AnthropicContentResponse>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnthropicContentResponse {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
    pub input: Option<Value>,
}

// =============================================================================
// Gemini types (minimal function_call parsing)
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<GeminiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_config: Option<GeminiToolConfig>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeminiContent {
    pub role: String,
    pub parts: Vec<GeminiPart>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeminiTool {
    pub function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeminiFunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeminiToolConfig {
    pub function_calling_config: GeminiFunctionCallingConfig,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeminiFunctionCallingConfig {
    pub mode: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeminiResponse {
    pub candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeminiCandidate {
    pub content: GeminiContentResponse,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeminiContentResponse {
    pub parts: Vec<GeminiPartResponse>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeminiPartResponse {
    pub text: Option<String>,
    #[serde(rename = "functionCall")]
    pub function_call: Option<GeminiFunctionCallResponse>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeminiFunctionCallResponse {
    pub name: String,
    pub args: Value,
}

// =============================================================================
// Helpers
// =============================================================================

pub fn openai_content_to_text(content: &OpenAiMessageContent) -> String {
    match content {
        OpenAiMessageContent::Text(s) => s.clone(),
        OpenAiMessageContent::Parts(parts) => {
            let mut out = String::new();
            for part in parts {
                match part {
                    OpenAiContentPart::Text { text } => {
                        if !out.is_empty() {
                            out.push('\n');
                        }
                        out.push_str(text);
                    }
                    OpenAiContentPart::ImageUrl { .. } => {
                        // Do not inline base64 or URLs into text.
                        if !out.is_empty() {
                            out.push('\n');
                        }
                        out.push_str("[image]");
                    }
                }
            }
            out
        }
    }
}
