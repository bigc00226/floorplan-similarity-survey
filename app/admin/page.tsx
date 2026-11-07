import type { Metadata } from "next";
import { Suspense } from "react";
import AdminApp from "@/components/admin/AdminApp";

export const metadata: Metadata = { title: "管理画面" };

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AdminApp />
    </Suspense>
  );
}
