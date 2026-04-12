import { describe, expect, it } from "vitest";
import { throughputMbps } from "./metrics.js";

describe("metrics", () => {
  it("computes throughput in Mb/s", () => {
    const value = throughputMbps(1_000_000, 1);
    expect(value).toBeCloseTo(8, 6);
  });
});
