import type { SupabaseClient } from "@supabase/supabase-js";
export const RECOVERY_KEY = "lunavoice.password-recovery";
export function authRedirect(intent?: "recovery") {
  return `${window.location.origin}/auth/callback${intent ? "?intent=recovery" : ""}`;
}
export function recoveryPending() {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === "1";
  } catch {
    return false;
  }
}
export function setRecovery(value: boolean) {
  try {
    if (value) sessionStorage.setItem(RECOVERY_KEY, "1");
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* current page state still works */
  }
}
export function authMessage(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "invalid_credentials":
      return "Неверная почта или пароль. Если раньше вы входили по коду, нажмите «Забыли пароль?» и задайте пароль.";
    case "email_not_confirmed":
      return "Подтвердите почту по ссылке из письма. Ниже можно отправить письмо повторно.";
    case "weak_password":
      return "Пароль слишком простой. Используйте минимум 8 символов, буквы и цифры.";
    case "user_already_exists":
    case "email_exists":
      return "Аккаунт с этой почтой уже есть. Войдите или восстановите пароль.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Слишком много попыток. Подождите минуту и попробуйте снова.";
    case "same_password":
      return "Новый пароль должен отличаться от предыдущего.";
    default:
      return "Не удалось выполнить действие. Проверьте подключение и попробуйте снова.";
  }
}
let callback:
  | Promise<{ returned: boolean; recovery: boolean; error: string }>
  | undefined;
/** One code exchange per page, including React Strict Mode's repeated effects. */
export function completeAuthRedirect(client: SupabaseClient) {
  if (callback) return callback;
  callback = (async () => {
    const url = new URL(window.location.href),
      hash = new URLSearchParams(url.hash.slice(1));
    const code = url.searchParams.get("code"),
      tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") ?? hash.get("type");
    const flowId = url.searchParams.get("sb_flow_id");
    const returned = !!(
      code ||
      tokenHash ||
      hash.get("access_token") ||
      url.searchParams.get("error") ||
      hash.get("error") ||
      url.pathname === "/auth/callback" ||
      url.searchParams.get("account")
    );
    let recovery = recoveryPending();
    if (!returned) return { returned, recovery, error: "" };
    // Remove credentials and provider error descriptions before rendering anything.
    window.history.replaceState(null, "", url.pathname);
    try {
      if (url.searchParams.has("error") || hash.has("error"))
        throw new Error("cancelled");
      if (code) {
        const { data, error } = await client.auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined,
        );
        if (error || !data.session) throw new Error("expired");
        recovery =
          ("redirectType" in data && data.redirectType === "recovery") ||
          url.searchParams.get("intent") === "recovery";
      } else if (tokenHash) {
        if (!["signup", "email", "recovery", "magiclink"].includes(type ?? ""))
          throw new Error("invalid");
        const { data, error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "signup" | "email" | "recovery" | "magiclink",
        });
        if (error || !data.session) throw new Error("expired");
        recovery = type === "recovery";
      } else if (hash.has("access_token") && hash.has("refresh_token")) {
        const { error } = await client.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        if (error) throw new Error("expired");
        recovery = type === "recovery";
      } else if (url.pathname === "/auth/callback") throw new Error("empty");
      setRecovery(recovery);
      return { returned, recovery, error: "" };
    } catch {
      return {
        returned,
        recovery: false,
        error:
          "Ссылка недействительна, уже использована или вход отменён. Запросите новое письмо либо повторите вход через Google. Ссылку с кодом возврата откройте в том же браузере, где начали вход.",
      };
    }
  })();
  return callback;
}
