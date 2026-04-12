import type { ClientConfig, FileRecord, NodeRole, TransferReport } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function getRole() {
  return request<{ role: NodeRole }>("/api/bootstrap");
}

export async function setRole(role: Exclude<NodeRole, "unselected">) {
  return request<{ role: NodeRole }>("/api/bootstrap/role", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role })
  });
}

export async function getClientConfig() {
  return request<ClientConfig>("/api/client/config");
}

export async function saveClientConfig(config: ClientConfig) {
  return request<ClientConfig>("/api/client/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config)
  });
}

export async function listFiles() {
  return request<FileRecord[]>("/api/client/files");
}

export async function uploadFiles(files: File[]) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const response = await fetch("/api/client/upload", { method: "POST", body: form });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || "Upload failed");
  }
  return (await response.json()) as { results: Array<{ fileId: string; report: TransferReport }> };
}

export async function deleteFiles(fileIds: string[]) {
  return request<{ deletedFileIds: string[] }>("/api/client/files/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileIds })
  });
}

export async function getReport(reportId: string) {
  return request<TransferReport>(`/api/client/reports/${encodeURIComponent(reportId)}`);
}

export async function getDataStatus() {
  return request<{
    publicIp: string;
    port: number;
    storageUsedBytes: number;
    maxUploadMbps: number;
    maxDownloadMbps: number;
  }>("/api/data/status");
}

export async function saveDataLimits(maxUploadMbps: number, maxDownloadMbps: number) {
  return request<{ maxUploadMbps: number; maxDownloadMbps: number }>("/api/data/config/rate-limits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ maxUploadMbps, maxDownloadMbps })
  });
}
