import { test, expect } from "@playwright/test";

test("manual loads directly in standards mode without module errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/manual/index.html");
  await expect(
    page.getByRole("heading", { name: "User manual", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
  expect(errors).toEqual([]);
});
