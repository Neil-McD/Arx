//! Tool registry for dispatching tool calls to handlers.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;

use crate::tool_handlers::{ToolContext, ToolError, ToolHandler, ToolOutput, ToolSpec};

/// Registry of tool handlers for dispatch
pub struct ToolRegistry {
    handlers: HashMap<String, Arc<dyn ToolHandler>>,
}

impl ToolRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    /// Register a tool handler
    pub fn register(&mut self, handler: Arc<dyn ToolHandler>) {
        let name = handler.name().to_string();
        self.handlers.insert(name, handler);
    }

    /// Get a handler by name
    pub fn get(&self, name: &str) -> Option<Arc<dyn ToolHandler>> {
        self.handlers.get(name).cloned()
    }

    /// Check if a tool exists
    pub fn contains(&self, name: &str) -> bool {
        self.handlers.contains_key(name)
    }

    /// Get all tool specifications for sending to the model
    pub fn specs(&self) -> Vec<ToolSpec> {
        let mut specs = self.handlers.values().map(|h| h.spec()).collect::<Vec<_>>();
        specs.sort_by(|a, b| a.name.cmp(b.name));
        specs
    }

    /// Get names of all registered tools
    pub fn tool_names(&self) -> Vec<&str> {
        self.handlers.values().map(|h| h.name()).collect()
    }

    /// Check if a tool requires approval
    pub fn requires_approval(&self, name: &str) -> bool {
        self.get(name).map(|h| h.requires_approval()).unwrap_or(true)
    }

    /// Check if a tool is parallel-safe
    pub fn is_parallel_safe(&self, name: &str) -> bool {
        self.get(name).map(|h| h.is_parallel_safe()).unwrap_or(false)
    }

    /// Check if a tool should be auto-applied
    pub fn auto_apply(&self, name: &str) -> bool {
        self.get(name).map(|h| h.auto_apply()).unwrap_or(false)
    }

    /// Dispatch a tool call to the appropriate handler
    pub async fn dispatch(
        &self,
        tool_name: &str,
        args: Value,
        ctx: &ToolContext,
    ) -> Result<ToolOutput, ToolError> {
        let handler = self
            .get(tool_name)
            .ok_or_else(|| ToolError::UnknownTool(tool_name.to_string()))?;

        handler.handle(args, ctx).await
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for constructing a ToolRegistry
pub struct ToolRegistryBuilder {
    handlers: Vec<Arc<dyn ToolHandler>>,
}

impl ToolRegistryBuilder {
    pub fn new() -> Self {
        Self {
            handlers: Vec::new(),
        }
    }

    /// Add a handler to the registry
    pub fn register(mut self, handler: Arc<dyn ToolHandler>) -> Self {
        self.handlers.push(handler);
        self
    }

    /// Build the registry
    pub fn build(self) -> ToolRegistry {
        let mut registry = ToolRegistry::new();
        for handler in self.handlers {
            registry.register(handler);
        }
        registry
    }
}

impl Default for ToolRegistryBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Build the default registry with all standard tools
pub fn build_default_registry() -> ToolRegistry {
    use crate::tool_handlers::handlers::*;

    ToolRegistryBuilder::new()
        .register(Arc::new(ShellHandler))
        .register(Arc::new(ExecCommandHandler))
        .register(Arc::new(ApplyPatchHandler))
        .register(Arc::new(ReadFileHandler))
        .register(Arc::new(ReadManyHandler))
        .register(Arc::new(ListFilesHandler))
        .register(Arc::new(MemoryHandler))
        .register(Arc::new(WriteStdinHandler))
        .register(Arc::new(ViewImageHandler))
        .register(Arc::new(ListDirHandler))
        .register(Arc::new(GrepFilesHandler))
        .register(Arc::new(GrepLinesHandler))
        .register(Arc::new(StatFileHandler))
        .register(Arc::new(GetMemoryBlockHandler))
        .register(Arc::new(SearchMemoryNotesHandler))
        .register(Arc::new(MkdirHandler))
        .register(Arc::new(DeleteFileHandler))
        .register(Arc::new(CopyFileHandler))
        .register(Arc::new(MoveFileHandler))
        .register(Arc::new(MultiEditHandler))
        .register(Arc::new(WriteFileHandler))
        .register(Arc::new(EditFileHandler))
        .register(Arc::new(UpdatePlanHandler))
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_default_tools() {
        let registry = build_default_registry();

        assert!(registry.contains("run_shell_command"));
        assert!(registry.contains("exec_command"));
        assert!(registry.contains("apply_patch"));
        assert!(registry.contains("read_file"));
        assert!(registry.contains("read_many"));
        assert!(registry.contains("list_files"));
        assert!(registry.contains("propose_memory_update"));
        assert!(registry.contains("write_stdin"));
        assert!(registry.contains("view_image"));
        assert!(registry.contains("list_dir"));
        assert!(registry.contains("grep_files"));
        assert!(registry.contains("grep_lines"));
        assert!(registry.contains("stat_file"));
        assert!(registry.contains("get_memory_block"));
        assert!(registry.contains("search_memory_notes"));
        assert!(registry.contains("mkdir"));
        assert!(registry.contains("delete_file"));
        assert!(registry.contains("copy_file"));
        assert!(registry.contains("move_file"));
        assert!(registry.contains("multi_edit"));
        assert!(registry.contains("write_file"));
        assert!(registry.contains("edit_file"));
        assert!(registry.contains("update_plan"));
    }

    #[test]
    fn unknown_tool_returns_error() {
        let registry = ToolRegistry::new();
        let ctx = ToolContext {
            session_id: "test".to_string(),
            cwd: "/tmp".to_string(),
            workspace_root: Some("/tmp".to_string()),
            project_id: None,
            db_path: std::path::PathBuf::from("/tmp/test.db"),
            db_key: "test".to_string(),
        };

        let result =
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(registry.dispatch(
                    "nonexistent",
                    serde_json::json!({}),
                    &ctx,
                ));

        assert!(matches!(result, Err(ToolError::UnknownTool(_))));
    }
}
