# LocalForge Development Handoff

## Mission
A pleasant GUI-first, offline CPU-only software-building workspace for older Windows/Linux systems. Small common coding foundation, specialization via tools/retrieval/adapters, and independent pixel art pipeline. Starting with Python and HTML/CSS/JS.

## v0.2 implementation
- GUI: Tauri 2 + React/TS, projects/chats persisted in existing localStorage v1 schema (backward-compatible assistant role added), downloaded GGUF status, CPU thread selector, load/unload, stream and stop buttons.
- Native: Rust commands in `src-tauri/src/lib.rs` own a `llama-server` child process, random localhost port + one-time UUID API key, `-ngl 0`, context 2048, parallel slots 1. Responses are consumed by Rust from streaming SSE and emitted as Tauri events. No direct fetch to localhost from the unprivileged frontend.
- Model: user-triggered download of official Qwen2.5-Coder-1.5B-Instruct Q4_K_M GGUF to app data via temp path, length and Hugging Face LFS SHA-256 checked. No additional provider keys. Local GGUF can be selected via native file picker.
- Packaging: `scripts/prepare_runtime.py` pins llama.cpp b12248 CPU archives and SHA-256, stages exe/shared libs in `src-tauri/runtime/`; GitHub Actions does this before Tauri packaging. The installed app does not download executables.
- Streamed answers are not claimed to be verified or tested code. No project files read/write or executable tools, and no developer shell UI.

## Non-negotiable safeguards
- No CLI required for users; only internal CI/contributor commands.
- Strict CPU-only inference, never claim broader old-machine support until tested.
- No pretend responses, test output, metrics, or filesystem access.
- Restrict process to bundled server; loopback-only ephemeral API-key protection; Rust manages lifecycle; no arbitrary shell plugin.
- Only user-initiated HTTPS download from trusted host with integrity verification. Partial downloads discarded.
- Preserve earlier chats; migrations must be one-way, tested, backwards-compatible and non-destructive.
- Scoped project permissions, explicit approval, undo before any code agent/file-write tools are enabled.

## Next priority
1. Run `npm test`, `npm run build`, Windows/Linux Tauri packaging in GitHub Actions and fix anything broken. Verify packaged binary launch on real Windows/Linux (CI package success alone does not prove runtime success).
2. Integration-test model download via official Hugging Face redirects, SHA verification, localhost inference startup and streamed responses. Fix any API changes or shared-library launch errors. Keep all such failures visible and actionable in UI.
3. Add cancellation safety for long downloads, low-RAM preflight/telemetry, thread/ctx experiments, handling stopped/crashed model and safe streaming error fallback.
4. Migrate localStorage to native SQLite while preserving conversations, then add read-only project indexing/documentation retrieval.
5. Build the CPU-only Python and web benchmark suite and verify actual task success on 4GB and 8GB computers.

## Known limitations
- No RAM/CPU telemetry yet. The 2,048-token context and 512 max generated tokens are conservative defaults, not hard memory guarantees.
- First verified release intended for x64 Windows and Linux. Older operating systems/CPUs and Linux glibc dependencies are not yet validated.
- No signed installer; unsigned test builds may trigger SmartScreen.
- Partial streamed response is not persisted if inference fails abruptly; only completed responses are saved.
- Conversation persistence is still webview localStorage, so long histories may hit quota. Migration to SQLite is high priority.
- No generic web access or project context is supplied to the model, only recent messages. Do not infer file inspection or build success.

## Structure
- `src/App.tsx`, `src/ModelManager.tsx`, `src/inference.ts`: GUI and native command bindings.
- `src/storage.ts`: versioned workspace persistence.
- `src-tauri/src/lib.rs`: restricted model download/launch/inference.
- `src-tauri/tauri.conf.json`: bundle runtime folder in installers.
- `scripts/prepare_runtime.py`: pinned archive verification and extraction.
- `.github/workflows/build.yml`: checks/package artifacts.
