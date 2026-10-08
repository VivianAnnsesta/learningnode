type StageIdentity = { key: string; status: "planned" | "expanded" };

// Runtime node progress does not make the curriculum itself a different draft.
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([key, entry]) => key !== "status" && entry != null && !(Array.isArray(entry) && entry.length === 0))
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, comparable(entry)])
  );
  return value;
}

export function recoverStageDraft<T extends StageIdentity>(drafts: T[], confirmed: T[], preferredKey?: string | null): T | null {
  const expanded = drafts.filter(stage => stage.status === "expanded");
  const changed = expanded.filter(stage => {
    const prior = confirmed.find(existing => existing.key === stage.key);
    return !prior || prior.status !== stage.status || JSON.stringify(comparable(prior)) !== JSON.stringify(comparable(stage));
  });
  return changed.find(stage => stage.key === preferredKey) || changed[0]
    || expanded.find(stage => stage.key === preferredKey) || expanded[0] || null;
}

export function replaceEditedStage<T extends StageIdentity>(baseline: T[], edited: T): T[] {
  if (!baseline.some(stage => stage.key === edited.key)) throw new Error("修订阶段不在当前地图中，请重新加载。");
  return baseline.map(stage => stage.key === edited.key ? edited : stage);
}
