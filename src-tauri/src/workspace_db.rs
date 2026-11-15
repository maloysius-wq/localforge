//! Native, local-only persistence for v1 workspace snapshots.
//! Legacy WebView localStorage remains untouched after first import, as a recovery copy.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, time::Duration};
use tauri::{AppHandle, Manager};

const MAX_WORKSPACE_BYTES: usize = 128 * 1024 * 1024;

fn validate_snapshot(content: &str) -> Result<(), String> {
    if content.len() > MAX_WORKSPACE_BYTES {
        return Err("Workspace is larger than the 128 MiB safety limit.".into());
    }
    let value: Value = serde_json::from_str(content)
        .map_err(|_| "Workspace data is not valid JSON. The original browser copy was not changed.".to_string())?;
    if value.get("version").and_then(Value::as_u64) != Some(1)
        || !value.get("threads").is_some_and(Value::is_array)
        || !value.get("projects").is_some_and(Value::is_array)
    {
        return Err("Workspace schema is not compatible with v1. No data was replaced.".into());
    }
    Ok(())
}

fn connect(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Cannot create workspace data folder: {err}"))?;
    }
    let db = Connection::open(path).map_err(|err| format!("Cannot open workspace database: {err}"))?;
    db.busy_timeout(Duration::from_secs(5))
        .map_err(|err| format!("Cannot set workspace database timeout: {err}"))?;
    db.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=FULL;
         CREATE TABLE IF NOT EXISTS workspace (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           payload TEXT NOT NULL
         );",
    ).map_err(|err| format!("Cannot prepare workspace database: {err}"))?;
    Ok(db)
}

fn import_or_load(path: &Path, legacy_json: &str) -> Result<String, String> {
    let mut db = connect(path)?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Cannot begin workspace initialization: {err}"))?;
    let existing: Option<String> = tx.query_row(
        "SELECT payload FROM workspace WHERE id = 1", [], |row| row.get(0),
    ).optional().map_err(|err| format!("Cannot read workspace: {err}"))?;
    if let Some(content) = existing {
        validate_snapshot(&content)?;
        tx.commit().map_err(|err| format!("Cannot finish workspace read: {err}"))?;
        return Ok(content);
    }
    // Validate BEFORE insertion. A malformed legacy copy is never silently overwritten.
    validate_snapshot(legacy_json)?;
    tx.execute("INSERT INTO workspace (id, payload) VALUES (1, ?1)", params![legacy_json])
        .map_err(|err| format!("Cannot import existing conversations: {err}"))?;
    tx.commit().map_err(|err| format!("Cannot finish workspace import: {err}"))?;
    Ok(legacy_json.to_owned())
}

fn replace(path: &Path, snapshot_json: &str) -> Result<(), String> {
    validate_snapshot(snapshot_json)?;
    let mut db = connect(path)?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Cannot begin workspace save: {err}"))?;
    let changed = tx.execute(
        "UPDATE workspace SET payload = ?1 WHERE id = 1", params![snapshot_json],
    ).map_err(|err| format!("Cannot save workspace: {err}"))?;
    if changed != 1 {
        return Err("Workspace has not been initialized. No data was written.".into());
    }
    tx.commit().map_err(|err| format!("Cannot commit workspace save: {err}"))
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir()
        .map(|path| path.join("workspace.sqlite3"))
        .map_err(|err| format!("Cannot locate local application data: {err}"))
}

#[tauri::command]
pub fn initialize_native_workspace(app: AppHandle, legacy_json: String) -> Result<String, String> {
    import_or_load(&db_path(&app)?, &legacy_json)
}

#[tauri::command]
pub fn save_native_workspace(app: AppHandle, snapshot_json: String) -> Result<(), String> {
    replace(&db_path(&app)?, &snapshot_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_path() -> PathBuf {
        std::env::temp_dir().join(format!("localforge-workspace-{}.sqlite3", uuid::Uuid::new_v4()))
    }
    const OLD: &str = r#"{"version":1,"projects":[],"threads":[{"id":"chat-1","messages":[{"role":"assistant","content":"Keep this reply"}]}]}"#;
    const NEW: &str = r#"{"version":1,"projects":[],"threads":[{"id":"chat-2","messages":[]}]}"#;

    #[test]
    fn imports_once_without_overwriting_legacy_data() {
        let path = test_path();
        assert_eq!(import_or_load(&path, OLD).unwrap(), OLD);
        assert_eq!(import_or_load(&path, NEW).unwrap(), OLD);
        assert_eq!(replace(&path, NEW), Ok(()));
        assert_eq!(import_or_load(&path, OLD).unwrap(), NEW);
    }

    #[test]
    fn malformed_import_is_rejected_without_erasing_a_later_good_import() {
        let path = test_path();
        assert!(import_or_load(&path, "{broken").is_err());
        assert_eq!(import_or_load(&path, OLD).unwrap(), OLD);
        assert!(replace(&path, "{broken").is_err());
        assert_eq!(import_or_load(&path, NEW).unwrap(), OLD);
    }

    #[test]
    fn a_failed_save_cannot_initialize_an_empty_database() {
        let path = test_path();
        assert!(replace(&path, NEW).is_err());
        assert_eq!(import_or_load(&path, OLD).unwrap(), OLD);
    }

    #[test]
    fn disallows_schema_downgrade_and_excessively_large_snapshots() {
        assert!(validate_snapshot(r#"{"version":2,"projects":[],"threads":[]}"#).is_err());
        assert!(validate_snapshot(&"X".repeat(MAX_WORKSPACE_BYTES + 1)).is_err());
    }
}
