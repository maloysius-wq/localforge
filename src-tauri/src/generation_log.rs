//! Privacy-preserving local generation diagnostics.
//! Never persist chat messages, project paths, source output, raw reasoning,
//! prompt payloads, runtime authentication keys, or raw SSE frames.
//! All records are bounded, structured metadata in app_log_dir/generation-diagnostics.jsonl.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const LOG_FILE: &str = "generation-diagnostics.jsonl";
const MAX_LOG_BYTES: u64 = 512 * 1024;
const MAX_READ_BYTES: usize = 96 * 1024;

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerationMeta {
    pub(crate) finish_reason: Option<String>,
    pub(crate) prompt_tokens: Option<u32>,
    pub(crate) completion_tokens: Option<u64>,
    pub(crate) output_limit: i32,
    pub(crate) visible_chars: u64,
    pub(crate) reasoning_chunks: u32,
    pub(crate) sse_events: u32,
    pub(crate) malformed_sse: u32,
    pub(crate) done_marker: bool,
    pub(crate) duration_ms: u64,
    pub(crate) first_visible_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerationResult {
    pub(crate) text: String,
    pub(crate) meta: GenerationMeta,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunRecord<'a> {
    kind: &'static str,
    unix_seconds: u64,
    version: &'static str,
    request_id: &'a str,
    backend: &'a str,
    code_only: bool,
    context_tokens: u32,
    phase: &'a str,
    outcome: &'a str,
    stream_bytes: u64,
    meta: &'a GenerationMeta,
}

fn unix_seconds() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_log_dir().map_err(|e| e.to_string())?.join(LOG_FILE))
}

fn append_record(path: &PathBuf, line: &str) -> Result<(), String> {
    if line.len() > 8 * 1024 { return Err("Diagnostic record is too large".into()); }
    if let Some(dir) = path.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    // Single active generation at a time. Rotate the bounded log by truncating
    // old metadata, without following user-supplied paths or saving raw content.
    let oversized = fs::metadata(path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false);
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if oversized { options.truncate(true); } else { options.append(true); }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"\n").map_err(|e| e.to_string())
}

fn valid_request_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok()
}

pub(crate) struct GenerationTrace {
    path: Option<PathBuf>,
    request_id: String,
    backend: &'static str,
    code_only: bool,
    context_tokens: u32,
    started: Instant,
    pub(crate) phase: &'static str,
    pub(crate) outcome: &'static str,
    pub(crate) stream_bytes: u64,
    pub(crate) meta: GenerationMeta,
}
impl GenerationTrace {
    pub(crate) fn new(app: &AppHandle, request_id: &str, backend: Option<&str>, code_only: bool, context: u32, limit: i32) -> Self {
        Self {
            path: log_path(app).ok(),
            request_id: if valid_request_id(request_id) { request_id.to_string() } else { "invalid-id".into() },
            backend: if backend == Some("cuda") { "cuda" } else { "cpu" },
            code_only,
            context_tokens: context,
            started: Instant::now(),
            phase: "preparing",
            outcome: "incomplete",
            stream_bytes: 0,
            meta: GenerationMeta {
                finish_reason: None,
                prompt_tokens: None,
                completion_tokens: None,
                output_limit: limit,
                visible_chars: 0,
                reasoning_chunks: 0,
                sse_events: 0,
                malformed_sse: 0,
                done_marker: false,
                duration_ms: 0,
                first_visible_ms: None,
            },
        }
    }
    pub(crate) fn observe(&mut self, event: &serde_json::Value, content: Option<&str>, is_reasoning: bool) {
        self.meta.sse_events = self.meta.sse_events.saturating_add(1);
        if let Some(n) = event.pointer("/usage/completion_tokens").and_then(|v|v.as_u64()) {
            self.meta.completion_tokens = Some(n);
        }
        if let Some(reason) = event.pointer("/choices/0/finish_reason").and_then(|v|v.as_str()) {
            self.meta.finish_reason = Some(match reason {
                "length" => "length", "stop" => "stop",
                "tool_calls" => "tool_calls", "content_filter" => "content_filter",
                _ => "other",
            }.to_string());
        }
        if is_reasoning { self.meta.reasoning_chunks = self.meta.reasoning_chunks.saturating_add(1); }
        if let Some(v) = content {
            if !v.is_empty() {
                if self.meta.first_visible_ms.is_none() { self.meta.first_visible_ms = Some(self.started.elapsed().as_millis() as u64); }
                self.meta.visible_chars = self.meta.visible_chars.saturating_add(v.chars().count() as u64);
            }
        }
    }
    pub(crate) fn completed(&mut self, canceled: bool) -> GenerationMeta {
        self.phase = "complete";
        self.outcome = if canceled { "cancelled" }
            else if self.meta.finish_reason.as_deref() == Some("length") {
                if self.meta.output_limit == -1 { "model_context_exhausted" }
                else { "output_limit" }
            }
            else if self.meta.done_marker { "completed" }
            else { "stream_ended_without_done" };
        self.meta.duration_ms = self.started.elapsed().as_millis() as u64;
        self.meta.clone()
    }
}
impl Drop for GenerationTrace {
    fn drop(&mut self) {
        if let Some(path) = &self.path {
            self.meta.duration_ms = self.started.elapsed().as_millis() as u64;
            let record = RunRecord {
                kind: "generation", unix_seconds: unix_seconds(),
                version: env!("CARGO_PKG_VERSION"), request_id: &self.request_id,
                backend: self.backend, code_only: self.code_only, context_tokens: self.context_tokens,
                phase: self.phase, outcome: self.outcome, stream_bytes: self.stream_bytes,
                meta: &self.meta,
            };
            if let Ok(json) = serde_json::to_string(&record) {
                let _ = append_record(path, &json); // never make inference fail due to diagnostics
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all="camelCase")]
pub(crate) struct Review {
    request_id: String,
    outcome: String,
    closed_fences: bool,
    proposed_files: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewRecord<'a> {
    kind: &'static str,
    unix_seconds: u64,
    request_id: &'a str,
    outcome: &'a str,
    closed_fences: bool,
    proposed_files: u32,
}

pub(crate) fn record_review(app: &AppHandle, review: Review) -> Result<(), String> {
    if !valid_request_id(&review.request_id) { return Err("Invalid diagnostic request identifier".into()); }
    if ![
        "accepted", "rejected_output_limit", "rejected_incomplete_stream",
        "rejected_unclosed_fence", "rejected_no_implementation", "rejected_static_checks",
        "no_visible_text", "staged", "staging_failed", "staging_not_possible",
    ].contains(&review.outcome.as_str()) || review.proposed_files > 500 {
        return Err("Invalid diagnostic result".into());
    }
    let path = log_path(app)?;
    let record = ReviewRecord {
        kind: "validation", unix_seconds: unix_seconds(), request_id: &review.request_id,
        outcome: &review.outcome, closed_fences: review.closed_fences,
        proposed_files: review.proposed_files,
    };
    append_record(&path, &serde_json::to_string(&record).map_err(|e| e.to_string())?)
}

pub(crate) fn read_diagnostics(app: &AppHandle) -> Result<String, String> {
    let path = log_path(app)?;
    let raw = match fs::read(&path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound =>
            return Ok("No generation diagnostics yet. Run a model request first.".into()),
        Err(e) => return Err(format!("Could not read diagnostics: {e}")),
    };
    let start = raw.len().saturating_sub(MAX_READ_BYTES);
    // Trim to complete UTF-8 JSONL lines after a bounded byte offset.
    let slice = &raw[start..];
    let complete = if start > 0 { slice.splitn(2, |b| *b == b'\n').nth(1).unwrap_or(&[]) } else { slice };
    Ok(format!(
        "LocalForge v{} | generation-diagnostics.jsonl | metadata only\n\
No prompts, source code, model responses, file paths, API keys, or reasoning text are recorded.\n\n{}",
        env!("CARGO_PKG_VERSION"), String::from_utf8_lossy(complete)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_ids_and_review_results_are_restricted() {
        assert!(valid_request_id("9c1b10a3-fab3-4c47-bf09-130900735717"));
        assert!(!valid_request_id("secret\n{\"prompt\":\"steal\"}"));
        let record = RunRecord {
            kind: "generation", unix_seconds: 0, version: "test",
            request_id: "test", backend:"cuda", code_only: true, context_tokens:32768,
            phase:"complete", outcome:"output_limit", stream_bytes:2024,
            meta: &GenerationMeta {
                finish_reason: Some("length".into()), prompt_tokens:Some(1024),
                completion_tokens:Some(4096),output_limit:-1,visible_chars:8000,
                reasoning_chunks:3,sse_events:120,malformed_sse:0,done_marker:true,
                duration_ms:12345,first_visible_ms:Some(2000),
            },
        };
        let json = serde_json::to_string(&record).unwrap();
        assert!(json.contains("\"output_limit\""));
        assert!(json.contains("\"completionTokens\":4096"));
        assert!(!json.contains("model_response"));
    }
    #[test]
    fn output_limit_and_eof_are_distinct() {
        let meta = GenerationMeta {
            finish_reason:Some("length".into()), prompt_tokens:None,completion_tokens:Some(4096),
            output_limit:4096,visible_chars:42,reasoning_chunks:0,sse_events:8,
            malformed_sse:0,done_marker:true,duration_ms:200,first_visible_ms:Some(30),
        };
        assert_eq!(meta.finish_reason.as_deref(), Some("length"));
        assert!(meta.done_marker);
    }
}
