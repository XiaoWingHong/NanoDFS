import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import type { MetadataStore } from "../services/metadata.js";
import type { BlockMetric, DataNodeEndpoint, FileBlockRecord, TransferReport } from "../types.js";
import { blockCountForFileSize, readFileBlock } from "../services/splitter.js";
import { elapsedSeconds, throughputMbps } from "../services/metrics.js";
import { roundRobinAssignments, runWithConcurrency } from "../services/scheduler.js";
import { validateDataNodesInput } from "../services/validation.js";
import { escapeCsvRow } from "../services/csv.js";

const PROCESSING_START_HEADER = "x-processing-start-ms";
const PROCESSING_END_HEADER = "x-processing-end-ms";

interface BlockTimingRange {
  startMs: number;
  endMs: number;
}

export interface ClientRouterOptions {
  /** Temp directory for disk-backed multipart uploads */
  uploadDir: string;
}

function createMulter(uploadDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${randomUUID()}-${safe}`);
      }
    })
  });
}

function ensureClientRole(metadata: MetadataStore) {
  return async (_req: unknown, res: any, next: any) => {
    if ((await metadata.getRole()) !== "client") {
      return res.status(409).json({ error: "This instance is not configured as a client node" });
    }
    return next();
  };
}

function normalizeDataNodeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function dataNodeAddress(node: DataNodeEndpoint): string {
  const normalizedHost = normalizeDataNodeHost(node.host);
  return `${normalizedHost || node.host.trim()}:${node.port}`;
}

function dataNodeBlockUrl(node: DataNodeEndpoint, blockId: string): string {
  const normalizedHost = normalizeDataNodeHost(node.host);
  if (!normalizedHost) {
    throw new Error(
      `Invalid data node host for ${dataNodeAddress(node)}. Check client data node host configuration.`
    );
  }
  return `http://${normalizedHost}:${node.port}/api/data/blocks/${encodeURIComponent(blockId)}`;
}

async function fetchDataNode(
  node: DataNodeEndpoint,
  url: string,
  init: RequestInit,
  operation: string
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to contact data node ${dataNodeAddress(node)} during ${operation}. Check host/port in client config and ensure the data node is reachable and running. (${reason})`
    );
  }
}

async function putBlock(node: DataNodeEndpoint, blockId: string, payload: Buffer): Promise<Response> {
  const url = dataNodeBlockUrl(node, blockId);
  return fetchDataNode(node, url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: new Uint8Array(payload)
  }, `block upload (${blockId})`);
}

function parseTimingFromHeaders(response: Response, fallback: BlockTimingRange): BlockTimingRange {
  const rawStart = Number(response.headers.get(PROCESSING_START_HEADER));
  const rawEnd = Number(response.headers.get(PROCESSING_END_HEADER));
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd < rawStart) {
    return fallback;
  }
  return { startMs: rawStart, endMs: rawEnd };
}

async function deleteBlock(node: DataNodeEndpoint, blockId: string): Promise<void> {
  const url = dataNodeBlockUrl(node, blockId);
  await fetchDataNode(node, url, { method: "DELETE" }, `block delete (${blockId})`);
}

function resolveDataNodeForBlock(
  block: FileBlockRecord,
  nodeById: Map<string, DataNodeEndpoint>
): DataNodeEndpoint | null {
  const configured = nodeById.get(block.nodeId);
  if (configured) {
    return configured;
  }
  const host = block.nodeHost?.trim();
  const port = block.nodePort;
  if (host && Number.isFinite(port) && port > 0) {
    return { id: block.nodeId, host, port, enabled: true };
  }
  return null;
}

async function fetchBlockBuffer(
  node: DataNodeEndpoint,
  blockId: string,
  localStartMs: number
): Promise<{ buffer: Buffer; timing: BlockTimingRange }> {
  const url = dataNodeBlockUrl(node, blockId);
  const response = await fetchDataNode(node, url, {}, `block download (${blockId})`);
  if (!response.ok) {
    throw new Error(`Failed to download block ${blockId} from ${node.host}:${node.port}`);
  }
  const ab = await response.arrayBuffer();
  const localEndMs = Date.now();
  return {
    buffer: Buffer.from(ab),
    timing: parseTimingFromHeaders(response, { startMs: localStartMs, endMs: localEndMs })
  };
}

async function cleanupUploadedBlocks(
  records: FileBlockRecord[],
  nodeById: Map<string, DataNodeEndpoint>
): Promise<void> {
  await Promise.all(
    records.map(async (r) => {
      const node = nodeById.get(r.nodeId);
      if (!node) {
        return;
      }
      try {
        await deleteBlock(node, r.blockId);
      } catch {
        // Best-effort cleanup of orphaned blocks on data nodes.
      }
    })
  );
}

function csvReport(report: any): string {
  const lines = [
    escapeCsvRow([
      "scope",
      "fileName",
      "operation",
      "sizeBytes",
      "elapsedSeconds",
      "throughputMbps",
      "blockIndex",
      "blockId",
      "nodeHost",
      "nodePort",
      "blockSizeBytes",
      "nodeCount",
      "concurrency",
      "startedAt",
      "finishedAt"
    ])
  ];
  lines.push(
    escapeCsvRow([
      "file",
      report.fileName,
      report.operation,
      report.sizeBytes,
      report.elapsedSeconds.toFixed(6),
      report.throughputMbps.toFixed(6),
      "",
      "",
      "",
      "",
      report.blockSizeBytes,
      report.nodeCount,
      report.concurrency,
      report.startedAt,
      report.finishedAt
    ])
  );
  for (const block of report.blocks) {
    lines.push(
      escapeCsvRow([
        "block",
        report.fileName,
        report.operation,
        block.sizeBytes,
        block.elapsedSeconds.toFixed(6),
        block.throughputMbps.toFixed(6),
        block.index,
        block.blockId,
        block.nodeHost,
        block.nodePort,
        report.blockSizeBytes,
        report.nodeCount,
        report.concurrency,
        "",
        ""
      ])
    );
  }
  return lines.join("\n");
}

export function clientRouter(metadata: MetadataStore, options: ClientRouterOptions) {
  const upload = createMulter(options.uploadDir);
  const router = Router();
  router.use(ensureClientRole(metadata));

  router.get("/config", async (_req, res) => {
    return res.json(await metadata.getClientConfig());
  });

  router.put("/config", async (req, res) => {
    const blockSizeBytes = Number(req.body?.blockSizeBytes);
    const maxConcurrentTasks = Number(req.body?.maxConcurrentTasks);
    const dataNodes = Array.isArray(req.body?.dataNodes) ? req.body.dataNodes : [];
    if (!Number.isFinite(blockSizeBytes) || blockSizeBytes < 1024) {
      return res.status(400).json({ error: "blockSizeBytes must be >= 1024" });
    }
    if (!Number.isFinite(maxConcurrentTasks) || maxConcurrentTasks < 1 || maxConcurrentTasks > 64) {
      return res.status(400).json({ error: "maxConcurrentTasks must be between 1 and 64" });
    }
    const validated = validateDataNodesInput(dataNodes, randomUUID);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }
    const config = await metadata.setClientConfig({
      blockSizeBytes,
      maxConcurrentTasks,
      dataNodes: validated.nodes
    });
    return res.json(config);
  });

  router.get("/files", async (_req, res) => {
    return res.json(await metadata.listFiles());
  });

  router.post("/upload", upload.array("files"), async (req, res, next) => {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      return res.status(400).json({ error: "No files provided" });
    }
    const config = await metadata.getClientConfig();
    const nodes = config.dataNodes.filter((node) => node.enabled);
    if (!nodes.length) {
      for (const f of files) {
        await fsPromises.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({ error: "At least one enabled data node is required" });
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const results: { fileId: string; report: TransferReport }[] = [];

    try {
      for (const file of files) {
        const fileId = randomUUID();
        const blockSizeBytes = config.blockSizeBytes;
        const stat = await fsPromises.stat(file.path);
        const fileSize = stat.size;
        const blockCount = blockCountForFileSize(fileSize, blockSizeBytes);
        const assignments = roundRobinAssignments(blockCount, nodes);
        const blockRecords: FileBlockRecord[] = [];

        let blockMetrics: BlockMetric[] = [];
        let transferStartMs: number | null = null;
        let transferEndMs: number | null = null;
        const handle = await fsPromises.open(file.path, "r");
        try {
          blockMetrics = await runWithConcurrency(assignments, config.maxConcurrentTasks, async (assignment) => {
            const payload = await readFileBlock(handle, assignment.index, blockSizeBytes, fileSize);
            const blockId = `${fileId}-${assignment.index}-${randomUUID().slice(0, 8)}`;
            const localStartMs = Date.now();
            const response = await putBlock(assignment.node, blockId, payload);
            if (!response.ok) {
              throw new Error(
                `Block upload failed for ${blockId} to ${assignment.node.host}:${assignment.node.port}`
              );
            }
            const localEndMs = Date.now();
            const timing = parseTimingFromHeaders(response, { startMs: localStartMs, endMs: localEndMs });
            transferStartMs = transferStartMs === null ? timing.startMs : Math.min(transferStartMs, timing.startMs);
            transferEndMs = transferEndMs === null ? timing.endMs : Math.max(transferEndMs, timing.endMs);
            const elapsed = elapsedSeconds(timing.startMs, timing.endMs);
            blockRecords.push({
              blockId,
              index: assignment.index,
              sizeBytes: payload.length,
              nodeId: assignment.node.id,
              nodeHost: assignment.node.host,
              nodePort: assignment.node.port
            });
            return {
              blockId,
              index: assignment.index,
              sizeBytes: payload.length,
              elapsedSeconds: elapsed,
              throughputMbps: throughputMbps(payload.length, elapsed),
              nodeHost: assignment.node.host,
              nodePort: assignment.node.port
            } satisfies BlockMetric;
          });
        } catch (uploadErr) {
          await cleanupUploadedBlocks(blockRecords, nodeById);
          throw uploadErr;
        } finally {
          await handle.close();
        }

        blockRecords.sort((a, b) => a.index - b.index);
        const fallbackNow = Date.now();
        const effectiveStartMs = transferStartMs ?? fallbackNow;
        const effectiveEndMs = transferEndMs ?? fallbackNow;
        const startedAt = new Date(effectiveStartMs).toISOString();
        const finishedAt = new Date(effectiveEndMs).toISOString();
        const totalElapsed = elapsedSeconds(effectiveStartMs, effectiveEndMs);
        await metadata.upsertFile({
          fileId,
          name: file.originalname,
          sizeBytes: fileSize,
          uploadedAt: finishedAt,
          blockSizeBytes: config.blockSizeBytes,
          blocks: blockRecords
        });
        const report = await metadata.saveReport({
          operation: "upload",
          fileId,
          fileName: file.originalname,
          sizeBytes: fileSize,
          blockSizeBytes: config.blockSizeBytes,
          nodeCount: nodes.length,
          concurrency: config.maxConcurrentTasks,
          startedAt,
          finishedAt,
          elapsedSeconds: totalElapsed,
          throughputMbps: throughputMbps(fileSize, totalElapsed),
          blocks: blockMetrics.sort((a, b) => a.index - b.index)
        });
        results.push({ fileId, report });
      }
      return res.json({ results });
    } catch (err) {
      return next(err);
    } finally {
      for (const f of files) {
        await fsPromises.unlink(f.path).catch(() => {});
      }
    }
  });

  router.get("/files/:fileId/download", async (req, res, next) => {
    const file = await metadata.getFile(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    const cfg = await metadata.getClientConfig();
    const nodeById = new Map(cfg.dataNodes.map((node) => [node.id, node]));
    let transferStartMs: number | null = null;
    let transferEndMs: number | null = null;
    const reportId = randomUUID();

    const sorted = [...file.blocks].sort((a, b) => a.index - b.index);
    try {
      const blockResults = await runWithConcurrency(sorted, cfg.maxConcurrentTasks, async (block) => {
        const node = resolveDataNodeForBlock(block, nodeById);
        if (!node) {
          throw new Error(`Missing data node configuration for block ${block.blockId}`);
        }
        const localStartMs = Date.now();
        const { buffer, timing } = await fetchBlockBuffer(node, block.blockId, localStartMs);
        transferStartMs = transferStartMs === null ? timing.startMs : Math.min(transferStartMs, timing.startMs);
        transferEndMs = transferEndMs === null ? timing.endMs : Math.max(transferEndMs, timing.endMs);
        const elapsed = elapsedSeconds(timing.startMs, timing.endMs);
        const metric: BlockMetric = {
          blockId: block.blockId,
          index: block.index,
          sizeBytes: buffer.length,
          elapsedSeconds: elapsed,
          throughputMbps: throughputMbps(buffer.length, elapsed),
          nodeHost: block.nodeHost,
          nodePort: block.nodePort
        };
        return { index: block.index, buffer, metric };
      });

      const assembledSize = blockResults.reduce((sum, r) => sum + r.buffer.length, 0);
      if (assembledSize !== file.sizeBytes) {
        throw new Error(
          `Downloaded ${assembledSize} bytes but file metadata expects ${file.sizeBytes} bytes`
        );
      }

      const blockMetrics = blockResults.map((r) => r.metric);
      const body = Buffer.concat(blockResults.map((r) => r.buffer));
      const fallbackNow = Date.now();
      const effectiveStartMs = transferStartMs ?? fallbackNow;
      const effectiveEndMs = transferEndMs ?? fallbackNow;
      const startedAt = new Date(effectiveStartMs).toISOString();
      const finishedAt = new Date(effectiveEndMs).toISOString();
      const totalElapsed = elapsedSeconds(effectiveStartMs, effectiveEndMs);
      await metadata.saveReport(
        {
          operation: "download",
          fileId: file.fileId,
          fileName: file.name,
          sizeBytes: file.sizeBytes,
          blockSizeBytes: file.blockSizeBytes,
          nodeCount: new Set(file.blocks.map((b) => b.nodeId)).size,
          concurrency: cfg.maxConcurrentTasks,
          startedAt,
          finishedAt,
          elapsedSeconds: totalElapsed,
          throughputMbps: throughputMbps(file.sizeBytes, totalElapsed),
          blocks: blockMetrics.sort((a, b) => a.index - b.index)
        },
        reportId
      );

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader("X-Report-Id", reportId);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
      res.end(body);
    } catch (err) {
      if (!res.headersSent) {
        return next(err);
      }
      try {
        res.destroy();
      } catch {
        // ignore
      }
      return;
    }
  });

  router.post("/files/delete", async (req, res) => {
    const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds.map(String) : [];
    if (!fileIds.length) {
      return res.status(400).json({ error: "fileIds is required" });
    }
    const cfg = await metadata.getClientConfig();
    const nodeById = new Map(cfg.dataNodes.map((node) => [node.id, node]));
    const removed = await metadata.removeFiles(fileIds);
    await Promise.all(
      removed.flatMap((file) =>
        file.blocks.map(async (block) => {
          const node = resolveDataNodeForBlock(block, nodeById);
          if (!node) {
            return;
          }
          try {
            await deleteBlock(node, block.blockId);
          } catch {
            // Idempotent delete: best effort cleanup on data nodes.
          }
        })
      )
    );
    return res.json({ deletedFileIds: removed.map((f) => f.fileId) });
  });

  router.get("/reports/:reportId", async (req, res) => {
    const report = await metadata.getReport(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    return res.json(report);
  });

  router.get("/reports/:reportId/csv", async (req, res) => {
    const report = await metadata.getReport(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    const csv = csvReport(report);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(report.fileName)}-${report.operation}-report.csv"`
    );
    return res.send(csv);
  });

  return router;
}
