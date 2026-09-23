"use client";
import { t, localeTag } from "../lib/i18n";

import { useState } from "react";
import { requireGoogleProvider } from "../lib/cloud/client";
import { authRedirect, authMessage } from "../lib/cloud/auth";
import type { Account } from "../hooks/use-account";
import type { HistoryStore } from "../lib/history/store";
import type { SyncState } from "../lib/cloud/sync";
export function AccountView({
  account,
  store,
  sync,
}: {
  account: Account;
  store: HistoryStore;
  sync: SyncState & {
    retry: () => void;
    stop: () => void;
  };
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const signedIn = !!account.session;
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось выполнить действие. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }
  const googleOnly =
    signedIn &&
    account.session!.user.app_metadata.providers?.includes("google") &&
    !account.session!.user.app_metadata.providers?.includes("email");
  async function google() {
    await requireGoogleProvider();
    const { error } = await account.client!.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirect(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error)
      throw new Error(
        "Не удалось открыть Google. Повторите вход или используйте почту и пароль.",
      );
  }
  async function submit() {
    const client = account.client!;
    if (deleting) {
      if (confirmation !== t("УДАЛИТЬ"))
        throw new Error("Для подтверждения введите УДАЛИТЬ.");
      let session = account.session;
      if (!googleOnly) {
        const { data, error } = await client.auth.signInWithPassword({
          email: account.session!.user.email!,
          password,
        });
        if (error) throw new Error(authMessage(error));
        session = data.session;
      }
      if (!session || session.user.id !== store.owner)
        throw new Error(
          "Аккаунт изменился. Повторите действие из его настроек.",
        );
      const { error } = await client
        .rpc("voice_delete_account")
        .setHeader("Authorization", `Bearer ${session.access_token}`);
      if (error)
        throw new Error(
          "Удаление не выполнено. Войдите заново и повторите. Если ошибка повторяется, попробуйте позже.",
        );
      try {
        sync.stop();
        await store.purgeAccountCache();
      } finally {
        const current = await client.auth.getSession();
        if (current.data.session?.user.id === store.owner)
          await client.auth.signOut({ scope: "local" });
      }
      return;
    }
    if (account.recovery) {
      if (password !== confirmation) throw new Error("Пароли не совпадают.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error(authMessage(error));
      setPassword("");
      setConfirmation("");
      account.finishRecovery();
      setMessage("Пароль сохранён. Вы вошли в аккаунт.");
      return;
    }
    if (mode === "reset") {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirect("recovery"),
      });
      if (error) throw new Error(authMessage(error));
      setMessage(
        "Если аккаунт с этой почтой существует, придёт ссылка для создания нового пароля. Откройте её в этом браузере.",
      );
      return;
    }
    if (mode === "signup") {
      if (password !== confirmation) throw new Error("Пароли не совпадают.");
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: authRedirect() },
      });
      if (error) throw new Error(authMessage(error));
      if (!data.session) {
        setPassword("");
        setConfirmation("");
        setMode("login");
        setMessage(
          "Проверьте почту: для нового аккаунта придёт ссылка подтверждения. Если аккаунт уже есть, войдите или восстановите пароль.",
        );
      }
      return;
    }
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(authMessage(error));
  }
  function changeMode(next: typeof mode) {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setError("");
    setMessage("");
  }
  return (
    <section className="account-view" aria-labelledby="account-title">
      <div className="eyebrow">LUNA VOICE / {t("Аккаунт")}</div>
      <h1 id="account-title">
        {t(signedIn ? "Ваш аккаунт" : "Практика с вами")}
        <span>.</span>
      </h1>
      <p className="account-intro">
        {t(
          signedIn
            ? "История и избранное доступны на ваших устройствах. Голос остаётся на устройстве."
            : "Войдите, чтобы сохранять прогресс и продолжать занятия на другом устройстве. Без входа доступен гостевой режим.",
        )}
      </p>
      {!account.client ? (
        <div className="account-card">
          <h2>{t("Вход скоро появится")}</h2>
          <p>
            {t(
              "Облачное подключение ещё не настроено. Практика и локальная история уже доступны.",
            )}
          </p>
        </div>
      ) : (
        <>
          {signedIn && !deleting && !account.recovery ? (
            <div className="account-grid">
              <div className="account-card">
                <h2>{t("Профиль")}</h2>
                <p className="account-email">{account.session!.user.email}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    store.updateProfile(
                      name ?? store.getSnapshot().profileName,
                    );
                    setMessage(
                      "Имя сохранено на устройстве и будет синхронизировано.",
                    );
                  }}
                >
                  <label>
                    {t("Как вас называть")}
                    <input
                      value={name ?? store.getSnapshot().profileName}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      autoComplete="nickname"
                      placeholder={
                        store.getSnapshot().profileName || t("Ваше имя")
                      }
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={!store.getSnapshot().ready}
                  >
                    {t("Сохранить имя")}
                  </button>
                </form>
                <button
                  className="account-text-button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const { error } = await account.client!.auth.signOut({
                        scope: "local",
                      });
                      if (error)
                        throw new Error(
                          "Не удалось выйти. Проверьте подключение и повторите.",
                        );
                    })
                  }
                >
                  {t("Выйти из аккаунта")}
                </button>
                <p className="account-small">
                  {t(
                    "После выхода вернётся гостевая история. Неотправленные изменения аккаунта дождутся следующего входа на этом устройстве.",
                  )}
                </p>
              </div>
              <div className="account-card">
                <h2>{t("Синхронизация")}</h2>
                <p role="status">
                  {t(
                    sync.busy
                      ? "Синхронизируем…"
                      : sync.error ||
                          (sync.pending
                            ? "Есть изменения для отправки"
                            : sync.lastSynced
                              ? "Всё синхронизировано"
                              : "Подготавливаем синхронизацию…"),
                  )}
                </p>
                {sync.lastSynced && (
                  <p className="account-small">
                    {t("Последнее обновление:")}{" "}
                    {t(
                      new Date(sync.lastSynced).toLocaleTimeString(localeTag()),
                    )}
                  </p>
                )}
                {sync.error && (
                  <button
                    className="secondary-button"
                    disabled={sync.busy}
                    onClick={sync.retry}
                  >
                    {t("Повторить синхронизацию")}
                  </button>
                )}
                <h3>{t("История гостя")}</h3>
                <p>
                  {t(
                    "Можно скопировать гостевые попытки, занятия и избранное этого браузера в аккаунт. Исходная история останется у гостя; настройки аккаунта сохранятся.",
                  )}
                </p>
                <button
                  className="secondary-button"
                  disabled={busy || !store.getSnapshot().ready}
                  onClick={() => {
                    if (
                      !window.confirm(
                        t(
                          "Скопировать гостевую историю и избранное в этот аккаунт?",
                        ),
                      )
                    )
                      return;
                    void perform(async () => {
                      await store.importGuest();
                      setMessage(
                        "Перенос добавлен в очередь сохранения. Дождитесь завершения синхронизации.",
                      );
                    });
                  }}
                >
                  {t("Перенести историю гостя")}
                </button>
              </div>
              <div className="account-card account-data">
                <h2>{t("Ваши данные")}</h2>
                <p>
                  {t(
                    "Удаление аккаунта удалит облачную историю, профиль и данные входа. Локальная гостевая история останется отдельно.",
                  )}
                </p>
                <div className="account-actions">
                  <button
                    className="account-text-button danger"
                    disabled={busy || sync.busy}
                    onClick={() => {
                      setDeleting(true);
                      setPassword("");
                      setConfirmation("");
                      setError("");
                      setMessage("");
                    }}
                  >
                    {t("Удалить аккаунт")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="account-card account-auth">
              <h2>
                {t(
                  deleting
                    ? "Удаление аккаунта"
                    : account.recovery
                      ? "Новый пароль"
                      : mode === "signup"
                        ? "Создать аккаунт"
                        : mode === "reset"
                          ? "Восстановить пароль"
                          : "Вход в аккаунт",
                )}
              </h2>
              <p>
                {t(
                  deleting
                    ? "Аккаунт и облачная история будут удалены без возможности отмены. Гостевая история останется."
                    : account.recovery
                      ? "Задайте новый пароль для этой почты."
                      : mode === "reset"
                        ? "Отправим ссылку для нового пароля. Этот способ подойдёт и тем, кто раньше входил по коду."
                        : "Сохраняйте занятия и продолжайте практику на любом устройстве.",
                )}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(submit);
                }}
              >
                {!deleting && !account.recovery && (
                  <label>
                    {t("Электронная почта")}
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      disabled={busy}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={"you@example.com"}
                    />
                  </label>
                )}
                {((!deleting && (account.recovery || mode !== "reset")) ||
                  (deleting && !googleOnly)) && (
                  <label>
                    {t(account.recovery ? "Новый пароль" : "Пароль")}
                    <input
                      type="password"
                      autoComplete={
                        account.recovery || mode === "signup"
                          ? "new-password"
                          : "current-password"
                      }
                      minLength={account.recovery || mode === "signup" ? 8 : 1}
                      required
                      value={password}
                      disabled={busy}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                )}
                {!deleting && (account.recovery || mode === "signup") && (
                  <label>
                    {t("Повторите пароль")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirmation}
                      disabled={busy}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                )}
                {deleting && (
                  <label>
                    {t("Введите УДАЛИТЬ")}
                    <input
                      required
                      value={confirmation}
                      autoComplete="off"
                      disabled={busy}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                )}
                <button className="primary-button" disabled={busy}>
                  {t(
                    busy
                      ? "Подождите…"
                      : deleting
                        ? "Подтвердить и удалить"
                        : account.recovery
                          ? "Сохранить новый пароль"
                          : mode === "signup"
                            ? "Зарегистрироваться"
                            : mode === "reset"
                              ? "Отправить ссылку"
                              : "Войти",
                  )}
                </button>
              </form>
              {!deleting && !account.recovery && mode !== "reset" && (
                <>
                  <div className="auth-divider">{t("или")}</div>
                  <button
                    className="google-button"
                    disabled={busy}
                    onClick={() => void perform(google)}
                  >
                    <span aria-hidden="true">G</span>
                    {t("Продолжить с Google")}
                  </button>
                </>
              )}
              {deleting && googleOnly && (
                <>
                  <p className="account-small">
                    {t(
                      "Для удаления требуется недавний вход через Google. После повторного входа откройте удаление ещё раз.",
                    )}
                  </p>
                  <button
                    className="google-button"
                    disabled={busy}
                    onClick={() => void perform(google)}
                  >
                    {t("Подтвердить вход через Google")}
                  </button>
                </>
              )}
              {!signedIn && (
                <>
                  <button
                    className="account-text-button"
                    disabled={busy}
                    onClick={() =>
                      changeMode(mode === "login" ? "signup" : "login")
                    }
                  >
                    {t(
                      mode === "login"
                        ? "Создать аккаунт"
                        : "Вернуться ко входу",
                    )}
                  </button>
                  {mode === "login" && (
                    <>
                      <button
                        className="account-text-button"
                        disabled={busy}
                        onClick={() => changeMode("reset")}
                      >
                        {t("Забыли пароль?")}
                      </button>
                      <button
                        className="account-text-button"
                        disabled={busy || !email.trim()}
                        onClick={() =>
                          void perform(async () => {
                            const { error } = await account.client!.auth.resend(
                              {
                                type: "signup",
                                email: email.trim(),
                                options: {
                                  emailRedirectTo: authRedirect(),
                                },
                              },
                            );
                            if (error) throw new Error(authMessage(error));
                            setMessage(
                              "Если почта ещё не подтверждена, придёт новое письмо со ссылкой.",
                            );
                          })
                        }
                      >
                        {t("Отправить подтверждение ещё раз")}
                      </button>
                    </>
                  )}
                </>
              )}
              {deleting && (
                <button
                  className="account-text-button"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(false);
                    setPassword("");
                    setConfirmation("");
                    setError("");
                  }}
                >
                  {t("Отмена")}
                </button>
              )}
              {account.recovery && (
                <button
                  className="account-text-button"
                  disabled={busy}
                  onClick={account.finishRecovery}
                >
                  {t("Позже")}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {(error || account.error) && (
        <p className="account-feedback danger" role="alert">
          {t(error || account.error)}
        </p>
      )}
      {message && (
        <p className="account-feedback" role="status">
          {t(message)}
        </p>
      )}
    </section>
  );
}
