import { test, expect } from "@playwright/test";

test("Feedback links to GitHub Discussions in both workspaces", async ({ page }) => {
  await page.goto("/");
  const feedback = page.getByRole("link", { name: "Feedback", exact: true });
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveAttribute("href", "https://github.com/wieli99/Leather-Pattern-Studio/discussions");
  await expect(feedback).toHaveAttribute("target", "_blank");
  await expect(feedback).toHaveAttribute("rel", "noopener noreferrer");
  await feedback.focus();
  await expect(feedback).toBeFocused();
  await page.getByRole("button", { name: "Create print layout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(feedback).toBeVisible();
});
