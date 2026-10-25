import { createHash, randomBytes } from "crypto";
import { kvDel, kvGet, kvGetDel, kvSAdd, kvSet } from "./kv";
import { normalizeEmail } from "./licenses";

/**
 * Passwordless accounts. A visitor enters an email, we mail a single-use link, and opening it
 * starts a session (random token in an httpOnly cookie; only its SHA-256 is stored server-side).
 * No passwords are ever stored.
 */

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface User {
  email: string;
  createdAt: string;
  /** Opted in to occasional deal tips and updates. */
  marketing: boolean;
  /** Wants emails when an alert matches. */
  emailAlerts: boolean;
  /** Secret in this user's one-click unsubscribe links. */
  unsubToken: string;
  /** Where to search for their email alerts. */
  location: UserLocation | null;
  lastCheckedAt: string | null;
  lastAlertEmailAt: string | null;
}

export const USERS_SET = "dealradar:users";
export const SESSION_COOKIE = "dealradar_session";
const SESSION_SECONDS = 90 * 24 * 3600;
const LOGIN_SECONDS = 15 * 60;

const userKey = (email: string) => `dealradar:user:${normalizeEmail(email)}`;
const sessionKey = (hash: string) => `dealradar:session:${hash}`;
const loginKey = (hash: string) => `dealradar:login:${hash}`;
const unsubKey = (token: string) => `dealradar:unsub:${token}`;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const newToken = (bytes = 32) => randomBytes(bytes).toString("hex");

export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ users */

export async function getUser(email: string): Promise<User | null> {
  return kvGet<User>(userKey(email));
}

export async function saveUser(user: User): Promise<void> {
  await kvSet(userKey(user.email), user);
}

/**
 * Creates the user on first sign-in. `marketing: true` records the opt-in; leaving it out never
 * removes an existing opt-in or opt-out.
 */
export async function upsertUser(rawEmail: string, options: { marketing?: boolean } = {}): Promise<User> {
  const email = normalizeEmail(rawEmail);
  const existing = await getUser(email);
  if (existing) {
    if (options.marketing === true && !existing.marketing) {
      const updated = { ...existing, marketing: true };
      await saveUser(updated);
      return updated;
    }
    return existing;
  }
  const user: User = {
    email,
    createdAt: new Date().toISOString(),
    marketing: options.marketing === true,
    emailAlerts: true,
    unsubToken: newToken(16),
    location: null,
    lastCheckedAt: null,
    lastAlertEmailAt: null,
  };
  await saveUser(user);
  await kvSet(unsubKey(user.unsubToken), email);
  await kvSAdd(USERS_SET, email);
  return user;
}

export async function userByUnsubToken(token: string): Promise<User | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const email = await kvGet<string>(unsubKey(token));
  return email ? getUser(email) : null;
}

/* ------------------------------------------------------------ magic links */

export async function createLoginToken(email: string, marketing: boolean): Promise<string> {
  const token = newToken();
  await kvSet(loginKey(sha256(token)), { email: normalizeEmail(email), marketing }, { exSeconds: LOGIN_SECONDS });
  return token;
}

/** Single use: the token is deleted as it is read. */
export async function consumeLoginToken(token: string): Promise<{ email: string; marketing: boolean } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  return kvGetDel<{ email: string; marketing: boolean }>(loginKey(sha256(token)));
}

/* --------------------------------------------------------------- sessions */

export async function createSession(email: string): Promise<string> {
  const token = newToken();
  await kvSet(
    sessionKey(sha256(token)),
    { email: normalizeEmail(email), createdAt: new Date().toISOString() },
    { exSeconds: SESSION_SECONDS },
  );
  return token;
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function getSessionEmail(req: Request): Promise<string | null> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const session = await kvGet<{ email: string }>(sessionKey(sha256(token)));
  return session?.email ?? null;
}

export async function getSessionUser(req: Request): Promise<User | null> {
  const email = await getSessionEmail(req);
  return email ? getUser(email) : null;
}

export async function destroySession(req: Request): Promise<void> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token && TOKEN_PATTERN.test(token)) await kvDel(sessionKey(sha256(token)));
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

export const clearedSessionCookie = {
  name: SESSION_COOKIE,
  value: "",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

/** Blocks cross-site form posts: real calls from our pages send JSON. */
export function isJsonRequest(req: Request): boolean {
  return (req.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
}
