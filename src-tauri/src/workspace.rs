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
        if !["py","js","jsx","ts","tsx","html","css","json","md","toml","rs"].contains(&extension.as_str()) { continue; }
        let path = safe_path(&root, &e.path)?;
        if let Ok(Some(body)) = text_file(&path) {
            let excerpt: String = body.chars().take(1400).collect();
            if context.len() + excerpt.len() + e.path.len() + 50 > MAX_CONTEXT { break; }
            context.push_str(&format!("\n--- {} (read-only excerpt) ---\n{}\n",e.path,excerpt));
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
    #[test] fn hash_is_stable() { assert_eq!(digest("a"),"ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"); }
}
