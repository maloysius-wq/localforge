//! Conservative, testable verification of actual llama.cpp CUDA offload.
//! Health reports that an HTTP server responded, not that its layers run on GPU.
//! Logs are native diagnostics only; never print the raw log or session API key.
// PrismML common/log.cpp maps GGML_LOG_LEVEL_INFO -> LOG_LEVEL_TRACE (4), not 3.
// Thus model offload reports are absent at the default verbosity of 3.
pub(crate) const GPU_LOG_VERBOSITY: &str = "4";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum OffloadEvidence {
    /// The loader reported positive layer placement on an initialized CUDA device.
    Confirmed { loaded: u32, total: u32 },
    /// Explicit zero layers on GPU (not a GPU inference session).
    CpuFallback { total: u32 },
    /// Positive layer count, but no positive CUDA device evidence.
    DeviceUnconfirmed { loaded: u32, total: u32 },
    /// The log may not yet have flushed the layer placement report.
    Pending,
}

/// Accept only explicit llama.cpp "offloaded N/M layers to GPU" messages.
/// A requested -ngl 99 or an HTTP 200 is NOT evidence of GPU execution.
fn offload_count(line: &str) -> Option<(u32, u32)> {
    let lower = line.to_ascii_lowercase();
    let rest = lower.split_once("offloaded ")?.1;
    let (count, suffix) = rest.split_once(" layers to gpu")?;
    // Require precisely the count before " layers to GPU"; reject strings
    // with extra words or unrelated model-loader metrics.
    let (loaded, total) = count.trim().split_once('/')?;
    let loaded: u32 = loaded.parse().ok()?;
    let total: u32 = total.parse().ok()?;
    if suffix.chars().next().is_some_and(|ch| ![' ', ',', ';', ')'].contains(&ch)) {
        return None;
    }
    if total == 0 || loaded > total { return None; }
    Some((loaded, total))
}

fn cuda_initialized(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if lower.contains("no cuda devices") || lower.contains("found 0 cuda devices") {
        return false;
    }
    // Prefer the device identified by ggml or the actual CUDA model buffer,
    // not a command-line argument that merely requests a device.
    (lower.contains("ggml_cuda_init") && lower.contains("found ") && lower.contains("cuda device"))
        || (lower.contains("cuda0") && (lower.contains("device") || lower.contains("buffer")))
        || (lower.contains("cuda1") && (lower.contains("device") || lower.contains("buffer")))
}

/// Return the most recent completed layer summary. This allows server startup
/// logs to arrive in multiple writes and never mistakes an absent line for a
/// confirmed CPU fallback.
pub(crate) fn assess(log: &str) -> OffloadEvidence {
    let mut last: Option<(u32, u32)> = None;
    let mut has_cuda = false;
    for line in log.lines() {
        if cuda_initialized(line) { has_cuda = true; }
        if let Some(counts) = offload_count(line) { last = Some(counts); }
    }
    match last {
        Some((0, total)) => OffloadEvidence::CpuFallback { total },
        Some((loaded, total)) if has_cuda => OffloadEvidence::Confirmed { loaded, total },
        Some((loaded, total)) => OffloadEvidence::DeviceUnconfirmed { loaded, total },
        None => OffloadEvidence::Pending,
    }
}

/// Safe, short status to show in UI without leaking model paths, chat,
/// command-line API keys, or unrelated log contents.
pub(crate) fn summary(log: &str) -> &'static str {
    match assess(log) {
        OffloadEvidence::Confirmed { .. } => "CUDA device and GPU layer offload confirmed",
        OffloadEvidence::CpuFallback { .. } => "The loader explicitly reported zero GPU layers",
        OffloadEvidence::DeviceUnconfirmed { .. } => "GPU layers reported, but no CUDA device initialization was detected",
        OffloadEvidence::Pending if log.is_empty() => "No runtime log content was readable",
        OffloadEvidence::Pending if log.to_ascii_lowercase().contains("out of memory") =>
            "The runtime reported an out-of-memory error",
        OffloadEvidence::Pending if log.to_ascii_lowercase().contains("no cuda devices") =>
            "The runtime reported no CUDA devices",
        OffloadEvidence::Pending => "The runtime log does not contain a completed GPU layer placement report",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NORMAL: &str = "ggml_cuda_init: found 1 CUDA devices:\n  Device 0: NVIDIA GeForce GTX 1060, compute capability 6.1\nllama_model_load: offloaded 99/99 layers to GPU\n";
    #[test]
    fn accepts_positive_offload_with_initialized_cuda_device() {
        assert_eq!(assess(NORMAL), OffloadEvidence::Confirmed { loaded: 99, total: 99 });
        let case_variant = "ggml_cuda_init: FOUND 1 cuda DEVICES\nllama_model_load: OFFLOADED 48/99 LAYERS TO GPU\n";
        assert_eq!(assess(case_variant), OffloadEvidence::Confirmed { loaded: 48, total: 99 });
        let model_buffer = "llama_model_load: CUDA0 model buffer size = 3500.0 MiB\nload_tensors: offloaded 65/65 layers to GPU\n";
        assert_eq!(assess(model_buffer), OffloadEvidence::Confirmed { loaded: 65, total: 65 });
    }

    #[test]
    fn field_log_is_incomplete_at_default_level_three() {
        // Redacted exact shape of the user's Prism 1-bit Bonsai startup log.
        // The HTTP server reports loaded and listening, but the default
        // verbosity level 3 suppresses the native model placement messages.
        let field_log = "0.00.250.661 I srv  llama_server: initializing ...\n\
0.00.250.680 I cmn  common_param: common_params_print_info: verbosity = 3 (adjust with the `-lv N` CLI arg)\n\
0.00.260.039 I srv    load_model: loading model 'Bonsai-27B-Q1_0.gguf'\n\
0.03.960.026 I cmn          init: llama threadpool init, n_threads = 4\n\
0.04.361.414 I srv    load_model: initializing, n_slots = 1, n_ctx_slot = 4096, kv_unified = 'false'\n\
0.04.372.540 I srv  server_run_i: model loaded\n\
0.04.372.546 I srv  server_on_li: listening on http://127.0.0.1:62939\n";
        assert_eq!(assess(field_log), OffloadEvidence::Pending);
        assert_eq!(GPU_LOG_VERBOSITY, "4");
    }

    #[test]
    fn exposes_gpu_placement_at_trace_level_four() {
        let trace = "0.00.100 I cmn common_params_print_info: verbosity = 4\n\
0.03.900 I llama_model_load: CUDA0 model buffer size = 3500.00 MiB\n\
0.03.901 I llama_model_load: offloaded 65/65 layers to GPU\n\
0.04.372 I srv server_run_i: model loaded\n";
        assert_eq!(assess(trace), OffloadEvidence::Confirmed { loaded: 65, total: 65 });
    }

    #[test]
    fn distinguishes_missing_lines_from_zero_offload() {
        assert_eq!(assess("server is listening on 127.0.0.1\n"), OffloadEvidence::Pending);
        assert_eq!(assess("ggml_cuda_init: found 1 CUDA devices:\nllama_model_load: offloaded 0/99 layers to GPU\n"),
            OffloadEvidence::CpuFallback { total: 99 });
    }

    #[test]
    fn prevents_health_or_requested_layers_from_being_treated_as_gpu_proof() {
        assert_eq!(assess("server: GET /health 200\ncmd: --n-gpu-layers 99 --device CUDA0\n"),
            OffloadEvidence::Pending);
        assert_eq!(assess("server: ready\nllama_model_load: offloaded 10/99 layers to GPU\n"),
            OffloadEvidence::DeviceUnconfirmed { loaded: 10, total: 99 });
        assert_eq!(assess("ggml_cuda_init: found 0 CUDA devices\nllama_model_load: offloaded 10/99 layers to GPU\n"),
            OffloadEvidence::DeviceUnconfirmed { loaded: 10, total: 99 });
    }

    #[test]
    fn refuses_malformed_layer_counts_and_does_not_expose_raw_log() {
        assert_eq!(offload_count("offloaded banana layers to GPU"), None);
        assert_eq!(offload_count("offloaded 101/99 layers to GPU"), None);
        assert_eq!(offload_count("offloaded 1/0 layers to GPU"), None);
        let secret = "llama-server --api-key sensitive-secret -m C:\\Users\\name\\model.gguf";
        assert_eq!(summary(secret), "The runtime log does not contain a completed GPU layer placement report");
        assert!(!summary(secret).contains("sensitive-secret"));
    }
}
