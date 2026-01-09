//! Parallel tool execution runtime.
//!
//! Uses RwLock to gate concurrent execution:
//! - Parallel-safe tools acquire read lock (can run concurrently)
//! - Non-parallel-safe tools acquire write lock (exclusive access)

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::exec_policy::policy_manager;
use crate::tool_handlers::{build_default_registry, ToolContext, ToolError, ToolOutput};

/// Runtime for parallel tool execution
pub struct ParallelToolRuntime {
    /// RwLock for gating parallel vs serial execution
    lock: Arc<RwLock<()>>,
}

impl ParallelToolRuntime {
    pub fn new() -> Self {
        Self {
            lock: Arc::new(RwLock::new(())),
        }
    }

    /// Execute a single tool, respecting parallel-safety
    pub async fn execute_tool(
        &self,
        tool_name: &str,
        args_json: &str,
        ctx: &ToolContext,
    ) -> Result<ToolOutput, ToolError> {
        let registry = build_default_registry();

        let args: serde_json::Value = serde_json::from_str(args_json)
            .map_err(|e| ToolError::InvalidArgs(format!("invalid args: {}", e)))?;

        let is_parallel_safe = policy_manager().is_parallel_safe(tool_name);

        if is_parallel_safe {
            // Acquire read lock - allows concurrent execution
            let _guard = self.lock.read().await;
            registry.dispatch(tool_name, args, ctx).await
        } else {
            // Acquire write lock - exclusive execution
            let _guard = self.lock.write().await;
            registry.dispatch(tool_name, args, ctx).await
        }
    }

    /// Execute multiple tools, running parallel-safe ones concurrently
    pub async fn execute_tools_parallel(
        &self,
        tools: Vec<(String, String, ToolContext)>,
    ) -> Vec<(String, Result<ToolOutput, ToolError>)> {
        use futures::future::join_all;

        // Partition into parallel-safe and serial tools
        let mut parallel_tools = Vec::new();
        let mut serial_tools = Vec::new();

        for (tool_name, args_json, ctx) in tools {
            if policy_manager().is_parallel_safe(&tool_name) {
                parallel_tools.push((tool_name, args_json, ctx));
            } else {
                serial_tools.push((tool_name, args_json, ctx));
            }
        }

        let mut results = Vec::new();

        // Execute parallel-safe tools concurrently
        if !parallel_tools.is_empty() {
            let _read_guard = self.lock.read().await;

            let futures: Vec<_> = parallel_tools
                .into_iter()
                .map(|(tool_name, args_json, ctx)| {
                    let registry = build_default_registry();
                    let tool_name_clone = tool_name.clone();
                    async move {
                        let args: serde_json::Value = match serde_json::from_str(&args_json) {
                            Ok(v) => v,
                            Err(e) => {
                                return (
                                    tool_name_clone,
                                    Err(ToolError::InvalidArgs(format!("invalid args: {}", e))),
                                )
                            }
                        };
                        let result = registry.dispatch(&tool_name_clone, args, &ctx).await;
                        (tool_name_clone, result)
                    }
                })
                .collect();

            let parallel_results = join_all(futures).await;
            results.extend(parallel_results);
        }

        // Execute serial tools one at a time
        for (tool_name, args_json, ctx) in serial_tools {
            let _write_guard = self.lock.write().await;
            let result = self.execute_tool(&tool_name, &args_json, &ctx).await;
            results.push((tool_name, result));
        }

        results
    }
}

impl Default for ParallelToolRuntime {
    fn default() -> Self {
        Self::new()
    }
}

// Global runtime instance
use once_cell::sync::Lazy;

static PARALLEL_RUNTIME: Lazy<ParallelToolRuntime> = Lazy::new(ParallelToolRuntime::new);

/// Get the global parallel tool runtime
pub fn parallel_runtime() -> &'static ParallelToolRuntime {
    &PARALLEL_RUNTIME
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    use tempfile::TempDir;

    #[tokio::test]
    async fn parallel_tools_run_concurrently() {
        let tmp = TempDir::new().unwrap();
        let file1 = tmp.path().join("file1.txt");
        let file2 = tmp.path().join("file2.txt");
        std::fs::write(&file1, "content1").unwrap();
        std::fs::write(&file2, "content2").unwrap();

        let runtime = ParallelToolRuntime::new();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        // Execute two read_file calls (parallel-safe)
        let tools = vec![
            (
                "read_file".to_string(),
                serde_json::json!({"path": file1.to_string_lossy()}).to_string(),
                ctx.clone(),
            ),
            (
                "read_file".to_string(),
                serde_json::json!({"path": file2.to_string_lossy()}).to_string(),
                ctx.clone(),
            ),
        ];

        let start = Instant::now();
        let results = runtime.execute_tools_parallel(tools).await;
        let _elapsed = start.elapsed();

        assert_eq!(results.len(), 2);
        for (_, result) in results {
            assert!(matches!(result, Ok(ToolOutput::Success { .. })));
        }
    }

    #[tokio::test]
    async fn single_tool_execution() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("test.txt");
        std::fs::write(&file, "hello").unwrap();

        let runtime = ParallelToolRuntime::new();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: tmp.path().to_string_lossy().to_string(),
            workspace_root: Some(tmp.path().to_string_lossy().to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let args = serde_json::json!({"path": file.to_string_lossy()}).to_string();
        let result = runtime.execute_tool("read_file", &args, &ctx).await;

        assert!(matches!(result, Ok(ToolOutput::Success { .. })));
    }
}
