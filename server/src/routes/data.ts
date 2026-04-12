import express, { Router } from "express";
import type { MetadataStore } from "../services/metadata.js";
import type { DataStorage } from "../services/dataStorage.js";
import { throttleByMbps } from "../services/rateLimit.js";
import { isValidRateLimit } from "../services/validation.js";

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

  router.put("/blocks/:blockId", async (req, res) => {
    const blockId = req.params.blockId;
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
    const startedAtMs = Date.now();
    const { maxUploadMbps } = await metadata.getDataConfig();
    await throttleByMbps(payload.length, maxUploadMbps, startedAtMs);
    storage.writeBlock(blockId, payload);
    return res.json({ blockId, sizeBytes: payload.length });
  });

  router.get("/blocks/:blockId", async (req, res) => {
    const blockId = req.params.blockId;
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

  router.delete("/blocks/:blockId", (req, res) => {
    storage.deleteBlock(req.params.blockId);
    return res.status(204).send();
  });

  router.get("/status", async (req, res) => {
    const host = process.env.PUBLIC_HOST || req.hostname;
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
