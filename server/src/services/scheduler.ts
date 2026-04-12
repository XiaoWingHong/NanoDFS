import pLimit from "p-limit";
import type { DataNodeEndpoint } from "../types.js";

export interface BlockAssignment {
  index: number;
  node: DataNodeEndpoint;
}

export function roundRobinAssignments(
  blockCount: number,
  nodes: DataNodeEndpoint[],
  startIndex = 0
): BlockAssignment[] {
  if (nodes.length === 0) {
    throw new Error("At least one enabled data node is required");
  }
  const assignments: BlockAssignment[] = [];
  for (let i = 0; i < blockCount; i += 1) {
    const node = nodes[(startIndex + i) % nodes.length];
    assignments.push({ index: i, node });
  }
  return assignments;
}

export async function runWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<U>
): Promise<U[]> {
  const safeConcurrency = Math.max(1, concurrency);
  const limit = pLimit(safeConcurrency);
  return Promise.all(items.map((item) => limit(() => worker(item))));
}
