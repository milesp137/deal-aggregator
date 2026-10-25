"use client";

import axios from "axios";
import { useEffect, useState, type FormEvent } from "react";
import { BellRing, Heart, Loader2, Mail, X } from "lucide-react";
import { api } from "@/lib/client";

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

/** Passwordless sign-in: enter an email, get a link. No password, no extra steps. */
export default function SignInModal({ open, onClose }: SignInModalProps) {
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setSentTo(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await api.post("/api/auth/request", { email: trimmed, marketing });
      setSentTo(trimmed);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string } | undefined)?.error
        : undefined;
      setError(message ?? "Couldn't send the link. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="relative w-full max-w-md animate-slide-in rounded-2xl border border-line bg-panel p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {sentTo ? (
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15">
              <Mail className="h-6 w-6 text-emerald-300" />
            </div>
            <h2 id="signin-title" className="text-xl font-extrabold text-white">
              Check your email
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              We sent a sign-in link to <strong className="text-white">{sentTo}</strong>. It works once and
              expires in 15 minutes. Check spam if you don&apos;t see it.
            </p>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="mt-4 text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-white hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h2 id="signin-title" className="text-xl font-extrabold text-white">
              Sign in to DealRadar
            </h2>
            <p className="mt-1.5 text-sm text-zinc-300">
              No password. We&apos;ll email you a link, and that&apos;s your account.
            </p>

            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li className="flex items-center gap-2.5">
                <BellRing className="h-4 w-4 shrink-0 text-brand" /> Get emailed when a deal matches your alerts
              </li>
              <li className="flex items-center gap-2.5">
                <Heart className="h-4 w-4 shrink-0 text-brand" /> Keep your saved listings and alerts on every device
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-brand" /> Your Pro plan follows your email
              </li>
            </ul>

            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="field"
              />
              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(event) => setMarketing(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                />
                <span>Send me occasional deal tips and DealRadar news. Unsubscribe any time.</span>
              </label>
              <button type="submit" disabled={sending || !email.trim()} className="btn-primary w-full justify-center">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Email me a sign-in link
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
