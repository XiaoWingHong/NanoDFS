import { Router } from "express";
import type { MetadataStore } from "../services/metadata.js";
import type { NodeRole } from "../types.js";

export function bootstrapRouter(metadata: MetadataStore) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json({ role: await metadata.getRole() });
  });

  router.post("/role", async (req, res) => {
    const role = req.body?.role as NodeRole;
    if (!role || !["client", "data"].includes(role)) {
      return res.status(400).json({ error: "role must be either 'client' or 'data'" });
    }
    await metadata.setRole(role);
    return res.json({ role });
  });

  router.post("/reset", async (_req, res) => {
    await metadata.setRole("unselected");
    return res.json({ role: "unselected" });
  });

  return router;
}
