import { test, expect } from "@playwright/test";
test("expanded catalogue groups, variable syllables, favorites and mobile layout", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(30);
  await expect(page.locator(".exercise-group")).toHaveCount(5);
  await page.getByRole("button", { name: "Чёткость", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(5);
  await page
    .getByRole("button", { name: "В избранное: Пять гласных", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть: Пять гласных", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Пять гласных." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Пять гласных." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page
    .getByRole("button", { name: "Избранное · 1", exact: true })
    .click();
  await expect(page.locator(".exercise-tile")).toHaveCount(1);
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await page.getByRole("button", { name: "Высота", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("catalogue-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".exercise-miniature rect")
      .evaluateAll((rects) =>
        rects.every(
          (r) =>
            +r.getAttribute("y") >= 0 &&
            +r.getAttribute("y") + +r.getAttribute("height") <= 64,
        ),
      ),
  ).toBe(true);
});

// Existing regression scenarios explicitly exercise the Russian locale.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("lunavoice.locale.v1", "ru"),
  );
});
