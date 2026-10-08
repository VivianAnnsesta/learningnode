import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
