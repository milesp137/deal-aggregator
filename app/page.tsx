"use client";

import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Flame,
  Heart,
  Mail,
  PackageSearch,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import AlertPanel from "@/components/AlertPanel";
import SignInModal from "@/components/SignInModal";
import ControlBar from "@/components/ControlBar";
import ListingCard from "@/components/ListingCard";
import LocationBar from "@/components/LocationBar";
import Logo from "@/components/Logo";
import LockedTeaser from "@/components/LockedTeaser";
import UpgradeModal from "@/components/UpgradeModal";
import { matchesAlert } from "@/lib/alerts";
import { api, clearLicense, getLicense, setLicense } from "@/lib/client";
import { formatPrice, timeAgo } from "@/lib/format";
import { BILLING_PORTAL_URL, FREE_MAX_DISTANCE, PLAN_LIMITS, SUPPORT_EMAIL, type Plan, type UpgradeReason } from "@/lib/plan";
import { isCountryCode } from "@/lib/countries";
import { DEFAULT_CATEGORY, isCategoryId } from "@/lib/categories";
import BrowseBar from "@/components/BrowseBar";
import { useLocation } from "@/lib/useLocation";
import { addRecent, clearRecent, loadPrefs, loadRecent, usePersistPrefs } from "@/lib/usePrefs";
import { useAccount } from "@/lib/useAccount";
import { useSaved } from "@/lib/useSaved";
import {
  ALL_SOURCES,
  ORIGINAL_SOURCES,
  SOURCE_NAMES,
  SORT_LABELS,
  type AlertHit,
  type AlertKeyword,
  type Listing,
  type ScrapeMeta,
  type ScrapeResponse,
  type SortMode,
  type SourcePlatform,
} from "@/lib/types";

interface SavedPrefs {
  maxDistance: number;
  minScore: number;
  hideScams: boolean;
  sort: SortMode;
  minPrice: string;
  maxPrice: string;
  countryOnly: boolean;
  country: string;
  category: string;
}

const AUTO_REFRESH_MS = 30_000;
const FILTER_DEBOUNCE_MS = 350;
const MAX_VISIBLE_HITS = 4;

const SOURCES_KEY = "dealradar:sources";

const PLATFORM_NAMES: Record<string, string> = SOURCE_NAMES;

type NotificationState = NotificationPermission | "unsupported";

export default function DashboardPage() {
  // Search + filters
  const [query, setQuery] = useState("");
  const [maxDistance, setMaxDistance] = useState(FREE_MAX_DISTANCE);
  const [minScore, setMinScore] = useState(1);
  const [hideScams, setHideScams] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [sources, setSources] = useState<SourcePlatform[]>(ALL_SOURCES);
  const [sort, setSort] = useState<SortMode>("best");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [countryOnly, setCountryOnly] = useState(false);
  const [country, setCountry] = useState("US");
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY.id);
  const [recent, setRecent] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Account (email sign-in). Anonymous visitors work exactly as before.
  const { account, loaded: accountLoaded, restoreFromLicense, updatePrefs, signOut } = useAccount();
  const accountEmail = account?.email ?? null;
  const [signInOpen, setSignInOpen] = useState(false);

  // Saved listings (watchlist) and which view is showing
  const { saved, isSaved, toggle: toggleSaved, refresh: refreshSaved } = useSaved(accountEmail);
  const [showSaved, setShowSaved] = useState(false);

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
    sources,
    sort,
    minPrice,
    maxPrice,
    country: "",
    category: DEFAULT_CATEGORY.id as string,
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
      sources,
      sort,
      minPrice,
      maxPrice,
      country: countryOnly ? country : "",
      category,
      originLat: location?.lat,
      originLng: location?.lng,
    };
  }, [
    category,
    query,
    maxDistance,
    minScore,
    sources,
    sort,
    minPrice,
    maxPrice,
    countryOnly,
    country,
    location?.lat,
    location?.lng,
  ]);

  // Restore the visitor's filters and recent searches from their last visit.
  useEffect(() => {
    const prefs = loadPrefs<SavedPrefs>();
    if (typeof prefs.maxDistance === "number") setMaxDistance(prefs.maxDistance);
    if (typeof prefs.minScore === "number") setMinScore(prefs.minScore);
    if (typeof prefs.hideScams === "boolean") setHideScams(prefs.hideScams);
    if (prefs.sort && prefs.sort in SORT_LABELS) setSort(prefs.sort);
    if (typeof prefs.minPrice === "string") setMinPrice(prefs.minPrice.replace(/\D/g, "").slice(0, 7));
    if (typeof prefs.maxPrice === "string") setMaxPrice(prefs.maxPrice.replace(/\D/g, "").slice(0, 7));
    if (typeof prefs.countryOnly === "boolean") setCountryOnly(prefs.countryOnly);
    if (isCountryCode(prefs.country)) setCountry(prefs.country);
    if (isCategoryId(prefs.category)) setCategory(prefs.category);
    setRecent(loadRecent());
    setPrefsLoaded(true);
  }, []);

  usePersistPrefs(
    { maxDistance, minScore, hideScams, sort, minPrice, maxPrice, countryOnly, country, category },
    prefsLoaded,
  );

  // Remember which sites the visitor wants between visits.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SOURCES_KEY) ?? "null") as unknown;
      if (Array.isArray(saved)) {
        const valid = ALL_SOURCES.filter((source) => saved.includes(source));
        // Visitors who had every original site on get the newer sites too; anyone who had
        // switched a site off keeps their own choice.
        const hadEverything = ORIGINAL_SOURCES.every((source) => valid.includes(source));
        if (valid.length > 0) setSources(hadEverything ? ALL_SOURCES : valid);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const changeSources = useCallback((next: SourcePlatform[]) => {
    setSources(next);
    try {
      window.localStorage.setItem(SOURCES_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

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
        sources: params.sources,
        sort: params.sort,
        minPrice: Number(params.minPrice) || 0,
        maxPrice: Number(params.maxPrice) || 0,
        country: params.country,
        category: params.category,
        originLat: params.originLat,
        originLng: params.originLng,
      });
      if (seq !== requestSeq.current) return; // a newer request superseded this one

      setPlan(data.meta.plan);
      refreshSaved(data.listings);
      if (params.query.trim()) setRecent(addRecent(params.query));

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
  }, [refreshSaved]);

  // Initial load (once the location is known) + debounced re-scrape whenever a slider or the
  // location changes.
  const hasLocation = location !== null;
  useEffect(() => {
    // Wait for the saved filters to load so the first search already uses them.
    if (!hasLocation || !prefsLoaded) return;
    const timer = setTimeout(() => void runScrape(), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    hasLocation,
    prefsLoaded,
    location?.lat,
    location?.lng,
    maxDistance,
    minScore,
    sources,
    sort,
    minPrice,
    maxPrice,
    countryOnly,
    country,
    category,
    runScrape,
  ]);

  // Optional live polling (Pro only).
  useEffect(() => {
    if (!autoRefresh || !isPro) return;
    const timer = setInterval(() => void runScrape(), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, isPro, runScrape]);

  // Load the alert rules once we know who is browsing. Signing in first moves any alerts this
  // browser created anonymously into the account.
  useEffect(() => {
    if (!accountLoaded) return;
    let cancelled = false;
    void (async () => {
      if (accountEmail) {
        try {
          await api.post("/api/alerts/migrate", {});
        } catch {
          /* the account's own alerts still load below */
        }
      }
      try {
        const { data } = await api.get<{ alerts: AlertKeyword[] }>("/api/alerts");
        if (!cancelled) setAlerts(data.alerts);
      } catch {
        if (!cancelled) setError("Could not load alert rules.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountLoaded, accountEmail]);

  // Signed-in Pro accounts are Pro on every device.
  useEffect(() => {
    if (account?.plan === "pro") setPlan("pro");
  }, [account?.plan]);

  // Remember where a signed-in user searches so their alert emails use the same area.
  const locationLat = location?.lat;
  const locationLng = location?.lng;
  const locationLabel = location?.label;
  useEffect(() => {
    if (!accountEmail || locationLat === undefined || locationLng === undefined) return;
    const timer = setTimeout(() => {
      api
        .post("/api/account/prefs", { location: { lat: locationLat, lng: locationLng, label: locationLabel ?? "" } })
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [accountEmail, locationLat, locationLng, locationLabel]);

  // Browser notification state, and re-check a stored Pro license.
  useEffect(() => {
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
            void restoreFromLicense();
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
  }, [restoreFromLicense]);

  const requirePro = useCallback((reason: UpgradeReason) => setUpgradeReason(reason), []);

  const resetFilters = useCallback(() => {
    setMaxDistance(FREE_MAX_DISTANCE);
    setMinScore(1);
    setHideScams(false);
    setMinPrice("");
    setMaxPrice("");
    setSort("best");
    setCountryOnly(false);
    changeSources(ALL_SOURCES);
  }, [changeSources]);

  // Clicking a recent search fills the box and searches right away.
  const pickRecent = useCallback(
    (value: string) => {
      paramsRef.current = { ...paramsRef.current, query: value };
      setQuery(value);
      setShowSaved(false);
      void runScrape();
    },
    [runScrape],
  );

  // Logo click: back to the default home view (blank search, results feed), scrolled to the top.
  const goHome = useCallback(() => {
    paramsRef.current = { ...paramsRef.current, query: "", category: DEFAULT_CATEGORY.id };
    setQuery("");
    setCategory(DEFAULT_CATEGORY.id);
    setShowSaved(false);
    setAlertsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void runScrape();
  }, [runScrape]);

  const clearRecentSearches = useCallback(() => {
    clearRecent();
    setRecent([]);
  }, []);

  const toggleSave = useCallback(
    (listing: Listing) => {
      if (toggleSaved(listing, PLAN_LIMITS[plan].maxSaved) === "limit") setUpgradeReason("saved");
    },
    [toggleSaved, plan],
  );

  const handleActivated = useCallback(() => {
    setPlan("pro");
    setUpgradeReason(null);
    setNudge(false);
    void restoreFromLicense(); // activating a key also signs in as the email that bought it
    void runScrape();
  }, [runScrape, restoreFromLicense]);

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
        {/* Logo + name + tagline: one click target that returns to the home view. */}
        <a
          href="/"
          onClick={(event) => {
            // Let ctrl/cmd/middle-click open a new tab normally; otherwise reset in place.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            goHome();
          }}
          aria-label="DealRadar home"
          className="flex items-center gap-3 rounded-xl no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <Logo className="h-11 w-11 rounded-xl shadow-glow" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">DealRadar</h1>
            <p className="text-sm text-zinc-400">
              Project cars, performance parts &amp; high-end electronics, scored in real time
            </p>
          </div>
        </a>

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

          <button
            type="button"
            onClick={() => setShowSaved((open) => !open)}
            aria-pressed={showSaved}
            className={showSaved ? "btn-primary" : "btn-ghost"}
          >
            <Heart className={`h-4 w-4 ${showSaved ? "fill-white" : ""}`} />
            Saved
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs">{saved.length}</span>
          </button>

          {isPro ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-lg border border-orange-400/50 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-200">
                <Sparkles className="h-4 w-4" />
                Pro active
              </span>
              {BILLING_PORTAL_URL && (
                <a
                  href={BILLING_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  Manage subscription
                </a>
              )}
            </>
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

          {account ? (
            <AccountMenu account={account} isPro={isPro} onUpdate={updatePrefs} onSignOut={signOut} />
          ) : (
            accountLoaded && (
              <button type="button" onClick={() => setSignInOpen(true)} className="btn-ghost">
                <Mail className="h-4 w-4" /> Sign in
              </button>
            )
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
          sources={sources}
          onSourcesChange={changeSources}
          sort={sort}
          onSortChange={setSort}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={(min, max) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
          sourceCounts={meta?.sources ?? null}
          recent={recent}
          onPickRecent={pickRecent}
          onClearRecent={clearRecentSearches}
          countryOnly={countryOnly}
          onCountryOnlyChange={setCountryOnly}
          country={country}
          onCountryChange={setCountry}
        />

        <BrowseBar
          query={query}
          category={category}
          onCategoryChange={(id) => {
            setShowSaved(false);
            setCategory(id);
          }}
          meta={meta}
          onPick={pickRecent}
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
            accountEmail={accountEmail}
            emailAlerts={account?.emailAlerts ?? true}
            onEmailAlertsChange={(value) => void updatePrefs({ emailAlerts: value })}
            onSignIn={() => setSignInOpen(true)}
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
      {!showSaved && meta && (
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

      {!showSaved && meta && Object.keys(meta.errors ?? {}).length > 0 && (
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

      {!showSaved && error && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-950/50 p-3 text-sm text-red-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void runScrape()}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-400/50 px-2.5 py-1 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {!showSaved && meta && !isPro && meta.delayedHotCount > 0 && (
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
        {showSaved ? (
          saved.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
              <Heart className="mb-3 h-10 w-10 text-zinc-600" />
              <p className="text-lg font-semibold text-zinc-200">Nothing saved yet</p>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                Tap the heart on any listing to keep it here. Saved listings update whenever they show
                up in a search, and you&apos;ll see if the price drops.
              </p>
              <button type="button" onClick={() => setShowSaved(false)} className="btn-primary mt-5">
                Back to deals
              </button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-zinc-400">
                <strong className="text-white">{saved.length}</strong> of {PLAN_LIMITS[plan].maxSaved} saved.
                Details refresh when a listing appears in a search; sold or removed posts may no longer
                open.{" "}
                {!accountEmail && accountLoaded && (
                  <button
                    type="button"
                    onClick={() => setSignInOpen(true)}
                    className="font-semibold text-orange-300 hover:text-orange-200"
                  >
                    Sign in to keep these on all your devices.
                  </button>
                )}
              </p>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {saved.map((item) => (
                  <ListingCard
                    key={item.listing.id}
                    listing={item.listing}
                    isNew={false}
                    matchedAlerts={[]}
                    saved
                    onToggleSave={() => toggleSave(item.listing)}
                    priceDropFrom={item.savedPrice}
                  />
                ))}
              </div>
            </>
          )
        ) : initialLoad ? (
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
              Try a broader keyword, a larger distance, a lower minimum deal score
              {sources.length < ALL_SOURCES.length ? ", turning on more sites under \u201cSearch on\u201d" : ""}
              {minPrice || maxPrice ? ", or widening the price range" : ""}.
            </p>
            <button type="button" onClick={resetFilters} className="btn-ghost mt-5">
              <RotateCcw className="h-4 w-4" /> Reset filters
            </button>
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
                saved={isSaved(listing.id)}
                onToggleSave={() => toggleSave(listing)}
                priceDropFrom={saved.find((item) => item.listing.id === listing.id)?.savedPrice}
              />
            ))}
          </div>
        )}

        {!showSaved && meta && !isPro && (
          <LockedTeaser
            lockedCount={meta.lockedCount}
            delayedCount={meta.delayedCount}
            delayedHotCount={meta.delayedHotCount}
            onUpgrade={() => setUpgradeReason(meta.lockedCount > 0 ? "results" : "fresh")}
          />
        )}
      </main>

      {accountLoaded && !accountEmail && (
        <section className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/70 p-4 sm:px-6">
          <div>
            <p className="font-bold text-white">Never miss a good deal</p>
            <p className="text-sm text-zinc-400">
              Get emailed when something matches your alerts, plus occasional deal tips. No password needed.
            </p>
          </div>
          <button type="button" onClick={() => setSignInOpen(true)} className="btn-primary">
            <Mail className="h-4 w-4" /> Get deal emails
          </button>
        </section>
      )}

      {SUPPORT_EMAIL && (
        <footer className="mt-12 border-t border-line pt-6 text-center text-xs text-zinc-500">
          Lost your Pro license key or need help?{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("DealRadar support")}`}
            className="font-semibold text-zinc-300 underline-offset-2 hover:text-white hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </footer>
      )}

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />

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
