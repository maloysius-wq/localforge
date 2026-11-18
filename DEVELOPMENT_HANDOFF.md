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

## v0.3.6: auto-staged batch source edits and tokenized context ring
- Selected project automatically re-inspected for coding requests. Named source files may be read within the selected root, bounded by context budget; file reads don't execute. New autoEdits.ts parser stages complete fenced code blocks, requiring explicit FILE: path.ext labels for multi-file output; single-file destinations inferred conservatively. Invalid/ambiguous paths fail closed. Auto review modal opens, with one Approve changes action.
- workspace.rs adds apply_project_changes and undo_project_changes, checks all hashes/paths before writing, refuses symlinks/traversal/secret files/duplicates, caps to 8 UTF-8 files (160 KiB each), keeps group undo journal and rolls back partial application when possible. Old single-edit backward compatibility retained.
- Context ring uses local authenticated llama.cpp /apply-template and /tokenize for measured prompt tokens, optionally updates from streamed prompt+completion usage. Unknown remains unknown if endpoints unavailable. Counts stored by conversation; last request indicator not cumulative history total.
- Supports fuller named file context at 16K/32K/64K; remains character-budgeted. CI Rust/TS/pinned model smoke needed; end-user native approval/undo test still pending.

## v0.3.7: source verification, repair and browser baseline
- Trigger: user provided a Minesweeper HTML file that rendered only a blank gray board and sometimes showed Game Over at startup. Prior code-first checks only looked for a complete document and script blocks, not functionality.
- Implemented Acorn-based offline JavaScript parsing plus HTML and Minesweeper-specific source contracts in `src/webQuality.ts`. On code tasks, `verificationFlow.ts` supplies concrete source failures to the local model for at most two repair attempts. If failed, report defects in chat/composer and do not automatically stage unsafe/incomplete HTML. Checks are conservative and heuristic, NOT behavioral proof.
- Verified UX labels say **static checks only** and do not pretend to run browser/gameplay on user's computer. Existing single approval, file hash preflight, undo and project isolation preserved.
- `benchmarks/fixtures/` contains a working 9x9 Minesweeper and a deliberately broken black/gray-board instant-loss regression. `scripts/web_acceptance.mjs` runs real Chromium Playwright tests in disposable GitHub CI with outside requests blocked: rendered tiles, no startup loss, clickable safe first cell, flag, timer, restart, no JS errors. Regression workflow requires working fixture PASS and broken fixture FAIL.
- Real Qwen CPU smoke test now exports generated candidate HTML, runs browser acceptance, records first-attempt and up-to-two browser-feedback repair trials. Failed model quality is recorded as a baseline, not fabricated or conflated with a code/build pass. Fixed source regression and measured model ability are distinct.
- `benchmarks/tasks.json` defines 10 future web/Python benchmark tasks; only Minesweeper browser acceptance implemented. Do not claim other tasks tested.
- Safety: desktop never executes arbitrary generated HTML/JS in its privileged Tauri WebView. Browser execution runs in CI with read-only repo token and route-blocking. Future local isolated runner requires separate IPC/CSP security review and user opt-in.
- Future: Native SQLite chat persistence, real isolated local web runner, full automated browser tests per task, Python sandbox/pytest runner, model selection benchmarks, measured memory/latency and model fine-tuning only after measured results.

## v0.3.8: native SQLite workspace migration
- Desktop workspace snapshots now persist in `workspace.sqlite3` under the native app-data directory, with bundled SQLite and transactional writes. The existing `localforge.workspace.v1` browser snapshot is imported once on the first launch and is never deleted or overwritten afterward. Browser-only preview continues to use v1 localStorage.
- Initialization returns the existing SQLite snapshot on subsequent launches even if old localStorage differs. Corrupt/unknown v1 import data and database errors block startup with a retry action rather than silently opening an empty workspace. No migration runs from an automatically generated answer.
- Frontend saves are serialized to keep rapid edits ordered and save errors visible. Rust tests cover import preservation, malformed snapshots and no implicit database replacement. TypeScript tests cover serialized writes and recovery after a rejected save.
- **Manual validation still required:** install v0.3.7 with real chats/projects, upgrade to v0.3.8 on Windows and Linux, confirm all messages survive, add a chat, restart twice, simulate WebView quota failure, confirm original localStorage v1 remains untouched; verify rollback/recovery from the original data. CI packaging passing is not proof of installed migration.
- Next development priority: real-world upgrade smoke; then read-only file retrieval and isolated, explicit-opt-in web/Python runtime verification. Do not weaken file-review approval, SHA checks, undo, offline CPU-only inference, or WebView CSP.

## v0.3.9: model comparison choices and alternate-drive model downloads
- Settings provides allowlisted CPU-only Q4_K_M candidates: Qwen2.5-Coder-1.5B, Qwen2.5-Coder-3B (Qwen Research license, noncommercial), and Qwen3-4B-Instruct-2507 (Apache-2.0 upstream; Unsloth public GGUF quantization). Candidate model sources and per-model file size bounds live in native Rust; no arbitrary download URLs.
- Users can choose a pre-existing folder on any accessible drive through the native directory picker. Metadata verification, space preflight and .part file writes happen in that folder, NOT in the system-drive app temp directory. Completed model files are SHA-256-verified against Hugging Face LFS metadata, then renamed on that disk; failures delete only this download's temporary file. Existing files are never overwritten by the download command.
- Selected model ID and optional download directory persist as small WebView preferences. Previously downloaded default 1.5B in app-data/models is unchanged. A new download folder does not move or delete any old GGUF. The existing local GGUF picker supports loading files anywhere, including old locations. Auto-load uses the actually selected downloaded file.
- 64K YaRN extrapolation remains specific to recognized Qwen2.5-Coder filenames, not Qwen3. The existing CPU-only runtime, project approval/undo, UI CSP, updates and native SQLite workspace persistence stay intact.
- Hardware and live quality limits: native Windows/Linux packaged launcher, Hugging Face SHA metadata and actual CPU inference of both larger models require field tests. Model size is not total RAM usage. Do not claim reliable app generation based on this model catalog alone.
- Next: benchmark comparable tasks and inference latency/memory across all 3 models, then add explicit-opt-in isolated test execution.

## v0.3.10: first-pass-only model output (user-requested)
- Removed BOTH automatic generation recovery paths: the code-format retry when initial model output lacks a complete implementation and the bounded HTML static-check repair loop (previously two more inferences).
- `src/verificationFlow.ts` now statically inspects the ONE original reply without triggering inference, reporting pass/fail/not-applicable. The full original model content is still shown in chat. When static checks fail, no automatic file changes are staged; explicit manual proposal/review/approval and undo safeguards remain.
- Composer indicates one model response instead of showing repair counts. Static checks are not a substitute for a real browser runtime.
- CI `scripts/model_smoke.py` now records one original model completion and one isolated browser evaluation (if an HTML document exists). A non-HTML or browser-failing output remains a recorded quality failure, not a reason to issue automated repair prompts or mark infrastructure smoke as broken. Artifacts: `web-quality-artifacts/model-first-pass-metrics.json` and original reply text.
- To compare 1.5B, 3B and 4B fairly, benchmark on identical tasks and settings with no automated corrections. Native CPU startup and broader task testing remain pending.

## v0.3.11: maximized startup, quiet source verification, response clock
- `src-tauri/tauri.conf.json` now starts a maximized normal OS window (`maximized: true`, `fullscreen: false`). F11/header still optionally toggle true fullscreen; UI starts from non-fullscreen state and queries the actual native state.
- Removed the permanently displayed source-verification checklist in the composer. Current first-pass-only mode still performs static inspections, refuses unsafe auto-staging, and includes failed checks in the assistant response. No automatic model repair or retries returned.
- The streaming assistant header includes a lightweight elapsed timer (m:ss, h:mm:ss for long generations), beginning at Send and updating every 500 ms; it does not consume model inference, modify prompts, or trigger file writes.
- Successful completed replies persist optional `durationMs` with their `ChatMessage` (unchanged version 1 workspace schema) and display final elapsed time. Older chat messages lack the field and remain readable. Errors/cancelled generations dismiss the live timer without fabricating a completed response.
- New frontend tests cover maximized window defaults, elapsed-time formatting and persistence compatibility. Full installed Windows/Linux window-launch and timing behavior still need field validation.

## Post-v0.3.11 CI browser and model comparison improvements
- The Minesweeper browser acceptance script now requires 81 visible 9×9 cells, with 81 cells still present after restart. An intentionally undersized but playable 3×3 fixture is a negative control, and browser checks trigger on pushes to main.
- Manual **Smoke-test real CPU coding model** workflow runs can select any of the three native-allowlisted Q4_K_M candidates. PR-triggered smoke remains 1.5B only; larger model downloads are never automatic. Each download uses the official Hugging Face SHA-256 and model-specific byte-range verification.
- A single original Minesweeper response is measured with fixed 4 CPU threads, 6,144-token context, 3,072-token output cap and temperature 0.1, **no retries or automatic repair**. Results include model digest, actual token usage where reported, startup and generation seconds, token throughput where measurable, observed Linux llama-server peak resident memory, CPU/RAM runner details, and browser acceptance outcomes. Missing measurements are null, not invented. GitHub Actions artifacts and run summaries expose results.
- Experimental 64K YaRN startup smoke stays restricted to the previously tested 1.5B model. Stdlib Python CI tests verify benchmark catalog URLs against Rust's native allowlist and basic measurement behavior.
- **Outstanding:** physical Windows/Linux upgrade and local inference validation, fair three-model repeated benchmarks on 4GB/8GB hardware, broader functional task acceptance, and safe opt-in isolated local execution. CI runner hardware may differ across runs. No end-user GUI or file access permissions were changed by these CI-only improvements.

## v0.3.12: optional Bonsai 27B NVIDIA CUDA path (Windows experimental)
- Official Prism ML `Bonsai-27B-Q1_0.gguf` (1-bit, ~3.8 GB) added to Rust allowlist and Settings, with pinned known SHA-256 `17ef842e47450caeb8eaa3ebfbbab5d2f2278b62b79be107985fb69a2f819aa0`. Download requires original Hugging Face metadata to match the pin; model file is also re-hashed at launch.
- Existing CPU-only runtime and all current CPU models remain the default. The new explicit `cuda` backend is allowed **only** for the official Bonsai model on Windows x64 with exactly 4,096 context tokens. There is no automatic GPU startup; CPU models still use `-ngl 0`.
- GitHub Actions `scripts/prepare_gpu_runtime.py` stages the separate PrismML `prism-b12128-d7b2896` CUDA 12.4 Windows server and CUDA DLL archives, each SHA-256 pinned, under `runtime-cuda/`. Linux packages contain only a nonfunctional marker there. No executable download, arbitrary shell tool, untrusted binary, or GPU library mixing is exposed through the frontend.
- The CUDA launch requests `--n-gpu-layers 99 --device CUDA0 --ctx-size 4096 --batch-size 128 --ubatch-size 64 --flash-attn off` plus private localhost API key and one slot. Health status is not presented as successful GPU inference if logs lack CUDA/offload evidence. The original process stop and updater shutdown remain in use.
- **Critical field test before claiming usable on GTX 1060:** check PrismML Windows prebuilt CUDA 12.4 support for Pascal `sm_61`, available 6GB VRAM, Windows NVIDIA driver, model load and streaming, prompt counting, long-response cancellation, and safe updater DLL replacement. CI has no NVIDIA device. If `sm_61` kernels are absent, produce a separately pinned compatible build rather than permitting unverified CPU fallback or downloading executables at runtime.
- A fair Bonsai-versus-4B functional comparison remains outstanding. Do not claim large coding quality or speed improvements until the exact same prompts, context/output budgets, and real browser acceptance checks run on the target i7-6700/GTX 1060/16GB setup. Context above 4K and speculative decoding are intentionally disabled for this first test.

## v0.3.13: GPU diagnostic bugfix after GTX 1060 field report
- GTX 1060 test showed `Could not load model: GPU layer offload was not confirmed`. This was emitted **after a healthy HTTP response**, because v0.3.12 checked for two case-sensitive log substrings immediately. It was not evidence of a real GPU failure.
- New `src-tauri/src/gpu_diagnostics.rs` assesses explicit offloaded layer counts with CUDA device evidence, distinguishes zero-layer fallback from incomplete logs, and avoids exposing the raw log/API key to the UI. Runtime gives Windows log buffer a short grace period after /health before deciding; detailed messages reference the log path. Rust unit tests cover representative ggml CUDA logs.
- Bump all native, Tauri, npm and UI versions to **0.3.13** so the in-app updater on v0.3.12 can see this fix. Do not overwrite an already published v0.3.12 asset with the fix.
- **Still required:** obtain actual v0.3.13 loader diagnostic and test with GTX 1060 on the user's machine; no hardware telemetry or runtime log was uploaded, so GPU offload remains unproven. Also compare first-pass coding quality after hardware validation.

## v0.3.14: root cause resolved for empty GPU placement log
- User provided the exact `llama-server.log` after v0.3.13: PrismML server loads `Bonsai-27B-Q1_0.gguf`, initializes 4 threads and 4096 context, and listens on 127.0.0.1; log has only 8 lines and says `verbosity = 3`. There are no CUDA device or layer allocation lines. This does **not** prove a GPU failure or offload success.
- Exact PrismML source investigation: `common/log.cpp:common_log_get_verbosity(GGML_LOG_LEVEL_INFO)` returns `LOG_LEVEL_TRACE` = 4. `src/llama-model.cpp` writes `offloaded N/M layers to GPU` and `CUDA0 model buffer size` with `LLAMA_LOG_INFO`. At log level 3 those are omitted, so v0.3.13 could not possibly confirm them regardless of the grace period.
- `start_model` now supplies `--log-verbosity 4` **only** when `backend=cuda`, using a tested constant. The existing positive-offload verifier remains fail-closed and rejects true zero-layer CPU fallback. Tests include sanitized field-log regression and expected trace-level CUDA model buffer/offload output. Version bumped all official locations to `0.3.14` for updater discoverability.
- Next: Windows CI installer and physical GTX 1060 test; inspect the now-richer log if needed. CPU model path and permissions unchanged. CUDA 6GB memory/driver issues still possible; do not assert resolved hardware functionality without actual hardware testing.

## v0.3.15: native 32K Bonsai context with limited GTX 1060 VRAM
- User confirmed v0.3.14 now loads Bonsai and generates, but 4,096-token context quickly exhausts during a coding task. Context limitation was enforced both in React model selection and Rust `validate_backend`.
- Bonsai's own model documentation supports 262K context and provides its 32K+ memory tradeoffs. New Bonsai default 32,768 tokens; configurable 4K/8K/16K/32K. Old persisted Bonsai 4K choice migrates once, later intentional 4K allowed. Non-Bonsai CPU model context defaults unchanged.
- For Bonsai CUDA at 8K+ the launcher uses `--no-kv-offload --fit off` verified in the PINNED PrismML `prism-b12128-d7b2896` arg definitions. This puts KV cache in host RAM to protect 6GB VRAM and forbids silent llama.cpp context shrinkage. `--n-gpu-layers 99` and explicit device, verified offload, localhost keys, logging diagnostics retained. Long-context speed and CUDA scratchpad remain field-test unknown; provide 8K/16K opt downs.
- Expanded React and Rust character budgets for 32K. Existing real tokenizer context guard still ensures code output room before generation. No GGUF re-download. After v0.3.15 Windows CI passes, verify on GTX 1060 16GB physical machine. Compare whether 32K host-KV slows long prompts and whether 16K is a better default for that hardware.

## v0.3.16: bounded reasoning and SSE empty-answer diagnosis
- Following the user's 32K-context trial with v0.3.15, generation eventually produced no visible text, prompting the old UI advice to unload/reload. We do NOT have the exact runtime SSE response, so the root cause remains a likely, code-supported hypothesis rather than measured evidence.
- Confirmed source failure mode: `generate` consumed only `choices[0].delta.content`, not `delta.reasoning_content`, and still used 1,536/3,072 generated tokens even for a 32K Bonsai context. The upstream model is a thinking model and the pinned PrismML server defaults `--reasoning-budget -1` (unbounded). If thinking occupied the budget, the UI got no text even if inference ran.
- GPU-only launch now applies `--reasoning-budget 384 --reasoning-format deepseek` (both verified in pinned `prism-b12128-d7b2896` arg.cpp), with Prism ML model-recommended temperature 0.7, top_p 0.95 and top_k 20. CPU sampling/settings untouched.
- GPU response token cap: 2,048 normal, 4,096 coding at >=8K context, 2,048 coding at 4K; exact prompt-token guard remains active. Parsed streaming SSE events track existence of separate reasoning_content, completion_tokens and finish_reason metadata but never save/reveal reasoning. Empty visible replies return an actionable backend error. Tests cover response limits, reasoning-only empty responses, hiding thinking text and valid content streaming.
- Bump native, Tauri, JS and visible app version to 0.3.16. Continue actual GTX 1060 acceptance testing and inspect fresh runtime log if response remains empty or slow. No automatic retries and no autonomous file writes.

## v0.3.17: why Bonsai stops mid-code, with local diagnostic logs
- User reports that v0.3.16 generated a long partial code answer and then the UI said "model did not produce usable code". No exact SSE or new runtime log attached to this turn. Code-level issue: `generate` dropped `finish_reason` and token usage after streaming; frontend rejected malformed/incomplete implementations under a single generic error. The exact user incident may have exhausted `max_tokens=4096`, or otherwise ended early, but cannot be established without traces.
- `src-tauri/src/generation_log.rs` is a privacy-preserving fixed-directory per-run JSONL log with bounded size. Logs request UUID, backend, code-only, context/output limits, prompt/completion token totals, `finish_reason`, `[DONE]` marker, SSE counts/errors, byte and visible-char counts, thinking chunk **counts only**, first visible token timing, wall-clock duration, phase/outcome. Do NOT log actual model output, source, user prompt, system instructions, thinking, paths or API keys. `get_generation_diagnostics` reads last 96KiB for Settings clipboard. `record_generation_review` logs allowlisted UI validation and staged/not-staged events (never raw text). Support logs are app-managed only; no filesystem picker or cloud upload.
- `generate` now returns `GenerationResult {text,meta}` rather than only a string; frontend distinguishes output-limit, interrupted/missing `[DONE]`, unclosed code fence, missing implementation and static source-check failure. Incomplete code is displayed with accurate warning, never auto-staged. Original no-auto-retry, no automatic file writes, verified CUDA runtime, manual approval and undo unchanged.
- Finish `v0.3.17` CI and Windows installer publication; then ask user to replicate once and click Settings → Generation diagnostics → Copy generation diagnostics and paste the report. Do not claim an actual physical GPU cause until the report is obtained. Frontend and Rust test coverage added for new diagnostic metadata.
