import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null | undefined;
export function cloudClient() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return (client = null);
  try {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        storageKey: "lunavoice.auth.v1",
      },
    });
  } catch {
    client = null;
  }
  return client;
}

/** Avoid navigating to Supabase's raw error page while Google is not configured. */
export async function requireGoogleProvider() {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Не удалось подключиться к Google. Попробуйте позже или войдите с паролем.",
    );
  const settings = await response.json();
  if (!settings.external?.google)
    throw new Error(
      "Вход через Google пока не включён. Сейчас можно войти по почте и паролю.",
    );
}
