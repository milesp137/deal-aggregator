"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Sparkles } from "lucide-react";
import type { Account } from "@/lib/useAccount";

interface AccountMenuProps {
  account: Account;
  isPro: boolean;
  onUpdate: (patch: { emailAlerts?: boolean; marketing?: boolean }) => void;
  onSignOut: () => void;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-zinc-400">{hint}</p>
      </div>
    </div>
  );
}

export default function AccountMenu({ account, isPro, onUpdate, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn-ghost max-w-[13rem]"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/20 text-xs font-bold uppercase text-brand-soft">
          {account.email[0]}
        </span>
        <span className="hidden truncate sm:inline">{account.email}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-slide-in rounded-xl border border-line bg-panel p-4 shadow-2xl"
        >
          <p className="truncate text-sm font-bold text-white">{account.email}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
            {isPro ? (
              <>
                <Sparkles className="h-3.5 w-3.5 text-orange-300" /> Pro plan
              </>
            ) : (
              "Free plan"
            )}
          </p>

          <div className="mt-3 divide-y divide-line border-y border-line">
            <Toggle
              label="Email me alert matches"
              hint={isPro ? "As soon as a new match is found." : "One daily digest. Pro sends them as soon as they appear."}
              checked={account.emailAlerts}
              onChange={(value) => onUpdate({ emailAlerts: value })}
            />
            <Toggle
              label="Deal tips & news"
              hint="Occasional emails. Unsubscribe any time."
              checked={account.marketing}
              onChange={(value) => onUpdate({ marketing: value })}
            />
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
