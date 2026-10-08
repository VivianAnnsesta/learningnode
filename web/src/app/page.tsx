"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDomainStatusLabel } from "../lib/learning/types";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel,
  StatusPill
} from "./components/ui";

type DomainCard = {
  id: string;
  name: string;
  description?: string | null;
  goal?: string | null;
  status?: string | null;
  updatedAt: string;
  hasMap: boolean;
  hasPlannedStages: boolean;
  progress: {
    totalNodes: number;
    completedNodes: number;
    percent: number;
    needsReviewNodes: number;
  };
};

export default function Dashboard() {
  const [domains, setDomains] = useState<DomainCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/domains");
        if (!response.ok) {
          setError("加载学习领域失败。");
          return;
        }
        const data = await response.json();
        setDomains(data.domains || []);
      } catch {
        setError("加载学习领域失败：无法连接到应用服务。");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const deleteDomain = async (domain: DomainCard) => {
    const confirmed = window.confirm(
      `确定删除“${domain.name}”吗？该领域的地图、学习节点、诊断记录和知识点会一并删除。`
    );
    if (!confirmed) return;

    setDeletingId(domain.id);
    setError("");
    try {
      const response = await fetch(`/api/domains/${domain.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "删除学习领域失败。");
        return;
      }
      setDomains((prev) => prev.filter((item) => item.id !== domain.id));
    } catch {
      setError("删除学习领域失败：无法连接到应用服务。");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <AppShell>
      <PageHeader
        kicker="沉浸式学习 v1.2"
        title="学习领域"
        description="从这里进入完整领域地图，自主选择要学习的节点。地图中的结构变更只有经过你确认后才会生效。"
        actions={
          <>
            <Link href="/settings/ai" className="workshop-button-secondary px-3 py-2 text-sm">
              AI 设置
            </Link>
            <Link href="/learning/domains/new" className="workshop-button px-3 py-2 text-sm">
              创建领域
            </Link>
          </>
        }
      />

      {error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4">
        {loading ? (
          <SectionPanel>
            <div className="text-sm text-slate-500">正在加载学习领域...</div>
          </SectionPanel>
        ) : null}

        {!loading && domains.length === 0 ? (
          <SectionPanel strong>
            <div>
              <div className="workshop-kicker">开始</div>
              <h2 className="workshop-title mt-1 text-xl font-semibold">还没有学习领域</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                先创建一个学习领域，生成任务书和领域地图，并在确认路线后再开始第一个知识点。
              </p>
            </div>
            <Link href="/learning/domains/new" className="workshop-button px-3 py-2 text-sm">
              创建第一个领域
            </Link>
          </SectionPanel>
        ) : null}

        {domains.map((domain) => {
          const hasMap = domain.hasMap;

          return (
            <SectionPanel key={domain.id} className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/learning/domains/${domain.id}`}
                      className="workshop-title text-xl font-semibold underline underline-offset-4"
                    >
                      {domain.name}
                    </Link>
                    <StatusPill>{getDomainStatusLabel(domain.status || "active")}</StatusPill>
                    {hasMap && domain.hasPlannedStages ? (
                      <StatusPill>地图仍在展开</StatusPill>
                    ) : hasMap ? (
                      <StatusPill>已完成 {domain.progress.percent}%</StatusPill>
                    ) : (
                      <StatusPill>未生成地图</StatusPill>
                    )}
                  </div>

                  {domain.goal ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">目标：{domain.goal}</p>
                  ) : domain.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {domain.description}
                    </p>
                  ) : null}

                  {domain.hasPlannedStages ? (
                    <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      已展开 {domain.progress.totalNodes} 个节点；完整全局完成率会在所有 Stage 展开后显示。
                    </div>
                  ) : hasMap ? (
                    <>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[rgba(185,130,79,0.18)]">
                        <div
                          className="h-full rounded-full bg-[color:var(--wood-deep)]"
                          style={{ width: `${domain.progress.percent || 0}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        已完成 {domain.progress.completedNodes} / {domain.progress.totalNodes} 个节点
                        {domain.progress.needsReviewNodes
                          ? `，${domain.progress.needsReviewNodes} 个待复习`
                          : ""}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                  <Link href={`/learning/domains/${domain.id}`} className="workshop-button px-3 py-2 text-sm">
                    打开地图
                  </Link>
                  <Link
                    href={`/learning/domains/${domain.id}`}
                    className="workshop-button-secondary px-3 py-2 text-sm"
                  >
                    领域地图
                  </Link>
                  <Link
                    href={`/learning/domains/${domain.id}/knowledge-graph`}
                    className="workshop-button-secondary px-3 py-2 text-sm"
                  >
                    知识体系图谱
                  </Link>
                  <ActionButton
                    type="button"
                    variant="danger"
                    onClick={() => void deleteDomain(domain)}
                    disabled={deletingId === domain.id}
                  >
                    {deletingId === domain.id ? "删除中..." : "删除领域"}
                  </ActionButton>
                </div>
              </div>
            </SectionPanel>
          );
        })}
      </section>
    </AppShell>
  );
}
