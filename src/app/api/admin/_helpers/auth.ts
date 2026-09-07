import { requireSessionUser, type SessionUser } from "@/lib/session";

/**
 * Auth gate for every /api/admin route: 401 when signed out (via
 * requireSessionUser), 403 when the session user is not an admin.
 * Thrown errors carry a `status` that apiError maps through.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (user.role !== "admin") {
    throw Object.assign(new Error("Admin access required"), { status: 403 });
  }
  return user;
}
