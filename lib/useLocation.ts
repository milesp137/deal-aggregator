"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ORIGIN } from "./market";

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
  /** device = browser geolocation, manual = picked by the user, default = fallback. */
  source: "device" | "manual" | "default";
}

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

const STORAGE_KEY = "dealradar:location";

// Rounded to ~1 km: plenty for "deals near me" and avoids sending exact coordinates around.
const round = (value: number) => Math.round(value * 100) / 100;

const FALLBACK: UserLocation = {
  lat: DEFAULT_ORIGIN.lat,
  lng: DEFAULT_ORIGIN.lng,
  label: DEFAULT_ORIGIN.label,
  source: "default",
};

function readStored(): UserLocation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocation;
    return Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) && parsed.label ? parsed : null;
  } catch {
    return null;
  }
}

/** Turns coordinates into "City, ST" using BigDataCloud's free, keyless client endpoint. */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
    );
    if (!response.ok) throw new Error("reverse geocode failed");
    const data = (await response.json()) as {
      city?: string;
      locality?: string;
      principalSubdivisionCode?: string;
      principalSubdivision?: string;
    };
    const city = data.city || data.locality;
    const state = (data.principalSubdivisionCode ?? "").replace(/^US-/, "") || data.principalSubdivision;
    if (city && state) return `${city}, ${state}`;
    return city || state || "Your location";
  } catch {
    return "Your location";
  }
}

/** City or ZIP search (US only) using Open-Meteo's free, keyless geocoding API. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=6&language=en&format=json&countryCode=US`,
  );
  if (!response.ok) throw new Error("place search failed");
  const data = (await response.json()) as {
    results?: { name: string; admin1?: string; latitude: number; longitude: number }[];
  };
  return (data.results ?? []).map((result) => ({
    label: result.admin1 ? `${result.name}, ${stateAbbreviation(result.admin1)}` : result.name,
    lat: round(result.latitude),
    lng: round(result.longitude),
  }));
}

const STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

function stateAbbreviation(name: string): string {
  return STATES[name] ?? name;
}

/**
 * Detects the visitor's location on first load (browser permission prompt), remembers it, and
 * lets them change it. Falls back to Los Angeles if permission is denied or unavailable.
 */
export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [detecting, setDetecting] = useState(true);
  const [detectFailed, setDetectFailed] = useState(false);

  const persist = useCallback((next: UserLocation) => {
    setLocation(next);
    if (next.source !== "default") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const detect = useCallback(() => {
    setDetecting(true);
    setDetectFailed(false);
    if (!("geolocation" in navigator)) {
      setLocation((current) => current ?? FALLBACK);
      setDetectFailed(true);
      setDetecting(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = round(position.coords.latitude);
        const lng = round(position.coords.longitude);
        const label = await reverseGeocode(lat, lng);
        persist({ lat, lng, label, source: "device" });
        setDetecting(false);
      },
      () => {
        // Denied or unavailable: keep whatever we had, else fall back to the default city.
        setLocation((current) => current ?? FALLBACK);
        setDetectFailed(true);
        setDetecting(false);
      },
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }, [persist]);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setLocation(stored);
      setDetecting(false);
    } else {
      detect();
    }
  }, [detect]);

  const choose = useCallback(
    (place: Place) => persist({ lat: place.lat, lng: place.lng, label: place.label, source: "manual" }),
    [persist],
  );

  return { location, detecting, detectFailed, detect, choose };
}
