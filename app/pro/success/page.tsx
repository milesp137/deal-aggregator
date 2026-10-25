"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Sparkles } from "lucide-react";
import { api, setLicense } from "@/lib/client";
import { SUPPORT_EMAIL } from "@/lib/plan";

type State =
  | { status: "waiting" }
  | { status: "ready"; key: string; email: string | null }
  | { status: "error"; message: string };

const MAX_ATTEMPTS = 20;
const POLL_MS = 2000;

export default function ProSuccessPage() {
  const [state, setState] = useState<State>({ status: "waiting" });

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setState({ status: "error", message: "This page needs the link Stripe sends after payment." });
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const { data, status } = await api.get<{ ready: boolean; key?: string; email?: string | null }>(
          "/api/pro/claim",
          { params: { session_id: sessionId }, validateStatus: (code) => code === 200 || code === 202 },
        );
        if (cancelled) return;
        if (status === 200 && data.ready && data.key) {
          setLicense(data.key); // activate Pro in this browser right away
          setState({ status: "ready", key: data.key, email: data.email ?? null });
          return;
        }
      } catch {
        if (cancelled) return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setState({
          status: "error",
          message:
            "Your payment went through, but your key is taking longer than usual. Check your email in a minute, or contact support.",
        });
        return;
      }
      setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
      <div className="w-full rounded-2xl border border-orange-500/40 bg-panel p-6 text-center shadow-2xl shadow-orange-500/10">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand shadow-glow">
          <Sparkles className="h-6 w-6 text-white" />
        </div>

        {state.status === "waiting" && (
          <>
            <h1 className="text-xl font-extrabold text-white">Thanks! Setting up your Pro account...</h1>
            <p className="mt-2 text-sm text-zinc-400">This usually takes a few seconds.</p>
            <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-brand" />
          </>
        )}

        {state.status === "ready" && (
          <>
            <h1 className="flex items-center justify-center gap-2 text-xl font-extrabold text-white">
              <Check className="h-5 w-5 text-emerald-400" /> You&apos;re Pro!
            </h1>
            <p className="mt-2 text-sm text-zinc-300">
              Pro is already active in this browser.
              {state.email ? ` We also emailed your license key to ${state.email}.` : ""}
            </p>
            <p className="mt-4 rounded-lg bg-canvas/60 px-4 py-3 font-mono text-sm font-bold tracking-wider text-white">
              {state.key}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Keep this key private. Use it to activate Pro on your other devices.
            </p>
            <Link href="/" className="btn-primary mt-5 w-full">
              Start finding deals
            </Link>
          </>
        )}

        {state.status === "error" && (
          <>
            <h1 className="text-xl font-extrabold text-white">Almost there</h1>
            <p className="mt-2 text-sm text-zinc-300">{state.message}</p>
            {SUPPORT_EMAIL && (
              <p className="mt-3 text-xs text-zinc-400">
                Still nothing? Email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-white underline">
                  {SUPPORT_EMAIL}
                </a>{" "}
                and we&apos;ll sort it out.
              </p>
            )}
            <Link href="/" className="btn-ghost mt-5 w-full">
              Back to DealRadar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
