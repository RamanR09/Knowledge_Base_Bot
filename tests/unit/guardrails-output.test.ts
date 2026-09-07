import { describe, expect, it } from "vitest";
import { checkOutput } from "@/lib/guardrails/output";

/** A substantive-looking answer comfortably above the 400-char threshold. */
const LONG_ANSWER =
  "The deployment pipeline promotes builds from staging to production after the " +
  "Release Captain approves the release. Health checks run for five minutes and " +
  "the system rolls back automatically if the error rate rises above the " +
  "configured threshold. Rollbacks can also be triggered manually within the " +
  "thirty-minute window; after that a forward fix is required. Deploy freezes " +
  "apply during the last two business days of every fiscal quarter and any " +
  "exception has to be approved by the VP of Engineering before the deploy runs.";

describe("checkOutput", () => {
  it("flags a long substantive answer with zero citations as uncited", () => {
    expect(LONG_ANSWER.length).toBeGreaterThan(400);
    const verdict = checkOutput(LONG_ANSWER, 0);
    expect(verdict.uncited).toBe(true);
    expect(verdict.secretLeak).toBe(false);
  });

  it("does not flag a long answer that carries citations", () => {
    expect(checkOutput(LONG_ANSWER, 3).uncited).toBe(false);
  });

  it("does not flag short answers without citations", () => {
    expect(checkOutput("The rollback window is 30 minutes.", 0).uncited).toBe(false);
  });

  it("does not flag an answer of exactly the threshold length (boundary)", () => {
    const exactly400 = "a".repeat(400);
    expect(checkOutput(exactly400, 0).uncited).toBe(false);
    expect(checkOutput(`${exactly400}b`, 0).uncited).toBe(true);
  });

  it("does not flag honest not-found phrasings even when long and uncited", () => {
    const padding = " Related material covers deploys, billing and onboarding.".repeat(10);
    for (const phrase of [
      "I couldn't find this in the knowledge base.",
      "I could not find anything about that topic.",
      "That topic is not in the knowledge base.",
      "There is no relevant information in the sources provided.",
      "I don't have information about parental leave.",
    ]) {
      const answer = phrase + padding;
      expect(answer.length).toBeGreaterThan(400);
      expect(checkOutput(answer, 0).uncited).toBe(false);
    }
  });

  it("matches not-found phrasing case-insensitively", () => {
    const answer = `I COULDN'T FIND this in the knowledge base.${" More words here.".repeat(30)}`;
    expect(checkOutput(answer, 0).uncited).toBe(false);
  });

  it("flags secret-looking strings in the answer", () => {
    const verdict = checkOutput("Your key is AKIAIOSFODNN7EXAMPLE — keep it safe.", 2);
    expect(verdict.secretLeak).toBe(true);
    expect(verdict.uncited).toBe(false);
  });

  it("returns clean verdict for a short cited answer with no secrets", () => {
    expect(checkOutput("Invoices are issued net-30 on quarter close.", 1)).toEqual({
      secretLeak: false,
      uncited: false,
    });
  });
});
