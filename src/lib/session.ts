import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Get the current session user in a Server Component or Route Handler; null if signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as SessionUser & Record<string, unknown>;
  return { id: u.id, email: u.email, name: u.name, role: u.role ?? "member" };
}

/** Like getSessionUser but throws a 401-shaped error for route handlers. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return user;
}
