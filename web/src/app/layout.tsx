import "./globals.css";
import Link from "next/link";
import { KnowledgeQuickSwitcher } from "./components/KnowledgeQuickSwitcher";

export const metadata = {
  title: "知识学习系统",
  description: "AI 导师式知识体系构建工作台"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hans">
      <body className="min-h-screen text-[color:var(--ink)] antialiased">
        <nav aria-label="主要功能" className="mx-auto flex max-w-6xl flex-wrap gap-5 px-5 py-4 text-sm">
          <Link href="/">学习路线</Link><Link href="/learning/sessions">当前学习</Link><Link href="/learning/knowledge">个人知识网络</Link><Link href="/learning/history">历史内容</Link><Link href="/settings/ai">模型设置</Link>
          <KnowledgeQuickSwitcher />
        </nav>
        {children}
      </body>
    </html>
  );
}
