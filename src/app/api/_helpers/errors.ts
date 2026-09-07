import { NextResponse } from "next/server";
import { ZodError } from "zod";

function statusOf(err: unknown): number | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return null;
}

/**
 * Shared error mapping for thin API routes:
 * 401-shaped errors (requireSessionUser) → 401, zod/JSON issues → 400,
 * other 4xx-carrying errors keep their status, everything else → generic 500.
 */
export function apiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path.join(".");
    return NextResponse.json(
      {
        error: first
          ? `${path ? `${path}: ` : ""}${first.message}`
          : "Invalid input",
      },
      { status: 400 },
    );
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = statusOf(err);
  if (status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (status !== null && status >= 400 && status < 500) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad request" },
      { status },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Maps errors thrown by the enqueue* contract (src/lib/ingestion/enqueue.ts):
 * errors carrying a 4xx `status` keep it, the current "Not implemented" stub
 * maps to 503, and any other Error is treated as a validation reason → 400.
 */
export function enqueueError(err: unknown): NextResponse {
  const status = statusOf(err);
  if (status !== null && status >= 400 && status < 500) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status },
    );
  }
  if (err instanceof Error && /not implemented/i.test(err.message)) {
    console.error(err);
    return NextResponse.json(
      { error: "Ingestion is not available yet — the pipeline is still being wired up." },
      { status: 503 },
    );
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
