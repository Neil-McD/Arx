use crate::context as ctx;
use crate::db::{
    list_memory_blocks, list_tool_calls_with_output, search_memory_notes, MessageRecord,
};
use crate::tool_handlers::context::telemetry_preview;

use rusqlite::Connection;

pub fn build_system_prompt(
    mode: &str,
    cwd: &str,
    agents_md: &str,
    memory_section: &str,
    tool_summary_section: &str,
    notes_section: &str,
) -> String {
    let mut out = String::new();
    out.push_str("<base_instructions>\n");
    out.push_str("You are Atom, an autonomous coding agent running inside the Arx desktop app.\n");
    out.push_str("Work step-by-step. Prefer using tools over describing commands.\n");
    out.push_str("When multiple independent reads/searches are needed, propose multiple tool calls in one response.\n");
    out.push_str("When you propose tools requiring approval, stop and wait for the user.\n");
    out.push_str("Never read or write outside the workspace root.\n");
    out.push_str("Avoid secrets/PII; redact if present.\n");

    match mode.trim().to_lowercase().as_str() {
        "plan" => {
            out.push_str("MODE: PLAN (READ-ONLY)\n");
            out.push_str("Do not propose any tool that requires approval or modifies files.\n");
            out.push_str("You may use read/search tools to inspect the codebase, then produce a concrete plan.\n");
        }
        "explore" => {
            out.push_str("MODE: EXPLORE\n");
            out.push_str("Prioritize fast, thorough codebase exploration (search, list, read) before proposing edits.\n");
        }
        _ => {
            out.push_str("MODE: BUILD\n");
            out.push_str("Keep going until the user’s goal is achieved; don’t stop after a single tool call if more safe work remains.\n");
        }
    }
    out.push_str("</base_instructions>\n\n");

    out.push_str("<current_working_directory>\n");
    out.push_str(cwd);
    out.push_str("\n</current_working_directory>\n\n");

    if !memory_section.trim().is_empty() {
        out.push_str("<memory>\n");
        out.push_str(memory_section.trim());
        out.push_str("\n</memory>\n\n");
    }

    if !tool_summary_section.trim().is_empty() {
        out.push_str("<recent_tool_results>\n");
        out.push_str(tool_summary_section.trim());
        out.push_str("\n</recent_tool_results>\n\n");
    }

    if !notes_section.trim().is_empty() {
        out.push_str("<retrieved_notes>\n");
        out.push_str(notes_section.trim());
        out.push_str("\n</retrieved_notes>\n\n");
    }

    if !agents_md.trim().is_empty() {
        out.push_str("<project_instructions>\n");
        out.push_str(agents_md.trim());
        out.push_str("\n</project_instructions>\n\n");
    }

    out
}

pub fn build_memory_section(
    conn: &Connection,
    session_id: &str,
    project_id: Option<&str>,
) -> Result<String, String> {
    let mut blocks = Vec::new();

    let globals = list_memory_blocks(conn, "global", None).map_err(|e| e.to_string())?;
    blocks.extend(globals);

    if let Some(project_id) = project_id {
        let project = list_memory_blocks(conn, "project", Some(project_id)).map_err(|e| e.to_string())?;
        blocks.extend(project);
    }

    let session = list_memory_blocks(conn, "session", Some(session_id)).map_err(|e| e.to_string())?;
    blocks.extend(session);

    let mut out = String::new();
    for block in blocks {
        let (redacted, _report) = ctx::redact_secrets(&block.value);
        out.push_str(&format!(
            "## {} ({}/{})\n{}\n\n",
            block.label,
            block.scope,
            block.scope_id.clone().unwrap_or_else(|| "-".to_string()),
            redacted.trim()
        ));
    }
    Ok(out.trim().to_string())
}

pub fn build_tool_summary_section(conn: &Connection, session_id: &str) -> Result<String, String> {
    let records = list_tool_calls_with_output(conn, session_id, 10).map_err(|e| e.to_string())?;
    let mut out = String::new();
    for record in records.into_iter().rev() {
        let args = record.args_json;
        let preview = record
            .stdout_excerpt
            .clone()
            .or(record.stderr_excerpt.clone())
            .unwrap_or_default();
        if preview.trim().is_empty() {
            continue;
        }
        let (redacted, _) = ctx::redact_secrets(&preview);
        out.push_str(&format!(
            "- {} {} => {}\n",
            record.tool_name,
            telemetry_preview(&args),
            telemetry_preview(&redacted),
        ));
    }
    Ok(out.trim().to_string())
}

pub fn extract_memory_query(history: &[MessageRecord]) -> Option<String> {
    // Legacy compatibility: allow a user message like "search memory: <query>" to trigger retrieval.
    let last_user = history.iter().rev().find(|m| m.role == "user")?;
    let value: serde_json::Value = serde_json::from_str(&last_user.content_json).ok()?;
    let text = value.get("text")?.as_str()?.trim();
    let prefix = "search memory:";
    if text.to_lowercase().starts_with(prefix) {
        Some(text[prefix.len()..].trim().to_string())
    } else {
        None
    }
}

pub fn build_retrieved_notes_section(
    conn: &Connection,
    query: Option<&str>,
) -> Result<String, String> {
    let Some(query) = query else {
        return Ok(String::new());
    };
    let query = query.trim();
    if query.is_empty() {
        return Ok(String::new());
    }
    let notes = search_memory_notes(conn, query, 3).map_err(|e| e.to_string())?;
    let mut out = String::new();
    for note in notes {
        let (redacted, _) = ctx::redact_secrets(&note.body_md);
        out.push_str(&format!("## {}\n{}\n\n", note.title, redacted.trim()));
    }
    Ok(out.trim().to_string())
}

// Intentionally keep DB access in the step engine; context helpers stay pure.
