import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Ingestion health, guardrail activity, usage &amp; cost, and feedback
          triage.
        </p>
      </header>
      <AdminDashboard />
    </div>
  );
}
