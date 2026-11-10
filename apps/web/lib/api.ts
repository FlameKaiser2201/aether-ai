import { API_ERROR_FALLBACK } from "@/lib/constants";
import { refreshSession, sessionWasRefreshed } from "@/lib/session-refresh";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code = "request_failed", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const send = () =>
    fetch(`/api/proxy/${path.replace(/^\/+/, "")}`, {
      ...init,
      headers,
      cache: "no-store",
    });

  let response = await send();
  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("auth/")) {
    // The backend access token can expire while a tab stays open. Ask Auth.js
    // for a fresh JWT (which rotates the refresh token) and retry once.
    const session = await refreshSession();
    if (sessionWasRefreshed(session) && !(init.body instanceof ReadableStream)) {
      response = await send();
    }
    if (response.status === 401) {
      window.location.href = "/login";
    }
  }
  if (!response.ok) {
    let message = API_ERROR_FALLBACK;
    let code = "request_failed";
    let details: unknown;
    try {
      const payload = await response.json();
      message = payload?.error?.message ?? message;
      code = payload?.error?.code ?? code;
      details = payload?.error?.details;
    } catch {
      // keep the fallback
    }
    throw new ApiError(message, response.status, code, details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(`/api/proxy/${path.replace(/^\/+/, "")}`, { cache: "no-store" });
  if (!response.ok) {
    throw new ApiError(API_ERROR_FALLBACK, response.status);
  }
  return response.blob();
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return API_ERROR_FALLBACK;
}
