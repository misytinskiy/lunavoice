import { chooseOption } from "./helpers.mjs";
import { test, expect } from "@playwright/test";
import { loadTs } from "../load-ts.mjs";
test.skip(
  process.env.LUNAVOICE_CLOUD_TESTS !== "1",
  "Требуется тестовая сборка Supabase и LUNAVOICE_CLOUD_TESTS=1; см. docs/SUPABASE.md",
);
const { attemptFromEvent } = loadTs("app/lib/history/model.ts");
const { normalizePractice, practiceNotes } = loadTs("app/lib/practice.ts");
const { PitchScore } = loadTs("app/lib/audio/analysis.ts");
const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const practice = normalizePractice({ exerciseId: "pulse" });
const attempt = attemptFromEvent(
  {
    type: "completed",
    id: "33333333-3333-4333-8333-333333333333",
    startedAt: new Date().toISOString(),
    snapshot: {
      practice,
      settings: {
        deviceId: "default",
        outputMode: "wired",
        thresholdDb: -42,
        correctionMs: 0,
      },
      score: 0,
      scoreReason: "",
      result: new PitchScore(practiceNotes(practice)).result(),
    },
  },
  null,
);
function session(email) {
  const id = email.startsWith("second") ? OTHER : UID;
  const now = Math.floor(Date.now() / 1000);
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp: now + 3600,
        iat: now,
        role: "authenticated",
        amr: [{ method: "password", timestamp: now }],
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
  return {
    access_token: token,
    refresh_token: "refresh-" + id,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
function backend() {
  const rows = new Map(),
    receipts = new Set();
  let googleEnabled = true;
  let unavailable = false,
    lostResponse = false;
  async function route(route) {
    const req = route.request(),
      url = new URL(req.url());
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "x-supabase-api-version": "2024-01-01",
          "access-control-expose-headers": "x-supabase-api-version",
        },
        body: JSON.stringify(data),
      });
    if (unavailable && url.pathname.startsWith("/rest/"))
      return route.abort("failed");
    if (url.pathname.endsWith("/settings"))
      return reply({ external: { google: googleEnabled, email: true } });
    if (url.pathname.endsWith("/signup"))
      return reply({
        user: session(req.postDataJSON().email).user,
        session: null,
      });
    if (url.pathname.endsWith("/recover") || url.pathname.endsWith("/resend"))
      return reply({});
    if (url.pathname.endsWith("/authorize")) {
      expect(url.searchParams.get("provider")).toBe("google");
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
      const target = new URL(url.searchParams.get("redirect_to"));
      expect(target.pathname).toBe("/auth/callback");
      target.searchParams.set("code", "google-code");
      return route.fulfill({
        status: 302,
        headers: { location: target.href },
        body: "",
      });
    }
    if (url.pathname.endsWith("/token")) {
      const body = req.postDataJSON();
      if (url.searchParams.get("grant_type") === "pkce") {
        expect(body.code_verifier.length).toBeGreaterThan(20);
        return reply(session("first@example.test"));
      }
      return body.password === "Correct123!"
        ? reply(session(body.email))
        : reply(
            { code: "invalid_credentials", msg: "Invalid login credentials" },
            400,
          );
    }
    if (url.pathname.endsWith("/verify")) {
      const body = req.postDataJSON();
      return body.token_hash === "valid-hash"
        ? reply(session("first@example.test"))
        : reply({ msg: "Expired link", code: "otp_expired" }, 403);
    }
    if (url.pathname.endsWith("/logout")) return reply({});
    const token = req.headers().authorization?.slice(7);
    let owner;
    try {
      owner = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ).sub;
    } catch {
      return reply({ message: "Unauthorized" }, 401);
    }
    const own = () => [...rows.values()].filter((r) => r.owner_id === owner);
    if (url.pathname.endsWith("/user"))
      return reply(
        session(owner === OTHER ? "second@example.test" : "first@example.test")
          .user,
      );
    if (url.pathname.endsWith("/voice_apply")) {
      const { operation_id, mutation: m } = req.postDataJSON();
      if (!receipts.has(owner + operation_id)) {
        receipts.add(owner + operation_id);
        const put = (kind, id, data, deleted = false) => {
          const key = `${owner}/${kind}/${id}`,
            old = rows.get(key);
          if (
            old?.deleted ||
            (!deleted &&
              ["attempt", "session"].includes(kind) &&
              old &&
              old.data.status !== "incomplete")
          )
            return;
          rows.set(key, {
            owner_id: owner,
            kind,
            id,
            data: deleted ? null : data,
            deleted,
          });
        };
        if (m.kind === "attempt" || m.kind === "session")
          put(m.kind, m.record.id, m.record);
        if (m.kind === "profile") put("profile", "name", m.name);
        if (m.kind === "favorite") put("favorite", m.id, m.enabled);
        if (m.kind === "preferences")
          for (const [key, value] of Object.entries(m.value)) {
            if (key === "tempos")
              for (const [id, bpm] of Object.entries(value))
                put("setting", "tempo:" + id, bpm);
            else put("setting", key, value);
          }
        if (m.kind === "deleteAttempt") put("attempt", m.id, null, true);
        if (m.kind === "clear")
          for (const row of own().filter((r) =>
            ["attempt", "session"].includes(r.kind),
          ))
            put(row.kind, row.id, null, true);
      }
      if (lostResponse) {
        lostResponse = false;
        return route.abort("failed");
      }
      return reply(null);
    }
    if (url.pathname.endsWith("/voice_delete_account")) {
      for (const [key, r] of rows) if (r.owner_id === owner) rows.delete(key);
      return reply(null);
    }
    if (url.pathname.endsWith("/voice_records"))
      return reply(
        own()
          .sort(
            (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
          )
          .map(({ kind, id, data, deleted }) => ({ kind, id, data, deleted })),
      );
    return reply({ message: "Unexpected request" }, 400);
  }
  return {
    route,
    googleEnabled: (value) => {
      googleEnabled = value;
    },
    rows,
    receipts,
    offline: (v) => {
      unavailable = v;
    },
    loseResponse: () => {
      lostResponse = true;
    },
  };
}
async function login(page, email = "first@example.test") {
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("Correct123!");
  await page.getByRole("button", { name: "Войти", exact: true }).last().click();
  await expect(
    page.getByRole("button", { name: "Аккаунт", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  await expect(
    page.getByText("Всё синхронизировано", { exact: true }),
  ).toBeVisible();
}
async function seedGuest(page) {
  await page.evaluate(async (record) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("lunavoice-history");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const t = db.transaction("attempts", "readwrite");
      t.objectStore("attempts").put(record);
      t.oncomplete = resolve;
      t.onerror = reject;
    });
    db.close();
    localStorage.setItem(
      "lunavoice.library.v1",
      JSON.stringify({ version: 1, favorites: ["pulse"], recent: [] }),
    );
  }, attempt);
}
// These tests run with the documented test URL in the build; every request is intercepted.
test("Password account separates guest data, imports once, syncs two devices and persists an offline queue", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const api = backend();
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  await page.goto("/");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await seedGuest(page);
  await login(page);
  expect(api.rows.size).toBe(0);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Перенести историю гостя" }).click();
  await expect
    .poll(
      () => [...api.rows.values()].filter((r) => r.kind === "attempt").length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Перенести историю гостя" }).click();
  await page.getByLabel("Как вас называть").fill("Виктор");
  await page.getByRole("button", { name: "Сохранить имя" }).click();
  await expect
    .poll(() => api.rows.get(`${UID}/profile/name`)?.data)
    .toBe("Виктор");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await chooseOption(page.getByLabel("Ежедневная цель"), "10");
  await expect
    .poll(() => api.rows.get(`${UID}/setting/goalMinutes`)?.data)
    .toBe(10);
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  const second = await browser.newContext();
  await second.addInitScript(() =>
    localStorage.setItem("lunavoice.locale.v1", "ru"),
  );
  const otherPage = await second.newPage();
  await otherPage.route("https://lunavoice-test.supabase.co/**", api.route);
  await otherPage.goto("/");
  await login(otherPage);
  await expect(otherPage.getByLabel("Как вас называть")).toHaveValue("Виктор");
  await otherPage
    .getByRole("button", { name: "Прогресс", exact: true })
    .click();
  await expect(otherPage.locator(".history-attempt")).toHaveCount(1);
  await expect(otherPage.getByLabel("Ежедневная цель")).toHaveAttribute(
    "data-value",
    "10",
  );
  await otherPage
    .getByRole("button", { name: "Библиотека", exact: true })
    .click();
  await expect(
    otherPage.getByRole("button", {
      name: "Убрать из избранного: Повтор ноты",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  api.offline(true);
  await page.getByLabel("Как вас называть").fill("Имя без сети");
  await page.getByRole("button", { name: "Сохранить имя" }).click();
  await expect(page.getByText(/Не удалось отправить изменения/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  await expect(page.getByLabel("Как вас называть")).toHaveValue("Имя без сети");
  api.offline(false);
  api.loseResponse();
  await page.getByRole("button", { name: "Повторить синхронизацию" }).click();
  await expect
    .poll(() => api.rows.get(`${UID}/profile/name`)?.data)
    .toBe("Имя без сети");
  await expect(
    page.getByRole("button", { name: "Повторить синхронизацию" }),
  ).toBeEnabled();
  const count = api.receipts.size;
  await page.getByRole("button", { name: "Повторить синхронизацию" }).click();
  await expect(
    page.getByText("Всё синхронизировано", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Повторить синхронизацию" }),
  ).toHaveCount(0);
  expect(api.receipts.size).toBe(count);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(
    page.getByRole("button", { name: "Войти", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
  await login(page, "second@example.test");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(0);
  await second.close();
});
test("invalid password recovers; account deletion requires password and preserves guest history", async ({
  page,
}, testInfo) => {
  const api = backend();
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  await page.goto("/");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await seedGuest(page);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByLabel("Электронная почта").fill("first@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("Wrong123!");
  await page.getByRole("button", { name: "Войти", exact: true }).last().click();
  await expect(page.locator(".account-feedback[role=alert]")).toContainText(
    "Неверная почта или пароль",
  );
  await page.getByLabel("Пароль", { exact: true }).fill("Correct123!");
  await page.getByRole("button", { name: "Войти", exact: true }).last().click();
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  await page.getByLabel("Как вас называть").fill("Удаляемый профиль");
  await page.getByRole("button", { name: "Сохранить имя" }).click();
  await expect.poll(() => api.rows.size).toBe(1);
  await expect(
    page.getByText("Всё синхронизировано", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("account-320.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Удалить аккаунт", exact: true })
    .click();
  await page.getByLabel("Введите УДАЛИТЬ").fill("УДАЛИТЬ");
  await page.getByLabel("Пароль", { exact: true }).fill("Correct123!");
  await page.getByRole("button", { name: "Подтвердить и удалить" }).click();
  await expect(
    page.getByRole("button", { name: "Войти", exact: true }),
  ).toBeVisible();
  expect(api.rows.size).toBe(0);
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".history-attempt")).toHaveCount(1);
});

test("signup and resend confirmation, valid email link signs in and removes tokens", async ({
  page,
}) => {
  const api = backend();
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  await page.goto("/?account=1");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await page.getByLabel("Электронная почта").fill("new@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("Correct123!");
  await page.getByLabel("Повторите пароль").fill("Correct123!");
  const request = page.waitForRequest((r) => r.url().includes("/signup"));
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  expect((await request).postDataJSON().password).toBe("Correct123!");
  await expect(
    page.getByText(/Проверьте почту: для нового аккаунта/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Отправить подтверждение ещё раз" })
    .click();
  await expect(page.getByText(/Если почта ещё не подтверждена/)).toBeVisible();
  await page.goto("/auth/callback?token_hash=valid-hash&type=signup");
  await expect(
    page.getByRole("heading", { name: "Ваш аккаунт." }),
  ).toBeVisible();
  expect(page.url()).not.toContain("token_hash");
});
test("password recovery link opens new-password form and survives reload", async ({
  page,
}) => {
  const api = backend();
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  await page.goto("/?account=1");
  await page.getByRole("button", { name: "Забыли пароль?" }).click();
  await page.getByLabel("Электронная почта").fill("first@example.test");
  await page
    .getByRole("button", { name: "Отправить ссылку", exact: true })
    .click();
  await expect(
    page.getByText(/Если аккаунт с этой почтой существует/),
  ).toBeVisible();
  await page.goto("/auth/callback?code=recovery-code&intent=recovery");
  await expect(
    page.getByRole("heading", { name: "Новый пароль", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Новый пароль", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Новый пароль", { exact: true }).fill("Changed123!");
  await page.getByLabel("Повторите пароль").fill("Different123!");
  await page.getByRole("button", { name: "Сохранить новый пароль" }).click();
  await expect(page.getByText("Пароли не совпадают.")).toBeVisible();
  await page.getByLabel("Повторите пароль").fill("Changed123!");
  const update = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith("/auth/v1/user"),
  );
  await page.getByRole("button", { name: "Сохранить новый пароль" }).click();
  expect((await update).postDataJSON().password).toBe("Changed123!");
  await expect(
    page.getByRole("heading", { name: "Профиль", exact: true }),
  ).toBeVisible();
});
test("Google uses PKCE and callback; cancelled and expired links remain actionable", async ({
  page,
}) => {
  const api = backend();
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  await page.goto("/?account=1");
  await page.getByRole("button", { name: "Продолжить с Google" }).click();
  await expect(
    page.getByRole("heading", { name: "Ваш аккаунт." }),
  ).toBeVisible();
  expect(page.url()).not.toContain("code=");
  await page.goto(
    "/auth/callback?error=access_denied&error_description=unsafe-text",
  );
  await expect(
    page.getByRole("heading", { name: "Не удалось войти" }),
  ).toBeVisible();
  await expect(page.getByText("unsafe-text")).toHaveCount(0);
  await page.goto("/auth/callback?token_hash=expired&type=signup");
  await expect(
    page.getByRole("link", { name: "Вернуться ко входу" }),
  ).toBeVisible();
});
test("legacy email confirmation returning to root establishes session from hash", async ({
  page,
}) => {
  const api = backend();
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  const data = session("first@example.test");
  await page.goto(
    "/#access_token=" +
      data.access_token +
      "&refresh_token=" +
      data.refresh_token +
      "&type=signup",
  );
  await expect(
    page.getByRole("heading", { name: "Ваш аккаунт." }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("disabled Google stays on the login form with a clear message", async ({
  page,
}) => {
  const api = backend();
  api.googleEnabled(false);
  await page.route("https://lunavoice-test.supabase.co/**", api.route);
  await page.goto("/?account=1");
  await page.getByRole("button", { name: "Продолжить с Google" }).click();
  await expect(
    page.getByText(
      "Вход через Google пока не включён. Сейчас можно войти по почте и паролю.",
    ),
  ).toBeVisible();
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3218");
  await expect(page.getByLabel("Пароль", { exact: true })).toBeVisible();
});

// Existing regression scenarios explicitly exercise the Russian locale.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("lunavoice.locale.v1", "ru"),
  );
});
