export type NodeRole = "unselected" | "client" | "data";

export interface DataNodeEndpoint {
  id: string;
  host: string;
  port: number;
  enabled: boolean;
}

export interface ClientConfig {
  blockSizeBytes: number;
  maxConcurrentTasks: number;
  dataNodes: DataNodeEndpoint[];
}

export interface DataNodeConfig {
  maxUploadMbps: number;
  maxDownloadMbps: number;
}

export interface FileBlockRecord {
  blockId: string;
  index: number;
  sizeBytes: number;
  nodeId: string;
  nodeHost: string;
  nodePort: number;
}

export interface FileRecord {
  fileId: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  blockSizeBytes: number;
  blocks: FileBlockRecord[];
}

export interface BlockMetric {
  blockId: string;
  index: number;
  sizeBytes: number;
  elapsedSeconds: number;
  throughputMbps: number;
  nodeHost: string;
  nodePort: number;
}

export interface TransferReport {
  reportId: string;
  operation: "upload" | "download";
  fileId: string;
  fileName: string;
  sizeBytes: number;
  blockSizeBytes: number;
  nodeCount: number;
  concurrency: number;
  startedAt: string;
  finishedAt: string;
  elapsedSeconds: number;
  throughputMbps: number;
  blocks: BlockMetric[];
}

export interface NanoState {
  role: NodeRole;
  clientConfig: ClientConfig;
  dataConfig: DataNodeConfig;
  files: FileRecord[];
  reports: TransferReport[];
}
