import { test, expect } from "@playwright/test";

const TEST_EMAIL = "e2e-test@teammate.dev";

test("full collaborative flow", async ({ browser }) => {
  // 1. Sign in
  const page1 = await browser.newPage();
  await page1.goto("/sign-in");

  // Fill email and request magic link
  await page1.getByLabel("Email").fill(TEST_EMAIL);
  await page1.getByRole("button", { name: "Send sign-in link" }).click();

  // Wait for the "sent" state — the page shows a check + instruction
  await expect(page1.getByText("Check your email")).toBeVisible();

  // In a real E2E run the OTP email is intercepted and the code is extracted,
  // then the callback URL is visited to establish the session. Here we
  // simulate that by navigating directly to the auth callback with a
  // valid-looking code. The middleware + Supabase exchangeCodeForSession
  // call handles the actual session establishment.
  //
  // NOTE: When running against a real Supabase project, replace the
  // hardcoded code below with the OTP extracted from the email
  // (e.g. via a mailhog/mailcatcher API call).
  const testCode = "test-auth-code";
  await page1.goto(
    `/auth/callback?code=${testCode}&next=${encodeURIComponent("/")}`,
  );

  // 2. Create a board — the root layout shows the workspace switcher
  await page1.goto("/");
  await expect(page1.getByText("Teammate")).toBeVisible();

  // Open the workspace switcher and create a new workspace/board
  await page1.getByRole("button", { name: /workspace/i }).click();
  await page1.getByRole("button", { name: /create/i }).click();

  const boardName = `E2E Board ${Date.now()}`;
  await page1.getByLabel("Name").fill(boardName);
  await page1.getByLabel("Slug").fill(boardName.toLowerCase().replace(/\s+/g, "-"));

  // Submit the create form
  await page1.getByRole("button", { name: /create/i }).last().click();

  // Wait for the board to appear and capture its ID from the URL
  await page1.waitForURL(/\/board\//);
  const boardUrl = page1.url();
  const boardId = boardUrl.split("/board/")[1]?.split("?")[0];
  if (!boardId) throw new Error("Could not extract board ID from URL");

  // 3. Add a card — click "+ Add a card" in the first list
  await expect(page1.getByRole("button", { name: /add a card/i })).toBeVisible();
  await page1.getByRole("button", { name: /add a card/i }).first().click();

  const cardTitle = "My first card";
  await page1.getByPlaceholder("Card title").fill(cardTitle);
  await page1.getByRole("button", { name: /create/i }).click();

  // 4. Edit the card — click the card title to start editing
  await expect(page1.getByText(cardTitle)).toBeVisible();

  // Click on the card title to enter edit mode
  await page1.getByText(cardTitle).click();

  const newTitle = "Updated card title";
  // In edit mode the title becomes an input — clear and type new title
  const editInput = page1.getByRole("textbox").last();
  await editInput.clear();
  await editInput.fill(newTitle);

  // Save the edit (Enter or save button)
  await editInput.press("Enter");

  // 5. Open a second window and verify it sees the edit
  const page2 = await browser.newPage();
  await page2.goto(`/board/${boardId}`);

  // The second window should see the updated title via realtime sync
  await expect(page2.getByText(newTitle)).toBeVisible({ timeout: 10_000 });
});