import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { clientRouter } from "./routes/client.js";
import { dataRouter } from "./routes/data.js";
import { MetadataStore } from "./services/metadata.js";
import { DataStorage } from "./services/dataStorage.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const runtimeRoot = process.env.NANODFS_RUNTIME_DIR || path.resolve(process.cwd(), "runtime");
const metadata = new MetadataStore(runtimeRoot);
await metadata.ensureStorage();
const storage = new DataStorage(runtimeRoot);
const clientUploadDir = path.join(runtimeRoot, "uploads", "tmp");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/bootstrap", bootstrapRouter(metadata));
app.use("/api/client", clientRouter(metadata, { uploadDir: clientUploadDir }));
app.use("/api/data", dataRouter(metadata, storage));

const webDistCandidates = [
  path.resolve(process.cwd(), "web/dist"),
  path.resolve(process.cwd(), "../web/dist")
];
const webDist = webDistCandidates.find((candidate) => fs.existsSync(candidate));
if (webDist) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).send("NanoDFS server is running. Build the web app to serve the UI.");
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message || "Unexpected server error" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`NanoDFS server listening on port ${port}`);
});
