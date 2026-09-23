import { chooseOption } from "./helpers.mjs";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockMicrophone } from "./helpers.mjs";
async function records(page, store = "attempts") {
  return page.evaluate(
    (store) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("lunavoice-history");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(store, "readonly"),
            data = tx.objectStore(store).getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(data.result);
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    store,
  );
}
async function selectPulse(page) {
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть: Повтор ноты", exact: true })
    .click();
}
async function firstStart(page) {
  await page
    .getByRole("button", { name: "Настроить звук", exact: true })
    .click();
  await chooseOption(page.getByLabel("Слушаю через"), "wired");
  await page
    .getByRole("button", { name: "Проверить микрофон", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Начать практику" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Начать практику" }).click();
}
test("real attempt persists once, exports detailed results, deletes durably and separates interruptions", async ({
  page,
}, testInfo) => {
  await mockMicrophone(page);
  await page.goto("/");
  await selectPulse(page);
  await firstStart(page);
  await expect(
    page.getByText("УПРАЖНЕНИЕ ЗАВЕРШЕНО", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect
    .poll(
      async () =>
        (await records(page)).filter((r) => r.status === "completed").length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  await page.locator(".history-attempt summary").click();
  await expect(page.locator(".history-notes li")).toHaveCount(6);
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать JSON" }).click();
  const download = await downloadPromise,
    payload = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(payload.attempts).toHaveLength(1);
  expect(payload.attempts[0].result.notes).toHaveLength(6);
  expect(payload.attempts[0].scoreVersion).toBe("pitch-time-v2");
  expect(payload.attempts[0]).not.toHaveProperty("history");
  expect(payload.attempts[0]).not.toHaveProperty("stream");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("progress-320.png"),
    fullPage: true,
  });
  await page.locator(".history-attempt summary").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Удалить попытку", exact: true })
    .click();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await page.getByRole("button", { name: "Практика", exact: true }).click();
  await page
    .getByRole("button", { name: "Начать упражнение", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect
    .poll(async () => (await records(page))[0]?.status)
    .toBe("interrupted");
  await expect(
    page.locator(".progress-summary > div").first().locator("strong"),
  ).toHaveText("0");
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  await expect(page.locator(".attempt-score")).toHaveText("Прервано");
});
test("practice settings and daily goal survive reload; clear history preserves preferences", async ({
  page,
}) => {
  await page.goto("/");
  await selectPulse(page);
  await page.getByLabel("Темп упражнения").focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Диапазон на полтона выше" }).click();
  await page.getByLabel("Громкость фортепиано").focus();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await chooseOption(page.getByLabel("Ежедневная цель", { exact: true }), "1");
  await page.getByLabel("Напоминать внутри приложения").uncheck();
  await expect(
    page.getByText("История сохранена в этом браузере.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Повтор ноты.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Темп упражнения")).toHaveValue("80");
  await expect(page.getByLabel("Громкость фортепиано")).toHaveValue("100");
  await expect(page.locator(".range-buttons strong")).toHaveText("C#3");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(
    page.getByLabel("Ежедневная цель", { exact: true }),
  ).toHaveAttribute("data-value", "1");
  await expect(
    page.getByLabel("Напоминать внутри приложения"),
  ).not.toBeChecked();
});
test("version-1 database migrates without losing results; comparison excludes different settings and deletion syncs tabs", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/_not-found");
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("lunavoice-history", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("attempts", { keyPath: "id" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("attempts", "readwrite"),
            store = tx.objectStore("attempts");
          [50, 90, 75].forEach((score, i) => {
            const startedAt = new Date(
              Date.now() - (3 - i) * 60000,
            ).toISOString();
            store.put({
              recordVersion: 1,
              id: `seed-${i}`,
              startedAt,
              endedAt: startedAt,
              status: "completed",
              title: "Лесенка",
              practice: {
                exerciseId: "ladder",
                exerciseVersion: 1,
                baseMidi: 48,
                bpm: i === 1 ? 90 : 75,
                fragment: null,
              },
              scoreVersion: "pitch-time-v2",
              score,
              result: {
                version: "pitch-time-v2",
                percent: score,
                targetSeconds: 10,
                matchedSeconds: score / 10,
                observedSeconds: 10,
                voicedSeconds: 10,
                voicedPercent: 100,
                aboveSeconds: 0,
                belowSeconds: 0,
                notes: [],
              },
              reason: "",
              audio: {
                deviceId: "seed",
                outputMode: "wired",
                thresholdDb: -42,
                correctionMs: 0,
              },
              sessionId: null,
            });
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(3);
  await expect(page.locator(".comparison-score strong")).toHaveText("75%");
  await expect(page.locator(".comparison-score span")).toContainText("+25");
  await expect(
    page.getByRole("img", {
      name: "Точность по порядку: 50%, 75%",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("progress-desktop.png"),
    fullPage: true,
  });
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(second.locator(".history-attempt")).toHaveCount(3);
  await chooseOption(page.getByLabel("Ежедневная цель", { exact: true }), "3");
  await expect(
    page.getByText("История сохранена в этом браузере.", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Удалить историю", exact: true })
    .click();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await expect(second.locator(".history-attempt")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(0);
  await expect(
    page.getByLabel("Ежедневная цель", { exact: true }),
  ).toHaveAttribute("data-value", "3");
});
test("denied IndexedDB keeps practice usable and retries unsaved changes", async ({
  page,
}) => {
  await mockMicrophone(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("history-test-allowed")) return;
    const factory = window.indexedDB;
    window.restoreHistoryStorage = () => {
      sessionStorage.setItem("history-test-allowed", "1");
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: factory,
      });
    };
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get: () => {
        throw new DOMException("Denied", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".storage-notice")).toContainText(
    "только в этой вкладке",
  );
  await firstStart(page);
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  await page.evaluate(() => window.restoreHistoryStorage());
  await page
    .getByRole("button", { name: "Повторить сохранение", exact: true })
    .click();
  await expect(page.locator(".storage-notice")).not.toBeVisible();
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
});

test("quota failure retries the same attempt without duplicate records", async ({
  page,
}) => {
  await mockMicrophone(page);
  await page.addInitScript(() => {
    window.allowHistoryWrite = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "attempts" && !window.allowHistoryWrite)
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.goto("/");
  await firstStart(page);
  await expect(page.locator(".storage-notice")).toContainText(
    "только в этой вкладке",
  );
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  expect(await records(page)).toHaveLength(0);
  await page.evaluate(() => (window.allowHistoryWrite = true));
  await page
    .getByRole("button", { name: "Повторить сохранение", exact: true })
    .click();
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await expect(page.locator(".storage-notice")).not.toBeVisible();
  await page.getByRole("button", { name: "Практика", exact: true }).click();
  await page
    .getByRole("button", { name: "Начать упражнение", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await records(page)).length).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(2);
  expect(
    (await records(page)).every((record) => record.status !== "completed"),
  ).toBe(true);
  await expect(
    page.locator(".progress-summary > div").first().locator("strong"),
  ).toHaveText("0");
});

// Existing regression scenarios explicitly exercise the Russian locale.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("lunavoice.locale.v1", "ru"),
  );
});
