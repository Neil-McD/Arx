//! search_memory_notes tool - search local memory notes (FTS5).

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::db;
use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct SearchMemoryNotesHandler;

const DEFAULT_LIMIT: usize = 8;
const MAX_LIMIT: usize = 50;

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Deserialize)]
struct SearchMemoryNotesArgs {
    query: String,
    #[serde(default = "default_limit")]
    limit: usize,
}

#[async_trait]
impl ToolHandler for SearchMemoryNotesHandler {
    fn name(&self) -> &'static str {
        "search_memory_notes"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "search_memory_notes",
            description: "Search local memory notes (FTS5). Returns matching note titles and excerpts.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search query" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 50, "description": "Max results (default: 8)" }
                },
                "required": ["query"],
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
        let args: SearchMemoryNotesArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        let query = args.query.trim();
        if query.is_empty() {
            return Err(ToolError::InvalidArgs("query is empty".to_string()));
        }

        let limit = args.limit.clamp(1, MAX_LIMIT);
        let conn = db::open_conn(&ctx.db_path, &ctx.db_key)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        let notes = db::search_memory_notes(&conn, query, limit)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        if notes.is_empty() {
            return Ok(ToolOutput::Success {
                content: "No memory notes found.".to_string(),
            });
        }

        let mut content = String::new();
        content.push_str(&format!("Found {} memory note(s):\n\n", notes.len()));
        for note in notes {
            content.push_str(&format!("- {} ({})\n", note.title, note.id));
            let excerpt = note.body_md.lines().take(12).collect::<Vec<_>>().join("\n");
            if !excerpt.trim().is_empty() {
                content.push_str("  ");
                content.push_str(&excerpt.replace('\n', "\n  "));
                content.push('\n');
            }
            content.push('\n');
        }

        Ok(ToolOutput::Success { content })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn rejects_empty_query() {
        let handler = SearchMemoryNotesHandler;
        let tmp = TempDir::new().unwrap();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: tmp.path().join("db.sqlite"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(serde_json::json!({"query": ""}), &ctx)
            .await;
        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }
}

