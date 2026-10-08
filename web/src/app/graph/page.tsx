"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GraphRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center text-sm text-slate-500">
      正在跳转到工作台
    </div>
  );
}
