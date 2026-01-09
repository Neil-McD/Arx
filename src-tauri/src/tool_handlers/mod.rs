//! Tool system for Arx agent (Codex-style architecture).
//!
//! This module provides:
//! - `ToolHandler` trait for implementing tools
//! - `ToolRegistry` for dispatch
//! - Individual handlers in `handlers/`
//!
//! This is the new Codex-style tool system that will replace the
//! legacy `tools.rs` once migration is complete.

// Allow dead code during migration - this module is set up but not yet
// wired into the main agent dispatch path.
#![allow(dead_code)]

pub mod handlers;
pub mod parallel;
pub mod registry;
pub mod context;
pub mod router;
pub mod executor;
pub mod text_edits;

#[allow(unused_imports)]
pub use parallel::{parallel_runtime, ParallelToolRuntime};
#[allow(unused_imports)]
pub use registry::{build_default_registry, ToolRegistry, ToolRegistryBuilder};
#[allow(unused_imports)]
pub use context::{telemetry_preview, ToolCall};
#[allow(unused_imports)]
pub use router::{from_gemini_parts, from_openai_tool_calls};
#[allow(unused_imports)]
pub use executor::{execute_and_record_tool_call, RecordedToolOutput};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Tool execution context passed to handlers
#[derive(Debug, Clone)]
pub struct ToolContext {
    pub session_id: String,
    pub cwd: String,
    /// Workspace root boundary; tools must not read outside this root.
    /// When unset, tools should treat `cwd` as the boundary.
    pub workspace_root: Option<String>,
    pub project_id: Option<String>,
    pub db_path: std::path::PathBuf,
    pub db_key: String,
}

/// Output from a tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolOutput {
    /// Tool executed successfully
    Success { content: String },
    /// Tool execution failed
    Error { message: String },
    /// Tool needs user approval before execution
    NeedsApproval {
        tool_call_id: String,
        preview: String,
        risk_level: RiskLevel,
    },
    /// Tool was auto-applied (e.g., memory updates)
    AutoApplied { content: String },
}

/// Risk level for tool operations
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// Errors that can occur during tool execution
#[derive(Debug, Clone)]
pub enum ToolError {
    /// Invalid arguments provided
    InvalidArgs(String),
    /// Execution failed
    ExecutionFailed(String),
    /// Tool was rejected (e.g., forbidden command)
    Rejected(String),
    /// Unknown tool
    UnknownTool(String),
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolError::InvalidArgs(msg) => write!(f, "invalid arguments: {}", msg),
            ToolError::ExecutionFailed(msg) => write!(f, "execution failed: {}", msg),
            ToolError::Rejected(msg) => write!(f, "rejected: {}", msg),
            ToolError::UnknownTool(name) => write!(f, "unknown tool: {}", name),
        }
    }
}

impl std::error::Error for ToolError {}

/// Tool specification sent to the model
#[derive(Debug, Clone, Serialize)]
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
}

/// Core trait for tool handlers (Codex-style pattern)
///
/// Implement this trait to create a new tool. The handler will be
/// registered with the `ToolRegistry` and dispatched based on the
/// tool name.
///
/// # Example
///
/// ```ignore
/// pub struct MyToolHandler;
///
/// #[async_trait]
/// impl ToolHandler for MyToolHandler {
///     fn name(&self) -> &'static str { "my_tool" }
///
///     fn spec(&self) -> ToolSpec {
///         ToolSpec {
///             name: "my_tool",
///             description: "Does something useful",
///             parameters: serde_json::json!({
///                 "type": "object",
///                 "properties": { "arg": { "type": "string" } },
///                 "required": ["arg"]
///             }),
///         }
///     }
///
///     async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
///         Ok(ToolOutput::Success { content: "done".to_string() })
///     }
/// }
/// ```
#[async_trait]
pub trait ToolHandler: Send + Sync {
    /// Tool name for registry lookup (must match spec name)
    fn name(&self) -> &'static str;

    /// Tool specification for the model (JSON schema)
    fn spec(&self) -> ToolSpec;

    /// Whether this tool requires user approval before execution
    ///
    /// Default: true (safe default)
    fn requires_approval(&self) -> bool {
        true
    }

    /// Whether this tool can run in parallel with other tools
    ///
    /// Default: false (safe default)
    fn is_parallel_safe(&self) -> bool {
        false
    }

    /// Whether this tool should be auto-applied without surfacing to user
    ///
    /// Used for memory updates that don't need explicit approval.
    /// Default: false
    fn auto_apply(&self) -> bool {
        false
    }

    /// Execute the tool with the given arguments
    ///
    /// Returns `ToolOutput` on success or `ToolError` on failure.
    async fn handle(&self, args: Value, ctx: &ToolContext) -> Result<ToolOutput, ToolError>;
}

pub fn validate_tool_args_json(tool_name: &str, args_json: &str) -> anyhow::Result<()> {
    let value: serde_json::Value = serde_json::from_str(args_json)?;
    validate_tool_args(tool_name, &value)
}

pub fn validate_tool_args(tool_name: &str, value: &serde_json::Value) -> anyhow::Result<()> {
    let spec = crate::tool_handlers::build_default_registry()
        .specs()
        .into_iter()
        .find(|spec| spec.name == tool_name)
        .ok_or_else(|| anyhow::anyhow!("unknown tool name: {}", tool_name))?;

    let obj = value
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("tool args must be a JSON object"))?;

    let required = spec
        .parameters
        .get("required")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    for field in required {
        let present = obj
            .get(field)
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or_else(|| obj.get(field).is_some());
        if !present {
            return Err(anyhow::anyhow!("{} requires {}", tool_name, field));
        }
    }

    Ok(())
}
