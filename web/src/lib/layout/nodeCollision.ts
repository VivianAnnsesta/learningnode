type LayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned?: boolean;
};

type ResolveOptions = {
  gap?: number;
  iterations?: number;
};

const overlaps = (a: LayoutNode, b: LayoutNode, gap: number) => {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
};

const clamp = (value: number) => (value < 0 ? 0 : value);

export const resolveNodeCollisions = (
  nodes: LayoutNode[],
  options: ResolveOptions = {}
) => {
  const gap = options.gap ?? 24;
  const iterations = options.iterations ?? 30;
  const next = nodes.map((node) => ({ ...node }));

  for (let step = 0; step < iterations; step += 1) {
    let moved = false;

    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i];
        const b = next[j];
        if (!overlaps(a, b, gap)) continue;

        const overlapX =
          Math.min(a.x + a.width + gap - b.x, b.x + b.width + gap - a.x);
        const overlapY =
          Math.min(a.y + a.height + gap - b.y, b.y + b.height + gap - a.y);

        const moveB = !b.pinned;
        const moveA = !a.pinned;
        if (!moveA && !moveB) continue;

        if (overlapX <= overlapY) {
          if (moveB) {
            b.x += overlapX;
            moved = true;
          } else if (moveA) {
            a.x -= overlapX;
            moved = true;
          }
        } else {
          if (moveB) {
            b.y += overlapY;
            moved = true;
          } else if (moveA) {
            a.y -= overlapY;
            moved = true;
          }
        }

        a.x = clamp(a.x);
        a.y = clamp(a.y);
        b.x = clamp(b.x);
        b.y = clamp(b.y);
      }
    }

    if (!moved) break;
  }

  return next;
};
