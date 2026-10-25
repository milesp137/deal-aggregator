"use client";

import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellRing, Flame, PackageSearch, Radar, ShieldAlert, Sparkles, X } from "lucide-react";
import AlertPanel from "@/components/AlertPanel";
import ControlBar from "@/components/ControlBar";
import ListingCard from "@/components/ListingCard";
import LocationBar from "@/components/LocationBar";
import LockedTeaser from "@/components/LockedTeaser";
import UpgradeModal from "@/components/UpgradeModal";
import { matchesAlert } from "@/lib/alerts";
import { api, clearLicense, getLicense, setLicense } from "@/lib/client";
import { formatPrice, timeAgo } from "@/lib/format";
import { FREE_MAX_DISTANCE, PLAN_LIMITS, type Plan, type UpgradeReason } from "@/lib/plan";
import { useLocation } from "@/lib/useLocation";
import type { AlertHit, AlertKeyword, Listing, ScrapeMeta, ScrapeResponse } from "@/lib/types";

const AUTO_REFRESH_MS = 30_000;
const FILTER_DEBOUNCE_MS = 350;
const MAX_VISIBLE_HITS = 4;

const PLATFORM_NAMES: Record<string, string> = {
  eBay: "eBay",
  Marketplace: "Facebook Marketplace",
  Craigs: "Craigslist",
};

type NotificationState = NotificationPermission | "unsupported";

export default function DashboardPage() {
  // Search + filters
  const [query, setQuery] = useState("");
  const [maxDistance, setMaxDistance] = useState(FREE_MAX_DISTANCE);
  const [minScore, setMinScore] = useState(1);
  const [hideScams, setHideScams] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Results
  const [listings, setListings] = useState<Listing[]>([]);
  const [meta, setMeta] = useState<ScrapeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Alerts
  const [alerts, setAlerts] = useState<AlertKeyword[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [hits, setHits] = useState<AlertHit[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationState>("unsupported");

  // Location (auto-detected, user can change) and plan (free/pro)
  const { location, detecting, detectFailed, detect, choose } = useLocation();
  const [plan, setPlan] = useState<Plan>("free");
  const isPro = plan === "pro";
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [nudge, setNudge] = useState(false);
  const searchCount = useRef(0);

  // Refs let the stable runScrape callback read the latest values without re-subscribing effects.
  const paramsRef = useRef({
    query,
    maxDistance,
    minScore,
    originLat: location?.lat,
    originLng: location?.lng,
  });
  const alertsRef = useRef<AlertKeyword[]>(alerts);
  const previousRef = useRef<{ signature: string; ids: Set<string> } | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    paramsRef.current = {
      query,
      maxDistance,
      minScore,
      originLat: location?.lat,
      originLng: location?.lng,
    };
  }, [query, maxDistance, minScore, location?.lat, location?.lng]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const runScrape = useCallback(async () => {
    const params = paramsRef.current;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<ScrapeResponse>("/api/scrape", {
        query: params.query,
        maxDistance: params.maxDistance,
        minDealScore: params.minScore,
        originLat: params.originLat,
        originLng: params.originLng,
      });
      if (seq !== requestSeq.current) return; // a newer request superseded this one

      setPlan(data.meta.plan);

      // Friendly nudge once per session, on the 3rd search, for Free users.
      searchCount.current += 1;
      if (
        data.meta.plan === "free" &&
        searchCount.current === 3 &&
        !window.sessionStorage.getItem("dealradar:nudged")
      ) {
        window.sessionStorage.setItem("dealradar:nudged", "1");
        setNudge(true);
      }

      // "New" only makes sense when comparing like-for-like searches.
      const signature = JSON.stringify(params);
      const previous = previousRef.current;
      const fresh =
        previous && previous.signature === signature
          ? data.listings.filter((listing) => !previous.ids.has(listing.id))
          : [];
      previousRef.current = { signature, ids: new Set(data.listings.map((l) => l.id)) };

      setListings(data.listings);
      setMeta(data.meta);
      setNewIds(new Set(fresh.map((listing) => listing.id)));

      // Fire alerts for brand-new listings only.
      const newHits: AlertHit[] = [];
      for (const listing of fresh) {
        const rule = alertsRef.current.find((alert) => matchesAlert(listing, alert));
        if (!rule) continue;
        newHits.push({
          id: `${listing.id}-${data.meta.scrapedAt}`,
          listingId: listing.id,
          title: listing.title,
          price: listing.price,
          keyword: rule.keyword,
        });
        if (
          data.meta.plan === "pro" &&
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(`Alert: ${rule.keyword}`, {
            body: `${listing.title} - ${formatPrice(listing.price)}`,
          });
        }
      }
      if (newHits.length > 0) setHits((current) => [...newHits, ...current].slice(0, MAX_VISIBLE_HITS));
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data as { error?: string } | undefined)?.error ?? err.message
          : "Unexpected error while scraping.",
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Initial load (once the location is known) + debounced re-scrape whenever a slider or the
  // location changes.
  const hasLocation = location !== null;
  useEffect(() => {
    if (!hasLocation) return;
    const timer = setTimeout(() => void runScrape(), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hasLocation, location?.lat, location?.lng, maxDistance, minScore, runScrape]);

  // Optional live polling (Pro only).
  useEffect(() => {
    if (!autoRefresh || !isPro) return;
    const timer = setInterval(() => void runScrape(), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, isPro, runScrape]);

  // Load saved alert rules + browser notification state, and re-check a stored Pro license.
  useEffect(() => {
    api
      .get<{ alerts: AlertKeyword[] }>("/api/alerts")
      .then(({ data }) => setAlerts(data.alerts))
      .catch(() => setError("Could not load alert rules."));
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");

    // One-click activation from the license email: /#license=KEY (the fragment never hits servers).
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("license");
    if (fragment) {
      api
        .post<{ valid: boolean }>("/api/pro/verify", { key: fragment })
        .then(({ data }) => {
          if (data.valid) {
            setLicense(fragment);
            setPlan("pro");
          }
        })
        .catch(() => undefined)
        .finally(() => window.history.replaceState(null, "", window.location.pathname));
    }

    const license = getLicense();
    if (license) {
      api
        .post<{ valid: boolean }>("/api/pro/verify", { key: license })
        .then(({ data }) => (data.valid ? setPlan("pro") : clearLicense()))
        .catch(() => undefined);
    }
  }, []);

  const requirePro = useCallback((reason: UpgradeReason) => setUpgradeReason(reason), []);

  const handleActivated = useCallback(() => {
    setPlan("pro");
    setUpgradeReason(null);
    setNudge(false);
    void runScrape();
  }, [runScrape]);

  const requestNotifications = useCallback(() => {
    if (!("Notification" in window)) return;
    void Notification.requestPermission().then(setNotificationPermission);
  }, []);

  const createAlert = useCallback(
    async (input: { keyword: string; maxPrice: number | null; minDealScore: number }) => {
      try {
        const { data } = await api.post<{ alert: AlertKeyword }>("/api/alerts", input);
        setAlerts((current) => [data.alert, ...current]);
      } catch (err) {
        // 402 = plan limit reached: show the upgrade prompt instead of a generic error.
        if (axios.isAxiosError(err) && err.response?.status === 402) {
          setUpgradeReason("alerts");
          return;
        }
        throw err;
      }
    },
    [],
  );

  const toggleAlert = useCallback(async (id: string, enabled: boolean) => {
    const { data } = await api.patch<{ alert: AlertKeyword }>("/api/alerts", { id, enabled });
    setAlerts((current) => current.map((alert) => (alert.id === id ? data.alert : alert)));
  }, []);

  const removeAlert = useCallback(async (id: string) => {
    await api.delete("/api/alerts", { params: { id } });
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const visibleListings = useMemo(
    () => (hideScams ? listings.filter((listing) => !listing.isScam) : listings),
    [listings, hideScams],
  );

  // listingId -> alert rules it satisfies, and alertId -> number of listings (for the panel).
  const { matchesByListing, matchCounts } = useMemo(() => {
    const byListing = new Map<string, AlertKeyword[]>();
    const counts: Record<string, number> = {};
    for (const listing of visibleListings) {
      for (const alert of alerts) {
        if (!matchesAlert(listing, alert)) continue;
        byListing.set(listing.id, [...(byListing.get(listing.id) ?? []), alert]);
        counts[alert.id] = (counts[alert.id] ?? 0) + 1;
      }
    }
    return { matchesByListing: byListing, matchCounts: counts };
  }, [visibleListings, alerts]);

  const hotDeals = visibleListings.filter((listing) => listing.dealScore >= 8 && !listing.isScam).length;
  const scams = visibleListings.filter((listing) => listing.isScam).length;
  const activeAlertCount = alerts.filter((alert) => alert.enabled).length;
  // Show skeletons until the first response (or error) lands, so the empty state never flashes.
  const initialLoad = meta === null && error === null;

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand shadow-glow">
            <Radar className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">DealRadar</h1>
            <p className="text-sm text-zinc-400">
              Project cars, performance parts &amp; high-end electronics, scored in real time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 sm:inline-flex">
            <span className="relative flex h-2.5 w-2.5">
              {autoRefresh && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  autoRefresh ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
            </span>
            {autoRefresh ? "Live" : "Paused"}
          </span>

          <button
            type="button"
            onClick={() => setAlertsOpen((open) => !open)}
            aria-expanded={alertsOpen}
            className={alertsOpen ? "btn-primary" : "btn-ghost"}
          >
            <BellRing className="h-4 w-4" />
            Alerts
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs">{activeAlertCount}</span>
          </button>

          {isPro ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-orange-400/50 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-200">
              <Sparkles className="h-4 w-4" />
              Pro active
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setUpgradeReason("general")}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-400 via-orange-500 to-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              <Sparkles className="h-4 w-4" />
              Go Pro
            </button>
          )}
        </div>
      </header>

      <div className="space-y-4">
        <ControlBar
          query={query}
          onQueryChange={setQuery}
          maxDistance={maxDistance}
          onMaxDistanceChange={setMaxDistance}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          hideScams={hideScams}
          onHideScamsChange={setHideScams}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          loading={loading}
          onRun={() => void runScrape()}
          isPro={isPro}
          onProRequired={requirePro}
        />

        {alertsOpen && (
          <AlertPanel
            alerts={alerts}
            matchCounts={matchCounts}
            notificationPermission={notificationPermission}
            onRequestNotifications={requestNotifications}
            onCreate={createAlert}
            onToggle={toggleAlert}
            onDelete={removeAlert}
            isPro={isPro}
            maxAlerts={PLAN_LIMITS[plan].maxAlerts}
            onProRequired={requirePro}
          />
        )}
      </div>

      <LocationBar
        location={location}
        detecting={detecting}
        detectFailed={detectFailed}
        onDetect={detect}
        onChoose={choose}
      />

      {/* Stats strip */}
      {meta && (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-400">
          <span>
            <strong className="text-white">{visibleListings.length}</strong>{" "}
            {visibleListings.length === 1 ? "listing" : "listings"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-emerald-400" />
            <strong className="text-white">{hotDeals}</strong> hot deals
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <strong className="text-white">{scams}</strong> flagged
          </span>
          <span className="sm:ml-auto">
            Updated {timeAgo(meta.scrapedAt)}
          </span>
        </div>
      )}

      {meta && Object.keys(meta.errors ?? {}).length > 0 && (
        <div
          role="status"
          className="mt-4 space-y-1 rounded-xl border border-yellow-500/50 bg-yellow-950/40 p-3 text-sm text-yellow-200"
        >
          {Object.entries(meta.errors).map(([platform, reason]) => (
            <p key={platform} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{PLATFORM_NAMES[platform] ?? platform}</strong> results are {reason}. Showing
                the other sources.
              </span>
            </p>
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-950/50 p-3 text-sm text-red-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {meta && !isPro && meta.delayedHotCount > 0 && (
        <button
          type="button"
          onClick={() => setUpgradeReason("fresh")}
          className="mt-4 flex w-full items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-left text-sm text-emerald-200 transition hover:border-emerald-400"
        >
          <Flame className="h-4 w-4 shrink-0" />
          <span>
            <strong>{meta.delayedHotCount}</strong> hot {meta.delayedHotCount === 1 ? "deal was" : "deals were"}{" "}
            posted in the last {PLAN_LIMITS.free.freshDelayMinutes} minutes. Pro members can see{" "}
            {meta.delayedHotCount === 1 ? "it" : "them"} right now.{" "}
            <span className="font-semibold underline">Unlock</span>
          </span>
        </button>
      )}

      {/* Feed */}
      <main className="mt-4">
        {initialLoad ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[26rem] animate-pulse rounded-2xl border border-line bg-panel" />
            ))}
          </div>
        ) : visibleListings.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
            <PackageSearch className="mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-lg font-semibold text-zinc-200">No listings match these filters</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Try a broader keyword, a larger distance, or a lower minimum deal score.
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          >
            {visibleListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isNew={newIds.has(listing.id)}
                matchedAlerts={matchesByListing.get(listing.id) ?? []}
              />
            ))}
          </div>
        )}

        {meta && !isPro && (
          <LockedTeaser
            lockedCount={meta.lockedCount}
            delayedCount={meta.delayedCount}
            delayedHotCount={meta.delayedHotCount}
            onUpgrade={() => setUpgradeReason(meta.lockedCount > 0 ? "results" : "fresh")}
          />
        )}
      </main>

      <UpgradeModal
        reason={upgradeReason}
        onClose={() => setUpgradeReason(null)}
        onActivated={handleActivated}
      />

      {/* Friendly one-time nudge for Free users */}
      {nudge && !isPro && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 flex w-[calc(100%-2rem)] max-w-sm animate-slide-in items-start gap-3 rounded-xl border border-orange-500/50 bg-panel p-4 shadow-2xl"
        >
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">Finding good stuff?</p>
            <p className="mt-0.5 text-sm text-zinc-300">
              Pro members see new listings {PLAN_LIMITS.free.freshDelayMinutes} minutes before everyone else.
              The best deals go fast.
            </p>
            <button
              type="button"
              onClick={() => {
                setNudge(false);
                setUpgradeReason("fresh");
              }}
              className="mt-2 text-sm font-semibold text-orange-300 hover:text-orange-200"
            >
              See what Pro includes
            </button>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNudge(false)}
            className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Alert toasts */}
      {hits.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
          {hits.map((hit) => (
            <div
              key={hit.id}
              role="status"
              className="flex animate-slide-in items-start gap-3 rounded-xl border border-brand/60 bg-panel p-3 shadow-glow"
            >
              <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-soft">
                  Alert &middot; {hit.keyword}
                </p>
                <p className="truncate text-sm font-semibold text-white">{hit.title}</p>
                <p className="text-sm text-zinc-300">{formatPrice(hit.price)}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() => setHits((current) => current.filter((item) => item.id !== hit.id))}
                className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
