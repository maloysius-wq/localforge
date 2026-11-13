use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Read,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

const MODEL_NAME: &str = "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf";
const MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf";
const MIN_MODEL_BYTES: u64 = 500_000_000;
const MAX_MODEL_BYTES: u64 = 2_000_000_000;

// Deliberately optimized for producing useful first implementations from vague requests.
// Project-folder paths are not sent to the model and no filesystem tools exist yet.
const CODING_SYSTEM_PROMPT: &str = concat!(
    "You are LocalForge, a practical offline coding implementation engine, not a general chatbot. ",
    "Your goal is to DELIVER working source code, not merely offer to help. ",
    "When asked to create, build, write or generate an app, program or feature from scratch, ",
    "assume there is NO existing code or project structure. Choose sensible defaults and begin implementing immediately. ",
    "Never ask the user to supply project structure, starter code or files for a NEW project. ",
    "For Python graphical apps, prefer standard-library tkinter unless another framework is specified. ",
    "Provide a concise file list and COMPLETE code in fenced code blocks with language tags; include basic run instructions. ",
    "For a large request, deliver the smallest useful runnable version now and briefly explain its scope. ",
    "Avoid generic promises and unnecessary follow-up questions; only ask if a genuinely essential requirement is missing. ",
    "For changes to an EXISTING project, you may request the relevant source if necessary. ",
    "You have NO project-file access, editing tools, compiler or terminal: never claim to have inspected, written, ",
    "executed, tested, built or installed anything. Code is provided in chat only. ",
    "Write accurate Python, HTML, CSS, JavaScript and TypeScript code, with minimal dependencies and clear filenames."
);
const MODEL_CONTEXT_TOKENS: u32 = 4096;
const MAX_GENERATION_TOKENS: u32 = 1536;


#[derive(Default)]
struct Engine {
    inner: Mutex<Inner>,
    downloading: AtomicBool,
}
#[derive(Default)]
struct Inner {
    process: Option<Child>,
    port: Option<u16>,
    key: Option<String>,
    model: Option<String>,
    generating: bool,
    cancel: Option<Arc<AtomicBool>>,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Status {
    running: bool,
    model: Option<String>,
    generating: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelInfo { installed: bool, path: String, size: u64 }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress { received: u64, total: u64, status: &'static str }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TokenEvent { request_id: String, delta: String }
#[derive(serde::Deserialize)]
struct ChatMessage { role: String, content: String }

impl Engine {
    fn status(&self) -> Status {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(process) = inner.process.as_mut() {
            if process.try_wait().ok().flatten().is_some() {
                inner.process = None;
                inner.port = None;
                inner.key = None;
                inner.model = None;
                inner.generating = false;
            }
        }
        Status { running: inner.process.is_some(), model: inner.model.clone(), generating: inner.generating }
    }
    fn stop(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cancel) = inner.cancel.take() { cancel.store(true, Ordering::Relaxed); }
        if let Some(mut process) = inner.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        inner.port = None;
        inner.key = None;
        inner.model = None;
        inner.generating = false;
    }
}

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|dir| dir.join("models").join(MODEL_NAME)).map_err(|e| e.to_string())
}
fn check_gguf(path: &Path) -> Result<u64, String> {
    let size = path.metadata().map_err(|e| format!("Cannot read model file: {e}"))?.len();
    if !(MIN_MODEL_BYTES..=10_000_000_000).contains(&size) {
        return Err("Model file is implausibly small or large for this release".into());
    }
    let mut magic = [0; 4];
    File::open(path).and_then(|mut f| f.read_exact(&mut magic)).map_err(|e| e.to_string())?;
    if magic != *b"GGUF" { return Err("Selected file is not a GGUF model".into()); }
    Ok(size)
}
#[tauri::command]
fn model_info(app: AppHandle) -> Result<ModelInfo, String> {
    let path = model_path(&app)?;
    let size = check_gguf(&path).unwrap_or(0);
    Ok(ModelInfo { installed: size > 0, path: path.to_string_lossy().to_string(), size })
}
#[tauri::command]
fn engine_status(engine: State<'_, Engine>) -> Status { engine.status() }

struct DownloadGuard<'a>(&'a AtomicBool);
impl Drop for DownloadGuard<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }

#[tauri::command]
async fn download_model(app: AppHandle, engine: State<'_, Engine>) -> Result<ModelInfo, String> {
    if engine.downloading.swap(true, Ordering::SeqCst) { return Err("A model download is already running".into()); }
    let _guard = DownloadGuard(&engine.downloading);
    let path = model_path(&app)?;
    if check_gguf(&path).is_ok() { return model_info(app); }
    let parent = path.parent().ok_or("Invalid model destination")?;
    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    let tmp = path.with_extension("gguf.part");
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(3600)).build().map_err(|e| e.to_string())?;
    let head_client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30)).build().map_err(|e| e.to_string())?;
    let result: Result<(), String> = async {
        // Capture the expected LFS digest before following Hugging Face's signed CDN redirect.
        // The final CDN response can have a short, unrelated HTTP ETag.
        let head = head_client.head(MODEL_URL).send().await
            .map_err(|e| format!("Cannot inspect model metadata: {e}"))?;
        if !head.status().is_success() && !head.status().is_redirection() {
            return Err(format!("Model metadata returned HTTP {}", head.status()));
        }
        let etag = head.headers().get("x-linked-etag").or_else(|| head.headers().get("etag"))
            .and_then(|v| v.to_str().ok()).unwrap_or("").trim_matches('"').to_ascii_lowercase();
        if etag.len() != 64 || !etag.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("The model host did not provide a verifiable SHA-256. Download was refused".into());
        }
        let expected_size = head.headers().get("x-linked-size")
            .and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok())
            .or_else(|| head.content_length())
            .ok_or("The model host did not provide a verified file length")?;
        if !(MIN_MODEL_BYTES..=MAX_MODEL_BYTES).contains(&expected_size) {
            return Err("Unexpected model size; refusing this file".into());
        }
        let response = client.get(MODEL_URL).send().await.map_err(|e| format!("Model download failed: {e}"))?
            .error_for_status().map_err(|e| format!("Model host returned an error: {e}"))?;
        if let Some(length) = response.content_length() {
            if length != expected_size { return Err("Model host changed its file size during download".into()); }
        }
        let total = expected_size;
        let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
        let mut stream = response.bytes_stream();
        let mut hasher = Sha256::new();
        let mut received = 0u64;
        let mut last_report = 0u64;
        use tokio::io::AsyncWriteExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Model download interrupted: {e}"))?;
            received += chunk.len() as u64;
            if received > total { return Err("Model exceeded advertised size".into()); }
            hasher.update(&chunk);
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            if received - last_report > 4_000_000 || received == total {
                let _ = app.emit("model-download", DownloadProgress { received, total, status: "downloading" });
                last_report = received;
            }
        }
        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);
        if received != total { return Err("Model download ended early".into()); }
        if format!("{:x}", hasher.finalize()) != etag { return Err("Downloaded model failed SHA-256 verification".into()); }
        check_gguf(&tmp)?;
        if path.exists() { tokio::fs::remove_file(&path).await.map_err(|e| e.to_string())?; }
        tokio::fs::rename(&tmp, &path).await.map_err(|e| e.to_string())?;
        let _ = app.emit("model-download", DownloadProgress { received, total, status: "complete" });
        Ok(())
    }.await;
    if result.is_err() { let _ = tokio::fs::remove_file(&tmp).await; }
    result?;
    model_info(app)
}

#[tauri::command]
async fn start_model(app: AppHandle, engine: State<'_, Engine>, model_path: Option<String>, threads: u8) -> Result<Status, String> {
    if !(1..=16).contains(&threads) { return Err("Threads must be between 1 and 16".into()); }
    let path = match model_path { Some(p) if !p.trim().is_empty() => PathBuf::from(p), _ => model_path_default(&app)? };
    let size = check_gguf(&path)?;
    let runtime = app.path().resource_dir().map_err(|e| e.to_string())?.join("runtime");
    let executable = runtime.join(if cfg!(windows) { "llama-server.exe" } else { "llama-server" });
    if !executable.exists() { return Err("Bundled CPU runtime is missing. Please reinstall from the official LocalForge build".into()); }
    // Limit configuration to one inference slot and a short context on low-RAM systems.
    // The application does not pass -ngl > 0 or enable GPU backends.
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    let key = uuid::Uuid::new_v4().to_string();
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log = File::create(log_dir.join("llama-server.log")).map_err(|e| e.to_string())?;
    {
        let mut inner = engine.inner.lock().unwrap_or_else(|p| p.into_inner());
        if inner.process.is_some() { return Err("Unload the current model first".into()); }
        let child = Command::new(executable).current_dir(runtime)
            .arg("--model").arg(&path).arg("--host").arg("127.0.0.1")
            .arg("--port").arg(port.to_string()).arg("--ctx-size").arg(MODEL_CONTEXT_TOKENS.to_string())
            .arg("--threads").arg(threads.to_string()).arg("--n-gpu-layers").arg("0")
            .arg("--parallel").arg("1").arg("--api-key").arg(&key)
            .stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(log)).spawn().map_err(|e| format!("Could not start CPU runtime: {e}"))?;
        inner.process = Some(child);
        inner.port = Some(port);
        inner.key = Some(key.clone());
        inner.model = Some(path.to_string_lossy().to_string());
    }
    // Distinguish successful process creation from a loaded, responding model.
    let client = reqwest::Client::builder().timeout(Duration::from_secs(3)).build().map_err(|e| e.to_string())?;
    for _ in 0..480 {
        if !engine.status().running { return Err("Model process exited before it was ready. See the runtime log".into()); }
        if let Ok(resp) = client.get(format!("http://127.0.0.1:{port}/health"))
            .bearer_auth(&key).send().await {
            if resp.status().is_success() { return Ok(engine.status()); }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    engine.stop();
    Err(format!("Model did not become ready in 120 seconds (file size {size} bytes). Try fewer threads or inspect the runtime log"))
}
fn model_path_default(app: &AppHandle) -> Result<PathBuf, String> { model_path(app) }
#[tauri::command]
fn stop_model(engine: State<'_, Engine>) -> Status { engine.stop(); engine.status() }
#[tauri::command]
fn cancel_generation(engine: State<'_, Engine>) {
    if let Some(flag) = engine.inner.lock().unwrap_or_else(|p| p.into_inner()).cancel.as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
}
struct GenerationGuard<'a>(&'a Engine);
impl Drop for GenerationGuard<'_> {
    fn drop(&mut self) {
        let mut inner = self.0.inner.lock().unwrap_or_else(|p| p.into_inner());
        inner.generating = false;
        inner.cancel = None;
    }
}
#[tauri::command]
async fn generate(app: AppHandle, engine: State<'_, Engine>, request_id: String, messages: Vec<ChatMessage>) -> Result<String, String> {
    if messages.is_empty() || messages.len() > 16 { return Err("Invalid conversation length".into()); }
    let (port, key, cancel) = {
        let mut inner = engine.inner.lock().unwrap_or_else(|p| p.into_inner());
        if inner.generating { return Err("Generation already in progress".into()); }
        let port = inner.port.ok_or("Load a model first")?;
        let key = inner.key.clone().ok_or("Model not ready")?;
        inner.generating = true;
        let cancel = Arc::new(AtomicBool::new(false));
        inner.cancel = Some(cancel.clone());
        (port, key, cancel)
    };
    let _guard = GenerationGuard(&engine);
    let conversation = build_conversation(messages)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(300)).build().map_err(|e| e.to_string())?;
    let response = client.post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .bearer_auth(&key).json(&serde_json::json!({"messages":conversation,"stream":true,"max_tokens":MAX_GENERATION_TOKENS,"temperature":0.15}))
        .send().await.map_err(|e| format!("Model communication failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Model returned HTTP {}", response.status())); }
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut output = String::new();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) { break; }
        let bytes = chunk.map_err(|e| format!("Response interrupted: {e}"))?;
        buffer.extend_from_slice(&bytes);
        if buffer.len() > 1_000_000 { return Err("Oversized streaming response frame".into()); }
        while let Some(pos) = buffer.iter().position(|b| *b == b'\n') {
            let line: Vec<_> = buffer.drain(..=pos).collect();
            let line = std::str::from_utf8(&line).map_err(|e| e.to_string())?.trim();
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" { break; }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(text) = event.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                        output.push_str(text);
                        let _ = app.emit("model-token", TokenEvent { request_id: request_id.clone(), delta: text.to_owned() });
                    }
                }
            }
        }
    }
    Ok(output)
}


// Keep enough context available for full code generation. The latest user prompt
// always has priority; older turns are included newest-first until the budget is full.
fn build_conversation(messages: Vec<ChatMessage>) -> Result<Vec<serde_json::Value>, String> {
    if messages.is_empty() || messages.len() > 16 { return Err("Invalid conversation length".into()); }
    if messages.last().is_none_or(|m| m.role != "user") {
        return Err("The latest message must be from the user".into());
    }
    const MAX_LATEST_CHARS: usize = 4800;
    const MAX_HISTORY_CHARS: usize = 4000;
    let mut history = Vec::new();
    let mut remaining = MAX_HISTORY_CHARS;
    for (index, msg) in messages.into_iter().rev().enumerate() {
        if msg.content.chars().count() > 9000 { return Err("Message is too long for the small local model".into()); }
        if msg.role != "user" && msg.role != "assistant" { return Err("Invalid conversation role".into()); }
        let chars = msg.content.chars().count();
        if index == 0 {
            if chars > MAX_LATEST_CHARS {
                return Err("This prompt is too long for the selected small model; shorten it and retry".into());
            }
        } else if chars > remaining {
            break;
        } else {
            remaining -= chars;
        }
        history.push(serde_json::json!({"role":msg.role,"content":msg.content}));
    }
    history.reverse();
    let mut conversation = Vec::with_capacity(history.len() + 1);
    conversation.push(serde_json::json!({"role":"system","content":CODING_SYSTEM_PROMPT}));
    conversation.extend(history);
    Ok(conversation)
}

#[cfg(test)]
mod prompt_tests {
    use super::*;

    #[test]
    fn new_project_policy_requests_real_code_instead_of_starter_files() {
        assert!(CODING_SYSTEM_PROMPT.contains("DELIVER working source code"));
        assert!(CODING_SYSTEM_PROMPT.contains("Never ask the user to supply project structure"));
        assert!(CODING_SYSTEM_PROMPT.contains("fenced code blocks"));
        assert!(CODING_SYSTEM_PROMPT.contains("NO project-file access"));
        assert!(MAX_GENERATION_TOKENS >= 1024);
        assert!(MODEL_CONTEXT_TOKENS > MAX_GENERATION_TOKENS);
    }

    #[test]
    fn project_creation_request_reaches_the_model_without_needing_existing_files() {
        let messages = vec![ChatMessage { role: "user".into(), content: "Build a Python GUI for my game library".into() }];
        let conversation = build_conversation(messages).unwrap();
        assert_eq!(conversation.len(), 2);
        assert_eq!(conversation[0]["role"], "system");
        assert_eq!(conversation[1]["content"], "Build a Python GUI for my game library");
    }

    #[test]
    fn recent_history_does_not_starve_the_latest_prompt() {
        let messages = vec![
            ChatMessage { role: "user".into(), content: "A".repeat(4200) },
            ChatMessage { role: "assistant".into(), content: "B".repeat(4200) },
            ChatMessage { role: "user".into(), content: "Create a fresh app".into() },
        ];
        let conversation = build_conversation(messages).unwrap();
        assert_eq!(conversation.len(), 2);
        assert_eq!(conversation[1]["content"], "Create a fresh app");
    }

    #[test]
    fn refuses_non_user_last_turn_and_oversize_prompts() {
        assert!(build_conversation(vec![ChatMessage { role:"assistant".into(), content:"hi".into() }]).is_err());
        assert!(build_conversation(vec![ChatMessage { role:"user".into(), content:"x".repeat(4900) }]).is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Engine::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![model_info, engine_status, download_model, start_model, stop_model, cancel_generation, generate])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) { window.state::<Engine>().stop(); }
        })
        .run(tauri::generate_context!())
        .expect("Failed to start LocalForge");
}
