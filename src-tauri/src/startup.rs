use tauri::Manager;

use crate::{db, NativeVoiceCaptureManager};

pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let base_dir = app.path().app_data_dir().map_err(|e| anyhow::anyhow!(e))?;
    let db_dir = db::db_path(&base_dir);
    let key = db::resolve_db_key()?;
    let recovery_db_path = db_dir.join(format!("arx.db.recovery.{}", db::now_ts()));

    // Retry once by backing up DB state when setup fails.
    let mut last_err: Option<anyhow::Error> = None;
    let mut use_recovery_db = false;
    for attempt in 0..2 {
        match (|| -> anyhow::Result<db::DbState> {
            let state = if use_recovery_db {
                db::init_db_at(&recovery_db_path, &key)?
            } else {
                db::init_db(&db_dir, &key)?
            };
            let conn = db::open_conn(&state.db_path, &state.key)?;
            let _ = db::crash_recovery(&conn, &state.db_path);
            if db::get_ui_state(&conn, "workspace_root")?.is_none() {
                // Use current cwd in debug; fallback to ~/Arx Workspace in release.
                let default_root = if cfg!(debug_assertions) {
                    std::env::current_dir().ok().unwrap_or_else(|| {
                        app.path()
                            .home_dir()
                            .expect("home dir must exist")
                            .join("Arx Workspace")
                    })
                } else {
                    app.path()
                        .home_dir()
                        .map_err(|e| anyhow::anyhow!(e))?
                        .join("Arx Workspace")
                };
                std::fs::create_dir_all(&default_root)?;
                db::set_ui_state(
                    &conn,
                    "workspace_root",
                    default_root.to_string_lossy().as_ref(),
                )?;
            }
            Ok(state)
        })() {
            Ok(state) => {
                db::spawn_default_blob_gc(state.db_path.clone(), state.key.clone());
                app.manage(state);
                app.manage(NativeVoiceCaptureManager::default());
                last_err = None;
                break;
            }
            Err(err) => {
                if db::is_db_key_mismatch_error(&err) {
                    last_err = Some(anyhow::anyhow!(
                        "database open failed: ARX_DB_KEY mismatch likely. Provide the original key used for this local database."
                    ));
                    break;
                }
                last_err = Some(err);
                if attempt == 0 {
                    eprintln!("DB setup failed; backing up and retrying: {last_err:?}");
                    if db::backup_db_files(&db_dir).is_err() {
                        // If DB files are locked, fall back to a recovery DB path.
                        use_recovery_db = true;
                    }
                    continue;
                }
            }
        }
    }

    if let Some(err) = last_err {
        return Err(err.into());
    }

    Ok(())
}
