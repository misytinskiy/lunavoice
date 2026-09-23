import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { authMessage, completeAuthRedirect } = loadTs("app/lib/cloud/auth.ts");
test("auth errors are actionable and do not echo remote error descriptions", () => {
  assert.match(authMessage({ code: "invalid_credentials" }), /Забыли пароль/);
  assert.match(
    authMessage({ code: "email_not_confirmed" }),
    /Подтвердите почту/,
  );
  assert.doesNotMatch(
    authMessage({ message: "private token or remote HTML" }),
    /private|HTML/,
  );
});
test("callback exchanges one-time code once, forwards flow ID, strips URL credentials and retains recovery", async () => {
  const savedWindow = globalThis.window,
    savedStorage = globalThis.sessionStorage;
  let calls = 0,
    cleaned = "";
  const values = new Map();
  globalThis.window = {
    location: {
      href: "https://voice.example/auth/callback?code=one-use&sb_flow_id=flow1&intent=recovery&next=https://evil.test",
    },
    history: {
      replaceState: (_a, _b, url) => {
        cleaned = url;
      },
    },
  };
  globalThis.sessionStorage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  try {
    const client = {
      auth: {
        exchangeCodeForSession: async (code, options) => {
          calls++;
          assert.equal(code, "one-use");
          assert.deepEqual(options, { flowId: "flow1" });
          return { data: { session: { user: { id: "user" } } }, error: null };
        },
      },
    };
    const first = completeAuthRedirect(client),
      second = completeAuthRedirect(client);
    assert.equal(first, second);
    assert.deepEqual(await first, {
      returned: true,
      recovery: true,
      error: "",
    });
    assert.equal(calls, 1);
    assert.equal(cleaned, "/auth/callback");
    assert.equal(values.get("lunavoice.password-recovery"), "1");
  } finally {
    globalThis.window = savedWindow;
    globalThis.sessionStorage = savedStorage;
  }
});
