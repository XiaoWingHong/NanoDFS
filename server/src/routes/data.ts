import express, { Router } from "express";
import type { MetadataStore } from "../services/metadata.js";
import type { DataStorage } from "../services/dataStorage.js";
import { throttleByMbps } from "../services/rateLimit.js";
import { isValidRateLimit } from "../services/validation.js";

const PUBLIC_IP_CACHE_TTL_MS = 60_000;
const PUBLIC_IP_LOOKUP_TIMEOUT_MS = 3_000;
const PUBLIC_IP_SERVICES = [
  "https://api.ipify.org?format=json",
  "https://ifconfig.me/ip"
];

let cachedPublicIp = "";
let cachedPublicIpAt = 0;
let publicIpLookupPromise: Promise<string | null> | null = null;

function isValidBlockId(blockId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(blockId);
}

function parseIpCandidate(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }
  return raw.split(",")[0]?.trim() ?? "";
}

async function fetchPublicIpFromService(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_IP_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    if (url.includes("format=json")) {
      const data = (await response.json()) as { ip?: string };
      return parseIpCandidate(data.ip);
    }
    return parseIpCandidate(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolvePublicIp(req: express.Request): Promise<string> {
  const now = Date.now();
  if (cachedPublicIp && now - cachedPublicIpAt < PUBLIC_IP_CACHE_TTL_MS) {
    return cachedPublicIp;
  }
  if (!publicIpLookupPromise) {
    publicIpLookupPromise = (async () => {
      for (const serviceUrl of PUBLIC_IP_SERVICES) {
        const ip = await fetchPublicIpFromService(serviceUrl);
        if (ip) {
          return ip;
        }
      }
      return null;
    })().finally(() => {
      publicIpLookupPromise = null;
    });
  }
  const externalIp = await publicIpLookupPromise;
  if (externalIp) {
    cachedPublicIp = externalIp;
    cachedPublicIpAt = now;
    return externalIp;
  }

  const forwarded = parseIpCandidate(req.headers["x-forwarded-for"] as string | undefined);
  return process.env.PUBLIC_HOST || forwarded || req.ip || req.hostname;
}

function ensureDataRole(metadata: MetadataStore) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((await metadata.getRole()) !== "data") {
      return res.status(409).json({ error: "This instance is not configured as a data node" });
    }
    return next();
  };
}

export function dataRouter(metadata: MetadataStore, storage: DataStorage) {
  const router = Router();
  router.use(ensureDataRole(metadata));
  router.use("/blocks", express.raw({ type: "application/octet-stream", limit: "1gb" }));
  let blockOperationQueue = Promise.resolve();

  function serializeBlockOperation<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = blockOperationQueue.then(operation, operation);
    blockOperationQueue = nextOperation.then(
      () => undefined,
      () => undefined
    );
    return nextOperation;
  }

  router.put("/blocks/:blockId", async (req, res) => {
    const blockId = req.params.blockId;
    if (!isValidBlockId(blockId)) {
      return res.status(400).json({ error: "Invalid block id" });
    }
    return serializeBlockOperation(async () => {
      const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
      const startedAtMs = Date.now();
      const { maxUploadMbps } = await metadata.getDataConfig();
      await throttleByMbps(payload.length, maxUploadMbps, startedAtMs);
      storage.writeBlock(blockId, payload);
      return res.json({ blockId, sizeBytes: payload.length });
    });
  });

  router.get("/blocks/:blockId", async (req, res) => {
    const blockId = req.params.blockId;
    if (!isValidBlockId(blockId)) {
      return res.status(400).json({ error: "Invalid block id" });
    }
    return serializeBlockOperation(async () => {
      if (!storage.exists(blockId)) {
        return res.status(404).json({ error: "Block not found" });
      }
      const block = storage.readBlock(blockId);
      const startedAtMs = Date.now();
      const { maxDownloadMbps } = await metadata.getDataConfig();
      await throttleByMbps(block.length, maxDownloadMbps, startedAtMs);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(block.length));
      return res.send(block);
    });
  });

  router.delete("/blocks/:blockId", (req, res) => {
    const blockId = req.params.blockId;
    if (!isValidBlockId(blockId)) {
      return res.status(400).json({ error: "Invalid block id" });
    }
    storage.deleteBlock(blockId);
    return res.status(204).send();
  });

  router.get("/status", async (req, res) => {
    const host = await resolvePublicIp(req);
    const port = Number(process.env.PUBLIC_PORT || process.env.PORT || 3000);
    const cfg = await metadata.getDataConfig();
    return res.json({
      publicIp: host,
      port,
      storageUsedBytes: storage.getStorageUsedBytes(),
      maxUploadMbps: cfg.maxUploadMbps,
      maxDownloadMbps: cfg.maxDownloadMbps
    });
  });

  router.post("/config/rate-limits", async (req, res) => {
    const maxUploadMbps = Number(req.body?.maxUploadMbps);
    const maxDownloadMbps = Number(req.body?.maxDownloadMbps);
    if (!isValidRateLimit(maxUploadMbps) || !isValidRateLimit(maxDownloadMbps)) {
      return res.status(400).json({ error: "Rate limits must be numbers in range (0, 1000]" });
    }
    const next = await metadata.setDataConfig(maxUploadMbps, maxDownloadMbps);
    return res.json(next);
  });

  return router;
}
