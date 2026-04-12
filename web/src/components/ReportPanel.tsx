import type { TransferReport } from "../types";

const BYTES_PER_MB = 1024 * 1024;

function formatMbps(value: number) {
  return `${value.toFixed(3)} Mb/s`;
}

function formatSeconds(value: number) {
  return `${value.toFixed(3)} s`;
}

function formatWhen(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}

function formatSizeMb(bytes: number) {
  return `${(bytes / BYTES_PER_MB).toFixed(3)} MB`;
}

export default function ReportPanel({
  reports,
  selectedReportId,
  onSelectReport
}: {
  reports: TransferReport[];
  selectedReportId: string | null;
  onSelectReport: (reportId: string) => void;
}) {
  const report =
    reports.find((r) => r.reportId === selectedReportId) ?? (reports.length ? reports[0] : null);

  if (!reports.length || !report) {
    return (
      <section className="card">
        <h2>Transfer Reports</h2>
        <p>No transfer reports yet.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="row-space">
        <h2>Transfer Reports</h2>
        <a className="button" href={`/api/client/reports/${encodeURIComponent(report.reportId)}/csv`}>
          Export CSV
        </a>
      </div>
      <label className="stack">
        <span className="tiny">Select report</span>
        <select
          value={report.reportId}
          onChange={(e) => onSelectReport(e.target.value)}
          aria-label="Select transfer report"
        >
          {reports.map((r) => (
            <option key={r.reportId} value={r.reportId}>
              {r.operation} — {r.fileName} ({formatWhen(r.startedAt)})
            </option>
          ))}
        </select>
      </label>
      <p>
        <strong>{report.fileName}</strong> ({report.operation})
      </p>
      <p className="tiny">
        Started {formatWhen(report.startedAt)} · Finished {formatWhen(report.finishedAt)}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Size</th>
            <th>Elapsed</th>
            <th>Throughput</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Entire file</td>
            <td>{formatSizeMb(report.sizeBytes)}</td>
            <td>{formatSeconds(report.elapsedSeconds)}</td>
            <td>{formatMbps(report.throughputMbps)}</td>
          </tr>
          {report.blocks.map((block) => (
            <tr key={block.blockId}>
              <td>
                Block #{block.index} @ {block.nodeHost}:{block.nodePort}
              </td>
              <td>{formatSizeMb(block.sizeBytes)}</td>
              <td>{formatSeconds(block.elapsedSeconds)}</td>
              <td>{formatMbps(block.throughputMbps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
