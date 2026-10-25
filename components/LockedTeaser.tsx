import { Flame, Lock, Sparkles, Timer } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/plan";

interface LockedTeaserProps {
  lockedCount: number;
  delayedCount: number;
  delayedHotCount: number;
  onUpgrade: () => void;
}

/** Shown to Free users: what's hidden from them, with placeholder cards and an upgrade button. */
export default function LockedTeaser({
  lockedCount,
  delayedCount,
  delayedHotCount,
  onUpgrade,
}: LockedTeaserProps) {
  if (lockedCount === 0 && delayedCount === 0) return null;
  const delay = PLAN_LIMITS.free.freshDelayMinutes;

  return (
    <section aria-label="Pro-only listings" className="mt-8">
      <div className="rounded-2xl border border-orange-500/40 bg-gradient-to-br from-orange-500/10 via-panel to-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 text-sm">
            <p className="flex items-center gap-2 text-base font-bold text-white">
              <Lock className="h-4 w-4 text-orange-300" /> More deals are locked on the Free plan
            </p>
            {delayedCount > 0 && (
              <p className="flex items-center gap-2 text-zinc-300">
                <Timer className="h-4 w-4 shrink-0 text-orange-300" />
                <span>
                  <strong className="text-white">{delayedCount}</strong> new{" "}
                  {delayedCount === 1 ? "listing" : "listings"} from the last {delay} minutes{" "}
                  {delayedCount === 1 ? "is" : "are"} Pro-only
                  {delayedHotCount > 0 && (
                    <span className="ml-1 inline-flex items-center gap-1 font-semibold text-emerald-300">
                      <Flame className="h-3.5 w-3.5" /> {delayedHotCount} look like good deals
                    </span>
                  )}
                </span>
              </p>
            )}
            {lockedCount > 0 && (
              <p className="flex items-center gap-2 text-zinc-300">
                <Lock className="h-4 w-4 shrink-0 text-orange-300" />
                <span>
                  <strong className="text-white">{lockedCount}</strong> more{" "}
                  {lockedCount === 1 ? "result" : "results"} beyond your top{" "}
                  {PLAN_LIMITS.free.maxResults}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-400 via-orange-500 to-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" /> Unlock with Pro
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            onClick={onUpgrade}
            className="group relative h-[22rem] overflow-hidden rounded-2xl border border-line bg-panel text-left"
          >
            <div className="h-44 bg-raised" />
            <div className="space-y-3 p-4 blur-[3px]">
              <div className="h-8 w-28 rounded bg-zinc-700" />
              <div className="h-4 w-4/5 rounded bg-zinc-800" />
              <div className="h-3 w-full rounded bg-zinc-800" />
              <div className="h-3 w-3/5 rounded bg-zinc-800" />
            </div>
            <div className="absolute inset-0 grid place-items-center bg-black/40 transition group-hover:bg-black/30">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-orange-200 ring-1 ring-orange-400/40">
                <Lock className="h-4 w-4" /> Pro listing
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
