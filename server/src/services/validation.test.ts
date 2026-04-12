import { describe, expect, it } from "vitest";
import {
  isValidDataNodeHost,
  isValidDataNodePort,
  isValidRateLimit,
  validateDataNodesInput
} from "./validation.js";

describe("validation", () => {
  it("validates data node rate limits", () => {
    expect(isValidRateLimit(1)).toBe(true);
    expect(isValidRateLimit(1000)).toBe(true);
    expect(isValidRateLimit(0)).toBe(false);
    expect(isValidRateLimit(1001)).toBe(false);
  });

  it("validates data node host and port", () => {
    expect(isValidDataNodeHost("127.0.0.1")).toBe(true);
    expect(isValidDataNodeHost("")).toBe(false);
    expect(isValidDataNodeHost("   ")).toBe(false);
    expect(isValidDataNodePort(1)).toBe(true);
    expect(isValidDataNodePort(65535)).toBe(true);
    expect(isValidDataNodePort(0)).toBe(false);
    expect(isValidDataNodePort(65536)).toBe(false);
    expect(isValidDataNodePort(3.5)).toBe(false);
  });

  it("validateDataNodesInput rejects invalid entries", () => {
    const id = () => "fixed-id";
    expect(validateDataNodesInput([], id)).toEqual({ ok: true, nodes: [] });
    const ok = validateDataNodesInput([{ host: "h", port: 8080, enabled: true }], id);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.nodes).toHaveLength(1);
      expect(ok.nodes[0].host).toBe("h");
      expect(ok.nodes[0].port).toBe(8080);
    }
    const badHost = validateDataNodesInput([{ host: "  ", port: 1 }], id);
    expect(badHost.ok).toBe(false);
    const badPort = validateDataNodesInput([{ host: "x", port: 0 }], id);
    expect(badPort.ok).toBe(false);
    const badFloat = validateDataNodesInput([{ host: "x", port: 3.14 }], id);
    expect(badFloat.ok).toBe(false);
  });
});
