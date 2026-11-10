"use client";

import type { Session } from "next-auth";
import { getSession } from "next-auth/react";

let pending: Promise<Session | null> | null = null;

/**
 * Ask Auth.js to re-issue the session JWT.
 *
 * The server-side `jwt` callback refreshes the backend access token when it is
 * close to expiry, rotates the refresh token, and writes the updated cookie.
 * Concurrent callers share one request so two 401s cannot race the refresh
 * token rotation.
 */
export function refreshSession(): Promise<Session | null> {
  if (!pending) {
    pending = getSession()
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function sessionWasRefreshed(session: Session | null): boolean {
  return Boolean(session && !session.error);
}
