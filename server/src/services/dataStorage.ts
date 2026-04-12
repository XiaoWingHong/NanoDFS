import fs from "node:fs";
import path from "node:path";

export class DataStorage {
  private readonly blockDir: string;

  constructor(rootDir: string) {
    this.blockDir = path.join(rootDir, "blocks");
    fs.mkdirSync(this.blockDir, { recursive: true });
  }

  blockPath(blockId: string) {
    return path.join(this.blockDir, `${blockId}.blk`);
  }

  writeBlock(blockId: string, data: Buffer) {
    fs.writeFileSync(this.blockPath(blockId), data);
  }

  readBlock(blockId: string): Buffer {
    return fs.readFileSync(this.blockPath(blockId));
  }

  deleteBlock(blockId: string) {
    const filePath = this.blockPath(blockId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  exists(blockId: string): boolean {
    return fs.existsSync(this.blockPath(blockId));
  }

  getStorageUsedBytes(): number {
    if (!fs.existsSync(this.blockDir)) {
      return 0;
    }
    const entries = fs.readdirSync(this.blockDir);
    return entries.reduce((sum, name) => {
      const stat = fs.statSync(path.join(this.blockDir, name));
      return stat.isFile() ? sum + stat.size : sum;
    }, 0);
  }
}
