"use client";

import { useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
  useStore
} from "reactflow";

const getNodeBounds = (node: any) => {
  const absolute =
    node?.internals?.positionAbsolute ??
    node?.positionAbsolute ??
    node?.position ?? { x: 0, y: 0 };
  const width = node?.measured?.width ?? node?.width ?? 0;
  const height = node?.measured?.height ?? node?.height ?? 0;
  return {
    x: absolute.x,
    y: absolute.y,
    width,
    height
  };
};

const getRectIntersection = (
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number }
) => {
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2
  };
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (dx === 0 && dy === 0) return sourceCenter;
  const scale =
    1 / Math.max(Math.abs(dx) / Math.max(source.width / 2, 1), Math.abs(dy) / Math.max(source.height / 2, 1));
  return {
    x: sourceCenter.x + dx * scale,
    y: sourceCenter.y + dy * scale
  };
};

export default function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label
}: EdgeProps) {
  const sourceNode = useStore(
    useMemo(() => (state) => state.nodeInternals.get(source), [source])
  );
  const targetNode = useStore(
    useMemo(() => (state) => state.nodeInternals.get(target), [target])
  );

  if (!sourceNode || !targetNode) return null;

  const sourceBounds = getNodeBounds(sourceNode);
  const targetBounds = getNodeBounds(targetNode);
  const sourcePoint = getRectIntersection(sourceBounds, targetBounds);
  const targetPoint = getRectIntersection(targetBounds, sourceBounds);

  const [path, labelX, labelY] = getStraightPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-full bg-white/80 px-1 text-[10px] text-slate-400 backdrop-blur-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
