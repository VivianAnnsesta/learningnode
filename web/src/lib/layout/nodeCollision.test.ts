import { describe, expect, it } from "vitest";
import { resolveNodeCollisions } from "./nodeCollision";

const hasOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 24
) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;

describe("resolveNodeCollisions", () => {
  it("separates two overlapping nodes", () => {
    const nodes = resolveNodeCollisions([
      { id: "a", x: 0, y: 0, width: 200, height: 120 },
      { id: "b", x: 120, y: 40, width: 200, height: 120 }
    ]);
    expect(hasOverlap(nodes[0], nodes[1])).toBe(false);
  });

  it("keeps pinned node position", () => {
    const nodes = resolveNodeCollisions([
      { id: "a", x: 0, y: 0, width: 200, height: 120, pinned: true },
      { id: "b", x: 80, y: 0, width: 200, height: 120 }
    ]);
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
    expect(hasOverlap(nodes[0], nodes[1])).toBe(false);
  });

  it("resolves dense clusters without overlap", () => {
    const input = Array.from({ length: 40 }, (_, index) => ({
      id: `n${index}`,
      x: (index % 5) * 100,
      y: Math.floor(index / 5) * 60,
      width: 180,
      height: 120
    }));
    const output = resolveNodeCollisions(input, { gap: 16, iterations: 80 });
    for (let i = 0; i < output.length; i += 1) {
      for (let j = i + 1; j < output.length; j += 1) {
        expect(hasOverlap(output[i], output[j], 16)).toBe(false);
      }
    }
  });

  it("finishes within reasonable time for 200 nodes", () => {
    const input = Array.from({ length: 200 }, (_, index) => ({
      id: `n${index}`,
      x: (index % 20) * 50,
      y: Math.floor(index / 20) * 36,
      width: 160,
      height: 100
    }));
    const startedAt = performance.now();
    resolveNodeCollisions(input, { gap: 12, iterations: 100 });
    const durationMs = performance.now() - startedAt;
    expect(durationMs).toBeLessThan(1500);
  });
});
