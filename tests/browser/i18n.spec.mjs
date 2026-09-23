import { chooseOption } from "./helpers.mjs";
import { test, expect } from "@playwright/test";
import { mockMicrophone } from "./helpers.mjs";
const language = (page) =>
  page.getByRole("combobox", { name: "Language / Мова / Язык" });
test("English default, Ukrainian and Russian persist; filters and account forms keep working", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "The ladder." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(30);
  await page.getByRole("button", { name: "Clarity", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(5);
  await chooseOption(
    page.getByRole("combobox", { name: "Goal", exact: true }),
    { label: "Stability" },
  );
  await expect(page.locator(".exercise-tile")).toHaveCount(1);
  await chooseOption(language(page), "uk");
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.locator(".exercise-tile")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Повтор ноти" }),
  ).toBeVisible();
  await chooseOption(
    page.getByRole("combobox", { name: "Ціль", exact: true }),
    { label: "Усі цілі" },
  );
  await page
    .getByRole("button", { name: "В обране: П’ять голосних", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Відкрити: П’ять голосних", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "П’ять голосних." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "П’ять голосних." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Бібліотека", exact: true }).click();
  await page.getByRole("button", { name: "Обране · 1", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(1);
  await chooseOption(language(page), "en");
  await expect(
    page.getByRole("heading", { name: "Five vowels" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  const signInButton = page
    .locator(".account-auth")
    .getByRole("button", { name: "Sign in", exact: true });
  const googleButton = page.getByRole("button", {
    name: "Continue with Google",
    exact: true,
  });
  expect(
    await signInButton.evaluate(
      (button, google) =>
        Boolean(button.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING),
      await googleButton.elementHandle(),
    ),
  ).toBe(true);
  const authCard = await page.locator(".account-auth").boundingBox();
  const content = await page.locator("main").boundingBox();
  expect(Math.abs(authCard.x + authCard.width / 2 - (content.x + content.width / 2))).toBeLessThanOrEqual(1);
  await chooseOption(language(page), "uk");
  await expect(
    page.getByLabel("Електронна пошта", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("account-uk-mobile.png"),
    fullPage: true,
  });
  await chooseOption(language(page), "ru");
  await expect(
    page.getByRole("heading", { name: "Практика с вами" }),
  ).toBeVisible();
  await page.reload();
  await expect(language(page)).toHaveAttribute("data-value", "ru");
});
test("switching language keeps the microphone session and setup state", async ({
  page,
}) => {
  await mockMicrophone(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Audio settings", exact: true })
    .click();
  await chooseOption(page.getByLabel("Listening through"), "wired");
  await page
    .getByRole("button", { name: "Check microphone", exact: true })
    .click();
  await expect(page.getByText("✓ Microphone is ready")).toBeVisible();
  // The setup modal covers the header. A storage event models a language change in another tab.
  await page.evaluate(() => {
    localStorage.setItem("lunavoice.locale.v1", "uk");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "lunavoice.locale.v1",
        newValue: "uk",
      }),
    );
  });
  await expect(page.getByText("✓ Мікрофон готовий до практики")).toBeVisible();
  expect(await page.evaluate(() => window.audioTest.requests)).toBe(1);
  expect(await page.evaluate(() => window.audioTest.stops)).toBe(0);
  await page
    .getByRole("button", { name: "Почати практику", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
});
test("invalid or blocked locale storage falls back to English", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("lunavoice.locale.v1", "xx");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "lunavoice.locale.v1")
        throw new DOMException("Blocked", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(language(page)).toHaveAttribute("data-value", "en");
  await chooseOption(language(page), "uk");
  await expect(page.getByRole("heading", { name: "Драбинка." })).toBeVisible();
});
