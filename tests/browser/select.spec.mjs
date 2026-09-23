import { test, expect } from "@playwright/test";
import { chooseOption } from "./helpers.mjs";
test("Studio dropdown keyboard navigation, Escape, outside click and locale selection", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const language = page.getByRole("combobox", {
    name: "Language / Мова / Язык",
  });
  await expect(page.locator("select")).toHaveCount(0);
  await language.focus();
  await language.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await language.press("End");
  await language.press("Escape");
  await expect(language).toHaveAttribute("data-value", "en");
  await expect(language).toBeFocused();
  await language.press("ArrowDown");
  await language.press("ArrowDown");
  await language.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await language.click();
  await page.screenshot({
    path: info.outputPath("studio-dropdown-mobile.png"),
  });
  const bounds = await page.getByRole("listbox").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(740);
  await page.getByRole("heading", { name: "Драбинка." }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await chooseOption(language, "en");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const goal = page.getByRole("combobox", { name: "Goal", exact: true });
  await goal.focus();
  await goal.press("i");
  await goal.press("n");
  await goal.press("t");
  await goal.press("o");
  await goal.press("Enter");
  await expect(goal).toHaveAttribute("data-value", "Интонация");
  await goal.click();
  await goal.press("Tab");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
