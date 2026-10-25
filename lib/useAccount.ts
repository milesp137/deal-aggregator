"use client";

import { useCallback, useEffect, useState } from "react";
import { api, clearLicense, getLicense } from "./client";
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

function toAccount(data: MeResponse): Account | null {
  if (!data.signedIn || !data.email) return null;
  return {
    email: data.email,
    plan: data.plan === "pro" ? "pro" : "free",
    emailAlerts: data.emailAlerts !== false,
    marketing: data.marketing === true,
  };
}

/** Signs in with the Pro license key saved in this browser, as the email that bought it. */
async function accountFromLicense(): Promise<Account | null> {
  const key = getLicense();
  if (!key) return null;
  try {
    const { data } = await api.post<MeResponse>("/api/auth/license", { key });
    return toAccount(data);
  } catch {
    return null;
  }
}

/** The signed-in account (null when browsing anonymously) and helpers to change its settings. */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let found: Account | null = null;
      try {
        found = toAccount((await api.get<MeResponse>("/api/auth/me")).data);
      } catch {
        /* treated as signed out */
      }
      // No session (expired, cleared cookies, new browser) but a Pro key is saved here:
      // that's enough to sign back in, so the customer never needs another email link.
      if (!found) found = await accountFromLicense();
      if (cancelled) return;
      setAccount(found);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Called right after a license key is activated, so the account comes with it. */
  const restoreFromLicense = useCallback(async () => {
    const found = await accountFromLicense();
    if (found) setAccount(found);
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
    // The saved key would sign this browser straight back in, so signing out forgets it too.
    clearLicense();
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      /* the reload below shows whatever state the server is really in */
    }
    window.location.reload();
  }, []);

  return { account, loaded, restoreFromLicense, updatePrefs, signOut };
}
