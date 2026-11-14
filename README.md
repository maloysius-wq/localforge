# LocalForge

**A CPU-only, offline-first coding workspace for ordinary computers.**

LocalForge is an open-source project toward a compact, shared coding model with Python, web, desktop, mobile, and eventually pixel-art specialties. The interface resembles a desktop coding agent, but the initial releases deliberately add capabilities one by one with clear status reporting and local privacy safeguards.

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
