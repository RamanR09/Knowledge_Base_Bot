import { expect, test } from "@playwright/test";

test.describe("authentication", () => {
  test("rejects a bad password with an inline error and stays on the login form", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).first().fill(`nobody-${Date.now()}@example.com`);
    await page.getByLabel(/^password/i).first().fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();

    await expect(
      page.getByText(/invalid|incorrect|wrong|failed|not found/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).pathname).toContain("/login");
  });

  test("redirects an unauthenticated visit to a protected route to /login", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toContain("/login");
  });
});
