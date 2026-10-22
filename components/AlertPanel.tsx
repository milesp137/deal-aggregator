"use client";

import { useState, type FormEvent } from "react";
import { Bell, BellOff, BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import type { AlertKeyword } from "@/lib/types";
import { formatPrice } from "@/lib/format";

interface AlertPanelProps {
  alerts: AlertKeyword[];
  /** listing counts per alert id for the current feed */
  matchCounts: Record<string, number>;
  notificationPermission: NotificationPermission | "unsupported";
  onRequestNotifications: () => void;
  onCreate: (input: { keyword: string; maxPrice: number | null; minDealScore: number }) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function AlertPanel({
  alerts,
  matchCounts,
  notificationPermission,
  onRequestNotifications,
  onCreate,
  onToggle,
  onDelete,
}: AlertPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minDealScore, setMinDealScore] = useState(7);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) {
      setFormError("Enter a keyword to watch for.");
      return;
    }
    const price = maxPrice.trim() === "" ? null : Number(maxPrice);
    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      setFormError("Max price must be a positive number.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onCreate({ keyword: trimmed, maxPrice: price, minDealScore });
      setKeyword("");
      setMaxPrice("");
    } catch {
      setFormError("Could not save the alert. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Keyword alert rules"
      className="animate-slide-in rounded-2xl border border-line bg-panel/90 p-4 shadow-xl sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <BellRing className="h-5 w-5 text-brand" /> Keyword Alerts
          </h2>
          <p className="mt-0.5 text-sm text-zinc-400">
            Get pinged the moment a matching, non-scam listing appears. Every word must match.
          </p>
        </div>

        {notificationPermission === "default" && (
          <button type="button" onClick={onRequestNotifications} className="btn-ghost">
            <Bell className="h-4 w-4" /> Enable desktop notifications
          </button>
        )}
        {notificationPermission === "granted" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            <Bell className="h-3.5 w-3.5" /> Desktop notifications on
          </span>
        )}
        {notificationPermission === "denied" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
            <BellOff className="h-3.5 w-3.5" /> Notifications blocked in browser
          </span>
        )}
      </div>

      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Keyword
          </span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="e.g. s14 coilovers"
            className="field"
            maxLength={80}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Max price ($)
          </span>
          <input
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            placeholder="Any"
            inputMode="numeric"
            className="field"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Min deal score
          </span>
          <select
            value={minDealScore}
            onChange={(event) => setMinDealScore(Number(event.target.value))}
            className="field"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
              <option key={score} value={score}>
                {score}+ / 10
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving} className="btn-primary h-[42px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add alert
        </button>
      </form>
      {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}

      <ul className="mt-5 divide-y divide-line rounded-xl border border-line bg-canvas/40">
        {alerts.length === 0 && (
          <li className="p-4 text-center text-sm text-zinc-500">
            No alert rules yet. Add one above to start watching the feed.
          </li>
        )}
        {alerts.map((alert) => {
          const count = matchCounts[alert.id] ?? 0;
          return (
            <li key={alert.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
              <button
                type="button"
                role="switch"
                aria-checked={alert.enabled}
                aria-label={`${alert.enabled ? "Disable" : "Enable"} alert for ${alert.keyword}`}
                onClick={() => void onToggle(alert.id, !alert.enabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  alert.enabled ? "bg-brand" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    alert.enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>

              <div className={`min-w-0 flex-1 ${alert.enabled ? "" : "opacity-50"}`}>
                <p className="truncate font-semibold text-white">{alert.keyword}</p>
                <p className="text-xs text-zinc-400">
                  {alert.maxPrice !== null ? `Under ${formatPrice(alert.maxPrice)}` : "Any price"}
                  {" \u00b7 "}score {alert.minDealScore}+
                </p>
              </div>

              {alert.enabled && count > 0 && (
                <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-bold text-brand-soft">
                  {count} match{count === 1 ? "" : "es"} now
                </span>
              )}

              <button
                type="button"
                onClick={() => void onDelete(alert.id)}
                aria-label={`Delete alert for ${alert.keyword}`}
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
