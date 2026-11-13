import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Activity, ArrowRight, ArrowUp, BookOpen, CheckCircle2, ChevronDown,
  ChevronRight, Code2, FileCode2, Folder, FolderOpen,
  FolderPlus, HardDrive, History, Info, LayoutPanelLeft, Menu, MessageSquare,
  Moon, PanelRightClose, Plus, Settings2, ShieldCheck, Sparkles,
  Sun, Terminal, Trash2, X, StopCircle, RefreshCw, RotateCcw, Eye, ClipboardCheck,
} from "lucide-react";
import {
  loadWorkspace, newId, projectLabel, saveWorkspace, uniqueProject,
  type ChatMessage, type EventLog, type Project, type Thread, type WorkspaceState,
} from "./storage";
import { ModelManager } from "./ModelManager";
import { splitCodeBlocks } from "./codeBlocks";
import { inspectProject, readProjectFile, applyProjectChange, undoProjectChange, suggestFilename,
  type ProjectSnapshot, type ProjectFile } from "./projectTools";
import { checkForUpdates, installUpdate, onUpdateProgress, type UpdateInfo } from "./updates";
import {
  type DownloadProgress, type EngineStatus, type ModelInfo, emptyStatus, emptyModel,
  getStatus, getModelInfo, downloadModel, startModel, stopModel,
  cancelGeneration, generate, onToken, onDownload,
} from "./inference";

type Tab = "activity" | "project";
const SUGGESTIONS = [
  { icon: FileCode2, title: "Debug an issue", prompt: "Inspect my project and help me debug a specific issue." },
  { icon: Sparkles, title: "Build a program", prompt: "Build a complete, runnable Python desktop app from scratch with a graphical interface for managing my game collection. Include filenames and code." },
  { icon: BookOpen, title: "Understand code", prompt: "Explain the architecture of this project and its main components." },
  { icon: Code2, title: "Improve quality", prompt: "Review this project for bugs, code quality, and maintainability improvements." },
];
const timeLabel = (timestamp: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
const dateLabel = (timestamp: number) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
const shortTitle = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 52) || "New conversation";

function MessageBody({ content, isAssistant, onPropose }: { content: string; isAssistant: boolean;
  onPropose?: (code: string, language: string, hint: string) => void }) {
  const [copied, setCopied] = useState<number | null>(null);
  if (!isAssistant) return <div className="message-text">{content}</div>;
  return <div className="message-body">{splitCodeBlocks(content).map((part, index) => part.type === "text"
    ? <div key={index} className="message-text">{part.content}</div>
    : <div key={index} className="code-block">
        <div className="code-heading"><span>{part.language || "code"}</span>
          {onPropose && <button type="button" onClick={() => onPropose(part.content, part.language, content.slice(0, content.indexOf(part.content)))}>Propose file change</button>}
          <button type="button" onClick={() => {
          void navigator.clipboard.writeText(part.content).then(() => {
            setCopied(index);
            window.setTimeout(() => setCopied(value => value === index ? null : value), 1600);
          }).catch(() => setCopied(null));
        }}>{copied === index ? "Copied" : "Copy code"}</button></div>
        <pre><code>{part.content}</code></pre>
      </div>)}</div>;
}

function ActivityItem({ event }: { event: EventLog }) {
  return <div className="activity-item"><span className="activity-dot" />
    <div><p>{event.message}</p><time>{timeLabel(event.at)} · {dateLabel(event.at)}</time></div>
  </div>;
}

function EmptyChat({ onPrompt, project }: { onPrompt: (prompt: string) => void; project?: Project }) {
  return <section className="empty-chat" aria-label="Get started">
    <div className="welcome-mark"><Code2 size={28} strokeWidth={2.3} /></div>
    <div className="welcome-eyebrow">YOUR DEVELOPMENT WORKSPACE</div>
    <h1>What are we building<span>?</span></h1>
    <p className="welcome-desc">{project
      ? <>Ready for <strong>{project.name}</strong>. Plan your work here and keep everything organized as LocalForge gains its coding engine.</>
      : <>A calm place for ambitious projects. Add a local project folder, start a conversation, and make something great.</>}
    </p>
    <div className="suggestions">{SUGGESTIONS.map(({ icon: Icon, title, prompt }) =>
      <button type="button" className="suggestion" key={title} onClick={() => onPrompt(prompt)}>
        <Icon size={19} /><span>{title}</span><ArrowRight size={16} className="suggestion-arrow" />
      </button>
    )}</div>
  </section>;
}

function UpdateSettings() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onUpdateProgress(e => { if (!disposed && e.total > 0) setProgress(Math.floor(e.received/e.total*100)); })
      .then(off => {if (disposed) off(); else unlisten = off;}).catch(() => {});
    return () => {disposed = true; unlisten?.();};
  }, []);
  async function check() {
    setBusy(true); setError("");
    try {setInfo(await checkForUpdates());}
    catch(e) {setError(`Could not check GitHub Releases: ${String(e)}`);}
    finally {setBusy(false);}
  }
  async function install() {
    if (!info?.installable || !window.confirm(`Download and install LocalForge ${info.latestVersion}? The current app will close to run the verified Windows installer.`)) return;
    setInstalling(true);setProgress(0);setError("");
    try {await installUpdate();}
    catch(e) {setError(`Update was not installed: ${String(e)}`);setInstalling(false);}
  }
  return <div className="updates-section">
    <div className="setting-summary"><RefreshCw size={18}/><div><strong>Updates from GitHub Releases</strong>
      <span>Check for a newer version. Windows installations are downloaded and SHA-256 checked against GitHub release metadata before launch. Development Actions artifacts aren't eligible.</span></div></div>
    <button type="button" className="model-action secondary" onClick={() => void check()} disabled={busy || installing}>
      <RefreshCw size={15}/> {busy ? "Checking GitHub…" : "Check for updates"}</button>
    {info && <div className="update-result"><strong>Installed: v{info.currentVersion} {info.latestVersion ? `· Latest release: ${info.latestVersion}` : ""}</strong>
      <p>{info.available ? `An update is available. ${info.notes}` : (info.notes || "You're using the latest published version.")}</p>
      {info.available && info.installable && <button type="button" className="model-action primary" onClick={() => void install()} disabled={installing}>
        <RefreshCw size={15}/>{installing ? `Downloading verified installer… ${progress}%` : "Download and install update"}</button>}
      {info.available && !info.installable && <p>No verified automatic installer is available for this operating system/release yet. See the official release page.</p>}
      <a className="release-link" target="_blank" rel="noopener noreferrer" href={info.releaseUrl}>View official GitHub release</a>
    </div>}
    {error && <p className="update-error" role="alert">{error}</p>}
  </div>;
}

function SettingsModal({ theme, setTheme, onClose, engine, model, progress, downloading, modelBusy, modelPath, threads, setThreads, download, load, unload, choose }: {
  theme: WorkspaceState["theme"];
  setTheme: (theme: WorkspaceState["theme"]) => void;
  onClose: () => void;
  engine: EngineStatus;
  model: ModelInfo;
  progress: DownloadProgress | null;
  downloading: boolean;
  modelBusy: boolean;
  modelPath: string | null;
  threads: number;
  setThreads: (threads: number) => void;
  download: () => void;
  load: () => void;
  unload: () => void;
  choose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
      <div className="modal-heading"><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-heading">Settings</h2></div>
        <button ref={closeRef} className="icon-button" type="button" aria-label="Close settings" onClick={onClose}><X size={20}/></button>
      </div>
      <div className="settings-section"><h3>Appearance</h3><p>Choose the look that suits your workspace.</p>
        <div className="theme-options">
          <button className={`theme-option ${theme === "dark" ? "selected" : ""}`} onClick={() => setTheme("dark")}><Moon size={19}/> Dark {theme === "dark" && <CheckCircle2 size={17}/>}</button>
          <button className={`theme-option ${theme === "light" ? "selected" : ""}`} onClick={() => setTheme("light")}><Sun size={19}/> Light {theme === "light" && <CheckCircle2 size={17}/>}</button>
        </div>
      </div>
      <div className="settings-section"><h3>Local inference</h3><p>Download or select a GGUF model, then load it into memory. LocalForge bundles the CPU-only runtime with its installer.</p>
        <ModelManager engine={engine} model={model} progress={progress} downloading={downloading} busy={modelBusy} modelPath={modelPath} threads={threads} setThreads={setThreads} onDownload={download} onLoad={load} onUnload={unload} onChoose={choose}/>
      </div>
      <div className="settings-section"><h3>Application updates</h3><UpdateSettings/></div>
      <div className="settings-section"><h3>Privacy and safety</h3>
        <div className="setting-summary"><ShieldCheck size={18}/><div><strong>Your data stays on this computer</strong><span>Chats stay local. Your selected project can be inspected on request and edited only after approving each proposed file change. No shell execution. Update checks reach the official GitHub API on request.</span></div></div>
      </div>
      <div className="settings-footer">LocalForge 0.3.1 · CPU coding workspace</div>
    </section>
  </div>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace());
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detailTab, setDetailTab] = useState<Tab>("activity");
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [engine, setEngine] = useState<EngineStatus>(emptyStatus);
  const [model, setModel] = useState<ModelInfo>(emptyModel);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [threads, setThreads] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [inspected, setInspected] = useState<{ projectId: string; data: ProjectSnapshot } | null>(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [viewedFile, setViewedFile] = useState<ProjectFile | null>(null);
  const [proposal, setProposal] = useState<{ projectId: string; root: string; path: string; content: string; original: ProjectFile | null } | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [lastEdit, setLastEdit] = useState<{ root: string; token: string; path: string } | null>(() => {
    try { const value = localStorage.getItem("localforge.last-edit.v1"); return value ? JSON.parse(value) : null; } catch {return null;}
  });
  const pendingRef = useRef<{ requestId: string; threadId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeThread = workspace.threads.find(t => t.id === workspace.activeThreadId) || null;
  const activeProject = workspace.projects.find(p => p.id === workspace.activeProjectId) || undefined;
  const visibleThreads = useMemo(() => workspace.threads
    .filter(t => t.projectId === workspace.activeProjectId)
    .sort((a, b) => b.updatedAt - a.updatedAt), [workspace.threads, workspace.activeProjectId]);

  useEffect(() => {
    document.documentElement.dataset.theme = workspace.theme;
    if (!saveWorkspace(workspace)) setStorageWarning(true);
  }, [workspace]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeThread?.messages.length, activeThread?.id, liveText]);
  useEffect(() => {
    function keydown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); createChat(); }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); setSettingsOpen(true); }
      if (e.key === "Escape") { setSettingsOpen(false); setNotice(""); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.activeProjectId]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unsubscribe: Array<() => void> = [];
    void getStatus().then(value => { if (!disposed) setEngine(value); }).catch(error => { if (!disposed) setNotice(String(error)); });
    void getModelInfo().then(value => { if (!disposed) setModel(value); }).catch(() => {});
    void onToken(token => {
      if (pendingRef.current?.requestId === token.requestId) setLiveText(text => text + token.delta);
    }).then(off => { if (disposed) off(); else unsubscribe.push(off); });
    void onDownload(value => { if (!disposed) setProgress(value); }).then(off => { if (disposed) off(); else unsubscribe.push(off); });
    return () => { disposed = true; unsubscribe.forEach(off => off()); };
  }, []);

  async function handleDownload() {
    setDownloading(true);
    setProgress(null);
    try {
      const info = await downloadModel();
      setModel(info);
      setModelPath(null);
      setNotice("Model verified and downloaded. Select Load model to start chatting offline.");
    } catch (error) { setNotice(`Model download failed: ${String(error)}`); }
    finally { setDownloading(false); }
  }
  async function handleChooseModel() {
    try {
      const path = await open({ title: "Choose a GGUF model file", directory: false, multiple: false,
        filters: [{ name: "GGUF model", extensions: ["gguf"] }] });
      if (typeof path === "string") setModelPath(path);
    } catch (error) { setNotice(`File picker failed: ${String(error)}`); }
  }
  async function handleLoadModel() {
    setModelBusy(true);
    try {
      setEngine(await startModel(modelPath, threads));
      setNotice("CPU coding model loaded. Chat responses are now generated locally.");
    } catch (error) { setNotice(`Could not load model: ${String(error)}`); }
    finally {
      setModelBusy(false);
      void getStatus().then(setEngine).catch(() => {});
    }
  }
  async function handleUnloadModel() {
    setModelBusy(true);
    try { setEngine(await stopModel()); }
    catch (error) { setNotice(`Could not unload model: ${String(error)}`); }
    finally { setModelBusy(false); }
  }

  function record(state: WorkspaceState, message: string): WorkspaceState {
    const event: EventLog = { id: newId(), message, at: Date.now() };
    return { ...state, activity: [event, ...state.activity].slice(0, 40) };
  }
  function createChat() {
    const now = Date.now();
    const thread: Thread = { id: newId(), projectId: workspace.activeProjectId, title: "New conversation", messages: [], createdAt: now, updatedAt: now };
    setWorkspace(s => record({ ...s, threads: [thread, ...s.threads], activeThreadId: thread.id }, "Conversation created"));
    setDraft("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }
  function openChat(thread: Thread) {
    setWorkspace(s => ({ ...s, activeThreadId: thread.id, activeProjectId: thread.projectId }));
    setDraft("");
  }
  function selectProject(id: string | null) {
    setWorkspace(s => ({ ...s, activeProjectId: id, activeThreadId: null }));
    setDraft("");
  }
  async function addProject() {
    if (!isTauri()) {
      setNotice("Choosing folders requires the installed desktop app. This browser preview does not access your files.");
      return;
    }
    setAddingProject(true);
    try {
      const path = await open({ directory: true, multiple: false, title: "Choose a development project folder" });
      if (typeof path !== "string") return;
      if (!uniqueProject(workspace, path)) {
        const existing = workspace.projects.find(p => p.path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() === path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase());
        if (existing) selectProject(existing.id);
        setNotice("This project is already in your workspace.");
        return;
      }
      const project: Project = { id: newId(), name: projectLabel(path), path, addedAt: Date.now() };
      setWorkspace(s => record({ ...s, projects: [...s.projects, project], activeProjectId: project.id, activeThreadId: null }, `Added project ${project.name}`));
      setDetailTab("project"); setDetailsOpen(true);
    } catch (error) {
      setNotice(`Could not open the folder picker: ${error instanceof Error ? error.message : String(error)}`);
    } finally { setAddingProject(false); }
  }
  function deleteChat(thread: Thread) {
    if (!window.confirm(`Delete conversation “${thread.title}”? This cannot be undone.`)) return;
    setWorkspace(s => record({ ...s, threads: s.threads.filter(t => t.id !== thread.id), activeThreadId: s.activeThreadId === thread.id ? null : s.activeThreadId }, "Conversation deleted"));
  }
  function removeProject(project: Project) {
    if (!window.confirm(`Remove “${project.name}” from LocalForge? Its conversations will be removed here too. Project files on disk will not be touched.`)) return;
    setWorkspace(s => record({ ...s, projects: s.projects.filter(p => p.id !== project.id), threads: s.threads.filter(t => t.projectId !== project.id), activeProjectId: s.activeProjectId === project.id ? null : s.activeProjectId, activeThreadId: s.threads.some(t => t.id === s.activeThreadId && t.projectId === project.id) ? null : s.activeThreadId }, `Removed project ${project.name} from workspace`));
  }
  async function inspectCurrentProject() {
    if (!activeProject || inspectBusy) return;
    const projectId = activeProject.id;
    setInspectBusy(true);setViewedFile(null);
    try {
      const data = await inspectProject(activeProject.path);
      setInspected({projectId,data});setDetailTab("project");setDetailsOpen(true);
      setWorkspace(state => record(state, `Inspected ${data.files.length} local project files (read only)`));
    } catch(e) {setNotice(`Project inspection failed: ${String(e)}`);}
    finally {setInspectBusy(false);}
  }
  async function viewFile(path: string) {
    if (!activeProject) return;
    try {setViewedFile(await readProjectFile(activeProject.path,path));}
    catch(e){setNotice(`Cannot read that source file: ${String(e)}`);}
  }
  function proposeCode(code: string, language: string, before: string) {
    if (!activeProject) {setNotice("Select a project folder in the sidebar before proposing a file change.");return;}
    setProposal({projectId:activeProject.id,root:activeProject.path,content:code,
      path:suggestFilename(language,before),original:null});
  }
  async function previewProposal() {
    if (!proposal || proposalBusy) return;
    setProposalBusy(true);
    try {const original=await readProjectFile(proposal.root,proposal.path);
      setProposal(current=>current ? {...current,original}:null);
    }catch(e){setNotice(`Could not preview the proposed change: ${String(e)}`);}
    finally {setProposalBusy(false);}
  }
  async function approveProposal() {
    if (!proposal || !proposal.original || proposalBusy) return;
    if (!window.confirm(`Apply the reviewed change to ${proposal.path}? LocalForge will save an undo snapshot. This writes a real file on disk.`))return;
    setProposalBusy(true);
    try {
      const result=await applyProjectChange(proposal.root,proposal.path,proposal.original.sha256,proposal.content);
      const entry={root:proposal.root,token:result.token,path:result.path};
      setLastEdit(entry);localStorage.setItem("localforge.last-edit.v1",JSON.stringify(entry));
      setWorkspace(state=>record(state,`Approved file change: ${result.path}`));
      setInspected(null);setViewedFile(null);setProposal(null);
      setNotice(`Updated ${result.path}. The Undo last change button can restore it.`);
    }catch(e){setNotice(`Change not applied: ${String(e)}`);}
    finally{setProposalBusy(false);}
  }
  async function undoLast() {
    if(!lastEdit || !activeProject || lastEdit.root !== activeProject.path)return;
    if(!window.confirm(`Undo LocalForge's last change to ${lastEdit.path}? Undo will refuse if that file has changed since.`))return;
    try{const path=await undoProjectChange(lastEdit.root,lastEdit.token);
      localStorage.removeItem("localforge.last-edit.v1");setLastEdit(null);setInspected(null);setViewedFile(null);
      setWorkspace(state=>record(state,`Restored ${path} from undo snapshot`));setNotice(`Restored ${path}.`);
    }catch(e){setNotice(`Undo refused: ${String(e)}`);}
  }

  function submitPrompt(text: string) {
    const content = text.trim();
    if (!content || generating) return;
    const now = Date.now();
    const message: ChatMessage = { id: newId(), role: "user", content, createdAt: now };
    const current = workspace.threads.find(t => t.id === workspace.activeThreadId);
    const threadId = current?.id || newId();
    const context = (current?.messages ?? []).slice(activeProject && inspected?.projectId === activeProject.id ? -4 : -10).map(m => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
    setWorkspace(s => {
      const exists = s.threads.some(t => t.id === threadId);
      const threads = exists ? s.threads.map(t => t.id === threadId
        ? { ...t, title: t.messages.length === 0 ? shortTitle(content) : t.title, updatedAt: now, messages: [...t.messages, message] }
        : t)
        : [{ id: threadId, projectId: s.activeProjectId, title: shortTitle(content), messages: [message], createdAt: now, updatedAt: now }, ...s.threads];
      return record({ ...s, threads, activeThreadId: threadId }, engine.running ? "Prompt sent to local model" : "Prompt saved locally (model offline)");
    });
    setDraft("");
    if (!engine.running) return;
    const requestId = newId();
    pendingRef.current = { requestId, threadId };
    setLiveText("");
    setGenerating(true);
    const projectContext = activeProject && inspected?.projectId === activeProject.id ? inspected.data.context : null;
    void generate(requestId, [...context, { role: "user", content }], projectContext).then(reply => {
      if (reply.trim()) {
        const answer: ChatMessage = { id: newId(), role: "assistant", content: reply, createdAt: Date.now() };
        setWorkspace(s => record({ ...s, threads: s.threads.map(t => t.id === threadId
          ? { ...t, messages: [...t.messages, answer], updatedAt: Date.now() } : t) }, "Local model response received"));
      } else setNotice("The local model returned no text. Try again or unload and reload it.");
    }).catch(error => { setNotice(`Generation failed: ${String(error)}`); })
      .finally(() => { pendingRef.current = null; setLiveText(""); setGenerating(false); });
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); submitPrompt(draft); }
  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitPrompt(draft); }
  }

  return <div className={`app-shell ${sidebarOpen ? "" : "sidebar-hidden"} ${detailsOpen ? "" : "details-hidden"}`}>
    <aside className="sidebar" aria-label="Projects and conversations">
      <div className="brand"><div className="brand-mark"><Code2 size={20}/></div><div className="brand-name">Local<span>Forge</span></div>
        <button className="icon-button brand-toggle" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => setSidebarOpen(false)}><LayoutPanelLeft size={19}/></button>
      </div>
      <button className="new-chat-button" onClick={createChat}><Plus size={18}/> New conversation <span className="shortcut">Ctrl N</span></button>
      <div className="sidebar-scroll">
        <div className="section-heading"><span>WORKSPACES</span><button title="Add local project" aria-label="Add local project" onClick={addProject} disabled={addingProject}><FolderPlus size={17}/></button></div>
        <button className={`sidebar-row ${workspace.activeProjectId === null ? "active" : ""}`} onClick={() => selectProject(null)}><div className="sidebar-row-main"><HardDrive size={17}/><span>Scratchpad</span></div></button>
        {workspace.projects.map(p => <button key={p.id} className={`sidebar-row ${workspace.activeProjectId === p.id ? "active" : ""}`} onClick={() => selectProject(p.id)} title={p.path}>
          <div className="sidebar-row-main"><Folder size={17}/><span>{p.name}</span></div>{workspace.activeProjectId === p.id && <ChevronRight size={15}/>}</button>)}
        <button className="add-project" onClick={addProject} disabled={addingProject}><Plus size={16}/>{addingProject ? "Opening picker…" : "Add a project"}</button>
        <div className="section-heading thread-heading"><span>CONVERSATIONS</span><span className="thread-count">{visibleThreads.length}</span></div>
        {visibleThreads.length === 0 && <p className="empty-sidebar">Your conversations will appear here.</p>}
        {visibleThreads.map(t => <div className={`conversation-row ${activeThread?.id === t.id ? "selected" : ""}`} key={t.id}>
          <button onClick={() => openChat(t)} title={t.title}><MessageSquare size={16}/><span>{t.title}</span></button>
          <button className="delete-thread" title={`Delete ${t.title}`} aria-label={`Delete ${t.title}`} onClick={() => deleteChat(t)}><Trash2 size={15}/></button>
        </div>)}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-status"><span className="status-indicator"/><div><strong>{engine.running ? "CPU model ready" : "Model not loaded"}</strong><span>Offline coding · v0.3.0</span></div></div>
        <button className="sidebar-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/> Settings <span>⌘,</span></button>
      </div>
    </aside>

    <main className="main-pane">
      <header className="topbar">
        <div className="top-left">
          {!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Show sidebar"><Menu size={20}/></button>}
          <span className="topbar-crumb">Workspace</span><ChevronRight size={16} className="muted-chevron"/>
          <strong className="topbar-title">{activeProject?.name || "Scratchpad"}</strong>
          <ChevronDown size={15} className="muted-chevron"/>
        </div>
        <div className="top-actions"><span className={`engine-pill ${engine.running ? "ready" : ""}`}><span/> {engine.running ? "CPU model ready" : "Engine offline"}</span>
          <button className={`icon-button ${detailsOpen ? "toggled" : ""}`} title={detailsOpen ? "Hide details" : "Show details"} aria-label={detailsOpen ? "Hide details" : "Show details"} onClick={() => setDetailsOpen(!detailsOpen)}><PanelRightClose size={19}/></button>
          <button className="icon-button" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button>
        </div>
      </header>
      <div className="model-banner" role="status"><Info size={16}/><span><strong>{engine.running ? "Offline coding chat active:" : "Set up local coding:"}</strong> {engine.running ? "Responses run on your CPU. Choose Inspect project to supply source context; file changes require approval." : "Open Settings to download, select and load a small CPU-only coding model. Prompts are saved even while offline."}</span><button aria-label="Open model settings" onClick={() => setSettingsOpen(true)}>{engine.running ? "Model" : "Set up"} <ArrowRight size={14}/></button></div>
      <div className="conversation-scroll" ref={scrollRef}>
        {activeThread && activeThread.messages.length > 0 ? <div className="conversation-body">
          <div className="conversation-intro"><div className="conversation-kicker"><MessageSquare size={15}/> CONVERSATION</div><h1>{activeThread.title}</h1><p>Started {dateLabel(activeThread.createdAt)} · Saved only on this device</p></div>
          {activeThread.messages.map(message => <article key={message.id} className={`chat-message ${message.role}`}>
            <div className="message-avatar">{message.role === "user" ? "Y" : <Code2 size={16}/>}</div>
            <div className="message-content"><div className="message-header"><strong>{message.role === "user" ? "You" : "LocalForge"}</strong><time>{timeLabel(message.createdAt)}</time></div><MessageBody content={message.content} isAssistant={message.role === "assistant"}
              onPropose={message.role === "assistant" ? proposeCode : undefined} /></div>
          </article>)}
          {generating && pendingRef.current?.threadId === activeThread.id && <article className="chat-message assistant" aria-live="polite"><div className="message-avatar"><Code2 size={16}/></div><div className="message-content"><div className="message-header"><strong>LocalForge · generating</strong></div><MessageBody content={liveText || "Thinking on your CPU…"} isAssistant /></div></article>}
          {!engine.running && activeThread.messages.at(-1)?.role === "user" && <div className="offline-response"><Info size={17}/><div><strong>Prompt saved. No response generated.</strong><p>Open Settings, download a GGUF model and load it to enable real offline chat.</p></div></div>}
        </div> : <EmptyChat project={activeProject} onPrompt={prompt => { setDraft(prompt); textareaRef.current?.focus(); }}/>}</div>
      <div className="composer-area"><form onSubmit={onSubmit} className="composer">
        <textarea ref={textareaRef} rows={2} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onComposerKeyDown} placeholder="Describe what you'd like to build…" aria-label="Message" />
        <div className="composer-bottom"><div className="composer-meta"><span><Code2 size={14}/> Coding workspace</span><span className="composer-separator">·</span><span>Project edits require approval</span></div>
          {generating ? <button type="button" className="send-button stop-button" onClick={() => void cancelGeneration()} title="Stop generation" aria-label="Stop generation"><StopCircle size={19}/></button> : <button type="submit" className="send-button" disabled={!draft.trim()} title={engine.running ? "Send prompt" : "Save prompt"} aria-label={engine.running ? "Send prompt" : "Save prompt"}><ArrowUp size={19}/></button>}
        </div>
      </form><div className="composer-caption">{engine.running ? "Enter to send · Shift+Enter for a new line · CPU only" : "Enter to save · Shift+Enter for a new line · Load a model in Settings"}</div></div>
    </main>

    {detailsOpen && <aside className="details-pane" aria-label="Workspace details">
      <div className="detail-header"><div className="detail-tabs"><button className={detailTab === "activity" ? "current" : ""} onClick={() => setDetailTab("activity")}>Activity</button><button className={detailTab === "project" ? "current" : ""} onClick={() => setDetailTab("project")}>Project</button></div><button className="icon-button" aria-label="Close details" onClick={() => setDetailsOpen(false)}><X size={18}/></button></div>
      <div className="detail-scroll">
        {detailTab === "activity" ? <>
          <div className="detail-section"><div className="detail-section-heading"><Activity size={17}/><h3>Session activity</h3></div><p className="detail-description">A transparent record of workspace actions. No simulated AI progress.</p></div>
          <div className="activity-list">{workspace.activity.length ? workspace.activity.map(e => <ActivityItem key={e.id} event={e}/>) : <div className="detail-empty"><History size={24}/><p>No activity yet</p><span>Actions you take will appear here.</span></div>}</div>
          <div className="detail-divider"/>
          <div className="detail-section"><div className="detail-section-heading"><Terminal size={17}/><h3>Build & tests</h3></div><div className="pending-card"><div className="pending-label">TEST RUNNER COMING LATER</div><p>You can inspect local source files and approve individual edits with undo. Build/test command execution is not enabled yet.</p></div></div>
        </> : <>
          <div className="detail-section"><div className="detail-section-heading"><FolderOpen size={18}/><h3>Project overview</h3></div>
            {activeProject ? <><div className="project-facts"><span>Name</span><strong>{activeProject.name}</strong><span>Path</span><code title={activeProject.path}>{activeProject.path}</code><span>Added</span><strong>{dateLabel(activeProject.addedAt)}</strong><span>Conversations</span><strong>{workspace.threads.filter(t => t.projectId === activeProject.id).length}</strong></div>
              <div className="project-privacy"><ShieldCheck size={16}/> Inspection is explicitly requested. Each code change shows its before/after preview and requires approval. No commands run automatically.</div>
              <button type="button" className="model-action primary project-inspect" disabled={inspectBusy} onClick={() => void inspectCurrentProject()}>
                <Eye size={15}/> {inspectBusy ? "Inspecting…" : "Inspect project (read-only)"}</button>
              {inspected?.projectId === activeProject.id && <div className="project-file-browser">
                <strong>{inspected.data.files.length} source files found {inspected.data.truncated ? "(list truncated)" : ""}</strong>
                <small>Source excerpts will be sent to the local model with your next prompt. Sensitive, generated and binary files are excluded.</small>
                {inspected.data.files.slice(0,75).map(file=><button key={file.path} type="button" title={file.path} onClick={()=>void viewFile(file.path)}><FileCode2 size={13}/>{file.path}</button>)}
                {viewedFile && <div className="project-file-preview"><strong>{viewedFile.path} · Read only</strong><pre>{viewedFile.content.slice(0,4500)}</pre></div>}
              </div>}
              {lastEdit && lastEdit.root === activeProject.path && <button type="button" className="model-action secondary project-inspect" onClick={()=>void undoLast()}><RotateCcw size={15}/>Undo last change: {lastEdit.path}</button>}
              <button className="remove-project" onClick={() => removeProject(activeProject)}><Trash2 size={15}/> Remove from workspace</button>
            </> : <div className="detail-empty"><Folder size={24}/><p>No project selected</p><span>Add a project folder to associate conversations with real work.</span><button onClick={addProject}>Choose folder <ArrowRight size={14}/></button></div>}</div>
        </>}
      </div>
      <div className="detail-footer"><div><span className="footer-small-dot"/> Local-first workspace</div><span>0.3.0</span></div>
    </aside>}
    {(notice || storageWarning) && <div className="toast" role="alert"><Info size={17}/><span>{storageWarning ? "Local storage is unavailable or full. Changes may not survive restarting the app." : notice}</span><button aria-label="Dismiss notification" onClick={() => { setNotice(""); setStorageWarning(false); }}><X size={16}/></button></div>}
    {proposal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setProposal(null);}}>
      <section className="settings-modal proposal-modal" role="dialog" aria-modal="true" aria-label="Review proposed project change">
        <div className="modal-heading"><div><span className="eyebrow">REVIEW BEFORE WRITING</span><h2>Propose file change</h2></div>
          <button type="button" className="icon-button" aria-label="Close proposal" onClick={()=>setProposal(null)}><X size={20}/></button></div>
        <div className="proposal-content">
          <label htmlFor="proposal-path">Project-relative destination</label>
          <input id="proposal-path" value={proposal.path} onChange={e=>setProposal({...proposal,path:e.target.value,original:null})}
            placeholder="src/main.py" spellCheck={false}/>
          <p>Changes are restricted to the selected project folder. Review the content and preview the actual existing file before approving.</p>
          <button type="button" className="model-action secondary" disabled={proposalBusy} onClick={()=>void previewProposal()}><Eye size={15}/>{proposalBusy?"Reading existing file…":"Preview existing file and proposed code"}</button>
          {proposal.original && <div className="proposal-preview">
            <div><strong>{proposal.original.exists?"CURRENT FILE":"NEW FILE"}</strong><pre>{proposal.original.exists?proposal.original.content:"(File does not exist)"}</pre></div>
            <div><strong>PROPOSED REPLACEMENT</strong><pre>{proposal.content}</pre></div>
          </div>}
          {!proposal.original && <div className="proposal-hint">No files have been changed. Preview the exact destination before applying.</div>}
          <div className="proposal-actions"><button type="button" className="model-action secondary" onClick={()=>setProposal(null)}>Cancel</button>
            <button type="button" className="model-action primary" disabled={!proposal.original || proposalBusy} onClick={()=>void approveProposal()}><ClipboardCheck size={15}/>Approve and write file</button></div>
        </div>
      </section></div>}
    {settingsOpen && <SettingsModal theme={workspace.theme} setTheme={theme => setWorkspace(s => ({ ...s, theme }))} onClose={() => setSettingsOpen(false)}
      engine={engine} model={model} progress={progress} downloading={downloading} modelBusy={modelBusy} modelPath={modelPath} threads={threads} setThreads={setThreads}
      download={() => void handleDownload()} load={() => void handleLoadModel()} unload={() => void handleUnloadModel()} choose={() => void handleChooseModel()}/>}
    <div className="mobile-block"><div className="welcome-mark"><Code2 size={30}/></div><h2>LocalForge</h2><p>This desktop workspace is designed for wider screens. Please resize your window.</p></div>
  </div>;
}
