"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NodeTeachingWorkspace } from "./NodeTeachingWorkspace";
import {
  getLearningNodeStatusLabel,
  getLearningNodeTypeLabel
} from "../../../../../../lib/learning/types";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel,
  StatusPill
} from "../../../../../components/ui";

type LearningNodeDetails = {
  node: {
    id: string;
    title: string;
    status: string;
    type: string;
    keyQuestion?: string | null;
    objective?: string | null;
    prerequisite?: string | null;
    commonMistake?: string | null;
    transferPrompt?: string | null;
    unitTitle: string;
    moduleTitle: string;
  } | null;
  item: {
    id: string;
    title: string;
    keyQuestion?: string | null;
    objective?: string | null;
    prerequisite?: string | null;
    commonMistake?: string | null;
    transferPrompt?: string | null;
    status: string;
    linkedWord?: {
      userUnderstanding?: string | null;
    } | null;
  };
  domain: { id: string; name: string };
};

export default function LearningNodePage() {
  const params = useParams();
  const router = useRouter();
  const rawDomainId = params?.id;
  const rawItemId = params?.itemId;
  const domainId = Array.isArray(rawDomainId) ? rawDomainId[0] : rawDomainId;
  const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;

  const [details, setDetails] = useState<LearningNodeDetails | null>(null);
  const [userUnderstanding, setUserUnderstanding] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const userUnderstandingDirtyRef = useRef(false);

  const loadNode = useCallback(async () => {
    if (!domainId || !itemId) return;
    setError("");
    try {
      const response = await fetch(`/api/domains/${domainId}/nodes/${itemId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "加载学习节点失败。");
        return;
      }
      setDetails(data);
      if (!userUnderstandingDirtyRef.current) {
        setUserUnderstanding(data.item.linkedWord?.userUnderstanding || "");
      }
    } catch {
      setError("加载学习节点失败：无法连接到应用服务。");
    }
  }, [domainId, itemId]);

  useEffect(() => {
    void loadNode();
  }, [loadNode]);

  const startNode = async () => {
    if (!domainId || !itemId) return;
    setBusy("start");
    setError("");
    try {
      const response = await fetch(
        `/api/domains/${domainId}/nodes/${itemId}/start`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "开始学习节点失败。");
        return;
      }
      await loadNode();
      setMessage("节点已开始。可以准备教学、练习，或在下方写下自己的理解。");
    } catch {
      setError("开始学习节点失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const completeNode = async () => {
    if (!domainId || !itemId || !userUnderstanding.trim()) return;
    setBusy("complete");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/domains/${domainId}/nodes/${itemId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userUnderstanding })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "沉淀学习记录失败。");
        return;
      }
      router.push(`/learning/domains/${domainId}`);
      router.refresh();
    } catch {
      setError("沉淀学习记录失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const node = details?.node;
  const item = details?.item;

  return (
    <AppShell>
      <PageHeader
        kicker="学习节点"
        title={node?.title || item?.title || "学习任务"}
        description="围绕当前目标学习、练习和提问，再用自己的话总结，由你确认是否沉淀。"
        actions={
          <Link
            href={`/learning/domains/${domainId || ""}`}
            className="workshop-button-secondary px-3 py-2 text-sm"
          >
            返回领域地图
          </Link>
        }
      />

      {error ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <SectionPanel strong>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusPill>
                {getLearningNodeStatusLabel(node?.status || item?.status)}
              </StatusPill>
              <StatusPill>{getLearningNodeTypeLabel(node?.type || "knowledge")}</StatusPill>
              {node?.unitTitle ? <StatusPill>{node.unitTitle}</StatusPill> : null}
            </div>
            <h2 className="workshop-title mt-3 text-2xl font-semibold">
              {item?.keyQuestion || "加载核心问题中..."}
            </h2>
          </div>
          {node && !["in_progress", "completed", "mastered"].includes(node.status) ? (
            <ActionButton
              variant="secondary"
              onClick={() => void startNode()}
              disabled={Boolean(busy)}
            >
              {busy === "start" ? "开始中..." : "开始学习"}
            </ActionButton>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["学习目标", item?.objective],
            ["已有前置", item?.prerequisite],
            ["常见误区", item?.commonMistake],
            ["迁移提醒", item?.transferPrompt]
          ].map(([label, value]) =>
            value ? (
              <div key={label} className="rounded border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium text-slate-500">{label}</div>
                <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
              </div>
            ) : null
          )}
        </div>
      </SectionPanel>

      {details && domainId && itemId ? (
        <NodeTeachingWorkspace key={`${domainId}:${itemId}`} domainId={domainId} nodeId={itemId} onPrepared={() => void loadNode()} understandingDraft={userUnderstanding} onRestoreUnderstanding={value=>{if(!userUnderstandingDirtyRef.current&&value){setUserUnderstanding(value);userUnderstandingDirtyRef.current=true;}}} />
      ) : null}

      <SectionPanel>
        <div>
          <div className="workshop-kicker">你的理解</div>
          <h2 className="workshop-title mt-1 text-xl font-semibold">
            用自己的话回答核心问题
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            写下自己的解释、例子、边界和疑问。这份记录由你保存、修订和确认，AI 不复核你的自我解释。
          </p>
        </div>
        <textarea
          aria-label="自己的理解"
          className="min-h-48 w-full rounded border border-slate-200 px-3 py-2 text-sm leading-6"
          value={userUnderstanding}
          onChange={(event) => {
            userUnderstandingDirtyRef.current = true;
            setUserUnderstanding(event.target.value);
          }}
          disabled={Boolean(busy)}
          placeholder="我认为……因为……一个例子是……它不适用于……"
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={() => void completeNode()}
            disabled={Boolean(busy) || !userUnderstanding.trim()}
          >
            {busy === "complete" ? "沉淀中..." : "我确认，沉淀并返回地图"}
          </ActionButton>
        </div>
      </SectionPanel>

    </AppShell>
  );
}
