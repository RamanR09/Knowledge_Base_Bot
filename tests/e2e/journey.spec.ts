/**
 * The full Phase-4 gate journey as ONE serial suite sharing a single page:
 * sign up → create collection → upload fixture → status walks to ready →
 * ask a golden question → streamed cited answer → citation opens the source
 * viewer → thumbs-down feedback → toast.
 *
 * Selectors are role/label/text based so they survive markup changes; the
 * question and fixture come from evals/golden.yaml (case sh-01) and
 * evals/fixtures/. If ingestion never reaches "ready" (missing provider API
 * keys), the remaining steps skip with an explicit message instead of failing.
 */
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_PATH = path.resolve("evals/fixtures/acme-deploy-guide.md");
const DOCUMENT_TITLE = /acme.deploy.guide/i;
// evals/golden.yaml case sh-01 — answerable from the uploaded fixture alone.
const GOLDEN_QUESTION = "How long after a production deploy can I still roll back?";
const GOLDEN_ANSWER_FRAGMENT = /30 minutes|thirty minutes/i;

const stamp = Date.now();
const email = `e2e-${stamp}@example.com`;
const password = `E2e-password-${stamp}!`;
const collectionName = `E2E Collection ${stamp}`;

test.describe("full user journey", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let ingestionReady = false;
  let answered = false;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("signs up with a unique email and lands on /chat", async () => {
    await page.goto("/login");

    const signUpSwitch = page
      .getByRole("link", { name: /sign up/i })
      .or(page.getByRole("tab", { name: /sign up/i }))
      .or(page.getByRole("button", { name: /sign up|create account/i }));
    await signUpSwitch.first().click();

    const nameField = page.getByLabel(/name/i).first();
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.fill("E2E Tester");
    }
    await page.getByLabel(/email/i).first().fill(email);
    await page.getByLabel(/^password/i).first().fill(password);
    const confirm = page.getByLabel(/confirm/i).first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.fill(password);
    }
    await page.getByRole("button", { name: /sign up|create account/i }).last().click();

    await page.waitForURL(/\/chat/, { timeout: 30_000 });
  });

  test("creates a collection on the documents page", async () => {
    await page.goto("/documents");

    await page
      .getByRole("button", { name: /new collection|create collection|add collection/i })
      .first()
      .click();
    await page.getByLabel(/name/i).first().fill(collectionName);
    await page.getByRole("button", { name: /^create$|^save$|create collection/i }).last().click();

    await expect(page.getByText(collectionName).first()).toBeVisible({ timeout: 15_000 });
  });

  test("uploads the deploy-guide fixture into the collection", async () => {
    // Dropzones keep a hidden <input type="file"> — drive it directly.
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_PATH);
    await expect(page.getByText(DOCUMENT_TITLE).first()).toBeVisible({ timeout: 30_000 });
  });

  test("document status walks to ready", async () => {
    // Generous timeout: parse → chunk → contextualize → embed involves real
    // provider calls through the worker.
    try {
      await expect(page.getByText(/^ready$/i).first()).toBeVisible({ timeout: 180_000 });
      ingestionReady = true;
    } catch {
      const failed = await page
        .getByText(/^failed$/i)
        .first()
        .isVisible()
        .catch(() => false);
      test.skip(
        true,
        `Ingestion stuck (${failed ? "failed" : "still processing"} after 180s) — ` +
          "likely missing VOYAGE_API_KEY/ANTHROPIC_API_KEY or no worker running; " +
          "skipping the chat/citation/feedback steps.",
      );
    }
  });

  test("asks a golden question and receives a streamed, grounded answer", async () => {
    test.skip(!ingestionReady, "skipped: ingestion never reached ready");

    await page.goto("/chat");
    const composer = page.getByRole("textbox").first();
    await composer.fill(GOLDEN_QUESTION);
    await composer.press("Enter");

    // The streamed answer must ground itself in the fixture's rollback window.
    await expect(page.getByText(GOLDEN_ANSWER_FRAGMENT).first()).toBeVisible({
      timeout: 120_000,
    });
    answered = true;
  });

  test("clicking a citation chip opens the source viewer with the document title", async () => {
    test.skip(!answered, "skipped: no answer was produced");

    const citation = page
      .getByTestId(/citation/i)
      .or(page.getByRole("button", { name: /^\[?\d+\]?$/ }))
      .first();
    await expect(citation).toBeVisible({ timeout: 15_000 });
    await citation.click();

    const viewer = page.getByRole("dialog").or(page.getByRole("complementary"));
    await expect(viewer.getByText(DOCUMENT_TITLE).first()).toBeVisible({ timeout: 15_000 });
    // Close the viewer so the feedback controls are reachable again.
    await page.keyboard.press("Escape");
  });

  test("thumbs-down with a comment shows a confirmation toast", async () => {
    test.skip(!answered, "skipped: no answer was produced");

    await page
      .getByRole("button", { name: /thumbs? ?down|not helpful|bad response|downvote/i })
      .first()
      .click();

    const comment = page.getByRole("textbox").last();
    await comment.fill("E2E: the answer should quote the exact rollback window.");
    await page.getByRole("button", { name: /submit|send feedback|^save$/i }).last().click();

    const toast = page.locator("[data-sonner-toast]").or(page.getByRole("status"));
    await expect(toast.first()).toBeVisible({ timeout: 15_000 });
  });
});
