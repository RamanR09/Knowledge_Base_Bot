import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-svh flex-1">
      <AppSidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
