import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend";

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "x-request-id",
  "x-voice-provider",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "dev-only-aether-secret-change-me",
    // Auth.js prefixes the session cookie with `__Secure-` on HTTPS. getToken
    // defaults to the unprefixed name, so match the request protocol or the
    // cookie is never found in production.
    secureCookie: request.nextUrl.protocol === "https:",
  });

  if (!token?.accessToken) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Please sign in to continue." } },
      { status: 401 },
    );
  }
  if (token.error === "RefreshFailed") {
    return NextResponse.json(
      { error: { code: "session_expired", message: "Your session expired. Please sign in again." } },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  const url = new URL(request.url);
  const target = `/api/v1/${path.join("/")}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  headers.set("authorization", `Bearer ${token.accessToken}`);

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await backendFetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "backend_unreachable",
          message: "The AETHER API is not reachable right now.",
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const key of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  if (responseHeaders.get("content-type")?.includes("text/event-stream")) {
    responseHeaders.set("cache-control", "no-cache, no-transform");
    responseHeaders.set("x-accel-buffering", "no");
    responseHeaders.set("connection", "keep-alive");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
