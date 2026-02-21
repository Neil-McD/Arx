fn resolve_workspace_fingerprint_for_binding(
    conn: &rusqlite::Connection,
    thread_id: &str,
    workspace_path: Option<&str>,
) -> Option<String> {
    let cleaned_path = workspace_path
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())?;
    let thread = crate::db::get_thread_by_id(conn, thread_id)
        .ok()
        .flatten()?;

    if let Some(project_id) = thread
        .project_id
        .as_deref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        if let Some(project) = crate::db::get_project_by_id(conn, project_id)
            .ok()
            .flatten()
        {
            if let Some(fingerprint) = crate::workspace_identity::normalize_workspace_fingerprint(
                Some(project.fingerprint.as_str()),
            ) {
                return Some(fingerprint);
            }
        }
    }

    let existing_fingerprint = crate::workspace_identity::normalize_workspace_fingerprint(
        thread.workspace_fingerprint.as_deref(),
    )?;
    let existing_path = thread
        .workspace_path
        .as_deref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())?;
    let existing_canonical = crate::workspace_identity::canonical_workspace_path(existing_path);
    let new_canonical = crate::workspace_identity::canonical_workspace_path(cleaned_path);
    if !existing_canonical.is_empty() && existing_canonical == new_canonical {
        Some(existing_fingerprint)
    } else {
        None
    }
}

#[tauri::command]
pub(crate) fn set_thread_workspace_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    workspace_path: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let cleaned = workspace_path
        .as_deref()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty());
    if let Some(path) = cleaned {
        if !std::path::Path::new(path).is_absolute() {
            return Err("workspace_path must be an absolute path".to_string());
        }
    }
    let workspace_fingerprint =
        resolve_workspace_fingerprint_for_binding(&conn, &thread_id, cleaned);
    let scope_id = cleaned
        .map(|path| {
            crate::workspace_identity::workspace_scope_id(path, workspace_fingerprint.as_deref())
        })
        .filter(|value| !value.trim().is_empty());

    // Contract primitive: device-local binding for workspace scope enforcement.
    let _ = crate::db::upsert_workspace_binding(&conn, &thread_id, cleaned, scope_id.as_deref());

    // Legacy metadata (kept for backwards compatibility with the current UI).
    crate::db::set_thread_workspace_path(
        &conn,
        &thread_id,
        cleaned,
        workspace_fingerprint.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
      "v": 1,
      "workspace_path": cleaned,
      "workspace_fingerprint": workspace_fingerprint,
      "workspace_scope_id": scope_id,
    });
    let _ = crate::db::append_event(
        &conn,
        &state.db_path,
        &thread_id,
        "thread_metadata_changed",
        Some("workspace_path"),
        Some(&payload.to_string()),
        None,
    );
    Ok(())
}

#[tauri::command]
pub(crate) fn set_thread_context_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    thread_lane: Option<String>,
    project_id: Option<String>,
    community_id: Option<String>,
    expected_context_version: Option<i64>,
    update_thread_lane: Option<bool>,
    update_project_id: Option<bool>,
    update_community_id: Option<bool>,
) -> Result<crate::db::ThreadRecord, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;

    let should_update_lane = update_thread_lane.unwrap_or(thread_lane.is_some());
    let should_update_project = update_project_id.unwrap_or(false);
    let should_update_community = update_community_id.unwrap_or(false);

    let lane_patch = if should_update_lane {
        let raw_lane = thread_lane
            .as_deref()
            .ok_or_else(|| "thread_lane is required when update_thread_lane is true".to_string())?;
        Some(raw_lane)
    } else {
        None
    };
    let project_patch = if should_update_project {
        Some(project_id.as_deref())
    } else {
        None
    };
    let community_patch = if should_update_community {
        Some(community_id.as_deref())
    } else {
        None
    };

    let result = crate::db::set_thread_context(
        &conn,
        &thread_id,
        lane_patch,
        project_patch,
        community_patch,
        expected_context_version,
    )
    .map_err(|e| e.to_string())?;
    let updated = result.thread;
    let changed_fields = result.changed_fields;
    if changed_fields.is_empty() {
        crate::emit_thread_context_trace(
            "lens_set_applied",
            serde_json::json!({
              "thread_id": thread_id,
              "status": "noop",
              "thread_lane": updated.thread_lane,
              "storage_mode": updated.storage_mode,
              "project_id": updated.project_id,
              "community_id": updated.community_id,
              "context_version": updated.context_version
            }),
        );
        return Ok(updated);
    }

    let payload = serde_json::json!({
      "v": 1,
      "thread_lane": updated.thread_lane,
      "storage_mode": updated.storage_mode,
      "project_id": updated.project_id,
      "community_id": updated.community_id,
      "context_version": updated.context_version,
      "changed_fields": changed_fields.clone(),
    });
    let _ = crate::db::append_event(
        &conn,
        &state.db_path,
        &thread_id,
        "thread_metadata_changed",
        Some("thread_context"),
        Some(&payload.to_string()),
        None,
    );

    crate::emit_thread_context_trace(
        "lens_set_applied",
        serde_json::json!({
          "thread_id": thread_id,
          "status": "updated",
          "thread_lane": updated.thread_lane,
          "storage_mode": updated.storage_mode,
          "project_id": updated.project_id,
          "community_id": updated.community_id,
          "context_version": updated.context_version,
          "changed_fields": changed_fields
        }),
    );

    Ok(updated)
}

#[tauri::command]
pub(crate) fn set_thread_engine_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    engine_id: String,
    model_id: Option<String>,
) -> Result<crate::db::ThreadRecord, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let cleaned_engine = engine_id.trim();
    if cleaned_engine.is_empty() {
        return Err("engine_id is required".to_string());
    }
    let cleaned_engine = if cleaned_engine == crate::ENGINE_LEGACY_OPENROUTER_CHAT
        || cleaned_engine == crate::ENGINE_LEGACY_OPENROUTER_MESSAGES_AGENT
    {
        crate::ENGINE_MESSAGES_AGENT
    } else {
        cleaned_engine
    };
    let cleaned_model = model_id
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());
    let requires_model = cleaned_engine == crate::ENGINE_MESSAGES_AGENT;
    let final_model = if requires_model {
        cleaned_model.ok_or_else(|| "model_id is required".to_string())?
    } else {
        ""
    };

    crate::db::set_thread_engine_model(
        &conn,
        &thread_id,
        cleaned_engine,
        if requires_model {
            Some(final_model)
        } else {
            None
        },
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
      "v": 1,
      "engine_id": cleaned_engine,
      "model_id": if requires_model { Some(final_model) } else { None },
    });
    let _ = crate::db::append_event(
        &conn,
        &state.db_path,
        &thread_id,
        "thread_metadata_changed",
        Some("engine"),
        Some(&payload.to_string()),
        None,
    );

    crate::db::get_thread_by_id(&conn, &thread_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "thread not found".to_string())
}

#[tauri::command]
pub(crate) fn set_thread_title_cmd(
    state: tauri::State<crate::db::DbState>,
    thread_id: String,
    title: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    crate::db::set_thread_title(&conn, &thread_id, title.as_deref()).map_err(|e| e.to_string())?;
    Ok(())
}
