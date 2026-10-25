import axios from "axios";

const CLIENT_ID_KEY = "dealradar:client-id";
const LICENSE_KEY = "dealradar:license";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Anonymous per-browser id; keeps each visitor's alerts private without accounts. */
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = randomId();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getLicense(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LICENSE_KEY) ?? "";
}

export function setLicense(key: string): void {
  window.localStorage.setItem(LICENSE_KEY, key.trim());
}

export function clearLicense(): void {
  window.localStorage.removeItem(LICENSE_KEY);
}

/** axios instance that identifies the browser and attaches the Pro license key, if any. */
export const api = axios.create();

api.interceptors.request.use((config) => {
  config.headers.set("x-client-id", getClientId());
  const license = getLicense();
  if (license) config.headers.set("x-license-key", license);
  return config;
});
