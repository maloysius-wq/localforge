//! Deliberately bounded, user-initiated local project tools. No shell execution.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

const MAX_FILE: u64 = 160 * 1024;
const MAX_CONTEXT: usize = 6_500;
const MAX_ENTRIES: usize = 160;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Entry { pub path: String, pub bytes: u64 }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Snapshot { pub root: String, pub files: Vec<Entry>, pub context: String, pub truncated: bool }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct FileResult { pub path: String, pub exists: bool, pub content: String, pub sha256: Option<String> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Applied { pub token: String, pub path: String, pub sha256: String }
#[derive(Serialize, Deserialize)]
struct Backup { root: String, path: String, before: Option<String>, after_sha: String }

fn digest(text: &str) -> String { format!("{:x}", Sha256::digest(text.as_bytes())) }
fn root_path(root: &str) -> Result<PathBuf,String> {
    let path = fs::canonicalize(root).map_err(|e| format!("Cannot open selected project folder: {e}"))?;
    if !path.is_dir() { return Err("The selected project is not a folder".into()); }
    Ok(path)
}
fn blocked(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with('.') && ![".gitignore", ".editorconfig"].contains(&lower.as_str()) {return true;}
    if lower.contains("secret") || lower.contains("credential") || lower.contains("private_key") {return true;}
    [".git", ".hg", ".svn", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target", ".idea", ".vscode", ".localforge-backups"].contains(&lower.as_str())
        || lower == ".env" || lower.starts_with(".env.") || lower.ends_with(".pem")
        || lower.ends_with(".key") || lower.ends_with(".p12") || lower.ends_with(".pfx")
        || lower == "id_rsa" || lower == "id_ed25519" || lower == "credentials.json"
        || lower == "secrets.json" || lower.ends_with(".sqlite") || lower.ends_with(".db")
}
fn safe_path(root: &Path, rel: &str) -> Result<PathBuf,String> {
    if rel.trim().is_empty() || rel.len() > 250 { return Err("Choose a project-relative filename".into()); }
    let rel = rel.replace('\\', "/");
    let mut out = root.to_path_buf();
    for seg in rel.split('/') {
        if seg.is_empty() || seg == "." || seg == ".." || seg.contains(':') || blocked(seg) {
            return Err("Filename is outside the allowed source-file scope".into());
        }
        out.push(seg);
        if let Ok(meta) = fs::symlink_metadata(&out) {
            if meta.file_type().is_symlink() { return Err("Symlink paths are not allowed".into()); }
            if out != root && out.is_dir() {
                let canonical = fs::canonicalize(&out).map_err(|e| e.to_string())?;
                if !canonical.starts_with(root) { return Err("Path escapes the project root".into()); }
            }
        }
    }
    // For existing files, catch junction/reparse paths even if symlink_metadata is ambiguous.
    if out.exists() && !fs::canonicalize(&out).map_err(|e| e.to_string())?.starts_with(root) {
        return Err("Path escapes the project root".into());
    }
    Ok(out)
}
fn text_file(path: &Path) -> Result<Option<String>,String> {
    if !path.exists() { return Ok(None); }
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_FILE { return Err("Only text files smaller than 160 KiB are supported".into()); }
    let content = fs::read_to_string(path).map_err(|_| "This is not a UTF-8 text file".to_owned())?;
    if content.contains('\0') { return Err("Binary files are not supported".into()); }
    Ok(Some(content))
}
#[tauri::command]
pub fn inspect_project(root: String) -> Result<Snapshot,String> {
    let root = root_path(&root)?;
    let mut stack = vec![(root.clone(),0usize)];
    let mut entries = Vec::new();
    let mut truncated = false;
    while let Some((dir, depth)) = stack.pop() {
        if depth > 4 { truncated = true; continue; }
        let mut children = fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten().collect::<Vec<_>>();
        children.sort_by_key(|e| e.file_name());
        for child in children {
            if entries.len() >= MAX_ENTRIES { truncated = true; break; }
            let name = child.file_name().to_string_lossy().to_string();
            if blocked(&name) { continue; }
            let ty = match child.file_type() { Ok(t) => t, Err(_) => continue };
            if ty.is_symlink() { continue; }
            let path = child.path();
            if ty.is_dir() { stack.push((path,depth+1)); continue; }
            if !ty.is_file() { continue; }
            let bytes = match child.metadata() { Ok(meta)=>meta.len(), Err(_)=>continue };
            if bytes > MAX_FILE { continue; }
            let rel = path.strip_prefix(&root).map_err(|e| e.to_string())?.to_string_lossy().replace('\\',"/");
            entries.push(Entry { path: rel, bytes });
        }
        if entries.len() >= MAX_ENTRIES { break; }
    }
    entries.sort_by(|a,b| a.path.cmp(&b.path));
    let mut context = format!("Selected project file inventory (read-only):\n{}\n", entries.iter().map(|e| e.path.as_str()).collect::<Vec<_>>().join("\n"));
    let mut selected = 0;
    for e in &entries {
        if selected >= 5 || context.len() >= MAX_CONTEXT { break; }
        let extension = Path::new(&e.path).extension().and_then(|e|e.to_str()).unwrap_or("").to_lowercase();
        if !["py","js","jsx","ts","tsx","html","css","json","md","toml","rs","txt"].contains(&extension.as_str()) { continue; }
        let path = safe_path(&root, &e.path)?;
        if let Ok(Some(body)) = text_file(&path) {
            let excerpt: String = body.chars().take(1400).collect();
            if context.len() + excerpt.len() + e.path.len() + 50 > MAX_CONTEXT { break; }
            context.push_str(&format!("\n--- {} (read-only excerpt) ---\n{}\n",e.path,if excerpt.is_empty() {"[empty file]"} else {&excerpt}));
            selected += 1;
        }
    }
    if context.len() > MAX_CONTEXT { context = context.chars().take(MAX_CONTEXT).collect(); truncated = true; }
    Ok(Snapshot { root: root.to_string_lossy().to_string(), files: entries, context, truncated })
}
#[tauri::command]
pub fn read_project_file(root: String, path: String) -> Result<FileResult,String> {
    let root = root_path(&root)?;
    let target = safe_path(&root, &path)?;
    let original = text_file(&target)?;
    Ok(FileResult { path, exists: original.is_some(), sha256: original.as_ref().map(|s|digest(s)), content: original.unwrap_or_default() })
}
fn backup_path(app: &AppHandle, token: &str) -> Result<PathBuf,String> {
    if uuid::Uuid::parse_str(token).is_err() { return Err("Invalid undo token".into()); }
    let folder = app.path().app_data_dir().map_err(|e| e.to_string())?.join("undo");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(folder.join(format!("{token}.json")))
}
#[tauri::command]
pub fn apply_project_change(app: AppHandle, root: String, path: String, expected_sha: Option<String>, content: String) -> Result<Applied,String> {
    if content.len() as u64 > MAX_FILE || content.contains('\0') { return Err("Content must be UTF-8 text under 160 KiB".into()); }
    let root = root_path(&root)?;
    let target = safe_path(&root, &path)?;
    let old = text_file(&target)?;
    if old.as_ref().map(|s|digest(s)) != expected_sha { return Err("File changed since preview. Refresh your proposed change before applying".into()); }
    let token = uuid::Uuid::new_v4().to_string();
    let new_hash = digest(&content);
    let backup = Backup { root: root.to_string_lossy().to_string(), path: path.clone(), before: old, after_sha: new_hash.clone() };
    let record = backup_path(&app,&token)?;
    fs::write(&record, serde_json::to_vec(&backup).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    let outcome = (|| -> Result<(),String> {
        if let Some(parent)= target.parent() { fs::create_dir_all(parent).map_err(|e|e.to_string())?; }
        // Re-validate after creating subdirectories, including any symlink traversal.
        let checked = safe_path(&root,&path)?;
        if checked != target { return Err("Path changed while preparing the edit".into()); }
        fs::write(&target, content).map_err(|e|e.to_string())?;
        Ok(())
    })();
    if outcome.is_err() { let _ = fs::remove_file(&record); }
    outcome?;
    Ok(Applied { token, path, sha256: new_hash })
}
#[tauri::command]
pub fn undo_project_change(app: AppHandle, root: String, token: String) -> Result<String,String> {
    let record = backup_path(&app,&token)?;
    let backup: Backup = serde_json::from_slice(&fs::read(&record).map_err(|e| format!("No saved undo record: {e}"))?).map_err(|e| e.to_string())?;
    let root = root_path(&root)?;
    if root.to_string_lossy() != backup.root { return Err("Undo belongs to another project".into()); }
    let target = safe_path(&root, &backup.path)?;
    let actual = text_file(&target)?;
    if actual.as_ref().map(|s|digest(s)) != Some(backup.after_sha) { return Err("File changed after LocalForge wrote it. Undo refused to protect those changes".into()); }
    match backup.before { Some(before) => fs::write(&target, before).map_err(|e|e.to_string())?, None => fs::remove_file(&target).map_err(|e|e.to_string())? }
    fs::remove_file(record).map_err(|e|e.to_string())?;
    Ok(backup.path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn blocks_traversal_secrets() {
        let root = std::env::temp_dir();
        for path in ["../outside.py","/etc/passwd",".env","a/.git/config","secrets.json","x\\..\\danger","x/C:evil"] {
            assert!(safe_path(&root,path).is_err(),"{path} was allowed");
        }
        assert!(safe_path(&root,"src/main.py").is_ok());
    }
    #[test] fn inventory_includes_blank_text_placeholder() {
        let root = std::env::temp_dir().join(format!("localforge-txt-test-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("New Text Document.txt"), "").unwrap();
        let snapshot = inspect_project(root.to_string_lossy().into_owned()).unwrap();
        assert_eq!(snapshot.files.len(), 1);
        assert!(snapshot.context.contains("--- New Text Document.txt (read-only excerpt) ---"));
        assert!(snapshot.context.contains("[empty file]"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test] fn hash_is_stable() { assert_eq!(digest("a"),"ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"); }
}


// A model may prepare multiple proposed full-file replacements, but it never
// gains filesystem write privileges. Only one explicit UI approval invokes
// this batch operation. Validate every change BEFORE writing any of them.
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BatchEdit {
    pub path: String,
    pub expected_sha: Option<String>,
    pub content: String,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct BatchApplied { pub token: String, pub paths: Vec<String> }
#[derive(Serialize, Deserialize)]
struct BatchEntry { path: String, before: Option<String>, after_sha: String }
#[derive(Serialize, Deserialize)]
struct BatchRecord { root: String, entries: Vec<BatchEntry> }

fn prepare_batch(root: &Path, edits: &[BatchEdit]) -> Result<Vec<BatchEntry>,String> {
    use std::collections::HashSet;
    if edits.is_empty() || edits.len() > 8 { return Err("A change set must contain 1–8 source files".into()); }
    let mut used = HashSet::new();
    let mut entries = Vec::with_capacity(edits.len());
    for edit in edits {
        if edit.content.len() as u64 > MAX_FILE || edit.content.contains('\0') {
            return Err(format!("{} exceeds the UTF-8 source file safety limits", edit.path));
        }
        let path = safe_path(root, &edit.path)?;
        // Windows targets are case insensitive; do not apply the same file twice.
        if !used.insert(path.to_string_lossy().to_lowercase()) {
            return Err("The proposed change set contains duplicate filenames".into());
        }
        let before = text_file(&path)?;
        if before.as_ref().map(|v|digest(v)) != edit.expected_sha {
            return Err(format!("{} changed since the preview; review again before applying", edit.path));
        }
        entries.push(BatchEntry { path: edit.path.clone(), before, after_sha: digest(&edit.content) });
    }
    Ok(entries)
}

fn restore_entries(root: &Path, entries: &[BatchEntry]) -> Result<(),String> {
    for entry in entries.iter().rev() {
        let target = safe_path(root, &entry.path)?;
        match &entry.before {
            Some(before) => fs::write(&target, before).map_err(|e| format!("Could not restore {}: {e}", entry.path))?,
            None if target.exists() => fs::remove_file(&target).map_err(|e| format!("Could not remove {}: {e}", entry.path))?,
            None => (),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn apply_project_changes(app: AppHandle, root: String, edits: Vec<BatchEdit>) -> Result<BatchApplied,String> {
    let root = root_path(&root)?;
    let entries = prepare_batch(&root, &edits)?;
    let token = uuid::Uuid::new_v4().to_string();
    let record_path = backup_path(&app, &token)?;
    let record = BatchRecord { root: root.to_string_lossy().to_string(), entries };
    // Persist an undo journal before making a change.
    fs::write(&record_path, serde_json::to_vec(&record).map_err(|e|e.to_string())?)
        .map_err(|e|format!("Cannot save undo journal: {e}"))?;
    let mut written = 0usize;
    let result = (|| -> Result<(),String> {
        for (edit, saved) in edits.iter().zip(record.entries.iter()) {
            let target = safe_path(&root, &edit.path)?;
            if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|e|e.to_string())?; }
            let verified = safe_path(&root, &edit.path)?;
            if verified != target { return Err("Project path changed during approval".into()); }
            // Recheck against the saved snapshot to avoid overwriting edits
            // made while this approval is being processed.
            let current = text_file(&verified)?;
            if current.as_ref().map(|s|digest(s)) != saved.before.as_ref().map(|s|digest(s)) {
                return Err(format!("{} changed while applying the batch", edit.path));
            }
            fs::write(&verified, &edit.content).map_err(|e| format!("Cannot update {}: {e}", edit.path))?;
            written += 1;
        }
        Ok(())
    })();
    if let Err(err) = result {
        if written == 0 {
            let _ = fs::remove_file(&record_path);
            return Err(err);
        }
        // Roll back only the files we successfully changed. A failed
        // rollback leaves the journal for recovery and reports the failure.
        let rollback = restore_entries(&root, &record.entries[..written]);
        if let Err(rollback_error) = rollback {
            return Err(format!("{err}. Automatic rollback also failed: {rollback_error}; undo journal {token} was retained"));
        }
        let _ = fs::remove_file(&record_path);
        return Err(format!("{err}. Earlier edits were rolled back"));
    }
    Ok(BatchApplied { token, paths: edits.into_iter().map(|v|v.path).collect() })
}

#[tauri::command]
pub fn undo_project_changes(app: AppHandle, root: String, token: String) -> Result<Vec<String>,String> {
    let root = root_path(&root)?;
    let record_path = backup_path(&app, &token)?;
    let record: BatchRecord = serde_json::from_slice(&fs::read(&record_path)
        .map_err(|e|format!("No saved batch undo record: {e}"))?).map_err(|e|e.to_string())?;
    if record.root != root.to_string_lossy() { return Err("Undo belongs to another project".into()); }
    // Verify ALL files have not been changed by the user after approval
    // before restoring ANY of them.
    for entry in &record.entries {
        let target = safe_path(&root, &entry.path)?;
        let current = text_file(&target)?;
        if current.as_ref().map(|s|digest(s)) != Some(entry.after_sha.clone()) {
            return Err(format!("{} changed after LocalForge wrote it. No files were undone", entry.path));
        }
    }
    restore_entries(&root, &record.entries)?;
    fs::remove_file(record_path).map_err(|e|e.to_string())?;
    Ok(record.entries.into_iter().map(|e|e.path).collect())
}

#[cfg(test)]
mod batch_tests {
    use super::*;
    fn test_root() -> PathBuf {
        let p = std::env::temp_dir().join(format!("localforge-batch-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap(); fs::canonicalize(p).unwrap()
    }
    #[test] fn stages_existing_and_new_files_without_writing_them() {
        let root = test_root();
        fs::write(root.join("index.html"), "old").unwrap();
        let entries = prepare_batch(&root, &[
            BatchEdit {path:"index.html".into(),expected_sha:Some(digest("old")),content:"new".into()},
            BatchEdit {path:"script.js".into(),expected_sha:None,content:"const a=1".into()}
        ]).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(fs::read_to_string(root.join("index.html")).unwrap(),"old");
        assert!(!root.join("script.js").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test] fn stale_file_rejects_entire_batch() {
        let root=test_root();
        fs::write(root.join("index.html"), "unexpected").unwrap();
        let err=prepare_batch(&root,&[
            BatchEdit {path:"new.py".into(),expected_sha:None,content:"print(1)".into()},
            BatchEdit {path:"index.html".into(),expected_sha:Some(digest("stale")),content:"new".into()}
        ]).err().unwrap();
        assert!(err.contains("changed since the preview"));
        assert!(!root.join("new.py").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test] fn rejects_duplicate_traversal_and_secret_changes() {
        let root=test_root();
        for name in ["../outside.py",".env","a/.git/config"] {
            assert!(prepare_batch(&root,&[BatchEdit {path:name.into(),expected_sha:None,content:"x".into()}]).is_err());
        }
        assert!(prepare_batch(&root,&[
            BatchEdit {path:"index.html".into(),expected_sha:None,content:"x".into()},
            BatchEdit {path:"INDEX.HTML".into(),expected_sha:None,content:"y".into()}
        ]).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
