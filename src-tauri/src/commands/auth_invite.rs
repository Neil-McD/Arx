use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYCHAIN_SUPABASE_SESSION: &str = "supabase_session";
const UI_STATE_PENDING_INVITES_V1: &str = "pending_invites_v1";
const MAX_INVITE_KEY_LEN: usize = 128;

#[derive(Clone, Serialize)]
pub(crate) struct ChatgptAuthSummary {
    email: Option<String>,
    account_id: Option<String>,
    access_token_expires_at: Option<i64>,
}

fn summarize_chatgpt_auth(value: &crate::ChatgptAuthV1) -> ChatgptAuthSummary {
    ChatgptAuthSummary {
        email: value.email.clone(),
        account_id: value.account_id.clone(),
        access_token_expires_at: value.access_token_expires_at,
    }
}

#[tauri::command]
pub(crate) fn get_chatgpt_auth_summary_cmd() -> Result<Option<ChatgptAuthSummary>, String> {
    Ok(crate::load_chatgpt_auth_v1()?.map(|value| summarize_chatgpt_auth(&value)))
}

#[tauri::command]
pub(crate) fn clear_chatgpt_auth_cmd() -> Result<(), String> {
    crate::clear_chatgpt_auth_v1()
}

#[tauri::command]
pub(crate) async fn chatgpt_login_cmd() -> Result<ChatgptAuthSummary, String> {
    // Use Codex's fixed localhost callback port. The OAuth client is typically
    // registered with a single redirect URI, so random ports can fail.
    let listener = crate::bind_chatgpt_callback_listener().await?;
    let redirect_uri = format!(
        "http://localhost:{}/auth/callback",
        crate::CHATGPT_OAUTH_CALLBACK_PORT
    );

    let (code_verifier, code_challenge) = crate::generate_chatgpt_pkce();
    let state = crate::generate_chatgpt_state();
    let auth_url = crate::build_chatgpt_authorize_url(&redirect_uri, &code_challenge, &state)?;

    // Launch browser for the OAuth consent/login flow.
    open::that(&auth_url).map_err(|e| e.to_string())?;

    let code = crate::wait_for_chatgpt_oauth_callback(listener, &state).await?;
    let (id_token, access_token, refresh_token) =
        crate::exchange_chatgpt_code_for_tokens(&code, &redirect_uri, &code_verifier).await?;

    let account_id = crate::extract_chatgpt_account_id_from_token(&id_token)
        .or_else(|| crate::extract_chatgpt_account_id_from_token(&access_token));
    let email = crate::jwt_string_claim(&id_token, "email");
    let access_token_expires_at = crate::jwt_i64_claim(&access_token, "exp");

    let stored = crate::ChatgptAuthV1 {
        id_token,
        access_token,
        refresh_token,
        account_id,
        email,
        access_token_expires_at,
    };
    crate::save_chatgpt_auth_v1(&stored)?;
    Ok(summarize_chatgpt_auth(&stored))
}

#[tauri::command]
pub(crate) fn get_supabase_session_cmd() -> Result<Option<String>, String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub(crate) fn set_supabase_session_cmd(session_json: String) -> Result<(), String> {
    let cleaned = session_json.trim();
    if cleaned.is_empty() {
        return Err("session_json is empty".to_string());
    }
    if cleaned.len() > 64 * 1024 {
        return Err("session_json too large".to_string());
    }
    let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
    entry.set_password(cleaned).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn clear_supabase_session_cmd() -> Result<(), String> {
    let entry = Entry::new("com.arx.app", KEYCHAIN_SUPABASE_SESSION).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub(crate) fn open_external_url_cmd(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is empty".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("url must start with http:// or https://".to_string());
    }
    open::that(trimmed).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct PendingInviteRecord {
    invite_key: String,
    status: String, // pending | dismissed | joined | expired
    first_seen_at: i64,
    updated_at: i64,
    dismissed_at: Option<i64>,
    join_intent_at: Option<i64>,
    joined_at: Option<i64>,
    expired_at: Option<i64>,
    community_id: Option<String>,
    community_name: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct PendingInvitesEnvelope {
    v: i32,
    invites: Vec<PendingInviteRecord>,
}

fn load_pending_invites(conn: &rusqlite::Connection) -> Vec<PendingInviteRecord> {
    let Some(raw) = crate::db::get_ui_state(conn, UI_STATE_PENDING_INVITES_V1)
        .ok()
        .flatten()
    else {
        return Vec::new();
    };
    let Ok(parsed) = serde_json::from_str::<PendingInvitesEnvelope>(&raw) else {
        return Vec::new();
    };
    if parsed.v != 1 {
        return Vec::new();
    }
    parsed.invites
}

fn save_pending_invites(
    conn: &rusqlite::Connection,
    invites: Vec<PendingInviteRecord>,
) -> Result<(), String> {
    let envelope = PendingInvitesEnvelope { v: 1, invites };
    let value = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    crate::db::set_ui_state(conn, UI_STATE_PENDING_INVITES_V1, &value).map_err(|e| e.to_string())
}

fn normalize_invite_key(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() > MAX_INVITE_KEY_LEN {
        return None;
    }
    Some(trimmed.to_string())
}

#[tauri::command]
pub(crate) fn list_pending_invites_cmd(
    state: tauri::State<crate::db::DbState>,
) -> Result<Vec<PendingInviteRecord>, String> {
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    Ok(load_pending_invites(&conn))
}

#[tauri::command]
pub(crate) fn upsert_pending_invite_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
    source: Option<String>,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "pending".to_string();
            existing.dismissed_at = None;
            existing.expired_at = None;
        }
        existing.updated_at = now;
        if existing.source.is_none() {
            existing.source = source;
        }
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "pending".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: None,
            joined_at: None,
            expired_at: None,
            community_id: None,
            community_name: None,
            source,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn dismiss_pending_invite_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "dismissed".to_string();
        }
        existing.dismissed_at = Some(now);
        existing.join_intent_at = None;
        existing.updated_at = now;
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "dismissed".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: Some(now),
            join_intent_at: None,
            joined_at: None,
            expired_at: None,
            community_id: None,
            community_name: None,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn request_join_pending_invite_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "pending".to_string();
        }
        existing.dismissed_at = None;
        existing.expired_at = None;
        existing.join_intent_at = Some(now);
        existing.updated_at = now;
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "pending".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: Some(now),
            joined_at: None,
            expired_at: None,
            community_id: None,
            community_name: None,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn mark_pending_invite_joined_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
    community_id: Option<String>,
    community_name: Option<String>,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        existing.status = "joined".to_string();
        existing.joined_at = Some(now);
        existing.dismissed_at = None;
        existing.expired_at = None;
        existing.join_intent_at = None;
        existing.updated_at = now;
        if existing.community_id.is_none() {
            existing.community_id = community_id;
        }
        if existing.community_name.is_none() {
            existing.community_name = community_name;
        }
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "joined".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: None,
            joined_at: Some(now),
            expired_at: None,
            community_id,
            community_name,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}

#[tauri::command]
pub(crate) fn mark_pending_invite_expired_cmd(
    state: tauri::State<crate::db::DbState>,
    invite_key: String,
) -> Result<(), String> {
    let Some(invite_key) = normalize_invite_key(&invite_key) else {
        return Err("invite_key is required".to_string());
    };
    let conn = crate::db::open_conn(&state.db_path, &state.key).map_err(|e| e.to_string())?;
    let now = crate::db::now_ts();

    let mut invites = load_pending_invites(&conn);
    if let Some(existing) = invites
        .iter_mut()
        .find(|item| item.invite_key == invite_key)
    {
        if existing.status != "joined" {
            existing.status = "expired".to_string();
            existing.expired_at = Some(now);
            existing.dismissed_at = None;
            existing.join_intent_at = None;
            existing.updated_at = now;
        }
    } else {
        invites.push(PendingInviteRecord {
            invite_key,
            status: "expired".to_string(),
            first_seen_at: now,
            updated_at: now,
            dismissed_at: None,
            join_intent_at: None,
            joined_at: None,
            expired_at: Some(now),
            community_id: None,
            community_name: None,
            source: None,
        });
    }

    save_pending_invites(&conn, invites)
}
