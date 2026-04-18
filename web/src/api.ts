import type { ClientConfig, FileRecord, NodeRole, TransferReport } from "./types";

export interface TransferProgress {
  loaded: number;
  total: number | null;
}
export type UploadPhase = "client" | "data";
export type DownloadPhase = "data" | "client";

const UPLOAD_TIMEOUT_MS = 300_000;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
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
  return uploadFilesWithProgress(files);
}

export async function uploadFilesWithProgress(
  files: File[],
  onProgress?: (progress: TransferProgress) => void,
  onPhase?: (phase: UploadPhase) => void
) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }

  const responseText = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/client/upload");
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    let inDataPhase = false;
    const emitPhase = (phase: UploadPhase) => {
      if (phase === "data") {
        inDataPhase = true;
      }
      onPhase?.(phase);
    };

    xhr.upload.onprogress = (event) => {
      const uploadComplete = event.lengthComputable && event.total > 0 && event.loaded >= event.total;
      emitPhase(inDataPhase || uploadComplete ? "data" : "client");
      if (onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : null
        });
      }
    };
    xhr.upload.onloadstart = () => {
      emitPhase("client");
    };
    xhr.upload.onload = () => {
      emitPhase("data");
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
        return;
      }
      let error = "Upload failed";
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string };
        error = parsed.error || error;
      } catch {
      }
      reject(new Error(error));
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(form);
  });

  return JSON.parse(responseText) as { results: Array<{ fileId: string; report: TransferReport }> };
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

export async function downloadFileWithProgress(
  fileId: string,
  onProgress?: (progress: TransferProgress) => void,
  onPhase?: (phase: DownloadPhase) => void
) {
  onPhase?.("data");
  const response = await fetch(`/api/client/files/${encodeURIComponent(fileId)}/download`, {
    cache: "no-store"
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Download failed" }));
    throw new Error(error.error || "Download failed");
  }

  const reportId = response.headers.get("X-Report-Id");
  const contentLengthHeader = response.headers.get("Content-Length");
  const parsedLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const total = Number.isFinite(parsedLength) && parsedLength > 0 ? parsedLength : null;
  const body = response.body;

  if (!body) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: blob.size || total });
    onPhase?.("client");
    return { blob, reportId };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      const chunkCopy = Uint8Array.from(value);
      chunks.push(chunkCopy);
      loaded += chunkCopy.length;
      onPhase?.("data");
      onProgress?.({ loaded, total });
    }
  }

  const blob = new Blob(chunks as unknown as BlobPart[]);
  onProgress?.({ loaded, total: total ?? loaded });
  onPhase?.("client");
  return { blob, reportId };
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
