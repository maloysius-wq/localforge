# LocalForge

**An offline-first coding workspace for ordinary computers, with optional experimental NVIDIA GPU inference on Windows.**

LocalForge is an open-source project toward a compact, shared coding model with Python, web, desktop, mobile, and eventually pixel-art specialties. The interface resembles a desktop coding agent, but the initial releases deliberately add capabilities one by one with clear status reporting and local privacy safeguards.

## v0.3.18: remove arbitrary Bonsai generation and time limits

- A real GTX 1060 field log from v0.3.17 showed exactly `4096/4096` generated tokens, `finishReason=length`, `doneMarker=true`, a 32,768-token context with only 1,187 input tokens, 11,846 visible code characters and a 627-second request. This **proves LocalForge's configured response-token ceiling**, not a GPU crash, context exhaustion or malformed SSE.
- For experimental Bonsai CUDA, `max_tokens=-1` is now sent to the pinned PrismML llama.cpp server for all requests, allowing the model to stop naturally at EOS. The native client applies **no overall generation-time timeout** to Bonsai. Its pinned server supports automatic context shifting on models with shiftable KV memory; a 32K context is still a physical context/window limit and true runtime inability to shift must be reported, not concealed. This is not literally infinite hardware memory or guaranteed model completion.
- The streaming and HTTP-header waits now select on explicit user cancellation so **Stop** remains responsive even during a long-running request without incoming output. Separate 60-second diagnostics/tokenization preflight calls still time out harmlessly; CPU inference retains its original 1,536/3,072 output limits and 15-minute request timeout.
- Structured diagnostics represent `outputLimit=-1` for Bonsai. `finishReason=length` under unlimited output is labeled a **runtime/model context limit**, not a false application-imposed output cap. Truly incomplete code is never automatically staged or written. Original manual file review, approvals and undo remain unchanged, and no retries or automated correction loops were added.
- No new model download required; Windows/Linux tests and published installers must pass before upgrading. User can run generations for hours and stop manually, subject to PC uptime, RAM/VRAM and PrismML runtime behavior.

## v0.3.17: structured diagnostics for truncated generations

- **Why:** Bonsai 27B on GTX 1060 wrote substantial code, then stopped partway through; the UI's generic "model did not produce usable code" could not distinguish token cap, unclosed code fence, truncated SSE stream, static source-check failures or a poor model response. No raw stream/log from this specific incident was available, so the exact cause is unconfirmed.
- Native generation now writes a bounded, metadata-only `generation-diagnostics.jsonl` in the app's standard log directory. Per-request records include random request ID, backend, configured context/output limits, actual prompt and completion token counts when available, server `finish_reason`, end-of-SSE `[DONE]` receipt, event counts, malformed-frame counts, stream byte counts, visible-character counts, separate reasoning-chunk counts (never content), total duration, first visible token timing and safe outcome/stage. Failures in HTTP or SSE are separately categorized. The metadata log is rotated at 512 KiB and never stores prompts, code, raw tokens, reasoning, model paths, API keys or SSE bodies.
- React now retains the structured generation result rather than discarding native finish metadata. It distinguishes `finish_reason=length` from a clean stop, missing completion marker and unclosed fenced source. Incomplete code stays visible with a targeted warning but cannot be automatically staged. Existing first-pass static HTML checks and source-change approval remain enforced.
- The native IPC accepts only enum-like review outcomes and valid UUIDs when recording frontend validation/staging results. Settings now offers **Copy generation diagnostics**, copying recent bounded sanitized records for troubleshooting without requiring a user to find log files.
- Frontend tests cover clean vs cut-off replies, missing stream-completion markers, unclosed fences and static-check failures; Rust tests cover metadata-only records. No prompt code is logged. The response length itself remains 4,096 tokens for Bonsai coding at 8K+ context. Diagnostics must be tested on the actual 6GB GTX 1060 before drawing conclusions about physical speed or memory usage.

## v0.3.16: prevent Bonsai thinking-only empty responses

- After 32K-context testing, LocalForge could return no text after a long generation. Exact runtime SSE payload was not provided, so the incident's cause is not proven. The native backend had a real failure mode: it read only visible `delta.content`, ignoring separate `reasoning_content` and `finish_reason`, while still imposing the same small output-token caps as CPU models.
- **Experimental Bonsai CUDA only:** request the pinned PrismML server's `--reasoning-budget 384` and `--reasoning-format deepseek`, reserving tokens for the final response. Non-code responses allow 2,048 output tokens; code requests allow 4,096 at 8K+ contexts and 2,048 at 4K. The model's 32K context is unchanged. Sampling follows Prism ML's published 0.7 temperature, 0.95 top-p and 20 top-k recommendations.
- Native SSE handling tracks only whether separate reasoning chunks appeared, final stop reason, and token counts. No raw thinking trace is exposed or saved. If a model responds without final visible text, the app now gives a targeted error instead of suggesting an unrelated unload/reload. Regression tests cover reasoning-only outputs and a visible final answer.
- Original CPU inference configuration, downloads, CUDA offload verification, project-file approval, undo and cancellation remain unchanged. Test on GTX 1060 hardware before claiming actual coding-quality improvements.

## v0.3.15: Bonsai 32K context on 6GB GPUs

- Bonsai's model architecture supports far more than 4,096 tokens; the previous limit was a conservative hardware-validation setting, not a model limitation. The user successfully loaded and generated with Bonsai but quickly exhausted the 4K coding window.
- **Bonsai now defaults to 32,768 tokens**, with selectable 4K, 8K, 16K and 32K options. Existing Bonsai users with the old forced 4K setting are migrated once to 32K; later explicitly chosen 4K settings are respected. Switching away from Bonsai resets to the CPU low-RAM default rather than carrying 32K onto smaller CPU models.
- For 8K–32K contexts, the native CUDA launcher adds `--no-kv-offload` and `--fit off`. These options are verified against the exact pinned PrismML runtime CLI. The FP16 KV cache lives in **system RAM** to avoid consuming the GTX 1060's 6GB VRAM; the model still requests 99 CUDA layers. Long-context inference may run substantially slower, and memory/scratch usage still requires real hardware testing. Unlike automatic fit reduction, `--fit off` rejects an unworkable 32K context rather than silently shrinking it.
- UI and Rust input budgets were increased for 32K, while the existing exact-model token-count safeguard, local-only model/server, per-file approval, and CPU path remain. The GGUF does not need re-downloading.
- v0.3.15 requires Windows installer validation, then a real 32K Bonsai test on the i7-6700/16GB/GTX1060 hardware. If CPU-backed attention is too slow, prefer 16K or 8K, or optimize cache quantization after benchmarking.

## v0.3.14: fix Bonsai GPU logging level after GTX 1060 field log

- Real Bonsai 27B startup logs from the GTX 1060 showed the PrismML server **loaded and listening** in about four seconds, but had **no native GPU device or model-layer allocation lines**. The runtime printed `verbosity = 3`.
- Investigation of the exact PrismML source established that its `common_log_default_callback` maps model `GGML_LOG_LEVEL_INFO` to verbosity **4**, whereas the server's own `INFO` entries remain visible at 3. The existing GPU verifier correctly required an actual layer count, but the default log level silently suppressed that evidence. The earlier v0.3.13 fix waited for messages that could never appear.
- GPU launch now adds **`--log-verbosity 4` only for the Bonsai CUDA backend**, the minimum setting needed to expose `CUDA0 model buffer size` and `offloaded N/M layers to GPU` log messages. The CPU path is unchanged. All model download hashes, GPU validation, localhost isolation and manual file-change approval safeguards remain intact.
- Native tests include a sanitized example of the actual GTX 1060 log with no placement evidence at level 3 and expected positive CUDA layer evidence at level 4. If offload remains unavailable the existing error includes the actual log path; no CPU fallback is accepted as GPU success.
- **Remaining real-world validation:** install v0.3.14, load Bonsai, confirm positive GPU offload in the log, and then compare inference speed/coding quality to the 4B model. Do not claim actual GTX 1060 GPU usage from the supplied v0.3.13 log.

## v0.3.13: fix false GPU-offload errors and add diagnostics

- The Bonsai loader previously rejected a healthy GPU-backed server if a single immediate log read did not contain the exact strings `CUDA` and `offload`. This yielded the confusing "GPU layer offload was not confirmed" error reported on GTX 1060.
- The new Rust GPU diagnostics parser checks explicit `offloaded N/M layers to GPU` evidence **and** an initialized CUDA device, independently of capitalization and unrelated log text. A healthy server is allowed a bounded grace period for log flushing. We never treat HTTP health, requested `--n-gpu-layers`, or model download as proof of GPU inference.
- If GPU evidence remains missing, the UI reports a safe summary and the **real log filename** in app data, instead of blaming the NVIDIA driver without evidence. Explicit 0-layer CPU fallback still fails closed. Regression tests cover positive, partial, zero, malformed and missing logs.
- This is versioned **v0.3.13** so installations of v0.3.12 can discover it via the built-in GitHub updater. No new model download is needed. A physical GTX 1060 run remains necessary to certify inference.
 
## v0.3.12: experimental Bonsai 27B NVIDIA GPU option (Windows)

- Settings → Local inference offers **Bonsai 27B 1-bit (Prism ML, Apache 2.0)** in addition to the three CPU-only models. The default remains Qwen2.5-Coder 1.5B on the CPU. Existing chats and downloaded GGUF files are not modified.
- Bonsai is an explicit, **manual-load** option. It does not auto-load on startup; it requires Windows x64, an NVIDIA CUDA 12.4-compatible driver and the separately bundled PrismML CUDA runtime. The frontend restricts Bonsai to a 4,096-token window. On Linux, this experimental backend reports an actionable unsupported-platform error rather than launching another executable.
- The model download remains user-triggered, from the official [Prism ML Bonsai GGUF](https://huggingface.co/prism-ml/Bonsai-27B-gguf), with its published **SHA-256 pinned**. The actual GGUF is hashed again before GPU launch, including manually selected copies. Model downloads never overwrite existing files.
- Windows installers stage two **SHA-256 pinned PrismML release archives** in a separate `runtime-cuda/` folder at GitHub Actions packaging time. Users do not download runtimes or use a command line. CPU libraries stay isolated in `runtime/`; the GPU launcher cannot load an arbitrary executable.
- GPU mode requests 99 offload layers, 128/64 batch/microbatch, Flash Attention off and the CUDA0 device. Native launch refuses an unconfirmed GPU-offload result instead of silently using the CPU. Localhost API keys, one-slot server ownership, cancellation, Windows update DLL shutdown protection, code review and undo all remain unchanged.
- **Hardware test still required:** the stock PrismML Windows CUDA 12.4 prebuild may not include Pascal `sm_61` kernels for a GTX 1060. Packaging and unit tests cannot confirm GTX 1060 offload. Also verify available VRAM and driver version. GPU performance and comparative coding quality are not yet established for LocalForge.
- Due to the bundled CUDA binaries, the Windows installer is larger than prior releases. For older machines, stay with CPU models and normal start-up. No GPU mode is triggered automatically.

## v0.3.11: maximized desktop, unobtrusive checks, response timer

- Start the desktop window **maximized, not fullscreen**, so the normal operating-system title bar and taskbar remain available. F11 and the header button still allow optional fullscreen.
- Remove the persistent source-check panel above the message composer when automated repair is disabled. First-pass static inspection and its code-staging safety gate remain active; failed checks still appear in the answer, not in an uncloseable overlay.
- Show a live **Working · m:ss** timer at the top of the streaming model response, starting when the prompt is sent, and a **Generated in m:ss** duration on completed answers. Completed response durations are stored as optional v1 message metadata without disturbing earlier conversations.
- No changes to offline CPU-only inference, explicit project-file review/approval, undo, or the one-pass benchmark.

## v0.3.10: first-pass-only code generation

- Each user request now produces **one** local model completion. LocalForge no longer sends a follow-up prompt when the output has no code or when HTML static checks fail.
- First response is preserved verbatim in chat (with a clearly labeled quality notice where needed); static source checks remain in place and can block automatic staging of defective HTML.
- The model smoke test measures only original Minesweeper output and records one first-pass browser-acceptance report without repair prompts. Failed game behavior is a model-quality metric, not a false green claim or a CI infrastructure failure.
- Project review, one-click approval, source hash safeguards, native SQLite, and undo are unchanged. Users can explicitly ask for another attempt or a fix in a new message.

## v0.3.9: choose a model and where it downloads

- In Settings → Local inference, select one of three Q4_K_M model candidates: Qwen2.5-Coder-1.5B (Apache 2.0), Qwen2.5-Coder-3B (Qwen Research noncommercial), Qwen3-4B-Instruct-2507 (Apache 2.0 upstream, Unsloth's GGUF quantization).
- Click **Choose download folder** to select a folder on another disk before pressing **Download and verify model**. The partial download and finished GGUF are kept in the chosen folder and space is checked before streaming.
- Each download comes only from an allowlisted Hugging Face repository, must match advertised SHA-256 and size, and does not overwrite an existing file. Nothing downloads automatically.
- A folder change does not move existing models. Existing models in an earlier folder can still be loaded with **Choose GGUF file**; the original 1.5B app-data download remains intact.
- Larger models need more RAM and CPU time. None are certified for reliable application creation without real benchmarks.

## v0.3.8: native SQLite conversation storage

- Desktop conversations, projects, and workspace settings are now stored in the native local `workspace.sqlite3` database (app data directory). No cloud service or user CLI is involved.
- **One-way, non-destructive migration:** on first launch after upgrading, LocalForge imports its existing `localforge.workspace.v1` WebView snapshot into a SQLite transaction. The original localStorage value is left untouched as a recovery copy. Subsequent native launches read SQLite rather than overwriting it from stale browser data.
- Startup refuses to open an empty workspace if initialization or validation fails. Failed saves are visible; sequential async writes prevent an older request from overwriting the newest snapshot. Browser preview still uses the original localStorage schema.
- Migration and save-order unit tests are included. Windows/Linux packaging CI checks build success; a real OS upgrade smoke test remains necessary to establish persistence across installed versions.

## v0.2: CPU coding chat

- Real desktop UI, project sidebar, conversation history, dark/light theme, native folder picker.
- First **real CPU-only inference** using [llama.cpp](https://github.com/ggml-org/llama.cpp) bundled in the Windows and Linux installers. It launches only when you press **Load model**, binds to `127.0.0.1` with a per-session API key, and stops when unloaded or the window exits.
- **Download verified model** button for [Qwen2.5-Coder-1.5B-Instruct Q4_K_M GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF). It streams the file to app data and compares SHA-256 with the digest advertised by Hugging Face before making it available.
- Alternative **Choose GGUF file** option for models you already have.
- **CPU threads** setting (1–16; start with 2), 2,048 token context, one concurrent generation. All GPU layers disabled.
- Streaming model replies in chat, **Stop generation**, saved replies and honest error states.
- Windows NSIS and Linux deb/AppImage CI installers. The runtime binary is fetched during GitHub Actions packaging from **pinned official llama.cpp b12248** assets and verified against published SHA-256 digests.

**Not yet included:** reading/writing project files, executing code, automated debugging/testing, RAG, native SQLite, RAM/CPU telemetry, pixel-art generation, or autonomous software edits. The model answers coding questions, but it cannot take development actions yet. Choosing a project only associates a chat with that folder.

### Installing and using (no terminal needed)

1. Open [LocalForge GitHub Actions](https://github.com/maloysius-wq/localforge/actions/workflows/build.yml) and open the latest **successful** build on `main`.
2. Download `LocalForge-windows-x64-nsis`, or the Linux AppImage/DEB artifact. Extract the installer from the ZIP and install normally.
3. Launch LocalForge, open **Settings**, and select **Download verified model** (approximately 1.1 GB). An internet connection is required for this one-time download only.
4. Press **Load model**. The first launch may be slow, depending on the CPU and memory available. If the model does not load, LocalForge reports an error rather than claiming it is ready.
5. Open a conversation and ask a Python or web coding question. Responses are streamed from a model running entirely on your own CPU. Use **Unload model** to release RAM.

You can also select an existing `.gguf` file from Settings. Models other than the suggested Qwen GGUF are experimental and may require different templates or more RAM. On older CPUs, Windows WebView2, system C/C++ runtimes or Linux shared library compatibility may limit installation or runtime startup. Unsupported machines are **not** advertised as verified until benchmarked. Installers are unsigned development builds.

### Safety and privacy

- No telemetry and no remote inference; only the user-initiated model download accesses Hugging Face. Development CI fetches the official pinned llama.cpp runtime during packaging, **not on the end user's PC**.
- The inference server binds only to loopback, uses an ephemeral port and an unguessable session key, and is controlled by native Rust commands, not an open shell permission.
- No automatic project filesystem access, terminal execution, destructive modifications, or arbitrary external endpoints.
- Conversations remain in versioned local webview storage. The next milestone will migrate them safely to a native database without losing existing chats. Back up important content in these early releases.
- The GGUF file is downloaded into the application data directory via a temporary file, checksum-verified, and only then renamed into place. Interrupted downloads do not get treated as installed models.

## Contributors

Requires Node 22+, Rust stable, Tauri 2 platform prerequisites and Python 3.10+ for CI preparation scripts:

```sh
npm install
npm test
npm run build
python scripts/prepare_runtime.py
npm run tauri dev
```

`prepare_runtime.py` downloads and verifies the official CPU runtime for your current OS; it requires internet and supports x64 Windows and Linux packaging. Runtime binaries are deliberately excluded from Git. Normal users do **not** need these commands, developer tools or a separate local server.

## Roadmap

1. **v0.1** Complete: desktop shell, chat storage and cross-platform installers.
2. **v0.2** CPU inference with GUI model management and live streaming chat. Benchmark and fix real-machine startup issues.
3. **v0.3** Native database with migration, real RAM/CPU metrics, scoped read-only project inspection and local documentation retrieval.
4. **v0.4** Explicitly approved file patches, safe undo and build/test tool execution.
5. **Later** Adapted small coding models, Android and Swift support, more desktop languages, optional pixel-art generation.

See [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md) for the current technical status and safeguards.

## License

LocalForge: MIT; see [LICENSE](LICENSE). `llama.cpp` is third-party MIT-licensed software ([source and terms](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE)). Qwen model weights are distributed under their own model license at the linked Hugging Face repository.

### v0.2.1 coding behavior update
The recommended small model is instructed to **start coding immediately** when asked to create a program from scratch. Its response limit is now 1,536 tokens and the context window 4,096 tokens. Generated code appears in copyable chat blocks. It cannot save files or run tests yet. If a request is complex, ask for a small runnable initial implementation, then iterate in follow-up prompts. Hardware-level model response quality remains to be evaluated.

## v0.3: quiet model startup, updates and approved project edits

- On Windows, the bundled `llama-server` now launches with `CREATE_NO_WINDOW`. The native server still runs while loaded and its troubleshooting log remains in the app's log directory. The console is hidden, **not** killed before generation completes.
- **Settings → Application updates → Check for updates** queries the official public GitHub Release API only when you click it. On Windows, when a newer official release contains an NSIS installer with GitHub's `sha256` asset digest, **Download and install update** downloads it, checks the full SHA-256 and size, starts the normal visible installer and exits LocalForge. It cannot install unverified assets, arbitrary URLs or GitHub Actions preview ZIPs. Other platforms get release information and an official release link. Installers remain unsigned, so publisher warnings can appear. GitHub Release packages are automatically published from successful `main` builds; PR builds remain ordinary preview artifacts.
- Select a project, open the **Project** tab and click **Inspect project (read-only)**. LocalForge enumerates a bounded number of small source files, ignores common secrets/build folders and displays a browsable list. A short snapshot is attached to future questions in that project until you switch projects or refresh. No data is sent to an external model: the selected local GGUF handles the request.
- Once the local model returns a fenced code block, click **Propose file change**. Select the relative filename, click **Preview existing file**, review current and proposed content side by side, then explicitly click **Approve and write file**. LocalForge saves a backup in its application data directory so **Undo last change** can restore the previous file even after restarting. An on-disk hash prevents writing when the file changed between preview and approval, and prevents an undo from overwriting subsequent edits.
- No shell commands or tests are executed by this release. It does not claim that AI-authored code compiles or works. Project snapshotting is deliberately bounded, not a complete repository index or documentation retrieval service. No autonomous multi-file editing, background agents or external search yet.

### Update caveat for existing v0.2.1 users

The currently installed v0.2.1 doesn't have the update button. Install v0.3.0 **once** from the [official releases page](https://github.com/maloysius-wq/localforge/releases), after the new Windows build and release are verified. Subsequent releases can use the app's update check.

### Backup and safety limits

Source excerpts are read only after you explicitly inspect the selected folder. Backups are stored in LocalForge app data; only the most recent edit has a convenient one-click Undo shortcut, and undo refuses if the file changed after LocalForge applied it. Binary files, symlinked paths, known private/credential filenames, large files and paths escaping the chosen project are rejected. External code execution remains disabled. Keep Git or your own backups for important work.

## v0.3.1 blank-project generation fix
- Blank `.txt` files are now available as explicitly read-only project context, including an empty-file marker.
- The model receives project context within the final user request, not as a second system message, and is instructed to generate proposed code instead of refusing because files are read-only.
- Standalone browser games default to `index.html`, with HTML, CSS and JavaScript in one file. Users still review and approve file writes; the original placeholder text file is not automatically renamed or deleted.
- Tests check the exact reported Minesweeper + blank text file scenario and project inventory, but live small-model behavior requires user validation.

## v0.3.2 updater DLL-in-use fix
On Windows, the in-app updater now waits until LocalForge's owned llama-server process exits before launching the verified NSIS installer. This prevents its loaded ggml-base.dll from blocking upgrades. If an older version is already stuck during installation, cancel the installer and end only LocalForge and its owned llama-server processes in Task Manager, or reboot, before installing. Do not select Ignore in the DLL-writing error, and do not delete downloaded models or conversation data.

## v0.3.3 coding-output reliability
- Creation requests are routed to a dedicated code-first prompt and a larger model output budget; normal conversational answers are unchanged.
- LocalForge checks for actual source code, retries once if the model only describes a program, and clearly reports failure if no complete implementation appears. These are checks on *output format*, not proof that the generated code functions correctly.
- Saved projects and model downloads are preserved. Longer output may take more time and RAM on older CPUs. No code is written without explicit approval.

## v0.3.4 user interface, startup and context
- Chat shows user messages aligned right and model responses on the left. The app launches fullscreen, with F11 or the header button to exit fullscreen.
- If a GGUF is already downloaded or selected, the CPU model loads automatically at startup. User preference, selected model path and thread count are persisted locally; automatic loading can be disabled to save RAM. It never downloads an unrequested model.
- Follow-up software changes now include the original task, recent requirements, and a bounded excerpt of the latest generated source. Ordinary discussions retain recent message history. This is bounded prompt context, not permanent neural memory; large programs can still exceed the model's context limit.

## v0.3.5 optional experimental 64K context
Choose Settings → Local inference → Context window. Select 4,096, 6,144 (low-RAM default), 8,192, 16,384, 32,768 (Qwen native) or 65,536 (experimental) tokens. Selection persists and affects both manual and automatic model loading. Unload/reload before changing context.

Qwen2.5-Coder-1.5B GGUF is natively 32K, so 64K uses experimental YaRN extrapolation. Accuracy beyond 32K is not assured; larger windows reserve more RAM and increase CPU prefill latency, especially problematic for 4GB PCs. Conversation history keeps more code at larger contexts but remains bounded and approximate rather than token-exact.

## v0.3.6: automatic file edits and circular context meter
With a selected local project, LocalForge reads its file inventory and source files explicitly mentioned in a coding request. It automatically prepares generated complete source files as one change set, opening a single before/after review panel. Click **Approve changes** once to apply the entire batch. For multiple files, the model must label each fenced source with `FILE: relative/path.ext`. Ambiguous or restricted paths are not staged. Native Rust checks file hashes, rejects traversal and secret files, and stores one undo journal for the entire group. No files are written until approval, and no shell commands execute.

The composer now shows a circular context meter. It measures tokens using the local llama.cpp chat template and tokenizer before generating and, where the pinned runtime supplies them, updates the displayed count with streamed usage. If token counting is unavailable, it shows unknown instead of inventing a percentage. It displays the last request's context usage, not the sum of all stored chat text. Long-context and model quality limitations still apply.

## v0.3.7: measurable source quality and first repair loop

LocalForge no longer treats a complete-looking HTML source block as proof of a completed task. For HTML coding requests, it parses inline JavaScript using Acorn, checks the document structure and (for Minesweeper) tests for missing tile construction, missing click/right-click handlers, absent reset and neighboring-count logic, and the known hidden-mine immediate-Game-Over pattern. It reports concrete failures, asks the CPU model to repair the full source up to **two times**, and withholds automatic approval if those checks still fail. The result panel explicitly distinguishes **static source checks** from browser tests.

The desktop app does **not** execute arbitrary generated JavaScript in its privileged WebView. Actual browser acceptance tests currently run in **isolated, disposable GitHub CI runners**, using Playwright Chromium with non-fixture requests blocked. Working and deliberately broken Minesweeper controls establish that the browser test detects missing tiles, starting in Game Over, broken interaction, flags, reset and timer. The separate real Qwen CPU smoke workflow records browser performance on an actual generated game and up to two model repairs. Those model quality scores are evidence, not a release gate, and are never made up when a job fails.

The benchmark manifest in `benchmarks/tasks.json` defines six web and four Python tasks for future same-hardware comparison across compact models. Only Minesweeper's browser acceptance is implemented in this milestone; other tests are **planned**, not scored. The initial 1.5B model remains the low-RAM default while evidence is collected. No project files are written before user approval; a passing static check is not a guarantee of working gameplay.

Next milestone: a dedicated opt-in sandboxed local browser runner, independent of Tauri's privileged frontend, and implementation of remaining task acceptance suites and Python test runner, followed by reproducible 1.5B/3B/new-model benchmarking and measured peak RAM on 4/8 GB machines.
