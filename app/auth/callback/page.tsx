"use client";
import { LanguageSwitcher } from "../../components/language-switcher";
import { useLocale } from "../../hooks/use-locale";
import { t } from "../../lib/i18n";

import { useEffect } from "react";
import Link from "next/link";
import { useAccount } from "../../hooks/use-account";
export default function AuthCallback() {
  useLocale();
  const account = useAccount();
  useEffect(() => {
    if (account.ready && account.session && !account.error)
      window.location.replace("/?account=1");
  }, [account.ready, account.session, account.error]);
  return (
    <main className="account-callback">
      <div className="account-card">
        <div className="eyebrow">LUNA VOICE</div>
        <LanguageSwitcher />
        <h1>
          {t(account.error ? "Не удалось войти" : "Возвращаемся к практике")}
        </h1>
        <p role={account.error ? "alert" : "status"}>
          {t(
            account.error ||
              (account.ready && !account.client
                ? "Подключение к аккаунтам не настроено."
                : "Подтверждаем вход…"),
          )}
        </p>
        {account.ready && (account.error || !account.session) && (
            <Link className="secondary-button" href="/?account=1">
              {t("Вернуться ко входу")}
            </Link>
          )}
      </div>
    </main>
  );
}
