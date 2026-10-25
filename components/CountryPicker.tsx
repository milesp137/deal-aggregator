"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { COUNTRIES, countryName } from "@/lib/countries";

interface CountryPickerProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

/** A searchable country dropdown: United States and Japan first, then A to Z. */
export default function CountryPicker({ value, onChange, disabled = false }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(
      (country) => country.name.toLowerCase().includes(needle) || country.code.toLowerCase() === needle,
    );
  }, [search]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="field inline-flex !w-auto items-center gap-2 !py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {countryName(value)}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <label className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault(); // don't submit the search form
                  if (matches[0]) choose(matches[0].code);
                }
              }}
              placeholder="Search countries..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
              autoComplete="off"
            />
          </label>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {matches.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No matching country</li>}
            {matches.map((country) => (
              <li key={country.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={country.code === value}
                  onClick={() => choose(country.code)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/5"
                >
                  {country.name}
                  {country.code === value && <Check className="h-3.5 w-3.5 text-orange-300" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
