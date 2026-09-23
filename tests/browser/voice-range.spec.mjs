import { test, expect } from "@playwright/test";
import { mockMicrophone } from "./helpers.mjs";

test("comfortable endpoints fit a series and survive reload on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() =>
    localStorage.setItem("lunavoice.locale.v1", "ru"),
  );
  await mockMicrophone(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть: Вниз по ступеням", exact: true })
    .click();
  await expect(page.getByLabel("Формат упражнения")).toHaveCount(0);
  await page.getByRole("button", { name: "Настроить звук" }).click();
  await expect(
    page.getByRole("button", { name: /Измерить нижнюю/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Закрыть проверку микрофона" })
    .click();
  await page
    .getByRole("button", { name: "Вокальный диапазон", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Включить микрофон", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Измерить нижнюю/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Измерить нижнюю/ }).click();
  const confirm = page.getByRole("button", { name: "Эту ноту петь комфортно" });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await page.evaluate(() => window.audioTest.setFrequency(440));
  await page.getByRole("button", { name: /Измерить верхнюю/ }).click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await page.getByRole("button", { name: "Применить к упражнению" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("lunavoice.voice-range.v1-guest")),
      ),
    )
    .toEqual({ low: 57, high: 69 });
  await page
    .getByRole("button", { name: "Закрыть измерение диапазона" })
    .click();
  await expect(page.locator(".range-buttons strong")).toHaveText("A#3 – G#4");
  await page.reload();
  await expect(page.locator(".range-buttons strong")).toHaveText("A#3 – G#4");
  await expect(page.locator(".series-status")).toHaveCount(0);
  await expect(page.getByLabel("Количество проходов")).toHaveAttribute(
    "data-value",
    "4",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("range-series-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
