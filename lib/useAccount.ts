"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import type { Plan } from "./plan";

export interface Account {
  email: string;
  plan: Plan;
  emailAlerts: boolean;
  marketing: boolean;
}

interface MeResponse {
  signedIn: boolean;
  email?: string;
  plan?: Plan;
  emailAlerts?: boolean;
  marketing?: boolean;
}

/** The signed-in account (null when browsing anonymously) and helpers to change its settings. */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MeResponse>("/api/auth/me")
      .then(({ data }) => {
        if (cancelled || !data.signedIn || !data.email) return;
        setAccount({
          email: data.email,
          plan: data.plan === "pro" ? "pro" : "free",
          emailAlerts: data.emailAlerts !== false,
          marketing: data.marketing === true,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Optimistic update; rolls back if the server rejects it. */
  const updatePrefs = useCallback(
    async (patch: { emailAlerts?: boolean; marketing?: boolean }) => {
      let previous: Account | null = null;
      setAccount((current) => {
        previous = current;
        return current ? { ...current, ...patch } : current;
      });
      try {
        await api.post("/api/account/prefs", patch);
      } catch {
        setAccount(previous);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      /* the reload below shows whatever state the server is really in */
    }
    window.location.reload();
  }, []);

  return { account, loaded, updatePrefs, signOut };
}
