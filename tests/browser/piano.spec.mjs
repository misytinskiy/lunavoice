import { test, expect } from "@playwright/test";
test("preload blocks early keys, retries a failed sample and reuses sounds on return", async ({
  page,
}) => {
  let fail = true,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/audio/piano/**", async (route) => {
    requests++;
    if (route.request().url().endsWith("/C2.wav") && fail) {
      await gate;
      await route.fulfill({ status: 503, body: "Unavailable" });
    } else await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  const key = page.locator('.piano-key[aria-label="C2"]');
  await expect(page.locator(".piano-spinner")).toBeVisible();
  await expect(key).toBeDisabled();
  await page.keyboard.press("z");
  await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
  release();
  await expect(page.locator(".piano-loading")).toHaveAttribute(
    "role",
    "alert",
    { timeout: 30000 },
  );
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(key).toBeEnabled({ timeout: 30000 });
  const before = requests;
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  await expect(key).toBeEnabled();
  expect(requests).toBe(before);
});
test("piano plays with keyboard and pointer, changes scale, and releases on blur", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.pianoStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.pianoStarts++;
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  const key = page.locator('.piano-key[aria-label="C2"]');
  await expect(key).toBeEnabled({ timeout: 30000 });
  await page.keyboard.down("z");
  await expect(key).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.pianoStarts)).toBe(1);
  await page.keyboard.down("x");
  await expect(page.locator(".piano-key.pressed")).toHaveCount(2);
  await page.keyboard.up("z");
  await page.keyboard.up("x");
  await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
  const beforeTap = await page.evaluate(() => window.pianoStarts);
  await page.keyboard.press("z");
  await expect.poll(() => page.evaluate(() => window.pianoStarts)).toBe(beforeTap + 1);
  await key.hover();
  await page.mouse.down();
  await expect(key).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await page.getByRole("combobox", { name: "Tonic", exact: true }).click();
  await page.getByRole("option", { name: "D", exact: true }).click();
  await expect(key).toBeDisabled();
  await page.locator(".piano-page h1").click();
  await page.keyboard.down("z");
  await expect(page.locator('.piano-key[aria-label="C#2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
  await page.keyboard.up("z");
  await page.getByRole("button", { name: "Sustain", exact: false }).click();
  await page.keyboard.down("z");
  await page.waitForTimeout(300);
  await page.keyboard.up("z");
  const starts = await page.evaluate(() => window.pianoStarts);
  await page.keyboard.down("z");
  await expect
    .poll(() => page.evaluate(() => window.pianoStarts))
    .toBe(starts + 1);
  await page.keyboard.up("z");
  await expect(page.locator(".piano-page").getByRole("alert")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".piano-instrument")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "/private/tmp/lunavoice-piano-mobile.png",
    fullPage: true,
  });
});
