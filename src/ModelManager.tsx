import { Cpu, Download, FolderOpen, HardDrive, LoaderCircle, Play, Square } from "lucide-react";
import type { DownloadProgress, EngineStatus, ModelInfo } from "./inference";
import { CONTEXT_CHOICES } from "./contextConfig";
import { MODEL_CATALOG, type CatalogModelId } from "./modelCatalog";

export function ModelManager({ engine, model, progress, downloading, busy, modelPath, modelId, setModelId,
  downloadDir, chooseDownloadDir, resetDownloadDir, threads, setThreads, contextTokens, setContextTokens,
  autoLoad, setAutoLoad, onDownload, onLoad, onUnload, onChoose }: {
  engine: EngineStatus;
  model: ModelInfo;
  progress: DownloadProgress | null;
  downloading: boolean;
  busy: boolean;
  modelPath: string | null;
  modelId: CatalogModelId;
  setModelId: (id: CatalogModelId) => void;
  downloadDir: string | null;
  chooseDownloadDir: () => void;
  resetDownloadDir: () => void;
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
  const selectedSpec = MODEL_CATALOG.find(choice => choice.id === modelId)!;
  const pct = progress?.total ? Math.floor((progress.received / progress.total) * 100) : 0;
  const gb = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2) + " GiB";
  return <div className="model-manager">
    <div className="model-setting-head"><Cpu size={18}/><div><strong>CPU-only local model</strong><span>{engine.running ? "Ready for offline coding chat" : "No model loaded"}</span></div>
      <span className={engine.running ? "pill live" : "pill neutral"}>{engine.running ? "Running" : "Stopped"}</span></div>
    <div className="model-option">
      <label htmlFor="catalog-model"><strong>Model to test</strong></label>
      <p>Compare models without replacing or deleting the ones you already downloaded. Only one model runs at a time.</p>
      <select id="catalog-model" value={modelId} disabled={busy || downloading || engine.running}
        onChange={e => setModelId(e.target.value as CatalogModelId)}>
        {MODEL_CATALOG.map(choice => <option key={choice.id} value={choice.id}>{choice.label} (Q4_K_M, {choice.size})</option>)}
      </select>
      <p>{selectedSpec.description} <strong>{selectedSpec.license}</strong> · {selectedSpec.source}.</p>
      {modelId === "qwen25-coder-3b" && <p className="model-caution" role="note">Research license: this candidate is for permitted noncommercial evaluation, not a default commercial distribution model.</p>}
    </div>
    <div className="model-option">
      <label><strong>Download folder</strong></label>
      <p>Choose another drive before downloading. Both the temporary file and finished GGUF stay in the selected folder.</p>
      <div className="model-download-location" title={downloadDir || "LocalForge application data / models"}>{downloadDir || "Default: LocalForge app-data/models (usually system drive)"}</div>
      <div className="model-action-row model-directory-actions">
        <button type="button" className="model-action secondary" onClick={chooseDownloadDir} disabled={busy || downloading}>
          <FolderOpen size={15}/> Choose download folder
        </button>
        {downloadDir && <button type="button" className="model-action secondary" onClick={resetDownloadDir} disabled={busy || downloading}>Use default folder</button>}
      </div>
      <p>Changing the folder does not move or delete old models. Use “Choose GGUF file” below to load one from an old location.</p>
    </div>
    <div className="model-option">
      <strong>Selected: {selectedSpec.label}</strong>
      <p>Download size {selectedSpec.size}. A download starts only when you press the button. Loading uses additional RAM.</p>
      {model.installed
        ? <span className="model-available">✓ GGUF found in this folder ({gb(model.size)})</span>
        : <button type="button" className="model-action" onClick={onDownload} disabled={downloading || busy || engine.running}>
          <Download size={15}/>{downloading ? "Downloading…" : "Download and verify model"}</button>}
      {model.installed && <small className="model-selected" title={model.path}>{model.path}</small>}
    </div>
    {downloading && <div className="download-meter" role="progressbar" aria-label="Model download" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="download-track"><span style={{ width: pct + "%" }}/></div>
      <span>{pct}% · {progress ? gb(progress.received) + " / " + gb(progress.total) : "Connecting…"}</span>
    </div>}
    <div className="model-option"><strong>Or choose a GGUF model already on disk</strong>
      <p>Load an existing GGUF without downloading or moving it. Choosing a file overrides the catalog selection for loading only.</p>
      <button type="button" className="model-action secondary" onClick={onChoose} disabled={busy || downloading || engine.running}>
        <FolderOpen size={15}/>Choose GGUF file
      </button>
      {modelPath && <small className="model-selected" title={modelPath}>Selected file: {modelPath}</small>}
      {modelPath && <p><strong>Custom file selected.</strong> Choose another catalog model above to return to catalog models.</p>}
    </div>
    <div className="model-option"><label htmlFor="cpu-threads"><strong>CPU threads</strong></label>
      <p>Start with 2 on an older computer. Larger models use more CPU and RAM.</p>
      <select id="cpu-threads" value={threads} onChange={e => setThreads(Number(e.target.value))} disabled={busy || engine.running}>{[1,2,3,4,6,8,12,16].map(n => <option key={n} value={n}>{n} {n===1?"thread":"threads"}</option>)}</select>
    </div>
    <div className="model-option">
      <label htmlFor="context-window"><strong>Context window</strong></label>
      <p>More context retains more code and history, but increases RAM use and CPU prefill time. Unload the model to change it.</p>
      <select id="context-window" value={contextTokens} disabled={busy || engine.running} onChange={e => setContextTokens(Number(e.target.value))}>
        {CONTEXT_CHOICES.map(n => <option key={n} value={n}>{n.toLocaleString()} tokens{n === 65536 ? " (64K experimental on Qwen2.5)" : n === 6144 ? " (low-RAM default)" : ""}</option>)}
      </select>
      {contextTokens === 65536 && <p className="model-caution" role="note"><strong>64K caution:</strong> Qwen2.5-Coder requires experimental YaRN scaling above 32K. Large contexts can exhaust RAM. The 4B candidate has not been validated at this context.</p>}
      {engine.running && <small className="model-selected">Unload the model before changing the context window.</small>}
    </div>
    <label className="model-autoload"><input type="checkbox" checked={autoLoad} onChange={e => setAutoLoad(e.target.checked)}/>
      <span><strong>Load selected model when LocalForge opens</strong><small>Uses CPU and RAM on startup. Never automatically downloads missing models.</small></span></label>
    <div className="model-action-row">
      {!engine.running
        ? <button type="button" className="model-action primary" onClick={onLoad} disabled={!selected || busy || downloading}>
          {busy ? <LoaderCircle size={15}/> : <Play size={15}/>} {busy ? "Loading model…" : "Load model"}</button>
        : <button type="button" className="model-action secondary" onClick={onUnload} disabled={busy || engine.generating}><Square size={15}/> Unload model</button>}
      <span className="engine-hint"><HardDrive size={14}/> {contextTokens.toLocaleString()}-token context · GPU layers: 0</span>
    </div>
    <p className="model-caution">Candidates run locally with the bundled CPU-only runtime. These are experimental quality comparisons, not verified app builders. Project file writes require approval; shell and app execution remain disabled.</p>
  </div>;
}
