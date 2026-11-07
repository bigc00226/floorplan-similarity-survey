import type { Metadata } from "next";
import { Suspense } from "react";
import StudyApp from "@/components/participant/StudyApp";

export const metadata: Metadata = { title: "Study" };

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <StudyApp />
    </Suspense>
  );
}
