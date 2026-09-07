import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { env } from "@/lib/env";

const execFileAsync = promisify(execFile);

/**
 * DEV-ONLY bridge: runs a prompt through the local Claude Code CLI (the
 * user's own logged-in subscription) when no ANTHROPIC_API_KEY is configured.
 *
 * Limitations vs the real API: no native citations, no streaming (one shot),
 * slower. Remove from the hot path by setting ANTHROPIC_API_KEY.
 */

const resultSchema = z.object({
  result: z.string().optional(),
  usage: z.unknown().optional(),
  is_error: z.boolean().optional(),
});

let cachedBinary: string | null | undefined;

/** Find the claude CLI: env override → PATH → VS Code extension bundle. */
export function findClaudeCli(): string | null {
  if (cachedBinary !== undefined) return cachedBinary;
  if (process.env.CLAUDE_CLI_PATH) {
    cachedBinary = process.env.CLAUDE_CLI_PATH;
    return cachedBinary;
  }
  try {
    const extDir = path.join(homedir(), ".vscode", "extensions");
    const candidates = readdirSync(extDir)
      .filter((d) => d.startsWith("anthropic.claude-code-"))
      .sort();
    const latest = candidates[candidates.length - 1];
    if (latest) {
      cachedBinary = path.join(extDir, latest, "resources", "native-binary", "claude");
      return cachedBinary;
    }
  } catch {
    // fall through
  }
  cachedBinary = "claude"; // hope it's on PATH; execFile will error clearly if not
  return cachedBinary;
}

export function cliBridgeAvailable(): boolean {
  return !env.ANTHROPIC_API_KEY;
}

/** Run one prompt through the CLI; returns the final text and usage. */
export async function runClaudeCli(
  prompt: string,
): Promise<{ text: string; usage: unknown }> {
  const binary = findClaudeCli();
  if (!binary) {
    throw new Error(
      "No ANTHROPIC_API_KEY set and the claude CLI was not found. " +
        "Add ANTHROPIC_API_KEY to .env (console.anthropic.com).",
    );
  }
  const { stdout } = await execFileAsync(
    binary,
    ["-p", prompt, "--output-format", "json", "--max-turns", "1"],
    { timeout: 240_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const parsed = resultSchema.parse(JSON.parse(stdout));
  if (parsed.is_error || parsed.result === undefined) {
    throw new Error("Claude CLI bridge returned an error response");
  }
  return { text: parsed.result, usage: parsed.usage ?? null };
}
