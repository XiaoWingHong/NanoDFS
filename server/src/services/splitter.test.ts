import { describe, expect, it } from "vitest";
import { blockCountForFileSize, reassembleBlocks, splitBuffer } from "./splitter.js";

describe("splitter", () => {
  it("splits and reassembles buffers", () => {
    const source = Buffer.from("abcdefghijklmnopqrstuvwxyz");
    const parts = splitBuffer(source, 5);
    expect(parts).toHaveLength(6);
    expect(reassembleBlocks(parts).toString("utf8")).toBe(source.toString("utf8"));
  });

  it("blockCountForFileSize matches splitBuffer length", () => {
    const buf = Buffer.from("abc");
    expect(blockCountForFileSize(buf.length, 2)).toBe(splitBuffer(buf, 2).length);
    expect(blockCountForFileSize(0, 1024)).toBe(0);
  });
});
