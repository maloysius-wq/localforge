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

## v0.2.1 coding-response quality patch
- A new-project request now receives task-oriented system instructions to deliver working code, assume an empty project, and avoid asking for starter files. Existing-project modifications still must not pretend to inspect files.
- Generation budget expanded to 1,536 tokens, server context to 4,096; old history trimmed to protect output room. Small-model quality is not guaranteed without hardware-level evaluation.
- Safe code-fence presentation and a Copy code action; still **chat code only**, no file editing or tests.
- Automated tests verify instructions/prompt construction and code-block rendering, not model intelligence. First manual validation: new conversation prompt: “Build a Python GUI for a game collection”; confirm a filename, runnable tkinter code and run steps appear, not a request for initial code.

## v0.3 current development priority and safety
- Native server on Windows is started with `CREATE_NO_WINDOW` (0x08000000) to hide the transient console while continuing to log and run inference.
- New modules: `src-tauri/src/workspace.rs` for bounded read-only project snapshot, file read, approved single-file writes and persistent one-edit undo records; `src-tauri/src/updates.rs` for official GitHub Release checks and verified Windows NSIS install handoff; `src/projectTools.ts`, `src/updates.ts` for typed frontend bridge. `App.tsx` adds inspectors and before/after approval modal.
- Update workflow: PR builds still upload preview artifacts. Main builds publish GitHub Release `v__VERSION__` using tauri-action. Update installer runs ONLY after checking GitHub API's SHA-256 digest and asset origin. No automatic execution from untrusted model output.
- The previous application (v0.2.1) cannot self-update; first v0.3 install must be manual. Subsequent installs use Settings → Application updates. Linux currently checks version only.
- New project context is provided only after user clicks Inspect and is bounded to ~6500 characters; file extensions limited, secrets, binary, huge files and symlinks excluded; model must treat snippets as data and not claim it wrote or ran anything.
- Code fences can be proposed for one target file and must be explicitly previewed and approved. Rust checks expected SHA-256 before writing; undo metadata saved in app data and guarded by current-file SHA-256. Undo shortcut persists across app restart for the last edit. This is **not an autonomous multi-file agent**, a test runner, or a full diff engine.
- Next: verify frontend tests, Rust unit tests and Windows/Linux native CI; repair native startup and actual project editing with user testing; add native SQLite migration without losing conversations; introduce command execution under explicit approval and robust sandboxing; documentation retrieval and benchmarks.

## v0.3.1 blank text file and HTML starter fix
- User reported a generic refusal when asking to turn an inspected `New Text Document.txt` into a single-file Minesweeper game. Project inspection succeeded, but `.txt` bodies were previously excluded from the model context and a second system-role message held snapshot data.
- Inspection now includes bounded UTF-8 .txt excerpts and marks empty files. Project snapshots are attached as untrusted data to the latest user request instead of a second system-role message. Safety constraints still prohibit automatic unapproved writes, and source-file text is not treated as instructions.
- The coding policy now clarifies that read-only context does not forbid proposed source code; HTML games should generate one standalone `index.html`. HTML fence proposals default to index.html if no explicit filename.
- Tests cover the exact Minesweeper+TXT request, .txt inspection, context construction, and filename detection. Packaging checks do not establish live model quality; re-test on Windows with a fresh conversation.

## v0.3.2 update install DLL lock fix
- Report: NSIS fails to overwrite `%LOCALAPPDATA%\\LocalForge\\runtime\\ggml-base.dll` when upgrading after v0.3.0 because llama-server is still running. The update command spawned the installer and called `app.exit(0)`, which does not guarantee window Destroyed cleanup of Engine.
- Change: `Engine::stop()` now returns a result and checks/awaits actual owned child exit (without silently ignoring failure). The verified updater calls stop before launching the installer; it aborts if shutdown fails. Unloading from Settings also surfaces shutdown errors. Window Destroyed best-effort stop remains.
- Rust test covers cancellation, state clearing and idempotent stop. A real Windows upgrade and post-update model-load smoke test remain required; CI packaging alone cannot prove file-lock behavior in the field.
- v0.3.1 cannot fix itself: affected users should Abort installer, stop LocalForge/llama-server in Task Manager or reboot, reinstall v0.3.1 (or later), and avoid Ignore. No need to remove model data.

## v0.3.3 code-first generation and actual code validation
- Qwen2.5-Coder-1.5B often answers Minesweeper creation with vague prose or refusals. Previously any nonempty reply was treated as successful. Creation requests now route to a short source-first system prompt and 3,072-token output budget with 6,144-token context. Ordinary coding discussion stays at 1,536 output tokens. The old model may still struggle and output longer code more slowly.
- Code intent routing also combines explicit follow-ups with the last original build request, WITHOUT refeeding prior refusal replies. Inspect context still supplied as untrusted text and file writes still require explicit user approval.
- The app checks that code tasks contain a complete fenced source block (or a raw complete HTML document), retries once with a targeted code-only request if not, and warns instead of claiming a finished program after two failures.
- Tests cover Minesweeper from blank text file, refusal follow-up, non-code response rejection and successful HTML block acceptance. CI verifies routing/application, not neural quality. Live Windows GGUF inference quality must be benchmarked before claiming actual working game generation.

## v0.3.4 chat alignment, CPU auto-loading, fullscreen, multi-turn context
- UI: user messages right and model answers left; fullscreen at native launch. Header action/F11 exits fullscreen, with narrowly scoped Tauri window permissions.
- CPU inference: stored thread setting and optional GGUF path; previously downloaded model loads on startup by default, configurable via Settings checkbox. Never download automatically; show startup error and preserve manual load. Existing server ownership and updater DLL-release safeguards continue.
- Fixed critical memory regression: v0.3.3's code-first flow discarded assistant history and old generated source, while Rust capped recent history to 4000 characters. New conversationContext.ts reconstructs original coding goal, recent user decisions and latest source (capped); normal conversations keep recent dialogue. Rust now allows 9000 chars for latest request and recent history while GGUF context stays 6144 tokens. Context is still bounded and old/oversized source excerpts will be incomplete; future project-file retrieval should prefer actual saved code.
- Tests cover Minesweeper multi-turn follow-up, recent design changes, normal explanations, thread isolation and bounded long source. Native CI and end-user autoload/fullscreen tests still required.

## v0.3.5 optional 64K context
- User requested 64K. Native Qwen2.5-Coder-1.5B GGUF is 32,768 tokens. 65,536 is explicitly experimental with --rope-scaling yarn --rope-scale 2 --yarn-orig-ctx 32768 when using bundled Qwen; custom GGUFs do not get Qwen-specific scaling.
- Settings options 4096,6144 (default low-memory),8192,16384,32768,65536. Persist under localforge.context-tokens.v1; used by manual/autoload model start; selection disabled during model runtime.
- Backend validates selected context and increases history char cap. Frontend uses larger bounded history/source budgets at higher contexts, not the former hardcoded 4K source clipping. Native prompt token sizing remains approximate, and large windows consume much more KV-cache RAM; investigate true Windows 64K startup/CPU timings.
