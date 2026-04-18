export function isValidRateLimit(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1000;
}

export function isValidDataNodePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function dataNodeHostValidationError(host: string): string | null {
  if (typeof host !== "string" || host.trim().length === 0) {
    return "Each data node must have a non-empty host";
  }
  const normalized = host.trim();
  if (/^https?:\/\//i.test(normalized)) {
    return "Each data node host must be a plain host/IP without http:// or https://";
  }
  if (/[/?#]/.test(normalized)) {
    return "Each data node host must not include path, query, or hash components";
  }
  if (/\s/.test(normalized)) {
    return "Each data node host must not contain whitespace";
  }
  return null;
}

export function isValidDataNodeHost(host: string): boolean {
  return dataNodeHostValidationError(host) === null;
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
    const hostError = dataNodeHostValidationError(host);
    if (hostError) {
      return { ok: false, error: hostError };
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
