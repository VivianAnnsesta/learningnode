"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  diagnosticAnswerResultLabels,
  diagnosticQuestionTypeLabels,
  getKnowledgeNodeStatusLabel,
  getRouteSuggestionStatusLabel,
  type DiagnosticAnswerResult,
  type DiagnosticQuestionType
} from "../../../../../../lib/learning/types";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel,
  StatusPill
} from "../../../../../components/ui";

type DiagnosticAnswer = {
  id: string;
  response: string;
  assessment?: string | null;
  result: string;
  createdAt: string;
};

type DiagnosticEvaluation = {
  summary?: string;
  strengths?: string[];
  unclearParts?: string[];
  inaccurateParts?: string[];
  missingBoundaries?: string[];
  misconceptionRisk?: string | null;
  nextHint?: string;
  suggestedResult?: string;
  suggestedRoadmapStatus?: string;
};

type DiagnosticQuestion = {
  id: string;
  prompt: string;
  questionType: DiagnosticQuestionType;
  expectedAnswer?: string | null;
  roadmapItem?: { id: string; title: string; status: string } | null;
  answers: DiagnosticAnswer[];
};

type DiagnosticSession = {
  id: string;
  title: string;
  status: string;
  summary?: string | null;
  questions: DiagnosticQuestion[];
};

type RouteSuggestion = {
  id: string;
  level: "L1" | "L2" | "L3";
  title: string;
  rationale: string;
  changesMap: boolean;
  status: string;
};

const parseEvaluation = (
  assessment?: string | null
): DiagnosticEvaluation | null => {
  if (!assessment) return null;
  try {
    return JSON.parse(assessment) as DiagnosticEvaluation;
  } catch {
    return { summary: assessment };
  }
};

export default function DiagnosticSessionPage() {
  const params = useParams();
  const rawDomainId = params?.id;
  const rawSessionId = params?.sessionId;
  const domainId = Array.isArray(rawDomainId) ? rawDomainId[0] : rawDomainId;
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;

  const [session, setSession] = useState<DiagnosticSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, RouteSuggestion[]>>({});
  const [evaluatedQuestionIds, setEvaluatedQuestionIds] = useState<Record<string, boolean>>(
    {}
  );
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSession = useCallback(async () => {
    if (!domainId || !sessionId) return;
    try {
      const response = await fetch(`/api/domains/${domainId}/diagnostics/${sessionId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "加载诊断会话失败。");
        return;
      }
      setSession(data.session);
    } catch {
      setError("加载诊断会话失败：无法连接到应用服务。");
    }
  }, [domainId, sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const saveAnswer = async (questionId: string) => {
    const responseText = answers[questionId]?.trim();
    if (!responseText) {
      setError("请先填写答案。");
      return;
    }
    setBusy((prev) => ({ ...prev, [`save-${questionId}`]: true }));
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/diagnostic-questions/${questionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseText })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "保存答案失败。");
        return;
      }
      setMessage("答案已保存。");
      setAnswers((prev) => ({ ...prev, [questionId]: "" }));
      await loadSession();
    } catch {
      setError("保存答案失败：无法连接到应用服务。");
    } finally {
      setBusy((prev) => ({ ...prev, [`save-${questionId}`]: false }));
    }
  };

  const evaluateAnswer = async (questionId: string, answerId: string) => {
    setBusy((prev) => ({ ...prev, [`eval-${answerId}`]: true }));
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/diagnostic-answers/${answerId}/evaluate`, {
        method: "POST"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "AI 评价失败。");
        return;
      }
      setEvaluatedQuestionIds((prev) => ({ ...prev, [questionId]: true }));
      setMessage(
        data.suggestedRoadmapItemUpdate
          ? "AI 评价已完成，现在可以为关联节点生成路线建议。"
          : "AI 评价已完成。"
      );
      await loadSession();
    } catch {
      setError("AI 评价失败：无法连接到应用服务。");
    } finally {
      setBusy((prev) => ({ ...prev, [`eval-${answerId}`]: false }));
    }
  };

  const createRouteSuggestions = async (questionId: string, answerId: string) => {
    setBusy((prev) => ({ ...prev, [`suggest-${questionId}`]: true }));
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/diagnostic-answers/${answerId}/route-suggestions`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "生成路线建议失败。");
        return;
      }
      setSuggestions((prev) => ({ ...prev, [questionId]: data.suggestions || [] }));
      setMessage("路线建议已生成。");
    } catch {
      setError("生成路线建议失败：无法连接到应用服务。");
    } finally {
      setBusy((prev) => ({ ...prev, [`suggest-${questionId}`]: false }));
    }
  };

  const acceptSuggestion = async (questionId: string, suggestionId: string) => {
    setBusy((prev) => ({ ...prev, [`accept-${suggestionId}`]: true }));
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/route-suggestions/${suggestionId}/accept`, {
        method: "POST"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "接受路线建议失败。");
        return;
      }
      setSuggestions((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] || []).map((item) =>
          item.id === suggestionId ? { ...item, status: "accepted" } : item
        )
      }));
      setMessage(data.applied ? "建议已接受并已应用。" : "建议已接受。");
    } catch {
      setError("接受路线建议失败：无法连接到应用服务。");
    } finally {
      setBusy((prev) => ({ ...prev, [`accept-${suggestionId}`]: false }));
    }
  };

  return (
    <AppShell className="max-w-5xl">
      <PageHeader
        title={session?.title || "诊断会话"}
        description={session?.summary || "逐题作答，获得 AI 评价，并按需生成路线建议。"}
        actions={
          <>
            <Link
              href={`/learning/domains/${domainId}/diagnostics`}
              className="workshop-button-secondary px-3 py-2 text-sm"
            >
              返回诊断列表
            </Link>
            <Link
              href={`/learning/domains/${domainId}`}
              className="workshop-button-secondary px-3 py-2 text-sm"
            >
              领域地图
            </Link>
          </>
        }
      />

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
        <div className="space-y-4">
          {session?.questions.map((question) => {
            const latestAnswer = question.answers[0];
            const evaluation = parseEvaluation(latestAnswer?.assessment);
            const questionSuggestions = suggestions[question.id] || [];

            return (
              <div
                key={question.id}
                className="rounded border border-slate-200 bg-white p-4"
              >
                <div className="text-sm font-medium text-slate-900">
                  {question.prompt}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  <StatusPill>
                    {diagnosticQuestionTypeLabels[question.questionType]}
                  </StatusPill>
                  {question.roadmapItem ? (
                    <StatusPill>关联节点：{question.roadmapItem.title}</StatusPill>
                  ) : null}
                </div>

                {latestAnswer ? (
                  <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div>{latestAnswer.response}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      结果：
                      {diagnosticAnswerResultLabels[
                        latestAnswer.result as DiagnosticAnswerResult
                      ] || latestAnswer.result}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton
                        type="button"
                        variant="secondary"
                        onClick={() => evaluateAnswer(question.id, latestAnswer.id)}
                        disabled={Boolean(busy[`eval-${latestAnswer.id}`])}
                      >
                        {busy[`eval-${latestAnswer.id}`] ? "评价中..." : "AI 评价"}
                      </ActionButton>
                      {question.roadmapItem &&
                      (evaluatedQuestionIds[question.id] || evaluation) ? (
                        <ActionButton
                          type="button"
                          onClick={() =>
                            createRouteSuggestions(question.id, latestAnswer.id)
                          }
                          disabled={Boolean(busy[`suggest-${question.id}`])}
                        >
                          {busy[`suggest-${question.id}`]
                            ? "生成中..."
                            : "生成路线建议"}
                        </ActionButton>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {evaluation ? (
                  <div className="mt-3 space-y-3 rounded border border-indigo-100 bg-indigo-50 p-3 text-sm text-slate-700">
                    <div className="font-medium text-indigo-700">AI 评价</div>
                    <div>{evaluation.summary}</div>
                    {evaluation.nextHint ? (
                      <div className="rounded border border-indigo-100 bg-white p-3">
                        下一条提示：{evaluation.nextHint}
                      </div>
                    ) : null}
                    {evaluation.suggestedRoadmapStatus ? (
                      <div className="text-xs text-slate-500">
                        建议节点状态：
                        {getKnowledgeNodeStatusLabel(
                          evaluation.suggestedRoadmapStatus
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {questionSuggestions.length ? (
                  <div className="mt-3 space-y-2">
                    {questionSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="rounded border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap gap-2 text-sm font-medium text-slate-900">
                              <StatusPill>{suggestion.level}</StatusPill>
                              <StatusPill>
                                {suggestion.changesMap ? "会改动地图" : "不改动地图"}
                              </StatusPill>
                              <StatusPill>
                                {getRouteSuggestionStatusLabel(suggestion.status)}
                              </StatusPill>
                            </div>
                            <div className="mt-2 text-sm font-medium text-slate-900">
                              {suggestion.title}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              {suggestion.rationale}
                            </div>
                          </div>
                          <ActionButton
                            type="button"
                            variant="secondary"
                            onClick={() => acceptSuggestion(question.id, suggestion.id)}
                            disabled={
                              suggestion.status !== "candidate" ||
                              Boolean(busy[`accept-${suggestion.id}`]) ||
                              suggestion.changesMap
                            }
                          >
                            {suggestion.changesMap
                              ? "需转为地图草稿"
                              : busy[`accept-${suggestion.id}`]
                                ? "接受中..."
                                : suggestion.status === "accepted"
                                  ? "已接受"
                                  : "接受建议"}
                          </ActionButton>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <textarea
                  value={answers[question.id] || ""}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: event.target.value
                    }))
                  }
                  disabled={Boolean(busy[`save-${question.id}`])}
                  rows={3}
                  className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="先写下你的答案。"
                />
                <div className="mt-2 flex justify-end">
                  <ActionButton
                    type="button"
                    onClick={() => saveAnswer(question.id)}
                    disabled={Boolean(busy[`save-${question.id}`])}
                  >
                    {busy[`save-${question.id}`] ? "保存中..." : "保存答案"}
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      </SectionPanel>
    </AppShell>
  );
}
