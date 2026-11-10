import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "dev-only-aether-secret-change-me",
    // Auth.js prefixes the session cookie with `__Secure-` on HTTPS. getToken
    // defaults to the unprefixed name, so match the request protocol or the
    // cookie is never found in production.
    secureCookie: request.nextUrl.protocol === "https:",
  });
  if (token?.refreshToken) {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: token.refreshToken }),
        cache: "no-store",
      });
    } catch {
      // Best-effort revocation; the cookie is cleared by signOut regardless.
    }
  }
  return NextResponse.json({ ok: true });
}
