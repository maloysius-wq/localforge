//! GitHub Releases based update discovery and verified Windows installer handoff.
//! No generic URL input or arbitrary installer execution is exposed to the UI.
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, process::Command, time::Duration};
use tauri::{AppHandle, Emitter, Manager};
use crate::Engine;
use tokio::io::AsyncWriteExt;

const RELEASE_API: &str = "https://api.github.com/repos/maloysius-wq/localforge/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/maloysius-wq/localforge/releases/latest";
const MAX_INSTALLER_BYTES: u64 = 200 * 1024 * 1024;
#[derive(Deserialize)]
struct Release { tag_name: String, body: Option<String>, html_url: String, assets: Vec<Asset> }
#[derive(Deserialize)]
struct Asset { name: String, browser_download_url: String, digest: Option<String>, size: u64 }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct UpdateInfo { current_version: String, latest_version: Option<String>, available: bool, installable: bool, notes: String, release_url: String }
#[derive(Serialize,Clone)]
#[serde(rename_all="camelCase")]
struct UpdateProgress { received: u64, total: u64 }

fn version_tuple(value: &str) -> Option<(u64,u64,u64)> {
    let v=value.trim_start_matches('v');
    let parts:Vec<_>=v.split('.').collect();
    if parts.len()!=3 {return None;}
    Some((parts[0].parse().ok()?,parts[1].parse().ok()?,parts[2].parse().ok()?))
}
fn safe_asset(asset:&Asset,tag:&str) -> bool {
    let url_prefix = format!("https://github.com/maloysius-wq/localforge/releases/download/{tag}/");
    asset.browser_download_url.starts_with(&url_prefix)
        && asset.name.to_ascii_lowercase().ends_with("-setup.exe")
        && asset.name.to_ascii_lowercase().starts_with("localforge")
        && asset.size > 100_000 && asset.size <= MAX_INSTALLER_BYTES
        && asset.digest.as_deref().is_some_and(|s| s.starts_with("sha256:") && s.len()==71 && s[7..].bytes().all(|b|b.is_ascii_hexdigit()))
}
async fn release() -> Result<Option<Release>,String> {
    let client=reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e|e.to_string())?;
    let response=client.get(RELEASE_API).header("User-Agent","LocalForge-Updater")
        .header("Accept","application/vnd.github+json").send().await.map_err(|e|format!("GitHub update check failed: {e}"))?;
    if response.status()==reqwest::StatusCode::NOT_FOUND {return Ok(None);}
    let response=response.error_for_status().map_err(|e|format!("GitHub release check returned an error: {e}"))?;
    let data: Release=response.json().await.map_err(|e|format!("Invalid GitHub release metadata: {e}"))?;
    if !data.html_url.starts_with("https://github.com/maloysius-wq/localforge/releases/tag/") {return Err("Unexpected GitHub release URL".into());}
    if version_tuple(&data.tag_name).is_none() {return Err("Published release is not a compatible version".into());}
    Ok(Some(data))
}
fn available(release:&Release)->bool {
    match (version_tuple(&release.tag_name),version_tuple(env!("CARGO_PKG_VERSION"))) {
        (Some(latest),Some(current))=>latest>current, _=>false
    }
}
#[tauri::command]
pub async fn check_for_updates()->Result<UpdateInfo,String> {
    let release=release().await?;
    let Some(rel)=release else {return Ok(UpdateInfo {current_version: env!("CARGO_PKG_VERSION").to_string(),latest_version:None,available:false,installable:false,notes:"No published GitHub Release yet. Development build artifacts are not installable through the updater.".into(),release_url:RELEASES_PAGE.into()});};
    let newer=available(&rel);
    let installer = cfg!(windows) && rel.assets.iter().any(|asset|safe_asset(asset,&rel.tag_name));
    Ok(UpdateInfo {current_version:env!("CARGO_PKG_VERSION").into(),latest_version:Some(rel.tag_name),available:newer,installable:newer && installer,notes:rel.body.unwrap_or_default().chars().take(1200).collect(),release_url:rel.html_url})
}
#[tauri::command]
pub async fn install_verified_update(app:AppHandle)->Result<(),String> {
    if !cfg!(windows) {return Err("In-app installation currently supports Windows only. See the official release page for Linux packages".into());}
    let rel=release().await?.ok_or("No published release is available")?;
    if !available(&rel) {return Err("LocalForge is already up to date".into());}
    let asset=rel.assets.iter().find(|asset|safe_asset(asset,&rel.tag_name))
        .ok_or("This release does not have a verifiable Windows NSIS installer. Installation was refused")?;
    let expected=asset.digest.as_deref().ok_or("Missing expected installer digest")?.trim_start_matches("sha256:").to_ascii_lowercase();
    let client=reqwest::Client::builder().timeout(Duration::from_secs(600)).connect_timeout(Duration::from_secs(20)).build().map_err(|e|e.to_string())?;
    let response=client.get(&asset.browser_download_url).header("User-Agent","LocalForge-Updater")
        .send().await.map_err(|e|format!("Update download failed: {e}"))?.error_for_status().map_err(|e|e.to_string())?;
    if response.content_length().is_some_and(|n| n!=asset.size) {return Err("Installer size changed unexpectedly".into());}
    let target:PathBuf=std::env::temp_dir().join(format!("localforge-update-{}.exe", uuid::Uuid::new_v4()));
    let operation=async {
        let mut file=tokio::fs::File::create(&target).await.map_err(|e|e.to_string())?;
        let mut stream=response.bytes_stream();
        let mut hash=Sha256::new();
        let mut received=0u64;
        while let Some(piece)=stream.next().await {
            let piece=piece.map_err(|e|e.to_string())?;
            received+=piece.len() as u64;
            if received>asset.size || received>MAX_INSTALLER_BYTES {return Err("Installer exceeds verified size".to_string());}
            hash.update(&piece);
            file.write_all(&piece).await.map_err(|e|e.to_string())?;
            let _=app.emit("update-progress",UpdateProgress {received,total:asset.size});
        }
        file.flush().await.map_err(|e|e.to_string())?;
        file.sync_all().await.map_err(|e|e.to_string())?;
        drop(file);
        if received!=asset.size {return Err("Update download incomplete".to_string());}
        if format!("{:x}",hash.finalize())!=expected {return Err("GitHub SHA-256 verification failed. Update was not launched".to_string());}
        Ok(())
    }.await;
    if let Err(err)=operation {let _=tokio::fs::remove_file(&target).await; return Err(err);}
    // A running llama-server has ggml-base.dll loaded, so Windows refuses to
    // replace it. Explicitly terminate and REAP the owned child before the
    // installer starts. app.exit() alone does not guarantee window event cleanup.
    app.state::<Engine>().stop().map_err(|e|format!(
        "The CPU model is still running; update was not launched: {e}. Unload the model and retry"
    ))?;
    // Visible native installer asks the user for any required permissions. Never use shell.
    Command::new(&target).spawn().map_err(|e|format!("Could not launch verified installer: {e}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn compare_versions() {assert!(version_tuple("v0.3.0")>version_tuple("0.2.1"));assert!(version_tuple("v1.0").is_none());}
    #[test] fn restrict_urls_and_digest() {
        let a=Asset{name:"LocalForge_0.3.0_x64-setup.exe".into(),browser_download_url:"https://github.com/maloysius-wq/localforge/releases/download/v0.3.0/LocalForge_0.3.0_x64-setup.exe".into(),digest:Some(format!("sha256:{}","a".repeat(64))),size:2_000_000};
        assert!(safe_asset(&a,"v0.3.0"));assert!(!safe_asset(&a,"v0.4.0"));
    }
}
