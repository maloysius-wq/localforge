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
