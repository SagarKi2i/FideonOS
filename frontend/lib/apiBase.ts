/** Configured FastAPI origin (no trailing slash). */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Base URL for browser `fetch` calls.
 * Local backends use same-origin `/api/*` (proxied in next.config.ts) to avoid CORS.
 * SSR / server actions use the full origin.
 */
export function getApiUrl(): string {
  if (typeof window === "undefined") return API_ORIGIN;
  if (LOCAL_API.test(API_ORIGIN)) return "";
  return API_ORIGIN;
}

export function isNetworkFetchError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  );
}

export class ApiUnreachableError extends Error {
  constructor() {
    super(
      `Cannot reach the API at ${API_ORIGIN}. Start the FastAPI backend or check NEXT_PUBLIC_API_URL.`,
    );
    this.name = "ApiUnreachableError";
  }
}
