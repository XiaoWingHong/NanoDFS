import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateDataNodesInput } from "./validation.js";
import type {
  ClientConfig,
  FileRecord,
  NanoState,
  NodeRole,
  TransferReport
} from "../types.js";

function normalizeClientConfig(raw: unknown): ClientConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const blockSizeBytes = Number(o.blockSizeBytes);
  const blockSize =
    Number.isFinite(blockSizeBytes) && blockSizeBytes >= 1024
      ? blockSizeBytes
      : 1024 * 1024;
  const dataNodesRaw = Array.isArray(o.dataNodes) ? o.dataNodes : [];
  const validated = validateDataNodesInput(dataNodesRaw, randomUUID);
  return {
    blockSizeBytes: blockSize,
    dataNodes: validated.ok ? validated.nodes : []
  };
}

function parseNanoState(raw: string): NanoState {
  const state = JSON.parse(raw) as NanoState;
  state.clientConfig = normalizeClientConfig(state.clientConfig);
  return state;
}

const DEFAULT_STATE: NanoState = {
  role: "unselected",
  clientConfig: {
    blockSizeBytes: 1024 * 1024,
    dataNodes: []
  },
  dataConfig: {
    maxUploadMbps: 200,
    maxDownloadMbps: 200
  },
  files: [],
  reports: []
};

export class MetadataStore {
  private readonly stateDir: string;
  private readonly statePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(rootDir: string) {
    this.stateDir = path.join(rootDir, "state");
    this.statePath = path.join(this.stateDir, "metadata.json");
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async ensureStorage(): Promise<void> {
    await this.enqueue(async () => {
      await fs.mkdir(this.stateDir, { recursive: true });
      try {
        await fs.access(this.statePath);
      } catch {
        await this.write(DEFAULT_STATE);
      }
    });
  }

  async getState(): Promise<NanoState> {
    return this.enqueue(async () => {
      try {
        await fs.access(this.statePath);
      } catch {
        await this.write(DEFAULT_STATE);
      }
      const raw = await fs.readFile(this.statePath, "utf8");
      return parseNanoState(raw);
    });
  }

  async setRole(role: NodeRole): Promise<NodeRole> {
    return this.enqueue(async () => {
      const state = await this.readStateUnlocked();
      state.role = role;
      await this.write(state);
      return role;
    });
  }

  async getRole(): Promise<NodeRole> {
    return this.enqueue(async () => (await this.readStateUnlocked()).role);
  }

  async getClientConfig(): Promise<ClientConfig> {
    return this.enqueue(async () => (await this.readStateUnlocked()).clientConfig);
  }

  async setClientConfig(config: ClientConfig): Promise<ClientConfig> {
    return this.enqueue(async () => {
      const state = await this.readStateUnlocked();
      state.clientConfig = config;
      await this.write(state);
      return config;
    });
  }

  async getDataConfig() {
    return this.enqueue(async () => (await this.readStateUnlocked()).dataConfig);
  }

  async setDataConfig(maxUploadMbps: number, maxDownloadMbps: number) {
    return this.enqueue(async () => {
      const state = await this.readStateUnlocked();
      state.dataConfig.maxUploadMbps = maxUploadMbps;
      state.dataConfig.maxDownloadMbps = maxDownloadMbps;
      await this.write(state);
      return state.dataConfig;
    });
  }

  async listFiles(): Promise<FileRecord[]> {
    return this.enqueue(async () => (await this.readStateUnlocked()).files);
  }

  async getFile(fileId: string): Promise<FileRecord | undefined> {
    return this.enqueue(async () => (await this.readStateUnlocked()).files.find((f) => f.fileId === fileId));
  }

  async upsertFile(file: FileRecord): Promise<FileRecord> {
    return this.enqueue(async () => {
      const state = await this.readStateUnlocked();
      const index = state.files.findIndex((f) => f.fileId === file.fileId);
      if (index >= 0) {
        state.files[index] = file;
      } else {
        state.files.push(file);
      }
      await this.write(state);
      return file;
    });
  }

  async removeFiles(fileIds: string[]): Promise<FileRecord[]> {
    return this.enqueue(async () => {
      const state = await this.readStateUnlocked();
      const removed = state.files.filter((f) => fileIds.includes(f.fileId));
      state.files = state.files.filter((f) => !fileIds.includes(f.fileId));
      await this.write(state);
      return removed;
    });
  }

  async saveReport(report: Omit<TransferReport, "reportId">, reportId?: string): Promise<TransferReport> {
    return this.enqueue(async () => {
      const state = await this.readStateUnlocked();
      const full: TransferReport = { reportId: reportId ?? randomUUID(), ...report };
      state.reports.unshift(full);
      state.reports = state.reports.slice(0, 1000);
      await this.write(state);
      return full;
    });
  }

  async getReport(reportId: string): Promise<TransferReport | undefined> {
    return this.enqueue(async () => (await this.readStateUnlocked()).reports.find((r) => r.reportId === reportId));
  }

  private async readStateUnlocked(): Promise<NanoState> {
    try {
      await fs.access(this.statePath);
    } catch {
      await this.write(DEFAULT_STATE);
    }
    const raw = await fs.readFile(this.statePath, "utf8");
    return parseNanoState(raw);
  }

  private async write(state: NanoState): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    const tempPath = `${this.statePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tempPath, this.statePath);
  }
}
