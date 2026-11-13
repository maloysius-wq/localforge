import { Cpu, Download, FolderOpen, HardDrive, LoaderCircle, Play, Square } from "lucide-react";
import type { DownloadProgress, EngineStatus, ModelInfo } from "./inference";
import { CONTEXT_CHOICES } from "./contextConfig";

export function ModelManager({ engine, model, progress, downloading, busy, modelPath, threads, setThreads, contextTokens, setContextTokens, autoLoad, setAutoLoad, onDownload, onLoad, onUnload, onChoose }: {
  engine: EngineStatus;
  model: ModelInfo;
  progress: DownloadProgress | null;
  downloading: boolean;
  busy: boolean;
  modelPath: string | null;
  threads: number;
  setThreads: (threads: number) => void;
  contextTokens: number;
  setContextTokens: (n: number) => void;
  autoLoad: boolean;
  setAutoLoad: (value: boolean) => void;
  onDownload: () => void;
  onLoad: () => void;
  onUnload: () => void;
  onChoose: () => void;
}) {
  const selected = modelPath || (model.installed ? model.path : null);
  const pct = progress?.total ? Math.floor((progress.received / progress.total) * 100) : 0;
  const mb = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2) + " GB";
  return <div className="model-manager">
    <div className="model-setting-head"><Cpu size={18}/><div><strong>CPU-only coding model</strong><span>{engine.running ? "Ready for offline coding chat" : "No model loaded"}</span></div><span className={engine.running ? "pill live" : "pill neutral"}>{engine.running ? "Running" : "Stopped"}</span></div>
    <div className="model-option"><strong>Recommended: Qwen2.5-Coder 1.5B (Q4_K_M)</strong><p>About 1.1 GB from Hugging Face. Designed for small local coding tasks. One-time internet download; offline after setup.</p>
      {!model.installed && <button type="button" className="model-action" onClick={onDownload} disabled={downloading || busy}><Download size={15}/>{downloading ? "Downloading…" : "Download verified model"}</button>}
      {model.installed && <span className="model-available">✓ Downloaded model available ({mb(model.size)})</span>}
    </div>
    {downloading && <div className="download-meter" role="progressbar" aria-label="Model download" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="download-track"><span style={{ width: `${pct}%` }}/></div><span>{pct}% · {progress ? `${mb(progress.received)} / ${mb(progress.total)}` : "Connecting…"}</span>
    </div>}
    <div className="model-option"><strong>Or choose a local GGUF model</strong><p>Use a model you already have, without another download. Model files aren't copied or uploaded.</p>
      <button type="button" className="model-action secondary" onClick={onChoose} disabled={busy || downloading || engine.running}><FolderOpen size={15}/>Choose GGUF file</button>
      {selected && <small className="model-selected" title={selected}>{selected}</small>}
    </div>
    <div className="model-option"><label htmlFor="cpu-threads"><strong>CPU threads</strong></label><p>Lower values can keep older computers responsive. Start with 2 and adjust after testing.</p>
      <select id="cpu-threads" value={threads} onChange={e => setThreads(Number(e.target.value))} disabled={busy || engine.running}>{[1,2,3,4,6,8,12,16].map(n => <option key={n} value={n}>{n} {n===1?'thread':'threads'}</option>)}</select>
    </div>
    <div className="model-option">
      <label htmlFor="context-window"><strong>Context window</strong></label>
      <p>More context retains more code and history, but increases RAM use and CPU prefill time. Unload the model to change this setting.</p>
      <select id="context-window" value={contextTokens} disabled={busy || engine.running} onChange={e => setContextTokens(Number(e.target.value))}>
        {CONTEXT_CHOICES.map(n => <option key={n} value={n}>{n.toLocaleString()} tokens{n === 65536 ? " (64K experimental)" : n === 32768 ? " (Qwen native maximum)" : n === 6144 ? " (low-RAM default)" : ""}</option>)}
      </select>
      {contextTokens === 65536 && <p className="model-caution" role="note"><strong>Experimental 64K:</strong> Qwen2.5-Coder-1.5B is native to 32K; YaRN extension may reduce accuracy and consume substantially more RAM. Not recommended on 4 GB computers.</p>}
      {engine.running && <small className="model-selected">Unload the model before changing the context window.</small>}
    </div>
    <label className="model-autoload"><input type="checkbox" checked={autoLoad} onChange={e => setAutoLoad(e.target.checked)}/><span><strong>Load model when LocalForge opens</strong><small>Uses your CPU and RAM on startup. Turn this off on very low-memory computers.</small></span></label>
    <div className="model-action-row">
      {!engine.running ? <button type="button" className="model-action primary" onClick={onLoad} disabled={!selected || busy || downloading}>{busy ? <LoaderCircle size={15}/> : <Play size={15}/>} {busy ? "Loading model…" : "Load model"}</button>
        : <button type="button" className="model-action secondary" onClick={onUnload} disabled={busy || engine.generating}><Square size={15}/> Unload model</button>}
      <span className="engine-hint"><HardDrive size={14}/> {contextTokens.toLocaleString()}-token context · GPU layers: 0</span>
    </div>
    <p className="model-caution">The model runs locally on your CPU. LocalForge can inspect selected project files and write a proposed single-file change only after your approval. No build or test execution yet. Code-first mode can use longer responses, increasing RAM use and generation time on older computers.</p>
  </div>;
}
