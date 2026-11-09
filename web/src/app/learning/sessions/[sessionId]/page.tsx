"use client";
import { useParams } from "next/navigation";
import { AppShell, PageHeader } from "../../../components/ui";
import { LearningWorkspace } from "../../../components/LearningWorkspace";
export default function SessionPage(){const p=useParams();return <AppShell><PageHeader title="当前学习" description="围绕问题学习、提问和整理，也可以暂停或自由探索。"/><LearningWorkspace sessionId={String(p.sessionId)}/></AppShell>;}
