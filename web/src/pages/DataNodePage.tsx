import { FormEvent, useEffect, useState } from "react";
import { getDataStatus, saveDataLimits } from "../api";

const BYTES_PER_MB = 1024 * 1024;

interface DataStatus {
  publicIp: string;
  port: number;
  storageUsedBytes: number;
  maxUploadMbps: number;
  maxDownloadMbps: number;
}

function formatMb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(3)} MB`;
}

export default function DataNodePage() {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [maxUpload, setMaxUpload] = useState("200");
  const [maxDownload, setMaxDownload] = useState("200");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const next = await getDataStatus();
    setStatus(next);
    setMaxUpload(String(next.maxUploadMbps));
    setMaxDownload(String(next.maxDownloadMbps));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load data node status"));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const up = Number(maxUpload);
    const down = Number(maxDownload);
    if (!Number.isFinite(up) || !Number.isFinite(down) || up <= 0 || down <= 0 || up > 1000 || down > 1000) {
      setError("Both limits must be in range (0, 1000].");
      return;
    }
    try {
      await saveDataLimits(up, down);
      setMessage("Rate limits updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save limits");
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Data Node</h1>
        {status && (
          <>
            <p>
              Public endpoint: <strong>{status.publicIp}</strong>:<strong>{status.port}</strong>
            </p>
            <p>Storage used: {formatMb(status.storageUsedBytes)}</p>
          </>
        )}
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Maximum upload speed (Mb/s)
            <input type="number" min={1} max={1000} value={maxUpload} onChange={(e) => setMaxUpload(e.target.value)} />
          </label>
          <label>
            Maximum download speed (Mb/s)
            <input
              type="number"
              min={1}
              max={1000}
              value={maxDownload}
              onChange={(e) => setMaxDownload(e.target.value)}
            />
          </label>
          <button className="button" type="submit">
            Save Limits
          </button>
        </form>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
