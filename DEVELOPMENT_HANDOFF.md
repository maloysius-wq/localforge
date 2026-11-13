# LocalForge Development Handoff

## Mission
Build a responsive, approachable offline CPU-only coding workspace for aging Windows/Linux computers. Prefer a compact shared foundation model and specialization via retrieval/tools/adapters. Initial specialties: Python and HTML/CSS/JS. Later: Android, iOS, Windows/Linux desktop and separate pixel-art generation.

## Current release and scope
v0.1.0: desktop UI shell, Tauri/React/TypeScript, saved projects/conversations, native directory picker, activity logging, settings, dark/light theme. No model is running and no project files are accessed. The UI always identifies this clearly. GitHub Actions packages Windows NSIS and Linux deb/AppImage build artifacts.

## Non-negotiable safeguards
- Users interact through GUI; CLI limited to internal developer/CI tools.
- CPU-only inference, no dedicated GPU dependency.
- No fake assistant responses, simulated build/test successes or invented metrics.
- Workspace isolation, least privilege, explicit write/command permissions and undo before agent capabilities are added.
- Keep deployment artifacts honest: only claim installer availability once CI succeeds.
- Preserve existing user conversations and avoid data loss during storage migration.
- Small memory footprint and compatibility testing on older hardware are acceptance criteria, not assumptions.

## Next development priority
1. Verify CI builds on Windows and Linux. Fix compiler/bundling issues before adding features.
2. Implement a CPU-only llama.cpp backend launched by the desktop shell, with controlled process lifetime, downloaded model verification, memory guardrails and streamed responses.
3. Add native SQLite persistence with migration from localStorage, model selector, load/unload controls, visible CPU/RAM/tokens-per-second metrics.
4. Write reproducible CPU-only benchmarks for basic Python and web coding tasks and show *verified* task outcomes.

## Structure
- `src/App.tsx`: UI state, project and chat navigation, actions.
- `src/storage.ts`: versioned local persistence and validation.
- `src/styles.css`: responsive dark/light theme.
- `src-tauri`: restricted desktop shell and bundling config.
- `.github/workflows/build.yml`: CI checks and Windows/Linux packages.

## Testing limitations
The development sandbox used for this initial scaffold could not download npm dependencies or run Rust/Cargo. Type checking, frontend tests, and native packaging therefore rely on GitHub Actions. Do not label any build as passing until CI confirms it.
