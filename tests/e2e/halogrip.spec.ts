import { expect, test } from "@playwright/test";

test("root opens the standalone HALOGRIP case study", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/work\/halogrip$/);
  await expect(page.locator("main h1")).toHaveText("HALOGRIP");
});

test("HALOGRIP stays readable without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });

  await page.goto("/work/halogrip");
  await expect(page.locator(".scroll-intro-static")).toBeVisible();
  await expect(page.locator(".scroll-intro canvas")).toHaveCount(0);
  await expect(page.locator("main h1")).toHaveText("HALOGRIP");
});

test("HALOGRIP restores pinned DOM when motion preferences change", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Exercises the desktop WebGL scene.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/work/halogrip");
  await expect(page.locator(".scroll-intro-canvas.is-visible")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".pin-spacer .design-gap-sequence")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".scroll-intro-static")).toBeAttached();
  await expect(page.locator(".pin-spacer .design-gap-sequence")).toHaveCount(0);
  expect(errors).toEqual([]);
});
