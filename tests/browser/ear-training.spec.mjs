import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.earMicRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.earMicRequests++;
      throw new Error("Ear training must not request microphone");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ear training", exact: true }).click();
});

test("complete exactly 20 questions, replay, score once and review", async ({
  page,
}) => {
  test.setTimeout(90000);
  await expect(page.locator(".ear-card")).toHaveCount(8);
  await page.getByRole("button", { name: /01.*Pitch direction/ }).click();
  await page.getByRole("combobox", { name: "Tempo", exact: true }).press("End");
  await page
    .getByRole("combobox", { name: "Tempo", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "Start · 20 questions" }).click();
  let correct = 0;
  for (let i = 1; i <= 20; i++) {
    await expect(page.locator(".ear-quiz-top")).toContainText(
      `Question ${i} / 20`,
    );
    const answer = page.locator(".ear-answers button").first();
    await expect(answer).toBeEnabled();
    if (i === 1) {
      await page.getByRole("button", { name: /Listen again/ }).click();
      await expect(answer).toBeDisabled();
      await expect(answer).toBeEnabled();
    }
    await answer.evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(page.locator(".ear-feedback")).toBeVisible();
    if ((await answer.getAttribute("class")) === "is-correct") correct++;
    await expect(page.locator(".ear-quiz progress")).toHaveAttribute(
      "value",
      String(i),
    );
    await page
      .getByRole("button", { name: i === 20 ? /See results/ : /Next question/ })
      .click();
  }
  await expect(page.locator(".ear-results h2")).toHaveText(`${correct * 5}%`);
  await expect(page.locator(".ear-review > div")).toHaveCount(20);
  expect(await page.evaluate(() => window.earMicRequests)).toBe(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".ear-quiz progress")).toHaveAttribute(
    "value",
    "0",
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator(".ear-training")).toHaveCount(0);
});

test("selection validation, failed audio retry and mobile translations", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("ear-catalogue-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Chord colours/ }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start · 20 questions" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Major", exact: true }).check();
  await page.getByRole("checkbox", { name: "Minor", exact: true }).check();
  await page.route("**/audio/piano/**", (route) => route.abort());
  await page.getByRole("button", { name: "Start · 20 questions" }).click();
  await expect(page.locator(".ear-error")).toContainText("Could not play");
  await expect(page.locator(".ear-answers button").first()).toBeDisabled();
  await page.unroute("**/audio/piano/**");
  await page.getByRole("button", { name: "▷ Listen", exact: true }).click();
  await expect(page.locator(".ear-answers button").first()).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  const language = page.getByRole("combobox", {
    name: "Language / Мова / Язык",
  });
  await language.click();
  await expect(language).toHaveAttribute("aria-expanded", "true");
  await language.press("ArrowDown");
  await expect(page.locator('[role="option"][data-value="uk"]')).toHaveClass(
    /is-active/,
  );
  await language.press("Enter");
  await expect(page.locator(".ear-heading h1")).toHaveText("Барви акордів");
  await expect(page.locator(".ear-quiz-top")).toContainText("Запитання 1 / 20");
  await page.screenshot({
    path: info.outputPath("ear-question-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("every exercise can load and play its first question", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.screenshot({
    path: info.outputPath("ear-catalogue-desktop.png"),
    fullPage: true,
  });
  for (let index = 0; index < 8; index++) {
    await page.locator(".ear-card").nth(index).click();
    const tempo = page.getByRole("combobox", { name: "Tempo", exact: true });
    await tempo.press("End");
    await tempo.press("Enter");
    await page.getByRole("button", { name: "Start · 20 questions" }).click();
    await expect(page.locator(".ear-answers button").first()).toBeEnabled({
      timeout: 20000,
    });
    await expect(page.locator(".ear-error")).toHaveCount(0);
    await page.getByRole("button", { name: /Back to exercises/ }).click();
  }
});
