import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReportPanel from "../components/ReportPanel";
import {
  deleteFiles,
  downloadFileWithProgress,
  getClientConfig,
  getReport,
  listFiles,
  saveClientConfig,
  uploadFiles
} from "../api";
import type { ClientConfig, FileRecord, TransferReport } from "../types";

const BYTES_PER_MB = 1024 * 1024;
const CLIENT_HASH_PREFIX = "#/client/";

type ClientView = "configuration" | "transfers" | "reports";

function blockSizeBytesToMb(bytes: number): number {
  return bytes / BYTES_PER_MB;
}

function mbToBlockSizeBytes(mb: number): number {
  const n = Number(mb);
  if (!Number.isFinite(n) || n <= 0) {
    return BYTES_PER_MB;
  }
  return Math.max(1024, Math.round(n * BYTES_PER_MB));
}

const DEFAULT_CONFIG: ClientConfig = {
  blockSizeBytes: BYTES_PER_MB,
  maxConcurrentTasks: 4,
  dataNodes: []
};

function mergeReports(prev: TransferReport[], incoming: TransferReport[]): TransferReport[] {
  const seen = new Set(incoming.map((r) => r.reportId));
  return [...incoming, ...prev.filter((r) => !seen.has(r.reportId))];
}

function parseViewFromHash(hash: string): ClientView {
  const value = hash.startsWith(CLIENT_HASH_PREFIX) ? hash.slice(CLIENT_HASH_PREFIX.length) : "";
  if (value === "transfers" || value === "reports") {
    return value;
  }
  return "configuration";
}

function asMb(value: number): string {
  return `${(value / BYTES_PER_MB).toFixed(3)} MB`;
}

export default function ClientPage() {
  const [config, setConfig] = useState<ClientConfig>(DEFAULT_CONFIG);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [reports, setReports] = useState<TransferReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [view, setView] = useState<ClientView>(() => parseViewFromHash(window.location.hash));
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshAll() {
    const [cfg, rows] = await Promise.all([getClientConfig(), listFiles()]);
    setConfig(cfg);
    setFiles(rows);
  }

  useEffect(() => {
    refreshAll().catch((err) => setError(err instanceof Error ? err.message : "Failed to load client data"));
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setView(parseViewFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash.startsWith(CLIENT_HASH_PREFIX)) {
      window.location.hash = `${CLIENT_HASH_PREFIX}configuration`;
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectedFiles = useMemo(() => files.filter((f) => selectedIds.includes(f.fileId)), [files, selectedIds]);

  function navigate(nextView: ClientView) {
    window.location.hash = `${CLIENT_HASH_PREFIX}${nextView}`;
  }

  function toggleSelection(fileId: string) {
    setSelectedIds((prev) => (prev.includes(fileId) ? prev.filter((it) => it !== fileId) : [...prev, fileId]));
  }

  function addNode() {
    setConfig((prev) => ({
      ...prev,
      dataNodes: [...prev.dataNodes, { id: crypto.randomUUID(), host: "127.0.0.1", port: 3000, enabled: true }]
    }));
  }

  function updateNode(index: number, key: "host" | "port" | "enabled", value: string | number | boolean) {
    setConfig((prev) => ({
      ...prev,
      dataNodes: prev.dataNodes.map((node, i) => (i === index ? { ...node, [key]: value } : node))
    }));
  }

  function removeNode(index: number) {
    setConfig((prev) => ({
      ...prev,
      dataNodes: prev.dataNodes.filter((_node, i) => i !== index)
    }));
  }

  async function onSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const saved = await saveClientConfig(config);
      setConfig(saved);
      setMessage("Configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    }
  }

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadQueue.length) {
      setError("Select at least one file first.");
      return;
    }
    setBusy(true);
    setIsUploading(true);
    setMessage("");
    setError("");
    try {
      const response = await uploadFiles(uploadQueue);
      const incoming = response.results.map((r) => r.report);
      setReports((prev) => mergeReports(prev, incoming));
      setSelectedReportId(incoming[0]?.reportId ?? null);
      setMessage(`Uploaded ${response.results.length} file(s).`);
      setUploadQueue([]);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setBusy(false);
    }
  }

  async function onDeleteSelected() {
    if (!selectedIds.length) {
      setError("Select files to delete.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await deleteFiles(selectedIds);
      setSelectedIds([]);
      setMessage(`Deleted ${result.deletedFileIds.length} file(s).`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadSelected() {
    if (!selectedFiles.length) {
      setError("Select files to download.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const incoming: TransferReport[] = [];
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const { blob, reportId } = await downloadFileWithProgress(file.fileId);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        if (reportId) {
          incoming.push(await getReport(reportId));
        }
      }
      if (incoming.length) {
        setReports((prev) => mergeReports(prev, incoming));
        setSelectedReportId(incoming[0]?.reportId ?? null);
      }
      setMessage(`Downloaded ${selectedFiles.length} file(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Client Node - NanoDFS</h1>
        <div className="button-row">
          <button className={`button ${view === "configuration" ? "" : "secondary"}`} onClick={() => navigate("configuration")}>
            Configuration
          </button>
          <button className={`button ${view === "transfers" ? "" : "secondary"}`} onClick={() => navigate("transfers")}>
            Transfers
          </button>
          <button className={`button ${view === "reports" ? "" : "secondary"}`} onClick={() => navigate("reports")}>
            Reports
          </button>
        </div>
      </section>

      {view === "configuration" && (
        <section className="card">
          <form className="stack" onSubmit={onSaveConfig}>
            <h2>Configuration</h2>
            <label>
              Block size (MB)
              <input
                type="number"
                min={1024 / BYTES_PER_MB}
                step="any"
                value={Number(blockSizeBytesToMb(config.blockSizeBytes).toFixed(6))}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    blockSizeBytes: mbToBlockSizeBytes(Number(e.target.value))
                  }))
                }
              />
            </label>
            <label>
              Max concurrent tasks
              <input
                type="number"
                min={1}
                max={64}
                value={config.maxConcurrentTasks}
                onChange={(e) => setConfig((prev) => ({ ...prev, maxConcurrentTasks: Number(e.target.value) }))}
              />
            </label>
            <div className="row-space">
              <h3>Data nodes (IP + port)</h3>
              <button className="button secondary" type="button" onClick={addNode}>
                Add node
              </button>
            </div>
            <div className="stack">
              {config.dataNodes.map((node, index) => (
                <div className="node-row" key={node.id}>
                  <input value={node.host} onChange={(e) => updateNode(index, "host", e.target.value)} />
                  <input
                    type="number"
                    value={node.port}
                    onChange={(e) => updateNode(index, "port", Number(e.target.value))}
                  />
                  <label className="tiny">
                    <input
                      type="checkbox"
                      checked={node.enabled}
                      onChange={(e) => updateNode(index, "enabled", e.target.checked)}
                    />
                    enabled
                  </label>
                  <button className="button danger" type="button" onClick={() => removeNode(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button className="button" type="submit">
              Save Configuration
            </button>
          </form>
        </section>
      )}

      {view === "transfers" && (
        <>
          <section className="card">
            <h2>Upload</h2>
            <form className="stack" onSubmit={onUpload}>
              <input
                ref={uploadInputRef}
                multiple
                type="file"
                onChange={(e) => setUploadQueue(Array.from(e.target.files ?? []))}
              />
              <button className="button" disabled={busy} type="submit">
                Upload selected files
              </button>
            </form>
            {isUploading && <p className="tiny">Uploading ...</p>}
          </section>

          <section className="card">
            <div className="row-space">
              <h2>File Manager</h2>
              <div className="button-row">
                <button className="button secondary" disabled={busy} onClick={onDownloadSelected}>
                  Download selected
                </button>
                <button className="button danger" disabled={busy} onClick={onDeleteSelected}>
                  Delete selected
                </button>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.fileId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(file.fileId)}
                        onChange={() => toggleSelection(file.fileId)}
                      />
                    </td>
                    <td>{file.name}</td>
                    <td>{asMb(file.sizeBytes)}</td>
                    <td>{new Date(file.uploadedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {!files.length && (
                  <tr>
                    <td colSpan={4}>No files uploaded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {view === "reports" && (
        <ReportPanel
          reports={reports}
          selectedReportId={selectedReportId}
          onSelectReport={setSelectedReportId}
        />
      )}
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
