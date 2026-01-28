use crate::context;
use crate::db;
use rusqlite::Connection;
use serde::Deserialize;

const PERSONAL_MEMORY_BUDGET_CHARS: usize = 2000;
const PERSONAL_MEMORY_FETCH_LIMIT: usize = 100;

#[derive(Clone, Debug)]
pub struct UsedPersonalMemoryItem {
  pub id: String,
  pub content: String,
  pub scope: String,
  pub scope_id: Option<String>,
  pub pinned: i64,
  pub updated_at: i64,
  pub redacted: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CloudPersonalMemoryItem {
  pub id: String,
  pub content: String,
  pub scope: String,
  pub scope_id: Option<String>,
  pub pinned: i64,
  pub updated_at: i64,
}

fn merge_and_rank_personal_memory(
  global_items: Vec<db::PersonalMemoryItemRecord>,
  workspace_items: Vec<db::PersonalMemoryItemRecord>,
) -> Vec<db::PersonalMemoryItemRecord> {
  let mut all = Vec::with_capacity(global_items.len() + workspace_items.len());
  all.extend(global_items);
  all.extend(workspace_items);
  all.sort_by(|a, b| {
    b.pinned
      .cmp(&a.pinned)
      .then_with(|| b.updated_at.cmp(&a.updated_at))
  });
  all
}

pub fn build_used_personal_memory_from_cloud_json(
  workspace_path: &str,
  items_json: &str,
) -> anyhow::Result<Vec<UsedPersonalMemoryItem>> {
  let items: Vec<CloudPersonalMemoryItem> = serde_json::from_str(items_json)?;
  let mut global = Vec::new();
  let mut workspace = Vec::new();

  for item in items {
    if item.scope == "global" {
      global.push(db::PersonalMemoryItemRecord {
        id: item.id,
        content: item.content,
        scope: item.scope,
        scope_id: item.scope_id,
        pinned: item.pinned,
        provenance_event_id: None,
        created_at: item.updated_at,
        updated_at: item.updated_at,
      });
      continue;
    }
    if item.scope == "workspace" && item.scope_id.as_deref() == Some(workspace_path) {
      workspace.push(db::PersonalMemoryItemRecord {
        id: item.id,
        content: item.content,
        scope: item.scope,
        scope_id: item.scope_id,
        pinned: item.pinned,
        provenance_event_id: None,
        created_at: item.updated_at,
        updated_at: item.updated_at,
      });
    }
  }

  let ranked = merge_and_rank_personal_memory(global, workspace);
  let mut used = Vec::new();
  let mut used_chars: usize = 0;

  for item in ranked {
    let (redacted, report) = context::redact_secrets(&item.content);
    if report.blocked {
      continue;
    }
    let line = format!("- {}", redacted.trim());
    if line.trim() == "-" {
      continue;
    }
    let next_len = if used.is_empty() { line.len() } else { 1 + line.len() };
    if used_chars + next_len > PERSONAL_MEMORY_BUDGET_CHARS {
      break;
    }
    used_chars += next_len;
    used.push(UsedPersonalMemoryItem {
      id: item.id,
      content: redacted,
      scope: item.scope,
      scope_id: item.scope_id,
      pinned: item.pinned,
      updated_at: item.updated_at,
      redacted: !report.redactions.is_empty(),
    });
  }

  Ok(used)
}

pub fn build_turn_handoff_prefix(
  conn: &Connection,
  workspace_path: &str,
) -> anyhow::Result<Vec<UsedPersonalMemoryItem>> {
  let global = db::list_personal_memory_items(conn, Some("global"), None, PERSONAL_MEMORY_FETCH_LIMIT)?;
  let workspace = db::list_personal_memory_items(
    conn,
    Some("workspace"),
    Some(workspace_path),
    PERSONAL_MEMORY_FETCH_LIMIT,
  )?;
  let ranked = merge_and_rank_personal_memory(global, workspace);

  let mut used = Vec::new();
  let mut used_chars: usize = 0;

  for item in ranked {
    let (redacted, report) = context::redact_secrets(&item.content);
    if report.blocked {
      continue;
    }
    let line = format!("- {}", redacted.trim());
    if line.trim() == "-" {
      continue;
    }

    // Budget applies to just the memory bullets, not the whole prefix.
    let next_len = if used.is_empty() { line.len() } else { 1 + line.len() };
    if used_chars + next_len > PERSONAL_MEMORY_BUDGET_CHARS {
      break;
    }
    used_chars += next_len;
    used.push(UsedPersonalMemoryItem {
      id: item.id,
      content: redacted,
      scope: item.scope,
      scope_id: item.scope_id,
      pinned: item.pinned,
      updated_at: item.updated_at,
      redacted: !report.redactions.is_empty(),
    });
  }
  Ok(used)
}
