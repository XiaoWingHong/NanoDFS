export function isValidRateLimit(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1000;
}

/** TCP/UDP port range */
export function isValidDataNodePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isValidDataNodeHost(host: string): boolean {
  return typeof host === "string" && host.trim().length > 0;
}

export interface RawDataNodeInput {
  id?: unknown;
  host?: unknown;
  port?: unknown;
  enabled?: unknown;
}

export interface ValidatedDataNode {
  id: string;
  host: string;
  port: number;
  enabled: boolean;
}

/**
 * Strict validation for client data node entries: non-empty host, integer port 1–65535.
 */
export function validateDataNodesInput(
  dataNodes: unknown[],
  newId: () => string
): { ok: true; nodes: ValidatedDataNode[] } | { ok: false; error: string } {
  if (!Array.isArray(dataNodes)) {
    return { ok: false, error: "dataNodes must be an array" };
  }
  const nodes: ValidatedDataNode[] = [];
  for (const n of dataNodes) {
    if (n === null || typeof n !== "object") {
      return { ok: false, error: "Each data node must be an object" };
    }
    const raw = n as RawDataNodeInput;
    const host = String(raw.host ?? "").trim();
    const port = Number(raw.port);
    if (!isValidDataNodeHost(host)) {
      return { ok: false, error: "Each data node must have a non-empty host" };
    }
    if (!Number.isInteger(port) || !isValidDataNodePort(port)) {
      return { ok: false, error: "Each data node port must be an integer from 1 to 65535" };
    }
    nodes.push({
      id: raw.id != null && String(raw.id).length > 0 ? String(raw.id) : newId(),
      host,
      port,
      enabled: raw.enabled !== false
    });
  }
  return { ok: true, nodes };
}
