"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { PLAN_LIMITS, PRO_PERKS, UPGRADE_COPY, UPGRADE_URL, type UpgradeReason } from "@/lib/plan";
import { api, setLicense } from "@/lib/client";

interface UpgradeModalProps {
  reason: UpgradeReason | null;
  onClose: () => void;
  /** Called after a valid license key has been saved. */
  onActivated: () => void;
}

export default function UpgradeModal({ reason, onClose, onActivated }: UpgradeModalProps) {
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!reason) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reason, onClose]);

  if (!reason) return null;
  const copy = UPGRADE_COPY[reason];

  const activate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setChecking(true);
    setError(null);
    try {
      const { data } = await api.post<{ valid: boolean }>("/api/pro/verify", { key: trimmed });
      if (!data.valid) {
        setError("That license key isn't valid. Check it and try again.");
        return;
      }
      setLicense(trimmed);
      setKey("");
      onActivated();
    } catch {
      setError("Couldn't verify the key right now. Try again in a moment.");
    } finally {
      setChecking(false);
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
        aria-labelledby="upgrade-title"
        className="relative w-full max-w-lg animate-slide-in rounded-2xl border border-orange-500/40 bg-panel p-6 shadow-2xl shadow-orange-500/10"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-orange-300">
          <Sparkles className="h-3.5 w-3.5" /> DealRadar Pro
        </div>
        <h2 id="upgrade-title" className="mt-2 text-2xl font-extrabold tracking-tight text-white">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{copy.body}</p>

        <ul className="mt-5 space-y-2.5">
          {PRO_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm text-zinc-100">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {perk}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg border border-line bg-canvas/50 p-3 text-xs text-zinc-400">
          Free plan: top {PLAN_LIMITS.free.maxResults} results, {PLAN_LIMITS.free.freshDelayMinutes}-minute
          delay on new listings, {PLAN_LIMITS.free.maxAlerts} alert, {PLAN_LIMITS.free.maxDistance}-mile
          radius.
        </div>

        <a
          href={UPGRADE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-400 via-orange-500 to-amber-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110"
        >
          <Sparkles className="h-4 w-4" /> Upgrade to Pro
        </a>

        <div className="mt-4 text-center">
          {!showKey ? (
            <button
              type="button"
              onClick={() => setShowKey(true)}
              className="text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-white hover:underline"
            >
              Already have a license key?
            </button>
          ) : (
            <form onSubmit={activate} className="flex gap-2">
              <input
                autoFocus
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="Paste your license key"
                className="field"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" disabled={checking || !key.trim()} className="btn-primary shrink-0">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate"}
              </button>
            </form>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
