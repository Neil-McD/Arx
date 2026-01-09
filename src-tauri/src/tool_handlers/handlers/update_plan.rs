//! Codex-style update_plan tool.
//!
//! This tool exists primarily to give the model a structured way to record its
//! plan that the UI can render. The tool does not perform filesystem actions.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

pub struct UpdatePlanHandler;

#[derive(Deserialize)]
struct PlanItem {
    step: String,
    status: String,
}

#[derive(Deserialize)]
struct UpdatePlanArgs {
    #[serde(default)]
    explanation: Option<String>,
    plan: Vec<PlanItem>,
}

#[async_trait]
impl ToolHandler for UpdatePlanHandler {
    fn name(&self) -> &'static str {
        "update_plan"
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "update_plan",
            description: "Updates the task plan. Provide an optional explanation and a list of plan items; at most one item can be in_progress.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "explanation": { "type": "string" },
                    "plan": {
                        "type": "array",
                        "description": "The list of steps",
                        "items": {
                            "type": "object",
                            "properties": {
                                "step": { "type": "string" },
                                "status": { "type": "string", "description": "One of: pending, in_progress, completed" }
                            },
                            "required": ["step", "status"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["plan"],
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

    async fn handle(&self, args: Value, _ctx: &ToolContext) -> Result<ToolOutput, ToolError> {
        let args: UpdatePlanArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArgs(e.to_string()))?;

        let mut in_progress = 0;
        for item in &args.plan {
            if item.step.trim().is_empty() {
                return Err(ToolError::InvalidArgs("plan item step is empty".to_string()));
            }
            if item.status == "in_progress" {
                in_progress += 1;
            }
        }
        if in_progress > 1 {
            return Err(ToolError::InvalidArgs(
                "at most one plan item can be in_progress".to_string(),
            ));
        }

        // The useful payload is what the UI reads from args_json; the return value is
        // just an acknowledgement for the model.
        let _ = args.explanation;
        Ok(ToolOutput::Success {
            content: "Plan updated".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_two_in_progress() {
        let handler = UpdatePlanHandler;
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result = handler
            .handle(
                serde_json::json!({
                    "plan": [
                        {"step": "a", "status": "in_progress"},
                        {"step": "b", "status": "in_progress"}
                    ]
                }),
                &ctx,
            )
            .await;

        assert!(matches!(result, Err(ToolError::InvalidArgs(_))));
    }
}
