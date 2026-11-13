import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Activity, ArrowRight, ArrowUp, BookOpen, CheckCircle2, ChevronDown,
  ChevronRight, Code2, Cpu, FileCode2, Folder, FolderOpen,
  FolderPlus, HardDrive, History, Info, LayoutPanelLeft, Menu, MessageSquare,
  Moon, PanelRightClose, Plus, Settings2, ShieldCheck, Sparkles,
  Sun, Terminal, Trash2, X,
} from "lucide-react";
import {
  loadWorkspace, newId, projectLabel, saveWorkspace, uniqueProject,
  type ChatMessage, type EventLog, type Project, type Thread, type WorkspaceState,
} from "./storage";

type Tab = "activity" | "project";
const SUGGESTIONS = [
  { icon: FileCode2, title: "Debug an issue", prompt: "Inspect my project and help me debug a specific issue." },
  { icon: Sparkles, title: "Build a feature", prompt: "Help me plan and implement a new feature in this project." },
  { icon: BookOpen, title: "Understand code", prompt: "Explain the architecture of this project and its main components." },
  { icon: Code2, title: "Improve quality", prompt: "Review this project for bugs, code quality, and maintainability improvements." },
];
const timeLabel = (timestamp: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
const dateLabel = (timestamp: number) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
const shortTitle = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 52) || "New conversation";

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

function SettingsModal({ theme, setTheme, onClose }: {
  theme: WorkspaceState["theme"];
  setTheme: (theme: WorkspaceState["theme"]) => void;
  onClose: () => void;
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
      <div className="settings-section"><h3>Local inference</h3><p>The coding model is not bundled in v0.1. Model downloading, CPU-only inference and live chat streaming are planned for v0.2.</p>
        <div className="setting-summary"><Cpu size={18}/><div><strong>CPU-only by design</strong><span>No GPU or cloud account required in the planned engine.</span></div><span className="pill neutral">Planned</span></div>
        <div className="setting-summary"><HardDrive size={18}/><div><strong>Local model management</strong><span>Download, load and switch quantized models from the UI.</span></div><span className="pill neutral">Planned</span></div>
      </div>
      <div className="settings-section"><h3>Privacy and safety</h3>
        <div className="setting-summary"><ShieldCheck size={18}/><div><strong>Your data stays on this computer</strong><span>Conversations and project references are saved locally. No telemetry, cloud sync, code execution or project file access.</span></div></div>
      </div>
      <div className="settings-footer">LocalForge 0.1.0 · Desktop shell preview</div>
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
  }, [activeThread?.messages.length, activeThread?.id]);
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
  function submitPrompt(text: string) {
    const content = text.trim();
    if (!content) return;
    const now = Date.now();
    const message: ChatMessage = { id: newId(), role: "user", content, createdAt: now };
    setWorkspace(s => {
      const id = s.activeThreadId && s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : newId();
      const exists = s.threads.some(t => t.id === id);
      const threads = exists ? s.threads.map(t => t.id === id
        ? { ...t, title: t.messages.length === 0 ? shortTitle(content) : t.title, updatedAt: now, messages: [...t.messages, message] }
        : t)
        : [{ id, projectId: s.activeProjectId, title: shortTitle(content), messages: [message], createdAt: now, updatedAt: now }, ...s.threads];
      return record({ ...s, threads, activeThreadId: id }, "Prompt saved locally (model not connected)");
    });
    setDraft("");
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
        <div className="sidebar-status"><span className="status-indicator"/><div><strong>Model not connected</strong><span>Workspace shell · v0.1</span></div></div>
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
        <div className="top-actions"><span className="engine-pill"><span/> Engine offline</span>
          <button className={`icon-button ${detailsOpen ? "toggled" : ""}`} title={detailsOpen ? "Hide details" : "Show details"} aria-label={detailsOpen ? "Hide details" : "Show details"} onClick={() => setDetailsOpen(!detailsOpen)}><PanelRightClose size={19}/></button>
          <button className="icon-button" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button>
        </div>
      </header>
      <div className="model-banner" role="status"><Info size={16}/><span><strong>Foundation build:</strong> Conversations are saved locally. AI responses and code tools will arrive with the inference integration.</span><button aria-label="Open model settings" onClick={() => setSettingsOpen(true)}>Details <ArrowRight size={14}/></button></div>
      <div className="conversation-scroll" ref={scrollRef}>
        {activeThread && activeThread.messages.length > 0 ? <div className="conversation-body">
          <div className="conversation-intro"><div className="conversation-kicker"><MessageSquare size={15}/> CONVERSATION</div><h1>{activeThread.title}</h1><p>Started {dateLabel(activeThread.createdAt)} · Saved only on this device</p></div>
          {activeThread.messages.map(message => <article key={message.id} className={`chat-message ${message.role}`}>
            <div className="message-avatar">{message.role === "user" ? "Y" : <Code2 size={16}/>}</div>
            <div className="message-content"><div className="message-header"><strong>{message.role === "user" ? "You" : "LocalForge"}</strong><time>{timeLabel(message.createdAt)}</time></div><div className="message-text">{message.content}</div></div>
          </article>)}
          <div className="offline-response"><Info size={17}/><div><strong>Prompt saved. No response generated.</strong><p>LocalForge does not have an inference engine yet. This first build saves your notes and conversations without pretending to run a model.</p></div></div>
        </div> : <EmptyChat project={activeProject} onPrompt={prompt => { setDraft(prompt); textareaRef.current?.focus(); }}/>}</div>
      <div className="composer-area"><form onSubmit={onSubmit} className="composer">
        <textarea ref={textareaRef} rows={2} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onComposerKeyDown} placeholder="Describe what you'd like to build…" aria-label="Message" />
        <div className="composer-bottom"><div className="composer-meta"><span><Code2 size={14}/> Coding workspace</span><span className="composer-separator">·</span><span>Local only</span></div>
          <button type="submit" className="send-button" disabled={!draft.trim()} title="Save prompt" aria-label="Save prompt"><ArrowUp size={19}/></button>
        </div>
      </form><div className="composer-caption">Enter to save · Shift+Enter for a new line · No model connected yet</div></div>
    </main>

    {detailsOpen && <aside className="details-pane" aria-label="Workspace details">
      <div className="detail-header"><div className="detail-tabs"><button className={detailTab === "activity" ? "current" : ""} onClick={() => setDetailTab("activity")}>Activity</button><button className={detailTab === "project" ? "current" : ""} onClick={() => setDetailTab("project")}>Project</button></div><button className="icon-button" aria-label="Close details" onClick={() => setDetailsOpen(false)}><X size={18}/></button></div>
      <div className="detail-scroll">
        {detailTab === "activity" ? <>
          <div className="detail-section"><div className="detail-section-heading"><Activity size={17}/><h3>Session activity</h3></div><p className="detail-description">A transparent record of workspace actions. No simulated AI progress.</p></div>
          <div className="activity-list">{workspace.activity.length ? workspace.activity.map(e => <ActivityItem key={e.id} event={e}/>) : <div className="detail-empty"><History size={24}/><p>No activity yet</p><span>Actions you take will appear here.</span></div>}</div>
          <div className="detail-divider"/>
          <div className="detail-section"><div className="detail-section-heading"><Terminal size={17}/><h3>Build & tests</h3></div><div className="pending-card"><div className="pending-label">NOT AVAILABLE IN V0.1</div><p>When code tools arrive, command output, test results and changed files will appear here.</p></div></div>
        </> : <>
          <div className="detail-section"><div className="detail-section-heading"><FolderOpen size={18}/><h3>Project overview</h3></div>
            {activeProject ? <><div className="project-facts"><span>Name</span><strong>{activeProject.name}</strong><span>Path</span><code title={activeProject.path}>{activeProject.path}</code><span>Added</span><strong>{dateLabel(activeProject.addedAt)}</strong><span>Conversations</span><strong>{workspace.threads.filter(t => t.projectId === activeProject.id).length}</strong></div>
              <div className="project-privacy"><ShieldCheck size={16}/> The project is linked by path. LocalForge does not read or change files in v0.1.</div>
              <button className="remove-project" onClick={() => removeProject(activeProject)}><Trash2 size={15}/> Remove from workspace</button>
            </> : <div className="detail-empty"><Folder size={24}/><p>No project selected</p><span>Add a project folder to associate conversations with real work.</span><button onClick={addProject}>Choose folder <ArrowRight size={14}/></button></div>}</div>
        </>}
      </div>
      <div className="detail-footer"><div><span className="footer-small-dot"/> Local-first workspace</div><span>0.1.0</span></div>
    </aside>}
    {(notice || storageWarning) && <div className="toast" role="alert"><Info size={17}/><span>{storageWarning ? "Local storage is unavailable or full. Changes may not survive restarting the app." : notice}</span><button aria-label="Dismiss notification" onClick={() => { setNotice(""); setStorageWarning(false); }}><X size={16}/></button></div>}
    {settingsOpen && <SettingsModal theme={workspace.theme} setTheme={theme => setWorkspace(s => ({ ...s, theme }))} onClose={() => setSettingsOpen(false)}/>}
    <div className="mobile-block"><div className="welcome-mark"><Code2 size={30}/></div><h2>LocalForge</h2><p>This desktop workspace is designed for wider screens. Please resize your window.</p></div>
  </div>;
}
