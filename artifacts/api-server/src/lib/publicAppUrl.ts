const LOCAL_PUBLIC_APP_URL = "http://localhost:5173";
const DEFAULT_PUBLIC_APP_URL = "https://rankpulse.up.railway.app";
const LEGACY_PUBLIC_APP_URL = "https://educonnect-platform-production-b1ce.up.railway.app";

function readTrimmedEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function normalizePublicUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/u, "");
  if (!trimmed) return "";
  if (/^https?:\/\//iu.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/iu.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function readPublicAppUrl() {
  const configured = normalizePublicUrl(readTrimmedEnv("PUBLIC_APP_URL"));
  const railwayPublicDomain = normalizePublicUrl(readTrimmedEnv("RAILWAY_PUBLIC_DOMAIN"));
  const railwayStaticUrl = normalizePublicUrl(readTrimmedEnv("RAILWAY_STATIC_URL"));
  const productionFallback = railwayPublicDomain || railwayStaticUrl || DEFAULT_PUBLIC_APP_URL;

  if (process.env.NODE_ENV === "development" && (!configured || configured === LEGACY_PUBLIC_APP_URL)) {
    return LOCAL_PUBLIC_APP_URL;
  }

  if (configured) return configured;
  return productionFallback;
}

export function buildPublicAppUrl(path: string) {
  try {
    return new URL(path, readPublicAppUrl()).toString();
  } catch {
    return readPublicAppUrl();
  }
}
