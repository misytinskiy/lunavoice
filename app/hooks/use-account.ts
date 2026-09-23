"use client";
import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { cloudClient } from "../lib/cloud/client";
import {
  completeAuthRedirect,
  recoveryPending,
  setRecovery,
} from "../lib/cloud/auth";
export type Account = {
  ready: boolean;
  client: SupabaseClient | null;
  session: Session | null;
  error: string;
  recovery: boolean;
  returned: boolean;
  finishRecovery: () => void;
};
export function useAccount(): Account {
  const [state, setState] = useState<Omit<Account, "finishRecovery">>({
    ready: false,
    client: null,
    session: null,
    error: "",
    recovery: false,
    returned: false,
  });
  useEffect(() => {
    let alive = true,
      initializing = true;
    const client = cloudClient();
    if (!client) {
      queueMicrotask(() => {
        if (alive) setState((s) => ({ ...s, ready: true }));
      });
      return () => {
        alive = false;
      };
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!alive || initializing) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!session) setRecovery(false);
      setState((s) => ({
        ...s,
        ready: true,
        client,
        session,
        recovery: !!session && recoveryPending(),
        error: "",
      }));
    });
    void (async () => {
      const result = await completeAuthRedirect(client);
      const { data, error } = await client.auth.getSession();
      initializing = false;
      if (alive)
        setState({
          ready: true,
          client,
          session: data.session,
          recovery: !!data.session && result.recovery,
          returned: result.returned,
          error: result.error || (error ? "Не удалось восстановить вход." : ""),
        });
    })().catch(() => {
      initializing = false;
      if (alive)
        setState((s) => ({
          ...s,
          ready: true,
          client,
          error: "Не удалось восстановить вход. Попробуйте снова.",
        }));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return {
    ...state,
    finishRecovery: () => {
      setRecovery(false);
      setState((s) => ({ ...s, recovery: false }));
    },
  };
}
