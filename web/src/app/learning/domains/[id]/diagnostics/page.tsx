"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  diagnosticQuestionTypeLabels,
  diagnosticQuestionTypes,
  type DiagnosticQuestionType
} from "../../../../../lib/learning/types";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel
} from "../../../../components/ui";

type Domain = {
  id: string;
  name: string;
};

type RoadmapItemOption = {
  id: string;
  title: string;
};

type DiagnosticAnswer = {
  id: string;
};

type DiagnosticQuestion = {
  id: string;
  prompt: string;
  questionType: DiagnosticQuestionType;
  roadmapItem?: RoadmapItemOption | null;
  answers: DiagnosticAnswer[];
};

type DiagnosticSession = {
  id: string;
  title: string;
  status: string;
  summary?: string | null;
  questions: DiagnosticQuestion[];
};

type QuestionDraft = {
  prompt: string;
  questionType: DiagnosticQuestionType;
  expectedAnswer: string;
  roadmapItemId: string;
};

const emptyQuestion = (): QuestionDraft => ({
  prompt: "",
  questionType: "concept",
  expectedAnswer: "",
  roadmapItemId: ""
});

export default function DiagnosticsPage() {
  const params = useParams();
  const rawId = params?.id;
  const domainId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [domain, setDomain] = useState<Domain | null>(null);
  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItemOption[]>([]);
  const [title, setTitle] = useState("初始诊断");
  const [summary, setSummary] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDomain = useCallback(async () => {
    if (!domainId) return;
    try {
      const response = await fetch(`/api/domains/${domainId}`);
      if (!response.ok) {
        setError("读取领域信息失败。");
        return;
      }
      const data = await response.json();
      setDomain(data.domain);
    } catch {
      setError("读取领域信息失败：无法连接到应用服务。");
    }
  }, [domainId]);

  const loadDiagnostics = useCallback(async () => {
    if (!domainId) return;
    try {
      const response = await fetch(`/api/domains/${domainId}/diagnostics`);
      if (!response.ok) {
        setError("加载诊断列表失败。");
        return;
      }
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch {
      setError("加载诊断列表失败：无法连接到应用服务。");
    }
  }, [domainId]);

  const loadRoadmapItems = useCallback(async () => {
    if (!domainId) return;
    try {
      const response = await fetch(`/api/domains/${domainId}/map`);
      if (!response.ok) {
        setError("加载可关联学习节点失败。");
        return;
      }
      const data = await response.json();
      const items: RoadmapItemOption[] = (data.map?.nodes || []).map((item: any) => ({
        id: item.id,
        title: item.title
      }));
      setRoadmapItems(items);
    } catch {
      setError("加载可关联学习节点失败：无法连接到应用服务。");
    }
  }, [domainId]);

  useEffect(() => {
    void loadDomain();
    void loadDiagnostics();
    void loadRoadmapItems();
  }, [loadDiagnostics, loadDomain, loadRoadmapItems]);

  const stats = useMemo(() => {
    const allQuestions = sessions.flatMap((session) => session.questions);
    const answered = allQuestions.filter((question) => question.answers[0]);
    return {
      sessions: sessions.length,
      questions: allQuestions.length,
      answered: answered.length
    };
  }, [sessions]);

  const updateQuestion = (
    index: number,
    key: keyof QuestionDraft,
    value: string
  ) => {
    setQuestions((prev) =>
      prev.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question
      )
    );
  };

  const createSession = async () => {
    if (!domainId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/diagnostics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          questions: questions.filter((question) => question.prompt.trim())
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "创建诊断会话失败。");
        return;
      }
      setMessage("诊断会话已创建。");
      setQuestions([emptyQuestion()]);
      await loadDiagnostics();
    } catch {
      setError("创建诊断会话失败：无法连接到应用服务。");
    } finally {
      setSaving(false);
    }
  };

  const generateDiagnosticDraft = async () => {
    if (!domainId) return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/diagnostics/ai-draft`, {
        method: "POST"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "生成诊断草稿失败。");
        return;
      }
      const draft = data.draft || {};
      setTitle(draft.title || "AI 诊断草稿");
      setSummary(draft.summary || "");
      setQuestions(
        (draft.questions || []).map((question: any) => ({
          prompt: question.prompt || "",
          questionType: question.questionType || "concept",
          expectedAnswer: question.expectedAnswer || "",
          roadmapItemId: question.roadmapItemId || ""
        }))
      );
      setMessage("AI 已生成诊断草稿。");
    } catch {
      setError("生成诊断草稿失败：无法连接到应用服务。");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={`${domain?.name || "学习领域"}诊断`}
        description="在这里创建诊断会话。具体作答、AI 评价和路线建议会在会话详情页继续完成。"
        actions={
          <>
            <Link
              href={`/learning/domains/${domainId}`}
              className="workshop-button-secondary px-3 py-2 text-sm"
            >
              返回领域地图
            </Link>
            <Link
              href={`/learning/domains/${domainId}/knowledge-graph`}
              className="workshop-button-secondary px-3 py-2 text-sm"
            >
              知识体系图谱
            </Link>
          </>
        }
      />

      <div className="text-xs text-slate-500">
        {stats.sessions} 个会话 · {stats.questions} 道题 · 已作答 {stats.answered} 道
      </div>

      {error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <SectionPanel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">创建诊断会话</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              你可以手动编写题目，也可以先让 AI 生成一版，再创建正式会话用于作答。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={generateDiagnosticDraft}
              disabled={generating || saving || roadmapItems.length === 0}
            >
              {generating ? "生成中..." : "AI 生成草稿"}
            </ActionButton>
            <ActionButton
              type="button"
              onClick={createSession}
              disabled={saving || generating}
            >
              {saving ? "创建中..." : "创建会话"}
            </ActionButton>
          </div>
          {!roadmapItems.length ? (
            <p className="mt-2 text-xs text-slate-500">
              请先保存路线图，再生成诊断题草稿；手动创建诊断仍可用。
            </p>
          ) : null}
        </div>

        <fieldset
          className="space-y-3 border-0 p-0"
          disabled={generating || saving}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded border border-slate-200 px-3 py-2 text-sm"
              placeholder="诊断标题"
            />
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className="rounded border border-slate-200 px-3 py-2 text-sm"
              placeholder="诊断摘要"
            />
          </div>

          <div className="space-y-3">
            {questions.map((question, index) => (
              <div
                key={index}
                className="grid gap-2 rounded border border-slate-200 p-3 md:grid-cols-[1fr_180px]"
              >
                <textarea
                  value={question.prompt}
                  onChange={(event) =>
                    updateQuestion(index, "prompt", event.target.value)
                  }
                  rows={2}
                  className="rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="诊断题目"
                />
                <select
                  value={question.questionType}
                  onChange={(event) =>
                    updateQuestion(index, "questionType", event.target.value)
                  }
                  className="rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  {diagnosticQuestionTypes.map((type) => (
                    <option key={type} value={type}>
                      {diagnosticQuestionTypeLabels[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={question.expectedAnswer}
                  onChange={(event) =>
                    updateQuestion(index, "expectedAnswer", event.target.value)
                  }
                  className="rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="预期答案"
                />
                <select
                  value={question.roadmapItemId}
                  onChange={(event) =>
                    updateQuestion(index, "roadmapItemId", event.target.value)
                  }
                  className="rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">不关联地图节点</option>
                  {roadmapItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
          >
            再添加一道题
          </ActionButton>
        </fieldset>
      </SectionPanel>

      <SectionPanel>
        <div>
          <h2 className="text-base font-semibold text-slate-900">诊断会话列表</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            打开某个会话后，可以继续作答、运行 AI 评价并生成路线建议。
          </p>
        </div>

        <div className="grid gap-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {session.title}
                  </div>
                  {session.summary ? (
                    <div className="mt-1 text-xs text-slate-500">
                      {session.summary}
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-slate-500">
                    {session.questions.length} 道题 · 已作答{" "}
                    {session.questions.filter((question) => question.answers[0]).length} 道
                  </div>
                </div>
                <Link
                  href={`/learning/domains/${domainId}/diagnostics/${session.id}`}
                  className="workshop-button px-3 py-2 text-sm"
                >
                  打开会话
                </Link>
              </div>
            </div>
          ))}
          {!sessions.length ? (
            <div className="rounded border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              还没有诊断会话。
            </div>
          ) : null}
        </div>
      </SectionPanel>
    </AppShell>
  );
}
