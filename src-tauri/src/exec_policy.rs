// Exec policy and approval rules.
//
// This module provides rule-based execution policy for:
// 1. Tool names (read_file, grep_files, run_shell_command, etc.)
// 2. Shell command prefixes (git status, ls, etc.)
//
// Rules can be loaded from config or AGENTS.md.

use std::collections::HashMap;
use std::sync::RwLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecDecision {
    Allow,
    Prompt,
    Forbid,
}

#[derive(Debug, Clone)]
pub struct ExecRule {
    pub decision: ExecDecision,
    pub prefix: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ExecDecisionResult {
    pub decision: ExecDecision,
    pub reason: String,
    pub matched_rule: Option<String>,
}

pub fn classify_command(tokens: &[String], rules: &[ExecRule]) -> ExecDecision {
    classify_command_with_reason(tokens, rules).decision
}

pub fn classify_command_with_reason(tokens: &[String], rules: &[ExecRule]) -> ExecDecisionResult {
    if tokens.is_empty() {
        return ExecDecisionResult {
            decision: ExecDecision::Prompt,
            reason: "empty command".to_string(),
            matched_rule: None,
        };
    }
    if is_forbidden(tokens) {
        return ExecDecisionResult {
            decision: ExecDecision::Forbid,
            reason: "blocked: forbidden command".to_string(),
            matched_rule: None,
        };
    }
    let mut allow_match: Option<String> = None;
    let mut prompt_match: Option<String> = None;
    let mut forbid_match: Option<String> = None;
    for rule in rules {
        if tokens_starts_with(tokens, &rule.prefix) {
            let prefix = rule.prefix.join(" ");
            let label = format!("{} {}", decision_label(rule.decision), prefix);
            match rule.decision {
                ExecDecision::Allow => allow_match = Some(label),
                ExecDecision::Prompt => prompt_match = Some(label),
                ExecDecision::Forbid => forbid_match = Some(label),
            }
        }
    }
    if let Some(rule) = forbid_match {
        return ExecDecisionResult {
            decision: ExecDecision::Forbid,
            reason: format!("matched rule: {rule}"),
            matched_rule: Some(rule),
        };
    }
    if let Some(rule) = allow_match {
        return ExecDecisionResult {
            decision: ExecDecision::Allow,
            reason: format!("matched rule: {rule}"),
            matched_rule: Some(rule),
        };
    }
    if let Some(rule) = prompt_match {
        return ExecDecisionResult {
            decision: ExecDecision::Prompt,
            reason: format!("matched rule: {rule}"),
            matched_rule: Some(rule),
        };
    }
    ExecDecisionResult {
        decision: ExecDecision::Prompt,
        reason: "default: prompt".to_string(),
        matched_rule: None,
    }
}

fn is_forbidden(tokens: &[String]) -> bool {
    let head = tokens[0].as_str();
    if matches!(head, "shutdown" | "reboot" | "halt") {
        return true;
    }
    if head == "rm" && tokens.iter().any(|t| t == "-rf" || t == "-fr") {
        if tokens.iter().any(|t| t == "/" || t == "/*") {
            return true;
        }
    }
    false
}

fn tokens_starts_with(tokens: &[String], prefix: &[String]) -> bool {
    if prefix.is_empty() || prefix.len() > tokens.len() {
        return false;
    }
    tokens.iter().zip(prefix.iter()).all(|(a, b)| a == b)
}

pub fn decision_as_str(decision: ExecDecision) -> &'static str {
    match decision {
        ExecDecision::Allow => "allow",
        ExecDecision::Prompt => "prompt",
        ExecDecision::Forbid => "forbid",
    }
}

fn decision_label(decision: ExecDecision) -> &'static str {
    match decision {
        ExecDecision::Allow => "allow",
        ExecDecision::Prompt => "prompt",
        ExecDecision::Forbid => "forbid",
    }
}

/// Default rules for safe commands that can auto-execute without user approval.
/// Inspired by Codex's PARALLEL_SAFE_TOOLS.
pub fn default_rules() -> Vec<ExecRule> {
    let safe_prefixes = vec![
        // Read-only file inspection
        vec!["ls"],
        vec!["find"],
        vec!["cat"],
        vec!["head"],
        vec!["tail"],
        vec!["wc"],
        vec!["file"],
        vec!["stat"],
        vec!["du"],
        vec!["df"],
        // Search tools
        vec!["grep"],
        vec!["rg"],
        vec!["ag"],
        vec!["ack"],
        // Git read-only
        vec!["git", "status"],
        vec!["git", "log"],
        vec!["git", "diff"],
        vec!["git", "branch"],
        vec!["git", "show"],
        vec!["git", "blame"],
        vec!["git", "ls-files"],
        vec!["git", "remote", "-v"],
        // Package info (read-only)
        vec!["npm", "list"],
        vec!["npm", "ls"],
        vec!["npm", "outdated"],
        vec!["cargo", "check"],
        vec!["cargo", "tree"],
        vec!["rustc", "--version"],
        vec!["node", "--version"],
        vec!["python", "--version"],
        vec!["python3", "--version"],
        // Environment inspection
        vec!["pwd"],
        vec!["whoami"],
        vec!["which"],
        vec!["where"],
        vec!["type"],
        vec!["echo"],
        vec!["env"],
        vec!["printenv"],
    ];

    safe_prefixes
        .into_iter()
        .map(|prefix| ExecRule {
            decision: ExecDecision::Allow,
            prefix: prefix.into_iter().map(|s| s.to_string()).collect(),
        })
        .collect()
}

pub fn parse_rules(input: &str) -> Result<Vec<ExecRule>, String> {
    let mut rules = Vec::new();
    for (idx, line) in input.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            return Err(format!("invalid rule on line {}", idx + 1));
        }
        let decision = match parts[0] {
            "allow" => ExecDecision::Allow,
            "prompt" => ExecDecision::Prompt,
            "forbid" => ExecDecision::Forbid,
            _ => return Err(format!("unknown decision on line {}", idx + 1)),
        };
        let prefix = parts[1..].iter().map(|s| s.to_string()).collect();
        rules.push(ExecRule { decision, prefix });
    }
    Ok(rules)
}

/// Tokenize a shell command string into argv-ish tokens.
///
/// This is intentionally minimal: supports single/double quotes and backslash
/// escapes (outside single quotes). It is used only for execpolicy prefix
/// matching and should never be treated as a full shell parser.
pub fn shell_split(command: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut escape = false;

    for ch in command.chars() {
        if escape {
            cur.push(ch);
            escape = false;
            continue;
        }

        if !in_single && ch == '\\' {
            escape = true;
            continue;
        }

        if !in_double && ch == '\'' {
            in_single = !in_single;
            continue;
        }
        if !in_single && ch == '"' {
            in_double = !in_double;
            continue;
        }

        if !in_single && !in_double && ch.is_whitespace() {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
            continue;
        }

        cur.push(ch);
    }

    if !cur.is_empty() {
        out.push(cur);
    }

    out
}

// =============================================================================
// Tool-Level Execution Policy
// =============================================================================

/// Policy for a specific tool
#[derive(Debug, Clone)]
pub struct ToolPolicy {
    /// Whether the tool can auto-execute without approval
    pub auto_execute: bool,
    /// Whether the tool can run in parallel with other parallel-safe tools
    pub parallel_safe: bool,
}

impl Default for ToolPolicy {
    fn default() -> Self {
        Self {
            auto_execute: false,
            parallel_safe: false,
        }
    }
}

/// Global execution policy manager
pub struct ExecPolicyManager {
    /// Tool-specific policies
    tool_policies: RwLock<HashMap<String, ToolPolicy>>,
}

impl ExecPolicyManager {
    /// Create a new policy manager with default policies
    pub fn new() -> Self {
        let tool_policies = default_tool_policies();
        Self {
            tool_policies: RwLock::new(tool_policies),
        }
    }

    /// Check if a tool can auto-execute
    pub fn can_auto_execute(&self, tool_name: &str) -> bool {
        self.tool_policies
            .read()
            .ok()
            .and_then(|policies| policies.get(tool_name).map(|p| p.auto_execute))
            .unwrap_or(false)
    }

    /// Check if a tool is parallel-safe
    pub fn is_parallel_safe(&self, tool_name: &str) -> bool {
        self.tool_policies
            .read()
            .ok()
            .and_then(|policies| policies.get(tool_name).map(|p| p.parallel_safe))
            .unwrap_or(false)
    }

    /// Load additional tool policies from config string
    /// Format:
    /// ```
    /// [tool:read_file]
    /// auto_execute = true
    /// parallel_safe = true
    ///
    /// [tool:run_shell_command]
    /// auto_execute = false
    /// shell_rules:
    ///   allow git status
    ///   allow cargo build
    /// ```
    pub fn load_config(&self, config: &str) -> Result<(), String> {
        let mut current_tool: Option<String> = None;
        let mut current_policy = ToolPolicy::default();

        for line in config.lines() {
            let trimmed = line.trim();

            // Skip empty lines and comments
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // Check for tool section header
            if trimmed.starts_with("[tool:") && trimmed.ends_with(']') {
                // Save previous tool if any
                if let Some(tool) = current_tool.take() {
                    if let Ok(mut policies) = self.tool_policies.write() {
                        policies.insert(tool, current_policy.clone());
                    }
                }

                // Start new tool
                let tool_name = &trimmed[6..trimmed.len() - 1];
                current_tool = Some(tool_name.to_string());
                current_policy = ToolPolicy::default();
                continue;
            }

            // Must be inside a tool section
            if current_tool.is_none() {
                continue;
            }

            // Parse key = value
            if let Some((key, value)) = trimmed.split_once('=') {
                let key = key.trim();
                let value = value.trim();

                match key {
                    "auto_execute" => {
                        current_policy.auto_execute = value == "true";
                    }
                    "parallel_safe" => {
                        current_policy.parallel_safe = value == "true";
                    }
                    _ => {}
                }
            }
        }

        // Save last tool
        if let Some(tool) = current_tool {
            if let Ok(mut policies) = self.tool_policies.write() {
                policies.insert(tool, current_policy);
            }
        }

        Ok(())
    }
}

impl Default for ExecPolicyManager {
    fn default() -> Self {
        Self::new()
    }
}

fn default_tool_policies() -> HashMap<String, ToolPolicy> {
    let registry = crate::tool_handlers::build_default_registry();
    let mut policies = HashMap::new();

    for name in registry.tool_names() {
        let requires_approval = registry.requires_approval(name);
        let auto_apply = registry.auto_apply(name);
        let parallel_safe = registry.is_parallel_safe(name);

        // Default: auto-execute anything that doesn't require approval, excluding
        // auto-apply tools (those are executed via a separate path).
        let auto_execute = !requires_approval && !auto_apply;

        policies.insert(
            name.to_string(),
            ToolPolicy {
                auto_execute,
                parallel_safe,
            },
        );
    }

    policies
}

// Global policy manager instance
use once_cell::sync::Lazy;

static POLICY_MANAGER: Lazy<ExecPolicyManager> = Lazy::new(ExecPolicyManager::new);

/// Get the global policy manager
pub fn policy_manager() -> &'static ExecPolicyManager {
    &POLICY_MANAGER
}

#[cfg(test)]
mod tests {
    use super::{
        classify_command_with_reason, parse_rules, policy_manager, shell_split, ExecDecision,
        ExecPolicyManager,
    };

    #[test]
    fn classify_matches_rule_and_reason() {
        let rules = parse_rules("allow git status").unwrap();
        let tokens = vec!["git".to_string(), "status".to_string()];
        let result = classify_command_with_reason(&tokens, &rules);
        assert_eq!(result.decision, ExecDecision::Allow);
        assert!(result.reason.contains("matched rule"));
    }

    #[test]
    fn classify_forbidden_command() {
        let rules = Vec::new();
        let tokens = vec!["shutdown".to_string()];
        let result = classify_command_with_reason(&tokens, &rules);
        assert_eq!(result.decision, ExecDecision::Forbid);
        assert!(result.reason.contains("forbidden"));
    }

    #[test]
    fn policy_manager_default_tools() {
        let manager = ExecPolicyManager::new();

        // Read-only tools should be auto-exec and parallel-safe
        assert!(manager.can_auto_execute("read_file"));
        assert!(manager.can_auto_execute("list_dir"));
        assert!(manager.can_auto_execute("grep_files"));
        assert!(manager.is_parallel_safe("read_file"));
        assert!(manager.is_parallel_safe("list_dir"));
        assert!(manager.is_parallel_safe("grep_files"));
    }

    #[test]
    fn policy_manager_load_config() {
        let manager = ExecPolicyManager::new();

        let config = r#"
[tool:my_custom_tool]
auto_execute = true
parallel_safe = true

[tool:run_shell_command]
auto_execute = false
"#;

        manager.load_config(config).unwrap();

        assert!(manager.can_auto_execute("my_custom_tool"));
        assert!(manager.is_parallel_safe("my_custom_tool"));
    }

    #[test]
    fn policy_manager_global_instance() {
        let pm = policy_manager();
        // Should have default policies
        assert!(pm.can_auto_execute("read_file"));
        assert!(!pm.can_auto_execute("run_shell_command"));
    }

    #[test]
    fn shell_split_handles_quotes() {
        let tokens = shell_split(r#"git commit -m "hello world""#);
        assert_eq!(
            tokens,
            vec!["git", "commit", "-m", "hello world"]
                .into_iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
        );
    }
}
