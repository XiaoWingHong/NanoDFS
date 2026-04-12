import type { FileHandle } from "node:fs/promises";

export function splitBuffer(buffer: Buffer, blockSizeBytes: number): Buffer[] {
  if (blockSizeBytes <= 0) {
    throw new Error("blockSizeBytes must be greater than 0");
  }
  const blocks: Buffer[] = [];
  for (let cursor = 0; cursor < buffer.length; cursor += blockSizeBytes) {
    blocks.push(buffer.subarray(cursor, Math.min(cursor + blockSizeBytes, buffer.length)));
  }
  return blocks;
}

export function blockCountForFileSize(fileSize: number, blockSizeBytes: number): number {
  if (blockSizeBytes <= 0) {
    throw new Error("blockSizeBytes must be greater than 0");
  }
  if (fileSize <= 0) {
    return 0;
  }
  return Math.ceil(fileSize / blockSizeBytes);
}

export async function readFileBlock(
  handle: FileHandle,
  index: number,
  blockSizeBytes: number,
  fileSize: number
): Promise<Buffer> {
  const start = index * blockSizeBytes;
  if (start >= fileSize) {
    return Buffer.alloc(0);
  }
  const len = Math.min(blockSizeBytes, fileSize - start);
  const buf = Buffer.allocUnsafe(len);
  const { bytesRead } = await handle.read(buf, 0, len, start);
  return buf.subarray(0, bytesRead);
}

export function reassembleBlocks(blocks: Buffer[]): Buffer {
  return Buffer.concat(blocks);
}
