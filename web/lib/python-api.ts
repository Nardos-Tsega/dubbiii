/**
 * Server-only helpers for talking to the Python API.
 * Do not import into client components.
 */

export function pythonApiBaseUrl(): string {
  const base = (process.env.PYTHON_API_URL || "http://127.0.0.1:8000").trim();
  return base.replace(/\/$/, "") || "http://127.0.0.1:8000";
}

export function pythonApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${pythonApiBaseUrl()}${normalized}`;
}

export function pythonApiHeaders(extra?: HeadersInit): HeadersInit {
  const secret = process.env.API_SHARED_SECRET || "";
  const headers = new Headers(extra);
  headers.set("X-API-Secret", secret);
  return headers;
}
