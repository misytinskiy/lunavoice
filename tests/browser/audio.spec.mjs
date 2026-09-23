import { chooseOption } from "./helpers.mjs";
import { test, expect } from "@playwright/test";

import { mockMicrophone } from "./helpers.mjs";

async function prepare(page) {
  await page.getByRole("button", { name: "Настроить звук" }).click();
  await chooseOption(page.getByLabel("Слушаю через"), "wired");
  await page
    .getByRole("button", { name: "Проверить микрофон", exact: true })
    .click();
}

test("mobile setup, live voice, pause, resume and reset release input", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockMicrophone(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Лесенка." })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await prepare(page);
  await expect(page.getByText("✓ Микрофон готов к практике")).toBeVisible();
  await expect(page.getByRole("meter")).toHaveAttribute(
    "aria-valuenow",
    /-\d+/,
  );
  await page.screenshot({
    path: testInfo.outputPath("microphone-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Начать практику" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Небольшая пауза" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Продолжить", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить упражнение" }).click();
  await expect.poll(() => page.evaluate(() => window.audioTest.stops)).toBe(1);
  expect(errors).toEqual([]);
});

test("denied permission is actionable; closing preparation leaves usable controls", async ({
  page,
}) => {
  await mockMicrophone(page, "denied");
  await page.goto("/");
  await prepare(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Разрешите микрофон",
  );
  await page
    .getByRole("button", { name: "Закрыть проверку микрофона" })
    .click();
  await expect(
    page.getByRole("button", { name: "Начать упражнение", exact: true }),
  ).toBeEnabled();
});

test("cancelled permission stops a stream that arrives afterwards", async ({
  page,
}) => {
  await mockMicrophone(page, "pending");
  await page.goto("/");
  await prepare(page);
  await expect
    .poll(() => page.evaluate(() => !!window.audioTest.resolvePermission))
    .toBe(true);
  await page.getByRole("button", { name: "Отменить подготовку" }).click();
  await page.evaluate(() => window.audioTest.resolvePermission());
  await expect.poll(() => page.evaluate(() => window.audioTest.stops)).toBe(1);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Начать упражнение", exact: true }),
  ).toBeEnabled();
});

test("silence cannot pass mic check and noise calibration does not invent a voice", async ({
  page,
}) => {
  await mockMicrophone(page, "silence");
  await page.goto("/");
  await prepare(page);
  await expect(
    page.getByRole("button", { name: "Начать практику" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Настроить по тишине · 2 сек" })
    .click();
  await expect(
    page.getByText("Чувствительность настроена.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Начать практику" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Закрыть проверку микрофона" })
    .click();
  await expect.poll(() => page.evaluate(() => window.audioTest.stops)).toBe(1);
});

test("full wired exercise produces a numeric result and stops microphone", async ({
  page,
}, testInfo) => {
  await mockMicrophone(page);
  await page.goto("/");
  await prepare(page);
  await expect(page.getByText("✓ Микрофон готов к практике")).toBeVisible();
  await page.getByRole("button", { name: "Начать практику" }).click();
  await expect(
    page.getByText("УПРАЖНЕНИЕ ЗАВЕРШЕНО", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".result-score")).toContainText("%");
  await expect.poll(() => page.evaluate(() => window.audioTest.stops)).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("result-desktop.png"),
    fullPage: true,
  });
  await expect(page.locator(".note-result")).toHaveCount(9);
  await page
    .getByRole("button", { name: "Повторить ноту 5", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("УПРАЖНЕНИЕ ЗАВЕРШЕНО", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-result")).toHaveCount(1);
  await expect(page.locator(".note-order")).toHaveText("05");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("fragment-320.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Повторить целиком", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Сбросить упражнение" }).click();
  await expect(page.getByLabel("Завершено 0 из 9 нот")).toBeVisible();
});

test("320px, landscape and enlarged text fit; keyboard adjusts tempo and closes setup", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  for (const size of [
    { width: 320, height: 740 },
    { width: 740, height: 320 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 740 });

  const tempo = page.getByLabel("Темп упражнения");
  await tempo.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tempo).toHaveValue("80");
  await page.getByRole("button", { name: "Настроить звук" }).click();
  expect(
    await page
      .locator("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll("dialog, dialog *")];
    const sizes = elements.map((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    elements.forEach((el, i) => (el.style.fontSize = `${sizes[i] * 2}px`));
  });
  expect(
    await page
      .locator("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("setup-320.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});


test("Play remembers first setup across reloads and returns to setup on mic disconnect", async ({
  page,
}) => {
  await mockMicrophone(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Начать упражнение", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Начать практику" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Начать практику" }).click();
  await page.getByRole("button", { name: "Сбросить упражнение" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Начать упражнение", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() =>
    window.audioTest.track.dispatchEvent(new Event("ended")),
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Микрофон отключён",
  );
  await page
    .getByRole("button", { name: "Проверить микрофон", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Начать практику" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Начать практику" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Сбросить упражнение" }).click();
});

test("library filters, favorites, recents and data-driven selection work at 320px", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(30);
  await page.screenshot({
    path: testInfo.outputPath("library-desktop.png"),
    fullPage: true,
  });
  await chooseOption(
    page.getByRole("combobox", { name: "Цель", exact: true }),
    "Устойчивость",
  );
  await expect(page.locator(".exercise-tile")).toHaveCount(2);
  await chooseOption(
    page.getByRole("combobox", { name: "Длительность", exact: true }),
    "До 15 секунд",
  );
  await expect(page.locator(".exercise-tile")).toHaveCount(2);
  await page
    .getByRole("button", { name: "В избранное: Повтор ноты", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page
    .getByRole("button", { name: "Избранное · 1", exact: true })
    .click();
  await expect(page.locator(".exercise-tile")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Открыть: Повтор ноты", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Повтор ноты.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Завершено 0 из 6 нот")).toBeVisible();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page.getByRole("button", { name: "Недавние", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(1);
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("library-320.png"),
    fullPage: true,
  });
  for (const title of [
    "Вниз по ступеням",
    "Маленькая мелодия",
    "Через ступень",
  ]) {
    await page
      .getByRole("button", { name: `Открыть: ${title}`, exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  }
});

test("three-exercise session releases microphone during rests and finishes with a weighted result", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await mockMicrophone(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  await chooseOption(page.getByLabel("Слушаю через"), "wired");
  await page
    .getByRole("button", { name: "Проверить микрофон", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Начать практику" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Начать практику" }).click();
  for (let index = 0; index < 2; index++) {
    await expect(
      page.getByRole("heading", { name: "Небольшой отдых", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: /Отдых ·/ })).toBeDisabled();
    await expect
      .poll(() => page.evaluate(() => window.audioTest.stops))
      .toBeGreaterThanOrEqual(index + 1);
    await page
      .getByRole("button", { name: "Следующее упражнение", exact: true })
      .click({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: "Пауза", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Занятие завершено", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".session-finished > strong")).toContainText("%");
  await expect(page.locator(".session-finished li")).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath("session-result.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "В библиотеку", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(30);
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(3);
  await page.getByRole("button", { name: "Занятия", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  await expect(page.locator(".history-attempt small")).toContainText(
    "Завершено",
  );
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await page.getByRole("button", { name: "Занятия", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  await page.locator(".history-attempt summary").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Удалить занятие", exact: true })
    .click();
  await expect(page.locator(".history-attempt")).toHaveCount(0);
  await page.getByRole("button", { name: "Упражнения", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(0);
  await expect(
    page.getByText("История сохранена в этом браузере.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(0);
  await page.getByRole("button", { name: "Занятия", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(0);
});

// Existing regression scenarios explicitly exercise the Russian locale.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("lunavoice.locale.v1", "ru"),
  );
});
