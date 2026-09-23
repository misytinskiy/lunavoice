"use client";
import { Select, SelectOption } from "./select";

import { useLocale } from "../hooks/use-locale";
import { isLocale, setLocale } from "../lib/i18n";
export function LanguageSwitcher() {
  const locale = useLocale();
  return (
    <label className="language-switcher">
     
      <Select
        aria-label="Language / Мова / Язык"
        value={locale}
        onValueChange={(selectedValue) => {
          if (isLocale(selectedValue)) setLocale(selectedValue);
        }}
      >
        <SelectOption value="en" lang="en">
          English
        </SelectOption>
        <SelectOption value="uk" lang="uk">
          Українська
        </SelectOption>
        <SelectOption value="ru" lang="ru">
          Русский
        </SelectOption>
      </Select>
    </label>
  );
}
