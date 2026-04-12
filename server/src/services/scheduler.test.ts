import { describe, expect, it } from "vitest";
import { roundRobinAssignments } from "./scheduler.js";

describe("scheduler", () => {
  it("distributes blocks evenly with round robin", () => {
    const nodes = [
      { id: "a", host: "1.1.1.1", port: 1, enabled: true },
      { id: "b", host: "1.1.1.2", port: 2, enabled: true },
      { id: "c", host: "1.1.1.3", port: 3, enabled: true }
    ];
    const assignments = roundRobinAssignments(7, nodes);
    expect(assignments.map((a) => a.node.id)).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });
});
